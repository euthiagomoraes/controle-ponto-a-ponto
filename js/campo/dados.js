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

async function loadFieldWeek() {
  const rows = await fieldRpc("tecnico_programacao", { p_semana: state.field.weekNum }) || [];
  const programs = rows.map(r => mapProgram(r));
  const executions = rows.flatMap(r => (r.execucoes || []).map(e => ({ ...e, programacao_id: r.id })));
  const equipment = rows.filter(r => r.equipamento).map(r => r.equipamento);
  // Pessoa sem equipe vê todas as equipes: guarda os nomes que vieram junto.
  rows.forEach(r => {
    if (r.equipe_id && r.equipe_nome && !teamById(r.equipe_id)) state.teams.push({ id: r.equipe_id, nome: r.equipe_nome, ativo: true });
  });

  const activeIds = new Set(state.activities.map(a => a.id));
  state.field.programs = programs.filter(p => activeIds.has(p.activityId));
  mergeExecutions(programs, executions);
  equipment.forEach(e => state.equipment.set(e.id, e));
  const visible = new Set(state.field.programs.map(p => p.id));
  state.field.selected = new Set([...state.field.selected].filter(id => visible.has(id) && !isDone(state.field.programs.find(p => p.id === id))));
  if (!visible.has(state.field.activeId)) state.field.activeId = null;
}

// A tela de campo e o Dashboard compartilham o mesmo mapa de execuções (por item).
function mergeExecutions(programs, executions) {
  const grouped = setExecutions(executions);
  programs.forEach(p => state.executions.set(p.id, grouped.get(p.id) || []));
}

// Semanas carregadas no Dashboard de campo: 12 anteriores, a atual e 2 seguintes.
const FIELD_DASHBOARD_BACK = 12;
const FIELD_DASHBOARD_AHEAD = 2;
const MISSING_012 = "O Dashboard da equipe de campo precisa da migration 012_identidade_e_dashboard_campo.sql. Peça ao administrador para executá-la no Supabase.";

// Programação da equipe em várias semanas, para os indicadores (fica em state.programs, como no planejamento).
async function loadFieldDashboard() {
  const current = currentWeekNumber();
  const { data, error } = await requireDb().rpc("tecnico_programacao_periodo", {
    p_cracha: fieldCode(), p_semana_de: current - FIELD_DASHBOARD_BACK, p_semana_ate: current + FIELD_DASHBOARD_AHEAD
  });
  if (error && isMissingFunction(error)) throw new Error(MISSING_012);
  if (error) throw error;
  const rows = Array.isArray(data) ? data : [];
  rows.forEach(r => {
    if (r.equipe_id && r.equipe_nome && !teamById(r.equipe_id)) state.teams.push({ id: r.equipe_id, nome: r.equipe_nome, ativo: true });
  });
  const activeIds = new Set(state.activities.map(a => a.id));
  const programs = rows.map(r => mapProgram(r)).filter(p => activeIds.has(p.activityId));
  mergeExecutions(programs, rows.flatMap(r => (r.execucoes || []).map(e => ({ ...e, programacao_id: r.id }))));
  state.programs = programs;
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
