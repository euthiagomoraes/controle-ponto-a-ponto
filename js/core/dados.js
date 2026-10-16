/* Planning Pro · core/dados.js
 * Carga de atividades, equipes, pessoas e programação; sincronização geral.
 */
"use strict";

/* =========================================================
   CARGA DE DADOS
   ========================================================= */

const teamById = id => state.teams.find(t => t.id === id) || null;
const teamName = id => teamById(id)?.nome || "";
const personById = id => state.people.find(p => p.id === id) || null;
const activityById = id => state.activities.find(a => a.id === id) || null;

function teamByName(name) {
  const target = normalizeText(name).replace(/^(equipe|eq\.?)\s*/, "");
  if (!target) return null;
  const clean = t => normalizeText(t.nome).replace(/^(equipe|eq\.?)\s*/, "");
  const exact = state.teams.filter(t => clean(t) === target);
  if (exact.length === 1) return exact[0];
  // Aceita "A" para "Equipe A" somente quando houver correspondência única.
  if (!exact.length && target.length <= 2) {
    const alias = state.teams.filter(t => clean(t).split(/\s+/).at(-1) === target);
    if (alias.length === 1) return alias[0];
  }
  return null;
}


function mapColumn(c) {
  return {
    id: c.id, key: c.chave, label: c.rotulo, type: COLUMN_TYPES[c.tipo] ? c.tipo : "text",
    required: Boolean(c.obrigatorio), technicianEditable: Boolean(c.editavel_tecnico),
    options: Array.isArray(c.opcoes) ? c.opcoes.map(String) : [], ordem: Number(c.ordem) || 0
  };
}

async function loadActivities() {
  const sb = requireDb();
  const { data: acts, error } = await sb.from("tb_atividades").select("id,nome,descricao,ativo,created_at").eq("ativo", true).order("created_at");
  if (error) throw error;
  const cols = await fetchAll(() => sb.from("tb_atividade_colunas").select("*").order("ordem").order("id"));
  state.activities = (acts || []).map(a => ({
    id: a.id, name: a.nome, description: a.descricao || "",
    columns: cols.filter(c => c.atividade_id === a.id).map(mapColumn).sort((x, y) => x.ordem - y.ordem)
  }));
}

async function seedDefaultActivities() {
  const sb = requireDb();
  for (const def of DEFAULT_ACTIVITIES) {
    const { data, error } = await sb.from("tb_atividades").insert({ nome: def.name, descricao: def.description, ativo: true }).select("id").single();
    if (error) throw error;
    const rows = def.columns.map(([chave, rotulo, tipo, obrigatorio = false, editavel = false, opcoes = []], ordem) => ({
      atividade_id: data.id, chave, rotulo, tipo, obrigatorio, editavel_tecnico: editavel, opcoes, ordem
    }));
    const { error: colError } = await sb.from("tb_atividade_colunas").insert(rows);
    if (colError) throw colError;
  }
}

async function loadTeams() {
  const { data, error } = await requireDb().from("tb_equipes").select("id,nome,disciplina,ativo").order("nome");
  if (error) throw error;
  state.teams = (data || []).map(t => ({ ...t, ativo: t.ativo !== false })).sort(sortByName);
}

async function loadPeople() {
  const data = await fetchAll(() => requireDb().from("tb_pessoas").select("id,nome,cracha,perfil,ativo,auth_user_id,equipe_id,disciplina").order("nome").order("id"));
  state.people = data.map(p => ({ ...p, ativo: p.ativo !== false }));
}

const PROGRAM_COLUMNS = "id,equipamento_id,semana,status,atividade_id,data_programacao,equipe_id,responsavel_id,quantidade,observacao,dados_personalizados,modo_importacao,arquivo_importacao,usuario_importacao,created_at";

function mapProgram(row) {
  return {
    id: row.id,
    weekNum: Number(row.semana),
    week: weekLabel(row.semana),
    activityId: row.atividade_id,
    teamId: row.equipe_id,
    responsibleId: row.responsavel_id,
    date: row.data_programacao || "",
    note: row.observacao || "",
    status: row.status || "PROGRAMADO",
    equipmentId: row.equipamento_id,
    customData: row.dados_personalizados && typeof row.dados_personalizados === "object" ? row.dados_personalizados : {},
    mode: row.modo_importacao || "",
    file: row.arquivo_importacao || "",
    importedBy: row.usuario_importacao || "",
    createdAt: row.created_at
  };
}

function setExecutions(rows) {
  const map = new Map();
  rows.forEach(e => {
    const list = map.get(e.programacao_id) || [];
    list.push(e);
    map.set(e.programacao_id, list);
  });
  map.forEach(list => list.sort((a, b) => String(a.executado_em).localeCompare(String(b.executado_em))));
  return map;
}

async function loadAdminPrograms() {
  const sb = requireDb();
  const [programs, executions] = await Promise.all([
    // Ordem secundária por id: uma importação grava centenas de linhas com o mesmo created_at.
    fetchAll(() => sb.from("tb_programacoes").select(PROGRAM_COLUMNS).order("created_at").order("id")),
    fetchAll(() => sb.from("tb_execucoes").select("id,programacao_id,executante_id,executado_em,observacao").order("executado_em").order("id"))
  ]);
  state.programs = programs.map(mapProgram);
  state.executions = setExecutions(executions);
}

const executionsOf = programId => state.executions.get(programId) || [];
const isDone = p => executionsOf(p.id).length > 0 || p.status === "EXECUTADO";

// Histórico de reprogramação guardado no próprio item (chave interna, não é coluna da atividade).
const HISTORY_KEY = "_semanas_anteriores";
const previousWeeks = p => (Array.isArray(p.customData?.[HISTORY_KEY]) ? p.customData[HISTORY_KEY] : []).map(Number).filter(Boolean);

// Backlog: item ainda não executado cuja semana já passou (em relação à semana de referência).
const isBacklog = (p, refWeek = currentWeekNumber()) => !isDone(p) && p.weekNum < refWeek;

async function syncAll() {
  await withBusy(async () => {
    try {
      if (state.user.role === "admin") {
        await loadActivities();
        if (!state.activities.length) { await seedDefaultActivities(); await loadActivities(); }
        await Promise.all([loadTeams(), loadPeople()]);
        await loadAdminPrograms();
      } else {
        if (state.field.weekNum === null) state.field.weekNum = currentWeekNumber();
        await loadFieldContext();
        await loadFieldWeek();
      }
      state.loadError = "";
    } catch (error) {
      console.error("Erro ao sincronizar:", error?.message || error, error);
      state.loadError = dbErrorMessage(error, "Não foi possível carregar os dados.");
      toast(state.loadError, "error");
    }
  });
  renderUserChrome();
  updateBacklogBadge();
}
