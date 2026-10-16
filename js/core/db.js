/* Planning Pro · core/db.js
 * Cliente Supabase, paginação, tradução de erros do banco e indicador de sincronização.
 */
"use strict";

/* =========================================================
   SUPABASE
   ========================================================= */

function db() {
  if (state.sb) return state.sb;
  const urlOk = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(SUPABASE_URL);
  if (!urlOk || SUPABASE_KEY.length < 30 || !window.supabase?.createClient) return null;
  state.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  return state.sb;
}

function requireDb() {
  const sb = db();
  if (!sb) throw new Error("Supabase não configurado. Verifique supabase-config.js.");
  return sb;
}

// Busca todas as páginas de uma consulta (o PostgREST corta em 1000 linhas).
async function fetchAll(build) {
  const rows = [];
  for (let from = 0; ; from += DB_PAGE) {
    const { data, error } = await build().range(from, from + DB_PAGE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < DB_PAGE) return rows;
  }
}

async function fetchIn(table, columns, field, ids) {
  const sb = requireDb();
  const unique = [...new Set(ids.filter(Boolean))];
  const parts = await Promise.all(chunk(unique, IN_CHUNK).map(async part => {
    const { data, error } = await sb.from(table).select(columns).in(field, part);
    if (error) throw error;
    return data || [];
  }));
  return parts.flat();
}

function isMissingFunction(error) {
  return ["PGRST202", "42883"].includes(error?.code) || /could not find the function/i.test(error?.message || "");
}

function dbErrorMessage(error, fallback = "Não foi possível concluir a operação.") {
  const msg = error?.message || (typeof error === "string" ? error : "");
  if (error?.code === "42501" || /row-level security|permission denied/i.test(msg)) return "O banco bloqueou a operação (permissões/RLS). Verifique as policies do Supabase para este perfil.";
  if (error?.code === "23505") return `Já existe um registro com esse valor${error.details ? ` (${error.details})` : ""}.`;
  if (error?.code === "23503") return "Este registro está vinculado a outros dados (ex.: execuções) e não pode ser removido.";
  if (/null value in column "equipamento_id"/i.test(msg)) return "O banco exige um equipamento para cada programação. Inclua a coluna TAG nesta atividade e preencha-a.";
  if (/tb_equipes_disciplina_check/i.test(msg)) return "Disciplina rejeitada pelo banco. Execute a migration 006_corrigir_disciplina_equipes.sql.";
  if (/chk_tb_programacoes_modo_importacao/i.test(msg)) return "Modo de importação rejeitado pelo banco. Execute a migration 007_corrigir_modo_importacao.sql.";
  if (/failed to fetch|networkerror|load failed/i.test(msg)) return "Sem conexão com o servidor. Verifique a internet e tente novamente.";
  return msg || fallback;
}

/* ---------- status de sincronização ---------- */

let busyCount = 0;
function setBusy(delta) {
  busyCount = Math.max(0, busyCount + delta);
  const el = $("syncStatus");
  if (!el) return;
  el.classList.toggle("busy", busyCount > 0);
  if (busyCount > 0) el.classList.remove("error");
  el.querySelector("span").textContent = busyCount > 0 ? "Sincronizando…" : (el.classList.contains("error") ? "Falha na conexão" : "Conectado");
}
function setSyncError(on) {
  const el = $("syncStatus");
  if (!el) return;
  el.classList.toggle("error", on);
  el.querySelector("span").textContent = on ? "Falha na conexão" : "Conectado";
}
async function withBusy(task) {
  setBusy(1);
  try {
    const result = await task();
    setSyncError(false);
    return result;
  } catch (error) {
    if (/failed to fetch|network/i.test(error?.message || "")) setSyncError(true);
    throw error;
  } finally {
    setBusy(-1);
  }
}
