/* Planning Pro · campo/dados.js
 * Acesso da equipe de campo ao banco via funções seguras (migration 008).
 */
"use strict";

/* =========================================================
   CAMPO — dados
   A equipe de campo entra só com o código (role anon), que não tem permissão
   nas tabelas. Todo acesso passa pelas funções SECURITY DEFINER da migration 008.
   ========================================================= */

const fieldCode = () => storageGet(localStorage, "ppaFieldCode");

const MISSING_008 = "O banco ainda não tem as funções da equipe de campo. Peça ao administrador para executar 008_tecnico_rpc_seguro.sql no SQL Editor do Supabase.";

async function fieldRpc(name, params) {
  const { data, error } = await requireDb().rpc(name, { p_cracha: fieldCode(), ...params });
  if (error && isMissingFunction(error)) throw new Error(MISSING_008);
  if (error) throw error;
  return data;
}

// Atividades/colunas e equipe da pessoa.
async function loadFieldContext() {
  const ctx = await fieldRpc("tecnico_contexto", {});
  if (!ctx) throw new Error("Código de acesso inválido ou inativo.");
  state.activities = (ctx.atividades || []).map(a => ({
    id: a.id, name: a.nome, description: a.descricao || "",
    columns: (a.colunas || []).map(mapColumn).sort((x, y) => x.ordem - y.ordem)
  }));
  state.teams = ctx.equipe ? [{ ...ctx.equipe, ativo: true }] : [];
}

// Programação de uma semana da equipe. Paginado: o Supabase devolve no máximo 1000 linhas por
// requisição, também em funções; sem isso uma semana com 1948 itens chegava cortada em 1000.
async function fetchFieldWeekRows(weekNum) {
  try {
    return await fetchAll(() => requireDb().rpc("tecnico_programacao", { p_cracha: fieldCode(), p_semana: weekNum }));
  } catch (error) {
    if (isMissingFunction(error)) throw new Error(MISSING_008);
    throw error;
  }
}

// Converte as linhas da função para o estado local; devolve os itens de atividades ativas.
function ingestFieldRows(rows) {
  // Pessoa sem equipe vê todas as equipes: guarda os nomes que vieram junto.
  rows.forEach(r => {
    if (r.equipe_id && r.equipe_nome && !teamById(r.equipe_id)) state.teams.push({ id: r.equipe_id, nome: r.equipe_nome, ativo: true });
    if (r.equipamento) state.equipment.set(r.equipamento.id, r.equipamento);
  });
  const activeIds = new Set(state.activities.map(a => a.id));
  const programs = rows.map(r => mapProgram(r)).filter(p => activeIds.has(p.activityId));
  mergeExecutions(programs, rows.flatMap(r => (r.execucoes || []).map(e => ({ ...e, programacao_id: r.id }))));
  return programs;
}

async function loadFieldWeek() {
  state.field.programs = ingestFieldRows(await fetchFieldWeekRows(state.field.weekNum));
  const visible = new Set(state.field.programs.map(p => p.id));
  state.field.selected = new Set([...state.field.selected].filter(id => visible.has(id) && !isDone(state.field.programs.find(p => p.id === id))));
  if (!visible.has(state.field.activeId)) state.field.activeId = null;
}

// A tela de campo e o Dashboard compartilham o mesmo mapa de execuções (por item).
function mergeExecutions(programs, executions) {
  const grouped = setExecutions(executions);
  programs.forEach(p => state.executions.set(p.id, grouped.get(p.id) || []));
}

// Semanas do Dashboard de campo: 8 anteriores, a atual e a seguinte.
const FIELD_DASHBOARD_BACK = 8;
const FIELD_DASHBOARD_AHEAD = 1;

// Indicadores da equipe: usa a mesma função segura da migration 008, semana a semana (4 em paralelo).
// Os itens ficam em state.programs, como no planejamento, e o Dashboard é o mesmo.
async function loadFieldDashboard() {
  const current = currentWeekNumber();
  const weeks = [];
  for (let w = current - FIELD_DASHBOARD_BACK; w <= current + FIELD_DASHBOARD_AHEAD; w++) weeks.push(w);
  const rows = [];
  for (const part of chunk(weeks, 4)) {
    (await Promise.all(part.map(fetchFieldWeekRows))).forEach(list => rows.push(...list));
  }
  state.programs = ingestFieldRows(rows);
}

async function fieldRegister(ids, observacao, executadoEm) {
  const data = await fieldRpc("tecnico_registrar_execucao", {
    p_programacao_ids: ids, p_observacao: observacao || null, p_executado_em: executadoEm || null
  });
  return Array.isArray(data) ? data : [];
}

async function fieldSaveFields(program, values) {
  const data = await fieldRpc("tecnico_salvar_campos", { p_programacao_id: program.id, p_dados: values });
  return data && typeof data === "object" ? data : { ...program.customData, ...values };
}

// Data escolhida no registro: hoje = agora; outro dia = meio-dia daquele dia (evita virar a data no fuso).
function executionTimestamp(isoDate) {
  if (!isoDate || isoDate === toISODate(new Date())) return null;
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0).toISOString();
}
