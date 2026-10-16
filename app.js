/*
 * Planning Pro — app.js
 *
 * Fluxo do produto:
 *   1. Planejamento cadastra ATIVIDADES, cada uma com suas COLUNAS (estrutura modular).
 *   2. O template Excel de cada atividade = colunas fixas + colunas da atividade.
 *   3. A importação grava cada linha em tb_programacoes (colunas da atividade em dados_personalizados).
 *   4. A equipe de campo vê a programação da sua equipe na semana e registra a execução (tb_execucoes).
 *   5. Dashboard e relatórios comparam programado x executado.
 *
 * Supabase é a fonte de verdade. localStorage guarda apenas preferências visuais.
 */

"use strict";

/* =========================================================
   CONSTANTES
   ========================================================= */

const SUPABASE_URL = window.PPA_SUPABASE_CONFIG?.url || "";
const SUPABASE_KEY = window.PPA_SUPABASE_CONFIG?.anonKey || "";

// Referência de numeração das semanas: segunda-feira 07/09/2026 = W132.
const WEEK_ANCHOR = new Date(2026, 8, 7);
const WEEK_ANCHOR_NUMBER = 132;

const PAGE_SIZE = 50;
const DB_PAGE = 1000;   // limite padrão de linhas do PostgREST
const IN_CHUNK = 150;   // ids por filtro .in() para não estourar a URL

const MODE_APPEND = "INCLUIR_NA_PROGRAMACAO";
const MODE_REPLACE = "NOVA_PROGRAMACAO";

const DISCIPLINE_LABELS = {
  ELETRICA: "Elétrica", INSTRUMENTACAO: "Instrumentação", TUBULACAO: "Tubulação",
  MECANICA: "Mecânica", AUTOMACAO: "Automação", CIVIL: "Civil"
};

const COLUMN_TYPES = { text: "Texto", number: "Número", date: "Data", select: "Lista", boolean: "Sim/Não" };

// Colunas padrão de toda programação. O restante do template é exatamente
// a lista de colunas criada na atividade, na mesma ordem.
const FIXED_COLUMNS = [
  { key: "week", label: "SEMANA", aliases: ["semana", "week", "sem"] },
  { key: "team", label: "EQUIPE", aliases: ["equipe", "team"] }
];

// Chaves de colunas antigas que duplicam as colunas padrão ou são derivadas da execução.
const RESERVED_COLUMN_KEYS = new Set(["week", "semana", "team", "equipe", "logs"]);

// Estrutura inicial, criada no banco apenas se não houver nenhuma atividade.
const DEFAULT_ACTIVITIES = [
  {
    name: "Ponto a Ponto", description: "Verificação ponto a ponto de equipamentos em campo.",
    columns: [["tag", "TAG", "text", true], ["forn", "FORN.", "text"], ["sys", "SYS", "text"], ["subsys", "SUBSYS", "text"],
      ["loop", "LOOP", "text"], ["service", "SERVICE", "text"], ["tipe", "TIPE", "text"], ["descricao", "DESCRIÇÃO", "text"]]
  },
  {
    name: "Loop Teste", description: "Testes de loop e registro do resultado.",
    columns: [["tag", "TAG", "text", true], ["loop", "LOOP", "text", true], ["sys", "SYS", "text"], ["subsys", "SUBSYS", "text"],
      ["teste", "TESTE", "text"], ["resultado", "RESULTADO", "select", false, true, ["APROVADO", "REPROVADO", "PENDENTE"]]]
  },
  {
    name: "Preservação", description: "Preservação de equipamentos e acompanhamento de status.",
    columns: [["tag", "TAG", "text", true], ["equipamento", "EQUIPAMENTO", "text"], ["sys", "SYS", "text"], ["metodo", "MÉTODO", "text"],
      ["status_preservacao", "STATUS", "select", false, true, ["ATIVO", "PRESERVADO", "BLOQUEADO", "LIBERADO"]]]
  }
];

const DEFAULT_SETTINGS = { primary: "#1f5eff", header: "#0f1b2d", chartPlanned: "#1f5eff", chartDone: "#12895a", logo: "" };

const ADMIN_SCREENS = ["dashboard", "programacao", "backlog", "importacoes", "relatorios", "atividades", "equipes", "configuracoes", "perfil"];
const FIELD_SCREENS = ["campo", "historico", "perfil"];

/* =========================================================
   ESTADO
   ========================================================= */

const state = {
  sb: null,
  user: null,                // { id, nome, cracha, perfil, role: "admin"|"technician", equipeId, disciplina, email, authUserId }
  activities: [],            // [{ id, name, description, columns: [...] }]
  teams: [],
  people: [],
  programs: [],              // admin: toda a programação
  executions: new Map(),     // programacao_id -> [execuções]
  equipment: new Map(),      // id -> equipamento
  settings: { ...DEFAULT_SETTINGS },
  loadError: "",

  dashboardWeek: null,
  program: { activityId: null, week: "", team: "", status: "", search: "", page: 0, selected: new Set() },
  backlog: { activity: "", team: "", week: "", search: "", selected: new Set() },
  editingProgramId: null,
  reprogramIds: [],
  activityId: null,
  editingActivityId: null,
  editingColumnId: null,
  editingPersonId: null,
  pendingImport: null,

  field: { weekNum: null, programs: [], status: "", activity: "", search: "", selected: new Set(), activeId: null }
};

/* =========================================================
   UTILITÁRIOS
   ========================================================= */

const $ = id => document.getElementById(id);
const setText = (id, value) => { const el = $(id); if (el) el.textContent = String(value ?? ""); };

const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[c]);
const dash = value => (value === null || value === undefined || String(value).trim() === "") ? "—" : String(value);

const normalizeText = value => String(value ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

function makeKey(label) {
  return normalizeText(label).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
}

const chunk = (list, size) => {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
};

const pad2 = n => String(n).padStart(2, "0");
const toISODate = date => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

function fmtDate(value) {
  if (!value) return "—";
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(value);
}

function fmtDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

// localStorage/sessionStorage podem lançar exceção (modo privado, bloqueio de rastreamento do Edge).
function storageGet(store, key) { try { return store.getItem(key) || ""; } catch { return ""; } }
function storageSet(store, key, value) { try { store.setItem(key, value); return true; } catch { return false; } }
function storageRemove(store, key) { try { store.removeItem(key); } catch { /* indisponível */ } }

const nowStamp = () => fmtDateTime(new Date().toISOString());
const pct = (part, total) => total ? Math.round(part / total * 100) : 0;
const initials = name => String(name || "?").trim().split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase() || "?";
const sortByName = (a, b) => String(a.nome || a.name || "").localeCompare(String(b.nome || b.name || ""), "pt-BR", { numeric: true, sensitivity: "base" });

/* ---------- semanas ---------- */

function currentWeekNumber() {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return WEEK_ANCHOR_NUMBER + Math.floor(Math.round((start - WEEK_ANCHOR) / 86400000) / 7);
}

// Aceita W137, w137, W 137, W-137, Semana 137, 137 e o número 137 do Excel. Tudo vira 137 (exibido como W137).
function weekToNumber(value) {
  if (typeof value === "number") return Number.isInteger(value) && value > 0 ? value : null;
  const s = normalizeText(value).toUpperCase()
    .replace(/^(SEMANA|SEM|WEEK|WK)\.?/, "W")
    .replace(/[\s_-]+/g, "")
    .replace(/[.,]0+$/, "");
  const m = s.match(/^W?(\d{1,4})$/);
  return m && Number(m[1]) > 0 ? Number(m[1]) : null;
}

const weekLabel = n => `W${n}`;
const sortWeeks = list => [...new Set(list.filter(Boolean))].sort((a, b) => weekToNumber(a) - weekToNumber(b));

/* ---------- valores das células ---------- */

const isDateObject = value => Object.prototype.toString.call(value) === "[object Date]";

function normalizeDateValue(value) {
  // +12h absorve o deslocamento de fuso que o SheetJS pode aplicar em datas sem hora.
  if (isDateObject(value)) return Number.isNaN(value.getTime()) ? null : toISODate(new Date(value.getTime() + 43200000));
  if (typeof value === "number" && window.XLSX?.SSF) {
    const p = XLSX.SSF.parse_date_code(value);
    if (p) return `${p.y}-${pad2(p.m)}-${pad2(p.d)}`;
  }
  const s = String(value ?? "").trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const br = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (br) {
    const year = br[3].length === 2 ? `20${br[3]}` : br[3];
    return `${year}-${pad2(br[2])}-${pad2(br[1])}`;
  }
  return null; // inválida
}

function normalizeBoolean(value) {
  const s = normalizeText(value);
  if (!s) return "";
  if (["sim", "s", "yes", "y", "true", "1", "x", "ok"].includes(s)) return "SIM";
  if (["nao", "n", "no", "false", "0"].includes(s)) return "NÃO";
  return null;
}

function cellText(value) {
  if (isDateObject(value)) return normalizeDateValue(value) || "";
  return String(value ?? "").trim();
}

function formatColumnValue(column, value) {
  if (value === null || value === undefined || value === "") return "—";
  if (column?.type === "date") return fmtDate(value);
  return String(value);
}

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

/* =========================================================
   UI HELPERS
   ========================================================= */

function toast(message, type = "") {
  const el = $("toast");
  if (!el) return;
  el.textContent = message;
  el.className = `toast show ${type}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), type === "error" ? 5000 : 2800);
}

function setMessage(id, text, ok = false) {
  const el = $(id);
  if (!el) return;
  el.textContent = text || "";
  el.classList.toggle("ok", ok);
}

async function withButton(button, task) {
  if (!button) return task();
  button.disabled = true;
  button.classList.add("loading");
  try { return await task(); }
  finally { button.disabled = false; button.classList.remove("loading"); }
}

function openModal(id) {
  const modal = $(id);
  if (!modal) return;
  modal.classList.remove("hidden");
  setTimeout(() => modal.querySelector("input:not([type=hidden]):not([disabled]), select, textarea, button.primary")?.focus(), 30);
}

function closeModal(id) {
  $(id)?.classList.add("hidden");
  if (id === "importModal") state.pendingImport = null;
  if (id === "confirmModal" && confirmDialog.resolve) { confirmDialog.resolve(false); confirmDialog.resolve = null; }
}

function confirmDialog({ title = "Confirmar", text = "", okLabel = "Confirmar", danger = false } = {}) {
  setText("confirmTitle", title);
  setText("confirmText", text);
  const ok = $("confirmOk");
  ok.textContent = okLabel;
  ok.classList.toggle("danger", danger);
  openModal("confirmModal");
  return new Promise(resolve => { confirmDialog.resolve = resolve; });
}

function resolveConfirm(value) {
  const resolve = confirmDialog.resolve;
  confirmDialog.resolve = null;
  $("confirmModal")?.classList.add("hidden");
  resolve?.(value);
}

function fillSelect(select, options, { value, placeholder } = {}) {
  if (!select) return;
  const previous = value ?? select.value;
  select.innerHTML = (placeholder !== undefined ? `<option value="">${escapeHTML(placeholder)}</option>` : "")
    + options.map(o => `<option value="${escapeHTML(o.value)}">${escapeHTML(o.label)}</option>`).join("");
  if (options.some(o => String(o.value) === String(previous))) select.value = previous;
  else if (placeholder === undefined && options[0]) select.value = options[0].value;
  else select.value = "";
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* =========================================================
   CONFIGURAÇÕES / TEMA
   ========================================================= */

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem("ppaSettings") || "null") || {};
    state.settings = { ...DEFAULT_SETTINGS, ...Object.fromEntries(Object.entries(saved).filter(([k]) => k in DEFAULT_SETTINGS)) };
  } catch {
    state.settings = { ...DEFAULT_SETTINGS };
  }
  applySettings();
}

function saveSettings() {
  try { localStorage.setItem("ppaSettings", JSON.stringify(state.settings)); }
  catch { toast("Não foi possível salvar: armazenamento do navegador cheio. Use uma logo menor.", "error"); return false; }
  applySettings();
  return true;
}

function applySettings() {
  const root = document.documentElement.style;
  root.setProperty("--primary", state.settings.primary);
  root.setProperty("--chart-planned", state.settings.chartPlanned);
  root.setProperty("--chart-done", state.settings.chartDone);
  document.querySelectorAll("[data-brand-mark]").forEach(el => {
    el.classList.toggle("has-logo", Boolean(state.settings.logo));
    el.style.backgroundImage = state.settings.logo ? `url("${state.settings.logo}")` : "";
    el.textContent = state.settings.logo ? "" : "PP";
  });
}

function renderSettings() {
  const s = state.settings;
  $("settingsPrimary").value = s.primary;
  $("settingsHeader").value = s.header;
  $("settingsPlanned").value = s.chartPlanned;
  $("settingsDone").value = s.chartDone;
  $("settingsLogoPreview").classList.toggle("hidden", !s.logo);
  $("settingsLogoPlaceholder").classList.toggle("hidden", Boolean(s.logo));
  if (s.logo) $("settingsLogoPreview").src = s.logo;
  const docHead = document.querySelector("#docPreview .doc-head");
  if (docHead) { docHead.style.background = s.header; docHead.style.borderBottomColor = s.primary; }
  const docLogo = $("docPreviewLogo");
  docLogo.style.backgroundImage = s.logo ? `url("${s.logo}")` : "";
  docLogo.textContent = s.logo ? "" : "LOGO";
}

// Converte a logo para PNG reduzido: jsPDF não aceita WebP e o localStorage é limitado.
function readLogo(file) {
  return new Promise((resolve, reject) => {
    if (file.size > 400 * 1024) return reject(new Error("A logo deve ter no máximo 400 KB."));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Formato de imagem não suportado."));
      img.onload = () => {
        const scale = Math.min(1, 480 / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/png"));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function applyTheme() {
  const theme = storageGet(localStorage, "ppaTheme");
  if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
  const dark = theme === "dark" || (!theme && window.matchMedia("(prefers-color-scheme: dark)").matches);
  $("themeToggle")?.querySelector("use")?.setAttribute("href", dark ? "#i-sun" : "#i-moon");
}

function toggleTheme() {
  const dark = document.documentElement.dataset.theme === "dark"
    || (!document.documentElement.dataset.theme && window.matchMedia("(prefers-color-scheme: dark)").matches);
  storageSet(localStorage, "ppaTheme", dark ? "light" : "dark");
  applyTheme();
}

/* =========================================================
   AUTENTICAÇÃO
   ========================================================= */

function showLoginStep(step) {
  $("accessChooser").classList.toggle("hidden", step !== "chooser");
  $("adminLoginForm").classList.toggle("hidden", step !== "admin");
  $("technicianLoginForm").classList.toggle("hidden", step !== "technician");
  setMessage("adminLoginMessage", "");
  setMessage("techLoginMessage", "");
  if (step === "admin") $("adminEmail").focus();
  if (step === "technician") $("techAccessCode").focus();
}

function personToUser(p, extra = {}) {
  return {
    id: p.id, nome: p.nome, cracha: p.cracha, perfil: p.perfil,
    role: p.perfil === "ADMINISTRADOR" ? "admin" : "technician",
    equipeId: p.equipe_id || null, disciplina: p.disciplina || "", authUserId: p.auth_user_id || null,
    ...extra
  };
}

async function loadAdminProfile() {
  const sb = requireDb();
  // getSession lê a sessão salva (e renova o token se preciso) sem depender de uma chamada extra ao servidor.
  const { data: auth } = await sb.auth.getSession();
  const authUser = auth?.session?.user;
  if (!authUser) return null;
  const { data, error } = await sb.from("tb_pessoas")
    .select("id,nome,cracha,perfil,ativo,auth_user_id,equipe_id,disciplina")
    .eq("auth_user_id", authUser.id).eq("ativo", true).limit(1).maybeSingle();
  if (error) throw error;
  return data ? personToUser(data, { email: authUser.email || "" }) : null;
}

async function loginAdmin(event) {
  event.preventDefault();
  const email = $("adminEmail").value.trim();
  const password = $("adminPassword").value;
  if (!email || !password) return setMessage("adminLoginMessage", "Informe e-mail e senha.");
  await withButton(event.submitter, async () => {
    try {
      const sb = requireDb();
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error(/invalid login/i.test(error.message) ? "E-mail ou senha incorretos." : error.message);
      const user = await loadAdminProfile();
      if (!user || user.role !== "admin") {
        await sb.auth.signOut();
        throw new Error(user ? "Esta conta não possui perfil de Administrador." : "Usuário sem cadastro ativo em tb_pessoas (auth_user_id).");
      }
      await enterApp(user);
    } catch (error) {
      setMessage("adminLoginMessage", dbErrorMessage(error, "Não foi possível entrar."));
    }
  });
}

async function technicianByCode(code) {
  const sb = requireDb();
  const { data, error } = await sb.rpc("login_tecnico_por_cracha", { p_cracha: code });
  if (error) throw error;
  const person = Array.isArray(data) ? data[0] : data;
  return person && person.perfil !== "ADMINISTRADOR" ? personToUser(person) : null;
}

async function loginTechnician(event) {
  event.preventDefault();
  const code = $("techAccessCode").value.trim();
  if (!code) return setMessage("techLoginMessage", "Informe o código de acesso.");
  await withButton(event.submitter, async () => {
    try {
      const user = await technicianByCode(code);
      if (!user) throw new Error("Código não encontrado ou inativo.");
      storageSet(localStorage, "ppaFieldCode", code);
      await enterApp(user);
    } catch (error) {
      setMessage("techLoginMessage", dbErrorMessage(error, "Não foi possível entrar."));
    }
  });
}

// Ao recarregar a página, só desloga se o acesso for realmente inválido.
// Falha de rede/timeout mantém a sessão guardada e mostra o motivo.
async function restoreSession() {
  const code = storageGet(localStorage, "ppaFieldCode") || storageGet(sessionStorage, "ppaFieldCode");
  if (code) {
    try {
      const user = await technicianByCode(code);
      if (user) { storageSet(localStorage, "ppaFieldCode", code); return user; }
      storageRemove(localStorage, "ppaFieldCode");
    } catch (error) {
      console.warn("Falha ao restaurar sessão de campo:", error);
      return { error: dbErrorMessage(error, "Não foi possível validar o acesso. Tente novamente.") };
    }
  }
  try {
    const user = await loadAdminProfile();
    if (user?.role === "admin") return user;
  } catch (error) {
    console.warn("Falha ao restaurar sessão administrativa:", error);
    return { error: dbErrorMessage(error, "Não foi possível validar a sessão. Tente novamente.") };
  }
  return null;
}

async function logout() {
  try { await db()?.auth.signOut(); } catch (error) { console.warn(error); }
  storageRemove(localStorage, "ppaFieldCode");
  storageRemove(sessionStorage, "ppaFieldCode");
  state.user = null;
  state.programs = [];
  state.executions = new Map();
  state.field = { ...state.field, programs: [], selected: new Set(), activeId: null };
  $("appShell").classList.add("hidden");
  $("loginScreen").classList.remove("hidden");
  $("adminLoginForm").reset();
  $("technicianLoginForm").reset();
  history.replaceState(null, "", location.pathname);
  showLoginStep("chooser");
}

async function enterApp(user) {
  state.user = user;
  $("loginScreen").classList.add("hidden");
  $("appShell").classList.remove("hidden");
  document.querySelectorAll("[data-nav-role]").forEach(nav => nav.classList.toggle("active", nav.dataset.navRole === user.role));
  renderUserChrome();
  updateBacklogBadge();
  await syncAll();
  route();
}

function renderUserChrome() {
  const u = state.user;
  if (!u) return;
  setText("sidebarRole", u.role === "admin" ? "Planejamento" : "Equipe de campo");
  setText("sidebarAvatar", initials(u.nome));
  setText("sidebarUserName", u.nome);
  setText("sidebarUserMeta", u.role === "admin" ? (u.email || "Administrador") : (teamName(u.equipeId) || "Sem equipe"));
}

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

function personByName(name) {
  const target = normalizeText(name);
  if (!target) return null;
  const matches = state.people.filter(p => normalizeText(p.nome) === target);
  return matches.length === 1 ? matches[0] : null;
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

/* =========================================================
   NAVEGAÇÃO
   ========================================================= */

function route() {
  if (!state.user) return;
  const allowed = state.user.role === "admin" ? ADMIN_SCREENS : FIELD_SCREENS;
  let screen = location.hash.replace("#", "");
  if (!allowed.includes(screen)) screen = allowed[0];

  document.querySelectorAll(".screen").forEach(el => el.classList.toggle("active", el.id === `screen-${screen}`));
  document.querySelectorAll(".nav-item[data-screen]").forEach(el => el.classList.toggle("active", el.dataset.screen === screen));
  const section = $(`screen-${screen}`);
  setText("topbarTitle", section?.dataset.title || "");
  setText("topbarKicker", section?.dataset.kicker || "");
  document.title = `${section?.dataset.title || ""} · Planning Pro`;
  closeSidebar();
  renderScreen(screen);
  window.scrollTo({ top: 0 });
}

function currentScreen() {
  return document.querySelector(".screen.active")?.id.replace("screen-", "") || "";
}

function renderScreen(screen = currentScreen()) {
  ({
    dashboard: renderDashboard,
    programacao: renderProgramacao,
    importacoes: renderImportHistory,
    relatorios: renderReports,
    atividades: renderActivities,
    equipes: renderEquipes,
    configuracoes: renderSettings,
    perfil: renderProfile,
    campo: renderField,
    historico: renderFieldHistory,
    backlog: renderBacklog
  })[screen]?.();
  updateBacklogBadge();
}

function goTo(screen) {
  if (location.hash === `#${screen}`) route();
  else location.hash = screen;
}

function closeSidebar() {
  $("sidebar").classList.remove("open");
  $("sidebarOverlay").classList.remove("show");
}

/* =========================================================
   ESTATÍSTICAS
   ========================================================= */

function summarize(programs) {
  const total = programs.length;
  const done = programs.filter(isDone).length;
  return { total, done, pending: total - done, rate: pct(done, total) };
}

function groupBy(programs, keyOf, labelOf) {
  const map = new Map();
  programs.forEach(p => {
    const key = keyOf(p) ?? "";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(p);
  });
  return [...map.entries()]
    .map(([key, list]) => ({ key, label: labelOf(key), ...summarize(list) }))
    .sort((a, b) => b.total - a.total || String(a.label).localeCompare(String(b.label), "pt-BR"));
}

const byActivity = programs => groupBy(programs, p => p.activityId, id => activityById(id)?.name || "Atividade removida");
const byTeam = programs => groupBy(programs, p => p.teamId, id => teamName(id) || "Sem equipe");

function allWeeks() {
  // As semanas vêm da própria programação importada (coluna SEMANA do Excel).
  return sortWeeks([...state.programs.map(p => p.week), weekLabel(currentWeekNumber())]);
}

// Reta de mínimos quadrados sobre os valores semanais (x = posição da semana no gráfico).
function linearTrend(values) {
  const n = values.length;
  if (n < 2) return null;
  const mx = (n - 1) / 2;
  const my = values.reduce((a, b) => a + b, 0) / n;
  const den = values.reduce((acc, _, i) => acc + (i - mx) ** 2, 0);
  const slope = values.reduce((acc, v, i) => acc + (i - mx) * (v - my), 0) / den;
  return { slope, at: i => my + slope * (i - mx) };
}

const fmtSlope = v => `${v > 0.05 ? "+" : v < -0.05 ? "−" : "±"}${Math.abs(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}`;

const CHART_AREA = 170;   // altura da área das barras (px)
const CHART_BAR_MAX = 150; // altura da maior barra (px)

function renderBarChart(host, series, currentWeek) {
  if (!host) return;
  if (!series.length) { host.innerHTML = `<div class="empty inline"><span>Sem programação no período.</span></div>`; return; }
  const max = Math.max(1, ...series.flatMap(s => [s.total, s.done]));
  const n = series.length;
  const y = v => Math.max(0, CHART_AREA - Math.min(Math.max(v, 0), max * CHART_AREA / CHART_BAR_MAX) / max * CHART_BAR_MAX);
  const x = i => (i + 0.5) / n * 100;

  const trends = [
    { key: "planned", label: "previsto", trend: linearTrend(series.map(s => s.total)) },
    { key: "done", label: "realizado", trend: linearTrend(series.map(s => s.done)) }
  ];
  const lines = trends.filter(t => t.trend).map(t => {
    const coords = `x1="${x(0)}" y1="${y(t.trend.at(0))}" x2="${x(n - 1)}" y2="${y(t.trend.at(n - 1))}"`;
    return `<line class="trend-halo" ${coords}/><line class="trend-line ${t.key}" ${coords}><title>Tendência ${t.label}: ${fmtSlope(t.trend.slope)} item(ns)/semana</title></line>`;
  }).join("");

  host.innerHTML = `
    <div class="bar-plot" style="min-width:${n * 56}px">
      <div class="bar-area">
        ${series.map(s => `
          <div class="bar-slot ${s.week === currentWeek ? "current" : ""}" title="${escapeHTML(s.week)}: ${s.done} de ${s.total} (${s.rate}%)">
            <i class="bar planned" style="height:${Math.round(s.total / max * CHART_BAR_MAX)}px"><b>${s.total}</b></i>
            <i class="bar done" style="height:${Math.round(s.done / max * CHART_BAR_MAX)}px"><b>${s.done}</b></i>
          </div>`).join("")}
        <svg class="trend-svg" viewBox="0 0 100 ${CHART_AREA}" preserveAspectRatio="none" aria-hidden="true">${lines}</svg>
      </div>
      <div class="bar-labels">${series.map(s => `<small class="${s.week === currentWeek ? "current" : ""}">${escapeHTML(s.week)}</small>`).join("")}</div>
    </div>
    <p class="trend-note">${n < 2
      ? "A tendência aparece a partir de 2 semanas com programação."
      : trends.map(t => `<span><i class="trend-swatch ${t.key}"></i><span>Tendência ${t.label}: <b>${fmtSlope(t.trend.slope)}</b> item(ns)/semana</span></span>`).join("")}</p>`;
}

function renderProgressList(host, groups, emptyText = "Sem dados.") {
  if (!host) return;
  host.innerHTML = groups.length ? groups.map(g => `
    <div class="progress-row">
      <strong title="${escapeHTML(g.label)}">${escapeHTML(g.label)}</strong>
      <span><b>${g.done}</b>/${g.total} · ${g.rate}%</span>
      <div class="meter"><i style="width:${g.rate}%"></i></div>
    </div>`).join("") : `<div class="empty inline"><span>${escapeHTML(emptyText)}</span></div>`;
}

function weeklySeries(programs, weeks) {
  return weeks.map(week => ({ week, ...summarize(programs.filter(p => p.week === week)) }));
}

/* =========================================================
   DASHBOARD
   ========================================================= */

function renderDashboard() {
  const weeks = allWeeks();
  if (!state.dashboardWeek || !weeks.includes(state.dashboardWeek)) state.dashboardWeek = weekLabel(currentWeekNumber());
  fillSelect($("dashboardWeek"), weeks.slice().reverse().map(w => ({ value: w, label: w })), { value: state.dashboardWeek });

  const week = state.dashboardWeek;
  const programs = state.programs.filter(p => p.week === week);
  const s = summarize(programs);
  setText("kpiPlanned", s.total);
  setText("kpiDone", s.done);
  setText("kpiPending", s.pending);
  setText("kpiRate", `${s.rate}%`);
  $("kpiRateBar").style.width = `${s.rate}%`;

  // Até 10 semanas com programação, terminando na semana selecionada.
  const n = weekToNumber(week);
  const withData = sortWeeks(state.programs.map(p => p.week)).filter(w => weekToNumber(w) <= n);
  if (!withData.includes(week)) withData.push(week);
  renderBarChart($("dashboardWeekly"), weeklySeries(state.programs, withData.slice(-10)), week);
  renderProgressList($("dashboardTeams"), byTeam(programs), "Nenhuma equipe programada nesta semana.");
  renderProgressList($("dashboardActivities"), byActivity(programs), "Nenhuma atividade programada nesta semana.");

  // Backlog: tudo que ficou pendente em semanas anteriores à selecionada.
  const backlog = state.programs.filter(p => isBacklog(p, n));
  setText("kpiBacklog", backlog.length);
  setText("kpiBacklogText", backlog.length ? `pendentes antes de ${week}` : "nada pendente antes desta semana");
  const origin = groupBy(backlog, p => p.week, w => w).sort((a, b) => weekToNumber(a.key) - weekToNumber(b.key));
  const maxOrigin = Math.max(1, ...origin.map(g => g.total));
  $("dashboardBacklog").innerHTML = origin.length ? origin.map(g => {
    const teams = byTeam(backlog.filter(p => p.week === g.key)).map(t => `${t.label} ${t.total}`).join(" · ");
    return `<div class="progress-row">
      <strong class="mono">${escapeHTML(g.key)}</strong>
      <span><b>${g.total}</b> item(ns) · ${n - weekToNumber(g.key)} sem. de atraso</span>
      <div class="meter"><i style="width:${Math.round(g.total / maxOrigin * 100)}%;background:var(--danger)"></i></div>
      <small class="muted sm" style="grid-column:1/-1">${escapeHTML(teams)}</small>
    </div>`;
  }).join("") : `<div class="empty inline"><span>Sem backlog até ${escapeHTML(week)}.</span></div>`;
  $("dashboardBacklogBtn").disabled = !backlog.length;

  // Apontamentos: registros de execução mais recentes.
  const byId = new Map(state.programs.map(p => [p.id, p]));
  const latest = [...state.executions.values()].flat()
    .filter(e => byId.has(e.programacao_id))
    .sort((a, b) => String(b.executado_em).localeCompare(String(a.executado_em)))
    .slice(0, 8);
  $("dashboardApontamentos").innerHTML = latest.map(e => {
    const p = byId.get(e.programacao_id);
    return `<div class="timeline-item"><div>
      <strong>${escapeHTML(programTitle(p))} <span class="muted sm">· ${escapeHTML(activityById(p.activityId)?.name || "")} · ${escapeHTML(p.week)}</span></strong>
      <small>${escapeHTML(fmtDateTime(e.executado_em))} · ${escapeHTML(executorName(e))} · ${escapeHTML(teamName(p.teamId) || "sem equipe")}</small>
      ${e.observacao ? `<p>${escapeHTML(e.observacao)}</p>` : ""}
    </div></div>`;
  }).join("");
}

function updateBacklogBadge() {
  const badge = $("navBacklogCount");
  if (!badge) return;
  const count = state.user?.role === "admin" ? state.programs.filter(p => isBacklog(p)).length : 0;
  badge.textContent = count > 99 ? "99+" : String(count);
  badge.classList.toggle("hidden", !count);
}

/* =========================================================
   PROGRAMAÇÃO
   ========================================================= */

// Colunas da atividade que entram no template/tabela (exclui as que duplicam campos fixos).
function activityColumns(activity) {
  return (activity?.columns || []).filter(c => !RESERVED_COLUMN_KEYS.has(c.key));
}

// SEMANA, EQUIPE e depois as colunas da atividade, na ordem configurada.
function templateColumns(activity) {
  return [
    ...FIXED_COLUMNS.map(f => ({ ...f, fixed: true })),
    ...activityColumns(activity).map(c => ({ ...c, fixed: false }))
  ];
}

function equipmentValue(program, key) {
  const eq = state.equipment.get(program.equipmentId);
  if (!eq) return undefined;
  return eq[key === "type" ? "tipe" : key];
}

function columnValue(program, column) {
  const v = program.customData?.[column.key];
  if (v !== undefined && v !== null && v !== "") return v;
  return equipmentValue(program, column.key) ?? "";
}

function titleColumn(activity) {
  const cols = activityColumns(activity);
  return cols.find(c => c.key === "tag") || cols.find(c => /tag|equipamento/.test(c.key)) || cols[0] || null;
}

function programTitle(program) {
  const activity = activityById(program.activityId);
  const col = titleColumn(activity);
  return (col && columnValue(program, col)) || activity?.name || "Item programado";
}

function filteredAdminPrograms() {
  const f = state.program;
  const q = normalizeText(f.search);
  const activity = activityById(f.activityId);
  const cols = activityColumns(activity);
  return state.programs.filter(p => {
    if (p.activityId !== f.activityId) return false;
    if (f.week && p.week !== f.week) return false;
    if (f.team && p.teamId !== f.team) return false;
    if (f.status === "done" && !isDone(p)) return false;
    if (f.status === "pending" && isDone(p)) return false;
    if (f.status === "backlog" && !isBacklog(p)) return false;
    if (q) {
      const hay = [p.week, teamName(p.teamId), p.note, ...cols.map(c => columnValue(p, c))].map(normalizeText).join(" ");
      if (!hay.includes(q)) return false;
    }
    return true;
  }).sort((a, b) => b.weekNum - a.weekNum || teamName(a.teamId).localeCompare(teamName(b.teamId), "pt-BR") || String(programTitle(a)).localeCompare(String(programTitle(b)), "pt-BR", { numeric: true }));
}

function renderProgramFilters() {
  if (!activityById(state.program.activityId)) state.program.activityId = state.activities[0]?.id || null;
  fillSelect($("programActivity"), state.activities.map(a => ({ value: a.id, label: a.name })), { value: state.program.activityId });
  const weeks = sortWeeks(state.programs.filter(p => p.activityId === state.program.activityId).map(p => p.week)).reverse();
  fillSelect($("programWeekFilter"), weeks.map(w => ({ value: w, label: w })), { value: state.program.week, placeholder: "Todas" });
  fillSelect($("programTeamFilter"), state.teams.map(t => ({ value: t.id, label: t.nome })), { value: state.program.team, placeholder: "Todas" });
  state.program.week = $("programWeekFilter").value;
  state.program.team = $("programTeamFilter").value;
}

function renderProgramacao() {
  renderProgramFilters();
  const activity = activityById(state.program.activityId);
  const cols = activityColumns(activity);
  const rows = filteredAdminPrograms();
  const s = summarize(rows);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  state.program.page = Math.min(state.program.page, pages - 1);
  const pageRows = rows.slice(state.program.page * PAGE_SIZE, (state.program.page + 1) * PAGE_SIZE);

  setText("programTableTitle", activity ? activity.name : "Programações");
  setText("programTableMeta", activity ? `${rows.length} item(ns) · ${s.done} executado(s) · ${s.pending} pendente(s)` : "Cadastre uma atividade para começar.");

  const sel = state.program.selected;
  const allOnPage = pageRows.length > 0 && pageRows.every(p => sel.has(p.id));
  $("programTableHead").innerHTML = `<tr><th class="check-col"><input type="checkbox" data-select-page ${allOnPage ? "checked" : ""} aria-label="Selecionar página"></th><th>Semana</th><th>Equipe</th>${cols.map(c => `<th>${escapeHTML(c.label)}</th>`).join("")}<th>Situação</th><th>Executado em</th><th></th></tr>`;
  $("programTableBody").innerHTML = pageRows.map(p => {
    const done = isDone(p);
    const last = executionsOf(p.id).at(-1);
    return `<tr class="${sel.has(p.id) ? "selected" : ""}">
      <td class="check-col"><input type="checkbox" data-select-program="${escapeHTML(p.id)}" ${sel.has(p.id) ? "checked" : ""} aria-label="Selecionar"></td>
      <td class="mono">${escapeHTML(p.week)}${reprogramChip(p)}</td>
      <td>${escapeHTML(dash(teamName(p.teamId)))}</td>
      ${cols.map(c => `<td title="${escapeHTML(columnValue(p, c))}">${escapeHTML(formatColumnValue(c, columnValue(p, c)))}</td>`).join("")}
      <td>${statusBadge(p)}</td>
      <td title="${last ? escapeHTML(`${fmtDateTime(last.executado_em)} · ${executorName(last)}`) : ""}">${last ? `${escapeHTML(fmtDate(toISODate(new Date(last.executado_em))))}${executionsOf(p.id).length > 1 ? ` <span class="chip">${executionsOf(p.id).length}x</span>` : ""}` : "—"}</td>
      <td class="actions-cell"><span class="row-actions">
        <button class="icon-btn sm" type="button" data-edit-program="${escapeHTML(p.id)}" title="Editar"><svg class="icon"><use href="#i-edit"/></svg></button>
        <button class="icon-btn sm" type="button" data-move-program="${escapeHTML(p.id)}" title="Reprogramar" ${done ? "disabled" : ""}><svg class="icon"><use href="#i-forward"/></svg></button>
        <button class="icon-btn sm danger" type="button" data-delete-program="${escapeHTML(p.id)}" title="Excluir"><svg class="icon"><use href="#i-trash"/></svg></button>
      </span></td>
    </tr>`;
  }).join("");
  $("programEmpty").classList.toggle("hidden", rows.length > 0);
  setText("programBulkCount", sel.size);
  $("programBulk").classList.toggle("hidden", !sel.size);

  $("programPager").innerHTML = pages > 1 ? `
    <span>Página ${state.program.page + 1} de ${pages} · ${rows.length} itens</span>
    <div class="actions">
      <button class="btn ghost sm" type="button" data-page="-1" ${state.program.page === 0 ? "disabled" : ""}>Anterior</button>
      <button class="btn ghost sm" type="button" data-page="1" ${state.program.page >= pages - 1 ? "disabled" : ""}>Próxima</button>
    </div>` : "";
}

async function deleteProgram(id) {
  const program = state.programs.find(p => p.id === id);
  if (!program) return;
  const executed = executionsOf(id).length;
  const ok = await confirmDialog({
    title: "Excluir programação?",
    text: `${programTitle(program)} · ${program.week} · ${teamName(program.teamId) || "sem equipe"}.${executed ? ` Este item possui ${executed} registro(s) de execução.` : ""}`,
    okLabel: "Excluir", danger: true
  });
  if (!ok) return;
  try {
    await withBusy(async () => {
      const { error } = await requireDb().from("tb_programacoes").delete().eq("id", id);
      if (error) throw error;
    });
    state.programs = state.programs.filter(p => p.id !== id);
    renderProgramacao();
    toast("Programação excluída.");
  } catch (error) {
    toast(dbErrorMessage(error), "error");
  }
}

/* ---------- lançamento manual ---------- */

function weekOptionsForForm() {
  const current = currentWeekNumber();
  const near = [current - 1, current, current + 1, current + 2].map(weekLabel);
  return sortWeeks([...state.programs.map(p => p.week), ...near]).map(w => ({ value: w, label: w }));
}

function renderCustomInputs(host, activity, values = {}, { prefix = "pf", editableOnly = false } = {}) {
  host.innerHTML = activityColumns(activity).map(c => {
    const value = values[c.key] ?? "";
    const disabled = editableOnly && !c.technicianEditable ? "disabled" : "";
    const attrs = `data-custom-key="${escapeHTML(c.key)}" data-type="${c.type}" ${disabled}`;
    const label = escapeHTML(c.label);
    let control;
    if (c.type === "select" || c.type === "boolean") {
      const opts = c.type === "boolean" ? ["SIM", "NÃO"] : c.options;
      const hasValue = !value || opts.some(o => String(o) === String(value));
      control = `<select ${attrs}><option value="">Selecione</option>${opts.map(o => `<option ${String(o) === String(value) ? "selected" : ""}>${escapeHTML(o)}</option>`).join("")}${hasValue ? "" : `<option selected>${escapeHTML(value)}</option>`}</select>`;
    } else {
      const type = c.type === "number" ? "number" : c.type === "date" ? "date" : "text";
      control = `<input ${attrs} type="${type}" ${c.type === "number" ? 'step="any"' : ""} value="${escapeHTML(value)}">`;
    }
    return `<label class="field" id="${prefix}-${escapeHTML(c.key)}">${label}${control}</label>`;
  }).join("");
}

function collectCustomInputs(host) {
  const data = {};
  host.querySelectorAll("[data-custom-key]").forEach(input => {
    data[input.dataset.customKey] = String(input.value ?? "").trim();
  });
  return { data };
}

function openProgramModal(id = null) {
  if (!state.activities.length) return toast("Cadastre uma atividade primeiro.", "error");
  const editing = id ? state.programs.find(p => p.id === id) : null;
  state.editingProgramId = editing?.id || null;
  setText("programModalTitle", editing ? `Editar · ${programTitle(editing)}` : "Nova programação");
  setText("programModalText", editing
    ? `${activityById(editing.activityId)?.name || ""} · ${isDone(editing) ? "item já executado: a alteração não muda os registros de campo." : "altere a semana, a equipe ou os dados do item."}`
    : "Lançamento manual de um item. Para cargas grandes, use a importação de Excel.");
  setText("programFormSubmit", editing ? "Salvar alterações" : "Salvar programação");

  fillSelect($("pfActivity"), state.activities.map(a => ({ value: a.id, label: a.name })), { value: editing?.activityId || state.program.activityId });
  $("pfActivity").disabled = Boolean(editing);
  const weeks = weekOptionsForForm();
  if (editing && !weeks.some(w => w.value === editing.week)) weeks.unshift({ value: editing.week, label: editing.week });
  fillSelect($("pfWeek"), sortWeeks(weeks.map(w => w.value)).map(w => ({ value: w, label: w })), { value: editing?.week || state.program.week || weekLabel(currentWeekNumber()) });
  const teams = state.teams.filter(t => t.ativo || t.id === editing?.teamId);
  fillSelect($("pfTeam"), teams.map(t => ({ value: t.id, label: t.nome })), { value: editing?.teamId || state.program.team, placeholder: "Selecione a equipe" });
  const activity = activityById($("pfActivity").value);
  const values = editing ? Object.fromEntries(activityColumns(activity).map(c => [c.key, columnValue(editing, c)])) : {};
  renderCustomInputs($("pfCustom"), activity, values);
  setMessage("programFormMessage", "");
  openModal("programModal");
}

async function saveProgramForm(event) {
  event.preventDefault();
  const activity = activityById($("pfActivity").value);
  const weekNum = weekToNumber($("pfWeek").value);
  const team = teamById($("pfTeam").value);
  const { data: customData } = collectCustomInputs($("pfCustom"));
  if (!activity || !weekNum || !team) return setMessage("programFormMessage", "Escolha atividade, semana e equipe.");
  const editing = state.programs.find(p => p.id === state.editingProgramId) || null;
  if (editing) return updateProgram(event.submitter, editing, { weekNum, team, customData });

  await withButton(event.submitter, async () => {
    try {
      await withBusy(async () => {
        const equipmentIds = await resolveEquipment([customData]);
        const tag = tagOf(customData);
        const payload = {
          equipamento_id: tag ? equipmentIds.get(tag) || null : null,
          semana: weekNum,
          status: "PROGRAMADO",
          atividade_id: activity.id,
          data_programacao: null,
          equipe_id: team.id,
          responsavel_id: null,
          quantidade: 1,
          observacao: null,
          dados_personalizados: customData,
          modo_importacao: MODE_APPEND,
          arquivo_importacao: null,
          usuario_importacao: state.user.authUserId
        };
        const { data, error } = await requireDb().from("tb_programacoes").insert(payload).select(PROGRAM_COLUMNS).single();
        if (error) throw error;
        state.programs.push(mapProgram(data));
      });
      closeModal("programModal");
      state.program.activityId = activity.id;
      renderProgramacao();
      toast("Programação cadastrada.");
    } catch (error) {
      setMessage("programFormMessage", dbErrorMessage(error));
    }
  });
}

/* ---------- edição, reprogramação e backlog ---------- */

function statusBadge(p) {
  if (isDone(p)) return `<span class="status done">Executado</span>`;
  if (isBacklog(p)) return `<span class="status late" title="Semana já passou e o item não foi executado">Backlog</span>`;
  return `<span class="status pending">Pendente</span>`;
}

function reprogramChip(p) {
  const prev = previousWeeks(p);
  if (!prev.length) return "";
  return `<span class="chip warn" title="Reprogramado de ${escapeHTML(prev.map(weekLabel).join(" → "))}">↻ ${escapeHTML(weekLabel(prev.at(-1)))}</span>`;
}

// Atualiza um item no banco e no estado local. Mudar a semana de um item pendente registra o histórico.
function programUpdatePayload(p, { weekNum, teamId, customData, equipmentId }) {
  const data = { ...p.customData, ...(customData || {}) };
  if (weekNum !== p.weekNum && !isDone(p)) data[HISTORY_KEY] = [...previousWeeks(p), p.weekNum];
  return {
    semana: weekNum,
    equipe_id: teamId,
    dados_personalizados: data,
    ...(equipmentId !== undefined ? { equipamento_id: equipmentId } : {}),
    updated_at: new Date().toISOString()
  };
}

async function updateProgram(button, p, { weekNum, team, customData }) {
  await withButton(button, async () => {
    try {
      await withBusy(async () => {
        let equipmentId;
        const newTag = tagOf(customData);
        if (normalizeText(newTag) !== normalizeText(tagOf(p.customData))) {
          equipmentId = newTag ? (await resolveEquipment([customData])).get(newTag) || null : null;
        }
        const payload = programUpdatePayload(p, { weekNum, teamId: team.id, customData, equipmentId });
        const { data, error } = await requireDb().from("tb_programacoes").update(payload).eq("id", p.id).select(PROGRAM_COLUMNS).single();
        if (error) throw error;
        Object.assign(p, mapProgram(data));
      });
      closeModal("programModal");
      renderScreen();
      updateBacklogBadge();
      toast("Programação atualizada.");
    } catch (error) {
      setMessage("programFormMessage", error?.code === "23505"
        ? `Esta TAG já está programada em ${weekLabel(weekNum)}. Escolha outra semana ou ajuste o item existente.`
        : dbErrorMessage(error));
    }
  });
}

function suggestedTargetWeek(programs) {
  const current = currentWeekNumber();
  const latest = Math.max(...programs.map(p => p.weekNum));
  return Math.max(current, latest) + 1;
}

function openReprogram(ids) {
  const programs = ids.map(id => state.programs.find(p => p.id === id)).filter(Boolean);
  const pending = programs.filter(p => !isDone(p));
  if (!pending.length) return toast("Os itens selecionados já foram executados; não há o que reprogramar.", "error");
  state.reprogramIds = pending.map(p => p.id);
  const skipped = programs.length - pending.length;
  setText("reprogramTitle", pending.length === 1 ? `Reprogramar ${programTitle(pending[0])}` : `Reprogramar ${pending.length} itens`);
  const fromWeeks = sortWeeks(pending.map(p => p.week)).join(", ");
  setText("reprogramText", `Origem: ${fromWeeks}.${skipped ? ` ${skipped} item(ns) já executado(s) ficam onde estão.` : ""} O histórico da semana original fica registrado no item.`);

  const target = suggestedTargetWeek(pending);
  const current = currentWeekNumber();
  const options = [];
  for (let w = current; w <= Math.max(target, current) + 6; w++) options.push({ value: String(w), label: `${weekLabel(w)}${w === current ? " · atual" : w === current + 1 ? " · próxima" : ""}` });
  fillSelect($("reprogramWeek"), options, { value: String(target) });
  fillSelect($("reprogramTeam"), state.teams.filter(t => t.ativo).map(t => ({ value: t.id, label: t.nome })), { value: "", placeholder: "Manter a equipe de cada item" });
  setMessage("reprogramMessage", "");
  renderReprogramWarning();
  openModal("reprogramModal");
}

// O banco não aceita a mesma TAG duas vezes na mesma semana: detecta antes de gravar.
function reprogramConflicts(targetWeek) {
  const moving = new Set(state.reprogramIds);
  const occupied = new Set(state.programs.filter(p => p.weekNum === targetWeek && !moving.has(p.id) && p.equipmentId).map(p => p.equipmentId));
  const seen = new Set();
  const conflicts = [];
  state.reprogramIds.forEach(id => {
    const p = state.programs.find(x => x.id === id);
    if (!p?.equipmentId) return;
    if (occupied.has(p.equipmentId) || seen.has(p.equipmentId)) conflicts.push(p);
    seen.add(p.equipmentId);
  });
  return conflicts;
}

function renderReprogramWarning() {
  const target = Number($("reprogramWeek").value);
  const conflicts = reprogramConflicts(target);
  const warn = $("reprogramWarn");
  warn.classList.toggle("hidden", !conflicts.length);
  warn.textContent = conflicts.length
    ? `${conflicts.length} item(ns) já têm a mesma TAG programada em ${weekLabel(target)} e serão mantidos na semana atual: ${conflicts.slice(0, 8).map(programTitle).join(", ")}${conflicts.length > 8 ? "…" : ""}.`
    : "";
}

async function confirmReprogram() {
  const target = Number($("reprogramWeek").value);
  const teamId = $("reprogramTeam").value || null;
  const blocked = new Set(reprogramConflicts(target).map(p => p.id));
  const programs = state.reprogramIds.map(id => state.programs.find(p => p.id === id)).filter(p => p && !blocked.has(p.id) && p.weekNum !== target);
  if (!programs.length) return setMessage("reprogramMessage", "Nenhum item pode ser movido para esta semana.");

  await withButton($("reprogramConfirm"), async () => {
    const failed = [];
    let moved = 0;
    await withBusy(async () => {
      const sb = requireDb();
      for (const part of chunk(programs, 10)) {
        const results = await Promise.all(part.map(async p => {
          const payload = programUpdatePayload(p, { weekNum: target, teamId: teamId || p.teamId });
          payload.status = "PROGRAMADO";
          const { data, error } = await sb.from("tb_programacoes").update(payload).eq("id", p.id).select(PROGRAM_COLUMNS).single();
          return { p, data, error };
        }));
        results.forEach(({ p, data, error }) => {
          if (error) failed.push(`${programTitle(p)}: ${error.code === "23505" ? `TAG já programada em ${weekLabel(target)}` : dbErrorMessage(error)}`);
          else { Object.assign(p, mapProgram(data)); moved++; }
        });
      }
    });
    state.program.selected.clear();
    state.backlog.selected.clear();
    updateBacklogBadge();
    renderScreen();
    if (failed.length) {
      setMessage("reprogramMessage", `${moved} reprogramado(s). Não foi possível mover ${failed.length}: ${failed.slice(0, 5).join("; ")}${failed.length > 5 ? "…" : ""}`);
    } else {
      closeModal("reprogramModal");
      toast(`${moved} item(ns) reprogramado(s) para ${weekLabel(target)}${blocked.size ? ` · ${blocked.size} mantido(s) por conflito de TAG` : ""}.`);
    }
  });
}

async function deleteSelectedPrograms() {
  const ids = [...state.program.selected];
  if (!ids.length) return;
  const executed = ids.filter(id => executionsOf(id).length).length;
  const ok = await confirmDialog({
    title: `Excluir ${ids.length} programação(ões)?`,
    text: executed ? `${executed} delas têm registro de execução e o banco pode recusar a exclusão desses itens.` : "Os itens serão removidos da programação.",
    okLabel: "Excluir", danger: true
  });
  if (!ok) return;
  const removed = new Set();
  const failed = [];
  await withBusy(async () => {
    const sb = requireDb();
    for (const part of chunk(ids, IN_CHUNK)) {
      const { error } = await sb.from("tb_programacoes").delete().in("id", part);
      if (!error) { part.forEach(id => removed.add(id)); continue; }
      // Algum item do lote está vinculado (ex.: execução): tenta um a um para remover os demais.
      for (const id of part) {
        const { error: one } = await sb.from("tb_programacoes").delete().eq("id", id);
        if (one) failed.push(id); else removed.add(id);
      }
    }
  });
  state.programs = state.programs.filter(p => !removed.has(p.id));
  state.program.selected = new Set(failed);
  updateBacklogBadge();
  renderProgramacao();
  toast(failed.length ? `${removed.size} excluída(s); ${failed.length} não puderam ser excluídas (possuem execuções).` : `${removed.size} programação(ões) excluída(s).`, failed.length ? "error" : "");
}

function filteredBacklog() {
  const f = state.backlog;
  const q = normalizeText(f.search);
  return state.programs.filter(p => isBacklog(p)
    && (!f.activity || p.activityId === f.activity)
    && (!f.team || p.teamId === f.team)
    && (!f.week || p.week === f.week)
    && (!q || [programTitle(p), teamName(p.teamId), activityById(p.activityId)?.name, ...activityColumns(activityById(p.activityId)).map(c => columnValue(p, c))].map(normalizeText).join(" ").includes(q)))
    .sort((a, b) => a.weekNum - b.weekNum || teamName(a.teamId).localeCompare(teamName(b.teamId), "pt-BR") || String(programTitle(a)).localeCompare(String(programTitle(b)), "pt-BR", { numeric: true }));
}

function renderBacklog() {
  const current = currentWeekNumber();
  const all = state.programs.filter(p => isBacklog(p));
  setText("backlogCurrentWeek", weekLabel(current));
  setText("backlogTotal", all.length);
  const oldest = all.reduce((min, p) => Math.min(min, p.weekNum), Infinity);
  setText("backlogOldest", Number.isFinite(oldest) ? weekLabel(oldest) : "—");
  setText("backlogOldestText", Number.isFinite(oldest) ? `${current - oldest} semana(s) de atraso` : "semana de origem");
  setText("backlogTeams", new Set(all.map(p => p.teamId)).size);
  setText("backlogMoved", all.filter(p => previousWeeks(p).length).length);

  const f = state.backlog;
  fillSelect($("backlogActivity"), state.activities.filter(a => all.some(p => p.activityId === a.id)).map(a => ({ value: a.id, label: a.name })), { value: f.activity, placeholder: "Todas" });
  fillSelect($("backlogTeam"), state.teams.filter(t => all.some(p => p.teamId === t.id)).map(t => ({ value: t.id, label: t.nome })), { value: f.team, placeholder: "Todas" });
  fillSelect($("backlogWeek"), sortWeeks(all.map(p => p.week)).map(w => ({ value: w, label: w })), { value: f.week, placeholder: "Todas" });
  Object.assign(f, { activity: $("backlogActivity").value, team: $("backlogTeam").value, week: $("backlogWeek").value });

  const visibleIds = new Set(all.map(p => p.id));
  f.selected = new Set([...f.selected].filter(id => visibleIds.has(id)));
  const rows = filteredBacklog();
  setText("backlogMeta", `${rows.length} de ${all.length} item(ns)`);
  $("backlogBody").innerHTML = rows.slice(0, 500).map(p => {
    const activity = activityById(p.activityId);
    const details = activityColumns(activity).filter(c => c !== titleColumn(activity)).map(c => [c, columnValue(p, c)]).filter(([, v]) => v !== "").slice(0, 3);
    const prev = previousWeeks(p);
    return `<tr class="${f.selected.has(p.id) ? "selected" : ""}">
      <td class="check-col"><input type="checkbox" data-select-backlog="${escapeHTML(p.id)}" ${f.selected.has(p.id) ? "checked" : ""} aria-label="Selecionar"></td>
      <td class="mono">${escapeHTML(p.week)}</td>
      <td><span class="chip danger">${current - p.weekNum} sem.</span></td>
      <td>${escapeHTML(activity?.name || "—")}</td>
      <td class="wrap"><strong class="mono">${escapeHTML(programTitle(p))}</strong><br><small class="muted">${details.map(([c, v]) => `${escapeHTML(c.label)} ${escapeHTML(formatColumnValue(c, v))}`).join(" · ")}</small></td>
      <td>${escapeHTML(dash(teamName(p.teamId)))}</td>
      <td>${prev.length ? `<span class="muted sm">${escapeHTML([...prev, p.weekNum].map(weekLabel).join(" → "))}</span>` : `<span class="muted sm">—</span>`}</td>
      <td class="actions-cell"><span class="row-actions">
        <button class="icon-btn sm" type="button" data-edit-program="${escapeHTML(p.id)}" title="Editar"><svg class="icon"><use href="#i-edit"/></svg></button>
        <button class="icon-btn sm" type="button" data-move-program="${escapeHTML(p.id)}" title="Reprogramar"><svg class="icon"><use href="#i-forward"/></svg></button>
      </span></td>
    </tr>`;
  }).join("");
  $("backlogEmpty").classList.toggle("hidden", rows.length > 0);
  const allSel = $("backlogSelectAll");
  allSel.checked = rows.length > 0 && rows.every(p => f.selected.has(p.id));
  allSel.indeterminate = !allSel.checked && rows.some(p => f.selected.has(p.id));
  setText("backlogBulkCount", f.selected.size);
  $("backlogBulk").classList.toggle("hidden", !f.selected.size);
}

/* ---------- equipamentos (TAG) ---------- */

function tagOf(data) {
  for (const key of ["tag", "TAG", "equipamento", "EQUIPAMENTO"]) {
    const v = String(data?.[key] ?? "").trim();
    if (v) return v;
  }
  return "";
}

// Garante tb_equipamentos para cada TAG em lote: 1 consulta + 1 inserção, em vez de N chamadas.
async function resolveEquipment(records) {
  const sb = requireDb();
  const byTag = new Map();
  records.forEach(r => { const tag = tagOf(r); if (tag && !byTag.has(tag)) byTag.set(tag, r); });
  const ids = new Map();
  if (!byTag.size) return ids;

  const existing = await fetchIn("tb_equipamentos", "id,tag", "tag", [...byTag.keys()]);
  existing.forEach(e => ids.set(e.tag, e.id));

  const pick = (r, keys) => { for (const k of keys) { const v = String(r?.[k] ?? "").trim(); if (v) return v; } return null; };
  const missing = [...byTag.entries()].filter(([tag]) => !ids.has(tag)).map(([tag, r]) => ({
    tag,
    forn: pick(r, ["forn"]), sys: pick(r, ["sys"]), subsys: pick(r, ["subsys"]), loop: pick(r, ["loop"]),
    service: pick(r, ["service"]), tipe: pick(r, ["tipe", "type"]), descricao: pick(r, ["descricao", "equipamento"]),
    ativo: true
  }));
  for (const part of chunk(missing, 500)) {
    const { data, error } = await sb.from("tb_equipamentos").insert(part).select("id,tag");
    if (error) throw error;
    (data || []).forEach(e => ids.set(e.tag, e.id));
  }
  return ids;
}

/* =========================================================
   EXCEL — TEMPLATE, LEITURA E IMPORTAÇÃO
   ========================================================= */

function requireXLSX() {
  if (!window.XLSX) throw new Error("A biblioteca de Excel não carregou. Verifique a conexão e recarregue a página.");
}

function styleHeaderRow(sheet, count) {
  const headerFill = state.settings.header.replace("#", "").toUpperCase();
  for (let c = 0; c < count; c++) {
    const cell = sheet[XLSX.utils.encode_cell({ r: 0, c })];
    if (cell) cell.s = { fill: { fgColor: { rgb: headerFill } }, font: { bold: true, color: { rgb: "FFFFFF" } }, alignment: { horizontal: "center", vertical: "center" } };
  }
  sheet["!rows"] = [{ hpt: 24 }];
}

function downloadTemplate(activity) {
  if (!activity) return toast("Selecione uma atividade.", "error");
  try {
    requireXLSX();
    const cols = templateColumns(activity);
    const headers = cols.map(c => c.label);
    const example = cols.map(c => {
      if (c.key === "week") return weekLabel(currentWeekNumber());
      if (c.key === "team") return state.teams.find(t => t.ativo)?.nome || "Equipe A";
      return "";
    });
    const sheet = XLSX.utils.aoa_to_sheet([headers, example]);
    sheet["!cols"] = headers.map(h => ({ wch: Math.max(14, Math.min(36, h.length + 6)) }));
    sheet["!autofilter"] = { ref: `A1:${XLSX.utils.encode_col(headers.length - 1)}1` };
    styleHeaderRow(sheet, headers.length);

    const info = [
      ["Atividade", activity.name],
      ["Gerado em", nowStamp()],
      [],
      ["Como preencher"],
      ["1", "Não altere nem renomeie os cabeçalhos. SEMANA e EQUIPE são as colunas padrão; as demais são as colunas da atividade."],
      ["2", "SEMANA: escreva a semana em cada linha, como W137 ou apenas 137 (o sistema grava como W137)."],
      ["3", "EQUIPE: nome de uma equipe cadastrada (lista abaixo)."],
      ["4", "As colunas da atividade podem ficar em branco. Datas em DD/MM/AAAA ou como data do Excel."],
      ["5", "Cada linha vira um item programado para a equipe de campo."],
      [],
      ["Coluna", "Tipo", "Equipe de campo edita", "Opções aceitas"],
      ...cols.map(c => [c.label, c.fixed ? "Padrão" : COLUMN_TYPES[c.type], c.technicianEditable ? "Sim" : "Não",
        c.type === "select" ? c.options.join(", ") : c.type === "boolean" ? "SIM, NÃO" : ""]),
      [],
      ["Equipes cadastradas"],
      ...state.teams.filter(t => t.ativo).map(t => [t.nome, DISCIPLINE_LABELS[t.disciplina] || t.disciplina || ""])
    ];
    const infoSheet = XLSX.utils.aoa_to_sheet(info);
    infoSheet["!cols"] = [{ wch: 26 }, { wch: 60 }, { wch: 22 }, { wch: 40 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, "Programação");
    XLSX.utils.book_append_sheet(wb, infoSheet, "Leia-me");
    XLSX.writeFile(wb, `template_${makeKey(activity.name)}.xlsx`);
    toast("Template gerado.");
  } catch (error) {
    toast(error.message, "error");
  }
}

async function readSheetRows(file) {
  requireXLSX();
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  const name = wb.SheetNames.find(n => makeKey(n) === "programacao") || wb.SheetNames[0];
  if (!name) throw new Error("O arquivo não possui planilhas.");
  return XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: "", raw: true, blankrows: false });
}

// Valida e converte as linhas do Excel. Retorna registros válidos e a lista completa de erros.
function parseProgramRows(rows, activity) {
  if (!rows.length) throw new Error("A planilha está vazia.");
  const headers = rows[0].map(h => makeKey(cellText(h)));
  const used = new Set();
  const findIndex = candidates => {
    const idx = headers.findIndex((h, i) => !used.has(i) && candidates.includes(h));
    if (idx >= 0) used.add(idx);
    return idx;
  };

  const customCols = activityColumns(activity).map(c => ({ col: c, index: findIndex([makeKey(c.label), c.key]) }));
  const fixed = Object.fromEntries(FIXED_COLUMNS.map(f => [f.key, findIndex([makeKey(f.label), ...f.aliases])]));

  // SEMANA e EQUIPE definem para quem e quando o item aparece: sem elas a linha não tem destino.
  const missingHeaders = FIXED_COLUMNS.filter(f => fixed[f.key] < 0).map(f => f.label);
  if (missingHeaders.length) throw new Error(`O arquivo precisa das colunas padrão ${missingHeaders.join(" e ")}. Baixe o template da atividade “${activity.name}”.`);

  const errors = [];
  const records = [];
  const at = (row, i) => (i >= 0 ? row[i] : "");

  rows.slice(1).forEach((row, i) => {
    if (!row.some(v => cellText(v) !== "")) return;
    const line = i + 2;
    const rowErrors = [];

    const weekNum = weekToNumber(cellText(at(row, fixed.week)));
    if (!weekNum) rowErrors.push(`SEMANA “${cellText(at(row, fixed.week)) || "vazia"}” inválida (use W137 ou 137)`);

    const teamText = cellText(at(row, fixed.team));
    const team = teamByName(teamText);
    if (!teamText) rowErrors.push("EQUIPE vazia");
    else if (!team) rowErrors.push(`equipe “${teamText}” não cadastrada`);
    else if (!team.ativo) rowErrors.push(`equipe “${team.nome}” está inativa`);

    const customData = {};
    customCols.forEach(({ col, index }) => {
      const raw = at(row, index);
      let value = cellText(raw);
      if (value && col.type === "date") {
        const d = normalizeDateValue(raw);
        if (d === null) rowErrors.push(`${col.label}: data inválida`); else value = d;
      } else if (value && col.type === "number") {
        const n = Number(value.replace(/\s/g, "").replace(",", "."));
        if (!Number.isFinite(n)) rowErrors.push(`${col.label}: número inválido`); else value = String(n);
      } else if (value && col.type === "boolean") {
        const b = normalizeBoolean(value);
        if (b === null) rowErrors.push(`${col.label}: use SIM ou NÃO`); else value = b;
      } else if (value && col.type === "select" && col.options.length) {
        const match = col.options.find(o => normalizeText(o) === normalizeText(value));
        if (!match) rowErrors.push(`${col.label}: “${value}” fora da lista (${col.options.join(", ")})`); else value = match;
      }
      customData[col.key] = value;
    });

    if (rowErrors.length) { errors.push(`Linha ${line}: ${rowErrors.join("; ")}.`); return; }
    records.push({ line, weekNum, week: weekLabel(weekNum), team, customData });
  });

  // Cada TAG vira um equipamento; o banco não aceita o mesmo equipamento duas vezes na mesma semana.
  const byKey = new Map();
  records.forEach(r => {
    const key = duplicateKey(r.weekNum, r.customData);
    if (key) byKey.set(key, [...(byKey.get(key) || []), r]);
  });
  byKey.forEach(list => {
    if (list.length < 2) return;
    errors.push(`TAG “${tagOf(list[0].customData)}” repetida em ${list[0].week} nas linhas ${list.map(r => r.line).join(", ")}. Deixe uma linha por TAG em cada semana.`);
  });

  if (!records.length && !errors.length) throw new Error("O arquivo não possui linhas de dados.");
  return { records, errors };
}

// Identifica o item programado: mesma semana e mesma TAG (equipamento).
function duplicateKey(weekNum, customData) {
  const tag = normalizeText(tagOf(customData));
  return tag ? `${weekNum}|${tag}` : null;
}

// Converte de volta para linha do banco (usado para restaurar itens em caso de falha).
function programToRow(p) {
  return {
    id: p.id, equipamento_id: p.equipmentId, semana: p.weekNum, status: p.status, atividade_id: p.activityId,
    data_programacao: p.date || null, equipe_id: p.teamId, responsavel_id: p.responsibleId || null, quantidade: 1,
    observacao: p.note || null, dados_personalizados: p.customData, modo_importacao: p.mode || MODE_APPEND,
    arquivo_importacao: p.file || null, usuario_importacao: p.importedBy || null, created_at: p.createdAt
  };
}

const DB_COLUMN_LABELS = { equipamento_id: "TAG", semana: "SEMANA", atividade_id: "ATIVIDADE", equipe_id: "EQUIPE" };

// Traduz a recusa de chave duplicada (23505) indicando quais linhas do arquivo causaram o conflito.
function describeUniqueViolation(error, records, equipmentIds) {
  const m = String(error?.details || "").match(/Key \(([^)]+)\)=\(([^)]*)\)/);
  const constraint = String(error?.message || "").match(/constraint "([^"]+)"/)?.[1] || "";
  if (!m) return `O banco recusou itens duplicados${constraint ? ` (restrição ${constraint})` : ""}. ${error?.details || error?.message || ""}`;
  const cols = m[1].split(",").map(s => s.trim());
  const vals = m[2].split(",").map(s => s.trim());
  const tagById = new Map([...equipmentIds.entries()].map(([tag, id]) => [String(id), tag]));
  const readable = cols.map((c, i) => `${DB_COLUMN_LABELS[c] || c} ${c === "equipamento_id" ? (tagById.get(vals[i]) || vals[i]) : c === "semana" ? weekLabel(vals[i]) : c === "equipe_id" ? (teamName(vals[i]) || vals[i]) : vals[i]}`);
  const lines = records.filter(r => cols.every((c, i) =>
    c === "equipamento_id" ? String(equipmentIds.get(tagOf(r.customData))) === vals[i]
      : c === "semana" ? String(r.weekNum) === vals[i]
      : c === "equipe_id" ? String(r.team.id) === vals[i]
      : true)).map(r => r.line);
  return `O banco não aceita duas programações com a mesma combinação ${cols.map(c => DB_COLUMN_LABELS[c] || c).join(" + ")} (restrição ${constraint}). `
    + `Conflito: ${readable.join(", ")}${lines.length ? ` — linha(s) ${lines.join(", ")} do arquivo` : ""}. `
    + "Esse item já está programado no banco ou repetido no arquivo.";
}

async function handleProgramFile(file) {
  const activity = activityById(state.program.activityId);
  if (!file) return;
  if (!activity) return toast("Selecione uma atividade antes de importar.", "error");
  try {
    const rows = await readSheetRows(file);
    // Recarrega do banco: a base pode ter sido alterada fora do app (ex.: limpeza via SQL).
    await withBusy(loadAdminPrograms);
    const { records, errors } = parseProgramRows(rows, activity);
    const existingKeys = new Set(state.programs.filter(p => p.activityId === activity.id).map(p => duplicateKey(p.weekNum, p.customData)).filter(Boolean));
    const duplicates = records.filter(r => existingKeys.has(duplicateKey(r.weekNum, r.customData))).length;
    state.pendingImport = { file: file.name, activityId: activity.id, records, errors, duplicates };
    renderImportModal();
    openModal("importModal");
  } catch (error) {
    toast(error.message || "Não foi possível ler o arquivo.", "error");
  }
}

function replaceCandidates(pending) {
  const weeks = new Set(pending.records.map(r => r.weekNum));
  return state.programs.filter(p => p.activityId === pending.activityId && weeks.has(p.weekNum) && !isDone(p));
}

function renderImportModal() {
  const pending = state.pendingImport;
  if (!pending) return;
  const activity = activityById(pending.activityId);
  const weeks = sortWeeks(pending.records.map(r => r.week));
  setText("importFile", pending.file);
  setText("importActivity", activity?.name || "—");
  setText("importCount", pending.records.length);
  setText("importWeeks", weeks.join(", ") || "—");

  const errorsBox = $("importErrors");
  errorsBox.classList.toggle("hidden", !pending.errors.length);
  if (pending.errors.length) {
    errorsBox.innerHTML = `<strong>${pending.errors.length} problema(s) no arquivo. Corrija o arquivo e importe novamente — nenhuma linha será gravada enquanto houver erros.</strong><ul>${pending.errors.slice(0, 200).map(e => `<li>${escapeHTML(e)}</li>`).join("")}</ul>${pending.errors.length > 200 ? `<p>… e mais ${pending.errors.length - 200}.</p>` : ""}`;
  }

  const cols = templateColumns(activity);
  const preview = pending.records.slice(0, 6);
  $("importPreview").innerHTML = `<thead><tr><th>Linha</th>${cols.map(c => `<th>${escapeHTML(c.label)}</th>`).join("")}</tr></thead><tbody>${preview.map(r => `<tr><td class="mono">${r.line}</td>${cols.map(c => {
    const v = c.key === "week" ? r.week : c.key === "team" ? r.team.nome : formatColumnValue(c, r.customData[c.key]);
    return `<td>${escapeHTML(dash(v))}</td>`;
  }).join("")}</tr>`).join("")}</tbody>`;
  $("importPreview").querySelectorAll("tbody td").forEach(td => { td.style.fontStyle = "normal"; td.style.color = "var(--text)"; });
  $("importPreviewWrap").classList.toggle("hidden", !preview.length);

  const replaceCount = replaceCandidates(pending).length;
  $("importReplaceHint").innerHTML = `Remove <b>${replaceCount}</b> item(ns) <b>pendente(s)</b> de ${escapeHTML(activity?.name || "")} em ${escapeHTML(weeks.join(", ") || "—")} e grava o arquivo. Itens já executados são mantidos.`;
  $("importDupWrap").classList.toggle("hidden", !pending.duplicates);
  setText("importDupText", `Ignorar ${pending.duplicates} linha(s) que já estão programadas (mesma semana e TAG)`);
  setMessage("importMessage", "");
  $("importConfirm").disabled = Boolean(pending.errors.length) || !pending.records.length;
  $("importModes").classList.toggle("hidden", Boolean(pending.errors.length));
}

async function confirmImport() {
  const pending = state.pendingImport;
  if (!pending || pending.errors.length) return;
  const activity = activityById(pending.activityId);
  const mode = document.querySelector('input[name="importMode"]:checked')?.value === "replace" ? MODE_REPLACE : MODE_APPEND;
  const skipDuplicates = mode === MODE_APPEND && $("importSkipDup").checked;
  const toReplace = mode === MODE_REPLACE ? replaceCandidates(pending).map(p => p.id) : [];

  if (mode === MODE_REPLACE && toReplace.length) {
    const ok = await confirmDialog({ title: "Substituir programação?", text: `${toReplace.length} item(ns) pendente(s) serão removidos e substituídos pelas ${pending.records.length} linhas do arquivo.`, okLabel: "Substituir", danger: true });
    if (!ok) return;
  }

  let records = pending.records;
  let equipmentIds = new Map();
  await withButton($("importConfirm"), async () => {
    try {
      const inserted = await withBusy(async () => {
        const sb = requireDb();
        if (skipDuplicates) {
          const existing = new Set(state.programs.filter(p => p.activityId === activity.id).map(p => duplicateKey(p.weekNum, p.customData)).filter(Boolean));
          records = records.filter(r => !existing.has(duplicateKey(r.weekNum, r.customData)));
        }
        equipmentIds = await resolveEquipment(records.map(r => r.customData));
        const payloads = records.map(r => ({
          equipamento_id: equipmentIds.get(tagOf(r.customData)) || null,
          semana: r.weekNum,
          status: "PROGRAMADO",
          atividade_id: activity.id,
          data_programacao: null,
          equipe_id: r.team.id,
          responsavel_id: null,
          quantidade: 1,
          observacao: null,
          dados_personalizados: r.customData,
          modo_importacao: mode,
          arquivo_importacao: pending.file,
          usuario_importacao: state.user.authUserId
        }));
        // Remove os pendentes substituídos ANTES de gravar: a nova carga normalmente traz as mesmas
        // TAGs/semanas, e o banco recusaria duplicidade. Se qualquer etapa falhar, tudo é desfeito.
        const removed = state.programs.filter(p => toReplace.includes(p.id));
        const created = [];
        try {
          for (const part of chunk(toReplace, IN_CHUNK)) {
            const { error } = await sb.from("tb_programacoes").delete().in("id", part);
            if (error) throw error;
          }
          for (const part of chunk(payloads, 500)) {
            const { data, error } = await sb.from("tb_programacoes").insert(part).select(PROGRAM_COLUMNS);
            if (error) throw error;
            created.push(...(data || []).map(mapProgram));
          }
        } catch (error) {
          const rollbackFailed = await rollbackImport(created, removed);
          if (rollbackFailed) error.rollbackFailed = rollbackFailed;
          throw error;
        }
        const removedIds = new Set(toReplace);
        state.programs = [...state.programs.filter(p => !removedIds.has(p.id)), ...created];
        return { created: created.length, skipped: pending.records.length - records.length };
      });
      closeModal("importModal");
      state.program.week = "";
      renderProgramacao();
      const parts = [`${inserted.created} item(ns) importado(s)`];
      if (toReplace.length) parts.push(`${toReplace.length} substituído(s)`);
      if (inserted.skipped) parts.push(`${inserted.skipped} duplicado(s) ignorado(s)`);
      toast(parts.join(" · ") + ".");
    } catch (error) {
      console.warn("Importação recusada:", error?.code, error?.message, error?.details);
      const base = error?.code === "23505"
        ? describeUniqueViolation(error, records, equipmentIds)
        : dbErrorMessage(error, "Não foi possível gravar a importação.");
      setMessage("importMessage", error?.rollbackFailed
        ? `${base} ATENÇÃO: não foi possível desfazer totalmente (${error.rollbackFailed}). Clique em Atualizar e confira a programação.`
        : `${base} Nenhuma programação foi alterada.`);
    }
  });
}

// Desfaz uma importação que falhou no meio: apaga o que foi gravado e restaura os itens substituídos.
async function rollbackImport(created, removed) {
  const sb = requireDb();
  const problems = [];
  for (const part of chunk(created.map(p => p.id), IN_CHUNK)) {
    const { error } = await sb.from("tb_programacoes").delete().in("id", part);
    if (error) problems.push(`remover itens novos: ${error.message}`);
  }
  for (const part of chunk(removed.map(programToRow), 500)) {
    const { error } = await sb.from("tb_programacoes").upsert(part, { onConflict: "id", ignoreDuplicates: true });
    if (error) problems.push(`restaurar itens substituídos: ${error.message}`);
  }
  return problems.join("; ");
}

function exportProgramList() {
  const activity = activityById(state.program.activityId);
  if (!activity) return;
  try {
    requireXLSX();
    const cols = activityColumns(activity);
    const rows = filteredAdminPrograms();
    const headers = ["SEMANA", "EQUIPE", ...cols.map(c => c.label), "SITUAÇÃO", "ÚLTIMA EXECUÇÃO", "EXECUTADO POR", "EXECUÇÕES"];
    const data = rows.map(p => {
      const ex = executionsOf(p.id);
      return [p.week, teamName(p.teamId), ...cols.map(c => columnValue(p, c)),
        isDone(p) ? "EXECUTADO" : "PENDENTE", ex.length ? fmtDateTime(ex.at(-1).executado_em) : "", ex.length ? executorName(ex.at(-1)) : "", ex.length];
    });
    const sheet = XLSX.utils.aoa_to_sheet([headers, ...data]);
    sheet["!cols"] = headers.map(h => ({ wch: Math.max(12, Math.min(34, h.length + 6)) }));
    sheet["!autofilter"] = { ref: `A1:${XLSX.utils.encode_col(headers.length - 1)}${data.length + 1}` };
    styleHeaderRow(sheet, headers.length);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, "Programação");
    XLSX.writeFile(wb, `programacao_${makeKey(activity.name)}${state.program.week ? `_${state.program.week}` : ""}.xlsx`);
  } catch (error) {
    toast(error.message, "error");
  }
}

/* =========================================================
   HISTÓRICO DE IMPORTAÇÕES (derivado do banco)
   ========================================================= */

function importBatches() {
  // Uma importação grava as linhas em sequência; agrupa por arquivo/modo/usuário com até 3 min de intervalo.
  const sorted = [...state.programs].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  const batches = [];
  const open = new Map();
  sorted.forEach(p => {
    const key = `${p.file || "manual"}|${p.mode}|${p.importedBy}|${p.file ? "" : String(p.createdAt).slice(0, 10)}`;
    const time = new Date(p.createdAt).getTime();
    const current = open.get(key);
    if (current && (!p.file || time - current.last <= 180000)) {
      current.items.push(p);
      current.last = time;
    } else {
      const batch = { key, file: p.file, mode: p.mode, importedBy: p.importedBy, first: p.createdAt, last: time, items: [p] };
      batches.push(batch);
      open.set(key, batch);
    }
  });
  return batches.reverse();
}

function renderImportHistory() {
  const host = $("importHistory");
  const batches = importBatches();
  if (!batches.length) {
    host.innerHTML = `<div class="card empty"><svg class="icon xl"><use href="#i-history"/></svg><strong>Nenhuma programação cadastrada</strong><span>As importações de Excel aparecerão aqui.</span></div>`;
    return;
  }
  host.innerHTML = batches.slice(0, 100).map((b, index) => {
    const s = summarize(b.items);
    const acts = [...new Set(b.items.map(p => activityById(p.activityId)?.name || "Atividade removida"))].join(", ");
    const weeks = sortWeeks(b.items.map(p => p.week)).join(", ");
    const who = state.people.find(p => p.auth_user_id && p.auth_user_id === b.importedBy)?.nome || "";
    const modeChip = !b.file ? `<span class="chip">MANUAL</span>` : b.mode === MODE_REPLACE ? `<span class="chip warn">NOVA PROGRAMAÇÃO</span>` : `<span class="chip primary">INCLUSÃO</span>`;
    const activity = activityById(b.items[0].activityId);
    const cols = activityColumns(activity).slice(0, 4);
    return `<details class="card import-batch" ${index === 0 ? "open" : ""}>
      <summary>
        ${modeChip}
        <div class="grow"><strong>${escapeHTML(b.file || "Lançamentos manuais")}</strong><small>${escapeHTML(fmtDateTime(b.first))}${who ? ` · ${escapeHTML(who)}` : ""} · ${escapeHTML(acts)} · ${escapeHTML(weeks)}</small></div>
        <span class="badge">${b.items.length} itens</span>
        <span class="chip ok">${s.rate}% executado</span>
      </summary>
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr><th>Semana</th><th>Equipe</th>${cols.map(c => `<th>${escapeHTML(c.label)}</th>`).join("")}<th>Situação</th></tr></thead>
          <tbody>${b.items.slice(0, 200).map(p => `<tr><td class="mono">${escapeHTML(p.week)}</td><td>${escapeHTML(dash(teamName(p.teamId)))}</td>${cols.map(c => `<td>${escapeHTML(formatColumnValue(c, columnValue(p, c)))}</td>`).join("")}<td><span class="status ${isDone(p) ? "done" : "pending"}">${isDone(p) ? "Executado" : "Pendente"}</span></td></tr>`).join("")}</tbody>
        </table>
      </div>
    </details>`;
  }).join("");
}

/* =========================================================
   RELATÓRIOS
   ========================================================= */

function reportFilters() {
  return { week: $("reportWeek").value, activity: $("reportActivity").value, team: $("reportTeam").value };
}

function reportPrograms(f = reportFilters(), { ignoreWeek = false } = {}) {
  return state.programs.filter(p =>
    (ignoreWeek || !f.week || p.week === f.week) &&
    (!f.activity || p.activityId === f.activity) &&
    (!f.team || p.teamId === f.team));
}

function renderReports() {
  fillSelect($("reportWeek"), allWeeks().reverse().map(w => ({ value: w, label: w })), { placeholder: "Todas" });
  fillSelect($("reportActivity"), state.activities.map(a => ({ value: a.id, label: a.name })), { placeholder: "Todas" });
  fillSelect($("reportTeam"), state.teams.map(t => ({ value: t.id, label: t.nome })), { placeholder: "Todas" });

  const f = reportFilters();
  const programs = reportPrograms(f);
  const s = summarize(programs);
  setText("reportPlanned", s.total);
  setText("reportDone", s.done);
  setText("reportPending", s.pending);
  setText("reportRate", `${s.rate}%`);
  $("reportRateBar").style.width = `${s.rate}%`;

  const trendSource = reportPrograms(f, { ignoreWeek: true });
  renderBarChart($("reportWeekly"), weeklySeries(trendSource, sortWeeks(trendSource.map(p => p.week)).slice(-16)), f.week);
  renderProgressList($("reportTeams"), byTeam(programs), "Sem dados no recorte.");
  renderProgressList($("reportActivities"), byActivity(programs), "Sem dados no recorte.");
}

/* =========================================================
   ATIVIDADES E COLUNAS
   ========================================================= */

function renderActivities() {
  if (!activityById(state.activityId)) state.activityId = state.activities[0]?.id || null;
  setText("activityCount", state.activities.length);
  $("activityList").innerHTML = state.activities.map(a => `
    <button class="select-item ${a.id === state.activityId ? "active" : ""}" type="button" data-activity="${escapeHTML(a.id)}">
      <strong>${escapeHTML(a.name)}</strong>
      <small>${activityColumns(a).length} coluna(s) · ${state.programs.filter(p => p.activityId === a.id).length} programação(ões)</small>
    </button>`).join("") || `<div class="empty inline"><span>Nenhuma atividade.</span></div>`;

  const activity = activityById(state.activityId);
  $("activityEmpty").classList.toggle("hidden", Boolean(activity));
  $("activityEditor").classList.toggle("hidden", !activity);
  if (!activity) return;

  const cols = activity.columns;
  setText("activityTitle", activity.name);
  setText("activityDescription", activity.description || "Sem descrição.");
  setText("activityColCount", cols.length);
  setText("activityEditCount", cols.filter(c => c.technicianEditable).length);
  setText("activityProgCount", state.programs.filter(p => p.activityId === activity.id).length);
  setText("templateFileName", `template_${makeKey(activity.name)}.xlsx`);

  $("columnList").innerHTML = cols.map((c, i) => {
    const reserved = RESERVED_COLUMN_KEYS.has(c.key);
    return `<div class="column-row" draggable="true" data-column="${escapeHTML(c.id)}">
      <span class="grip" title="Arrastar"><svg class="icon"><use href="#i-grip"/></svg></span>
      <span class="order">${i + 1}</span>
      <div class="name"><strong>${escapeHTML(c.label)}</strong><small>${escapeHTML(c.key)}</small></div>
      <span class="type"><span class="chip">${COLUMN_TYPES[c.type]}</span></span>
      <div class="flags">
        ${c.technicianEditable ? `<span class="chip primary">Editável em campo</span>` : ""}
        ${c.type === "select" ? `<span class="chip" title="${escapeHTML(c.options.join(", "))}">${c.options.length} opções</span>` : ""}
        ${reserved ? `<span class="chip warn" title="Coberta pelas colunas padrão SEMANA/EQUIPE ou pelos registros de execução">Ignorada no template</span>` : ""}
      </div>
      <div class="row-actions">
        <button class="icon-btn sm" type="button" data-move="-1" data-col="${escapeHTML(c.id)}" ${i === 0 ? "disabled" : ""} title="Subir"><svg class="icon"><use href="#i-up"/></svg></button>
        <button class="icon-btn sm" type="button" data-move="1" data-col="${escapeHTML(c.id)}" ${i === cols.length - 1 ? "disabled" : ""} title="Descer"><svg class="icon"><use href="#i-down"/></svg></button>
        <button class="icon-btn sm" type="button" data-edit-col="${escapeHTML(c.id)}" title="Editar"><svg class="icon"><use href="#i-edit"/></svg></button>
        <button class="icon-btn sm danger" type="button" data-delete-col="${escapeHTML(c.id)}" title="Excluir"><svg class="icon"><use href="#i-trash"/></svg></button>
      </div>
    </div>`;
  }).join("");

  const tcols = templateColumns(activity);
  $("templatePreview").innerHTML = `<thead><tr>${tcols.map(c => `<th>${escapeHTML(c.label)}</th>`).join("")}</tr></thead>
    <tbody><tr>${tcols.map(c => `<td>${escapeHTML(c.key === "week" ? weekLabel(currentWeekNumber()) : c.key === "team" ? "Equipe A" :c.type === "select" ? (c.options[0] || "opção") : c.type === "date" ? "DD/MM/AAAA" : c.type === "number" ? "0" : c.type === "boolean" ? "SIM" : "")}</td>`).join("")}</tr></tbody>`;
}

function openActivityModal(id = null) {
  const activity = id ? activityById(id) : null;
  state.editingActivityId = activity?.id || null;
  setText("activityModalTitle", activity ? "Editar atividade" : "Nova atividade");
  $("afName").value = activity?.name || "";
  $("afDescription").value = activity?.description || "";
  setMessage("activityFormMessage", "");
  openModal("activityModal");
}

async function saveActivity(event) {
  event.preventDefault();
  const name = $("afName").value.trim().replace(/\s+/g, " ");
  const description = $("afDescription").value.trim();
  if (!name) return setMessage("activityFormMessage", "Informe o nome.");
  if (state.activities.some(a => normalizeText(a.name) === normalizeText(name) && a.id !== state.editingActivityId)) {
    return setMessage("activityFormMessage", "Já existe uma atividade com esse nome.");
  }
  await withButton(event.submitter, async () => {
    try {
      await withBusy(async () => {
        const sb = requireDb();
        if (state.editingActivityId) {
          const { error } = await sb.from("tb_atividades").update({ nome: name, descricao: description || null, updated_at: new Date().toISOString() }).eq("id", state.editingActivityId);
          if (error) throw error;
          Object.assign(activityById(state.editingActivityId), { name, description });
        } else {
          const { data, error } = await sb.from("tb_atividades").insert({ nome: name, descricao: description || null, ativo: true }).select("id").single();
          if (error) throw error;
          state.activities.push({ id: data.id, name, description, columns: [] });
          state.activityId = data.id;
        }
      });
      closeModal("activityModal");
      renderActivities();
      toast("Atividade salva.");
    } catch (error) {
      setMessage("activityFormMessage", dbErrorMessage(error));
    }
  });
}

async function deactivateActivity() {
  const activity = activityById(state.activityId);
  if (!activity) return;
  const count = state.programs.filter(p => p.activityId === activity.id).length;
  const ok = await confirmDialog({
    title: `Desativar “${activity.name}”?`,
    text: `A atividade deixa de aparecer para programação e para o campo.${count ? ` As ${count} programação(ões) existentes são preservadas no banco.` : ""}`,
    okLabel: "Desativar", danger: true
  });
  if (!ok) return;
  try {
    await withBusy(async () => {
      const { error } = await requireDb().from("tb_atividades").update({ ativo: false, updated_at: new Date().toISOString() }).eq("id", activity.id);
      if (error) throw error;
    });
    state.activities = state.activities.filter(a => a.id !== activity.id);
    state.activityId = state.activities[0]?.id || null;
    renderActivities();
    toast("Atividade desativada.");
  } catch (error) {
    toast(dbErrorMessage(error), "error");
  }
}

function openColumnModal(id = null) {
  const activity = activityById(state.activityId);
  if (!activity) return;
  const column = id ? activity.columns.find(c => c.id === id) : null;
  state.editingColumnId = column?.id || null;
  setText("columnModalTitle", column ? "Editar coluna" : "Nova coluna");
  $("cfLabel").value = column?.label || "";
  $("cfKey").value = column?.key || "";
  $("cfKey").disabled = Boolean(column);
  setText("cfKeyHint", column ? "A chave não pode ser alterada: os dados já gravados usam este identificador." : "Gerada a partir do nome. Identificador usado no banco.");
  $("cfType").value = column?.type || "text";
  $("cfOptions").value = (column?.options || []).join(", ");
  $("cfEditable").checked = Boolean(column?.technicianEditable);
  $("cfOptionsWrap").classList.toggle("hidden", $("cfType").value !== "select");
  setMessage("columnFormMessage", "");
  openModal("columnModal");
}

async function saveColumn(event) {
  event.preventDefault();
  const activity = activityById(state.activityId);
  if (!activity) return;
  const editing = activity.columns.find(c => c.id === state.editingColumnId) || null;
  const label = $("cfLabel").value.trim().replace(/\s+/g, " ");
  const key = editing ? editing.key : makeKey($("cfKey").value || label);
  const type = $("cfType").value;
  const options = type === "select" ? [...new Set($("cfOptions").value.split(",").map(o => o.trim()).filter(Boolean))] : [];

  if (!label || !key) return setMessage("columnFormMessage", "Informe o nome da coluna.");
  if (type === "select" && !options.length) return setMessage("columnFormMessage", "Informe ao menos uma opção para a lista.");
  if (activity.columns.some(c => c.id !== editing?.id && (c.key === key || makeKey(c.label) === makeKey(label)))) {
    return setMessage("columnFormMessage", "Já existe uma coluna com esse nome ou chave nesta atividade.");
  }
  if (!editing && FIXED_COLUMNS.some(f => f.key === key || [makeKey(f.label), ...f.aliases].includes(makeKey(label)))) {
    return setMessage("columnFormMessage", `“${label}” já é uma coluna padrão do template (SEMANA e EQUIPE).`);
  }

  // Nenhuma coluna é obrigatória: a importação aceita células em branco.
  const payload = {
    rotulo: label, tipo: type, obrigatorio: false, editavel_tecnico: $("cfEditable").checked,
    opcoes: options, updated_at: new Date().toISOString()
  };

  await withButton(event.submitter, async () => {
    try {
      await withBusy(async () => {
        const sb = requireDb();
        if (editing) {
          const { error } = await sb.from("tb_atividade_colunas").update(payload).eq("id", editing.id);
          if (error) throw error;
          Object.assign(editing, { label, type, required: payload.obrigatorio, technicianEditable: payload.editavel_tecnico, options });
        } else {
          const ordem = activity.columns.length;
          const { data, error } = await sb.from("tb_atividade_colunas").insert({ ...payload, atividade_id: activity.id, chave: key, ordem }).select("*").single();
          if (error) throw error;
          activity.columns.push(mapColumn(data));
        }
      });
      closeModal("columnModal");
      renderActivities();
      toast("Coluna salva.");
    } catch (error) {
      setMessage("columnFormMessage", dbErrorMessage(error));
    }
  });
}

async function deleteColumn(id) {
  const activity = activityById(state.activityId);
  const column = activity?.columns.find(c => c.id === id);
  if (!column) return;
  const ok = await confirmDialog({
    title: `Excluir a coluna “${column.label}”?`,
    text: "Ela sai do template, da tabela e da tela de campo. Os valores já importados permanecem gravados nas programações.",
    okLabel: "Excluir", danger: true
  });
  if (!ok) return;
  try {
    await withBusy(async () => {
      const { error } = await requireDb().from("tb_atividade_colunas").delete().eq("id", id);
      if (error) throw error;
    });
    activity.columns = activity.columns.filter(c => c.id !== id);
    await persistColumnOrder(activity);
    renderActivities();
    toast("Coluna excluída.");
  } catch (error) {
    toast(dbErrorMessage(error), "error");
  }
}

async function persistColumnOrder(activity) {
  const changed = activity.columns.map((c, i) => ({ c, i })).filter(({ c, i }) => c.ordem !== i);
  if (!changed.length) return;
  await withBusy(async () => {
    const sb = requireDb();
    const results = await Promise.all(changed.map(({ c, i }) => sb.from("tb_atividade_colunas").update({ ordem: i }).eq("id", c.id)));
    const failed = results.find(r => r.error);
    if (failed) throw failed.error;
    changed.forEach(({ c, i }) => { c.ordem = i; });
  });
}

async function moveColumn(id, toIndex) {
  const activity = activityById(state.activityId);
  if (!activity) return;
  const from = activity.columns.findIndex(c => c.id === id);
  if (from < 0 || toIndex < 0 || toIndex >= activity.columns.length || from === toIndex) return;
  const [moved] = activity.columns.splice(from, 1);
  activity.columns.splice(toIndex, 0, moved);
  renderActivities();
  try { await persistColumnOrder(activity); }
  catch (error) { toast(`Ordem não salva: ${dbErrorMessage(error)}`, "error"); }
}

function bindColumnDrag() {
  const list = $("columnList");
  let dragId = null;
  list.addEventListener("dragstart", e => {
    const row = e.target.closest(".column-row");
    if (!row) return;
    dragId = row.dataset.column;
    row.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
  });
  list.addEventListener("dragend", () => {
    dragId = null;
    list.querySelectorAll(".dragging,.drag-over").forEach(el => el.classList.remove("dragging", "drag-over"));
  });
  list.addEventListener("dragover", e => {
    const row = e.target.closest(".column-row");
    if (!row || !dragId) return;
    e.preventDefault();
    list.querySelectorAll(".drag-over").forEach(el => el !== row && el.classList.remove("drag-over"));
    row.classList.add("drag-over");
  });
  list.addEventListener("drop", e => {
    const row = e.target.closest(".column-row");
    if (!row || !dragId) return;
    e.preventDefault();
    const activity = activityById(state.activityId);
    moveColumn(dragId, activity.columns.findIndex(c => c.id === row.dataset.column));
  });
}

function exportActivityForm() {
  const activity = activityById(state.activityId);
  if (!activity) return;
  const jsPDF = window.jspdf?.jsPDF;
  if (!jsPDF) return toast("A biblioteca de PDF não carregou.", "error");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let y = pdfHeader(doc, `Formulário de campo · ${activity.name}`, "Preenchimento manual");
  doc.setTextColor(15, 27, 45);
  doc.setFontSize(9);
  doc.text("Semana: ____________    Data: ____/____/________    Equipe: ________________________________", 12, y);
  y += 10;
  activityColumns(activity).forEach(c => {
    if (y > 260) { doc.addPage(); y = 18; }
    doc.setDrawColor(207, 216, 227);
    doc.setFillColor(248, 250, 252);
    doc.rect(12, y, 62, 9, "FD");
    doc.rect(74, y, 124, 9);
    doc.setFont("helvetica", "bold");
    doc.text(String(c.label).slice(0, 34), 15, y + 6);
    doc.setFont("helvetica", "normal");
    if (c.type === "select" || c.type === "boolean") {
      const opts = c.type === "boolean" ? ["SIM", "NÃO"] : c.options;
      let x = 78;
      opts.slice(0, 5).forEach(o => { doc.rect(x, y + 2.5, 4, 4); doc.text(String(o).slice(0, 16), x + 6, y + 6); x += 6 + Math.min(16, String(o).length) * 1.9 + 8; });
    }
    y += 11;
  });
  if (y > 230) { doc.addPage(); y = 18; }
  y += 4;
  doc.setFont("helvetica", "bold");
  doc.text("Observações", 12, y);
  doc.rect(12, y + 3, 186, 34);
  y += 48;
  doc.setFont("helvetica", "normal");
  doc.text("Executante: _____________________________________     Assinatura: ______________________________", 12, y);
  pdfFooter(doc);
  doc.save(`formulario_${makeKey(activity.name)}.pdf`);
}

/* =========================================================
   EQUIPES, PESSOAS E SEMANAS
   ========================================================= */

function renderEquipes() {
  const q = normalizeText($("peopleSearch").value);
  const people = [...state.people].sort(sortByName).filter(p => !q || normalizeText(`${p.nome} ${p.cracha} ${teamName(p.equipe_id)}`).includes(q));
  setText("peopleMeta", `${state.people.filter(p => p.ativo).length} ativo(s) de ${state.people.length}`);
  $("peopleBody").innerHTML = people.map(p => `<tr>
    <td><strong>${escapeHTML(p.nome)}</strong></td>
    <td class="mono">${escapeHTML(dash(p.cracha))}</td>
    <td>${escapeHTML(dash(teamName(p.equipe_id)))}</td>
    <td>${p.perfil === "ADMINISTRADOR" ? `<span class="chip primary">Administrador</span>` : `<span class="chip">Campo</span>`}</td>
    <td><span class="status ${p.ativo ? "done" : "inactive"}">${p.ativo ? "Ativo" : "Inativo"}</span></td>
    <td class="actions-cell"><button class="icon-btn sm" type="button" data-edit-person="${escapeHTML(p.id)}" title="Editar"><svg class="icon"><use href="#i-edit"/></svg></button></td>
  </tr>`).join("");
  $("peopleEmpty").classList.toggle("hidden", people.length > 0);

  setText("teamCount", state.teams.length);
  $("teamList").innerHTML = state.teams.map(t => {
    const members = state.people.filter(p => p.equipe_id === t.id && p.ativo).length;
    return `<div class="row-item ${t.ativo ? "" : "inactive"}">
      <div class="grow"><strong>${escapeHTML(t.nome)}</strong><small>${escapeHTML(DISCIPLINE_LABELS[t.disciplina] || t.disciplina || "—")} · ${members} pessoa(s)</small></div>
      <button class="btn ghost sm" type="button" data-toggle-team="${escapeHTML(t.id)}">${t.ativo ? "Desativar" : "Reativar"}</button>
    </div>`;
  }).join("");
}

async function saveTeam(event) {
  event.preventDefault();
  const name = $("teamName").value.trim().replace(/\s+/g, " ");
  const discipline = $("teamDiscipline").value;
  if (!name || !discipline) return setMessage("teamMessage", "Informe nome e disciplina.");
  if (state.teams.some(t => normalizeText(t.nome) === normalizeText(name))) return setMessage("teamMessage", `A equipe “${name}” já existe.`);
  await withButton(event.submitter, async () => {
    try {
      await withBusy(async () => {
        const { data, error } = await requireDb().from("tb_equipes").insert({ nome: name, disciplina: discipline, ativo: true }).select("id,nome,disciplina,ativo").single();
        if (error) throw error;
        state.teams = [...state.teams, { ...data, ativo: data.ativo !== false }].sort(sortByName);
      });
      $("teamForm").reset();
      setMessage("teamMessage", `Equipe “${name}” cadastrada.`, true);
      renderEquipes();
    } catch (error) {
      setMessage("teamMessage", dbErrorMessage(error));
    }
  });
}

async function toggleTeam(id) {
  const team = teamById(id);
  if (!team) return;
  try {
    await withBusy(async () => {
      const { error } = await requireDb().from("tb_equipes").update({ ativo: !team.ativo }).eq("id", id);
      if (error) throw error;
    });
    team.ativo = !team.ativo;
    renderEquipes();
  } catch (error) {
    toast(dbErrorMessage(error), "error");
  }
}


function randomAccessCode() {
  const used = new Set(state.people.map(p => String(p.cracha)));
  let code;
  do { code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 900000 + 100000); } while (used.has(code));
  return code;
}

function openPersonModal(id = null) {
  const person = id ? personById(id) : null;
  state.editingPersonId = person?.id || null;
  setText("personModalTitle", person ? "Editar pessoa" : "Nova pessoa");
  $("psName").value = person?.nome || "";
  $("psCode").value = person?.cracha || randomAccessCode();
  fillSelect($("psTeam"), state.teams.filter(t => t.ativo || t.id === person?.equipe_id).map(t => ({ value: t.id, label: t.nome })), { value: person?.equipe_id || "", placeholder: "Sem equipe" });
  $("psRole").value = person?.perfil === "ADMINISTRADOR" ? "ADMINISTRADOR" : "EXECUTANTE";
  $("psStatus").value = person && !person.ativo ? "0" : "1";
  setMessage("personFormMessage", "");
  openModal("personModal");
}

async function savePerson(event) {
  event.preventDefault();
  const nome = $("psName").value.trim().replace(/\s+/g, " ");
  const cracha = $("psCode").value.trim();
  const team = teamById($("psTeam").value);
  if (!nome || !cracha) return setMessage("personFormMessage", "Nome e código são obrigatórios.");
  if (cracha.length < 4) return setMessage("personFormMessage", "Use um código com pelo menos 4 dígitos (recomendado: 6).");
  if (state.people.some(p => String(p.cracha) === cracha && p.id !== state.editingPersonId)) return setMessage("personFormMessage", "Este código já pertence a outra pessoa.");
  const payload = {
    nome, cracha, perfil: $("psRole").value, ativo: $("psStatus").value === "1",
    equipe_id: team?.id || null, disciplina: team?.disciplina || null, updated_at: new Date().toISOString()
  };
  if (state.editingPersonId === state.user.id && (!payload.ativo || payload.perfil !== "ADMINISTRADOR")) {
    return setMessage("personFormMessage", "Você não pode remover o seu próprio acesso de administrador.");
  }
  await withButton(event.submitter, async () => {
    try {
      await withBusy(async () => {
        const sb = requireDb();
        const query = state.editingPersonId
          ? sb.from("tb_pessoas").update(payload).eq("id", state.editingPersonId)
          : sb.from("tb_pessoas").insert(payload);
        const { error } = await query;
        if (error) throw error;
        await loadPeople();
      });
      closeModal("personModal");
      renderEquipes();
      toast("Pessoa salva.");
    } catch (error) {
      setMessage("personFormMessage", dbErrorMessage(error));
    }
  });
}

/* =========================================================
   PERFIL
   ========================================================= */

function renderProfile() {
  const u = state.user;
  if (!u) return;
  setText("profileAvatar", initials(u.nome));
  setText("profileName", u.nome);
  setText("profileRole", u.role === "admin" ? "Administrador · Planejamento" : "Equipe de campo");
  const rows = [
    ["E-mail", u.email],
    ["Código de acesso", u.role === "technician" ? u.cracha : ""],
    ["Equipe", teamName(u.equipeId)],
    ["Disciplina", DISCIPLINE_LABELS[u.disciplina] || u.disciplina],
    ["Semana atual", weekLabel(currentWeekNumber())]
  ].filter(([, v]) => v);
  $("profileInfo").innerHTML = rows.map(([k, v]) => `<div><dt>${escapeHTML(k)}</dt><dd>${escapeHTML(v)}</dd></div>`).join("");
}

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
  state.executions = setExecutions(executions);
  state.equipment = new Map(equipment.map(e => [e.id, e]));
  const visible = new Set(state.field.programs.map(p => p.id));
  state.field.selected = new Set([...state.field.selected].filter(id => visible.has(id) && !isDone(state.field.programs.find(p => p.id === id))));
  if (!visible.has(state.field.activeId)) state.field.activeId = null;
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

/* =========================================================
   CAMPO — telas
   ========================================================= */

function filteredFieldPrograms() {
  const f = state.field;
  const q = normalizeText(f.search);
  return f.programs.filter(p => {
    if (f.activity && p.activityId !== f.activity) return false;
    if (f.status === "done" && !isDone(p)) return false;
    if (f.status === "pending" && isDone(p)) return false;
    if (q) {
      const activity = activityById(p.activityId);
      const hay = [activity?.name, p.note, ...activityColumns(activity).map(c => columnValue(p, c))].map(normalizeText).join(" ");
      if (!hay.includes(q)) return false;
    }
    return true;
  }).sort((a, b) => Number(isDone(a)) - Number(isDone(b))
    || String(activityById(a.activityId)?.name).localeCompare(String(activityById(b.activityId)?.name), "pt-BR")
    || String(programTitle(a)).localeCompare(String(programTitle(b)), "pt-BR", { numeric: true }));
}

function executorName(execution) {
  if (execution.executante_nome) return execution.executante_nome;
  if (execution.executante_id === state.user?.id) return state.user.nome;
  return personById(execution.executante_id)?.nome || "Outro integrante";
}

function renderField() {
  const f = state.field;
  const all = f.programs;
  const s = summarize(all);
  setText("fieldWeek", weekLabel(f.weekNum));
  setText("fieldTeamLabel", teamName(state.user.equipeId) ? `Equipe ${teamName(state.user.equipeId).replace(/^equipe\s+/i, "")}` : "Todas as equipes");
  setText("fieldProgressText", `${s.done} de ${s.total} executadas · ${s.rate}%`);
  $("fieldProgressBar").style.width = `${s.rate}%`;
  setText("fieldTotal", s.total);
  setText("fieldDone", s.done);
  setText("fieldPending", s.pending);

  const acts = state.activities.filter(a => all.some(p => p.activityId === a.id));
  fillSelect($("fieldActivity"), acts.map(a => ({ value: a.id, label: a.name })), { value: f.activity, placeholder: "Todas as atividades" });
  f.activity = $("fieldActivity").value;
  document.querySelectorAll("[data-field-status]").forEach(b => b.classList.toggle("active", b.dataset.fieldStatus === f.status));

  const rows = filteredFieldPrograms();
  setText("fieldListMeta", `${rows.length} de ${all.length} item(ns)`);
  $("fieldList").innerHTML = rows.map(p => {
    const activity = activityById(p.activityId);
    const done = isDone(p);
    const title = titleColumn(activity);
    const fields = activityColumns(activity).filter(c => c !== title).map(c => [c, columnValue(p, c)]).filter(([, v]) => v !== "").slice(0, 4);
    const last = executionsOf(p.id).at(-1);
    return `<article class="task ${done ? "done" : ""} ${p.id === f.activeId ? "active" : ""}" data-task="${escapeHTML(p.id)}">
      <label class="check" title="${done ? "Já executada" : "Selecionar"}"><input type="checkbox" data-select="${escapeHTML(p.id)}" ${f.selected.has(p.id) ? "checked" : ""} ${done ? "disabled" : ""} aria-label="Selecionar"></label>
      <div>
        <div class="task-head"><span class="chip primary">${escapeHTML(activity?.name || "")}</span>${previousWeeks(p).length ? `<span class="chip warn" title="Reprogramado de ${escapeHTML(previousWeeks(p).map(weekLabel).join(", "))}">Reprogramado de ${escapeHTML(weekLabel(previousWeeks(p).at(-1)))}</span>` : ""}</div>
        <div class="task-title">${escapeHTML(programTitle(p))}</div>
        <div class="task-fields">${fields.map(([c, v]) => `<span>${escapeHTML(c.label)} <b>${escapeHTML(formatColumnValue(c, v))}</b></span>`).join("")}</div>
      </div>
      <div class="task-side">
        <span class="status ${done ? "done" : "pending"}">${done ? "Executada" : "Pendente"}</span>
        ${last ? `<small>${escapeHTML(fmtDateTime(last.executado_em))}</small>` : p.date ? `<small>Prev. ${escapeHTML(fmtDate(p.date))}</small>` : ""}
      </div>
    </article>`;
  }).join("");
  $("fieldEmpty").classList.toggle("hidden", rows.length > 0);
  setText("fieldEmptyText", state.loadError || (all.length ? "Ajuste a busca ou os filtros." : `Não há programação para ${teamName(state.user.equipeId) || "a equipe"} em ${weekLabel(f.weekNum)}.`));

  const selectable = rows.filter(p => !isDone(p));
  const allSel = $("fieldSelectAll");
  allSel.checked = selectable.length > 0 && selectable.every(p => f.selected.has(p.id));
  allSel.indeterminate = !allSel.checked && selectable.some(p => f.selected.has(p.id));
  allSel.disabled = !selectable.length;
  renderBulkBar();
  renderFieldDetail();
}

function renderBulkBar() {
  const n = state.field.selected.size;
  const today = toISODate(new Date());
  $("bulkDate").max = today;
  if (!$("bulkDate").value) $("bulkDate").value = today;
  $("bulkBar").classList.toggle("hidden", n === 0 || currentScreen() !== "campo");
  setText("bulkCount", n);
}

function renderFieldDetail() {
  const p = state.field.programs.find(x => x.id === state.field.activeId);
  $("fieldDetailEmpty").classList.toggle("hidden", Boolean(p));
  $("fieldDetailBody").classList.toggle("hidden", !p);
  if (!p) { closeFieldSheet(); return; }

  const activity = activityById(p.activityId);
  const done = isDone(p);
  const executions = executionsOf(p.id);
  setText("detailActivity", activity?.name || "");
  setText("detailTitle", programTitle(p));
  setText("detailMeta", [p.week, teamName(p.teamId), p.date ? `previsto ${fmtDate(p.date)}` : ""].filter(Boolean).join(" · "));
  const status = $("detailStatus");
  status.className = `status ${done ? "done" : "pending"}`;
  status.textContent = done ? `Executada · ${executions.length} registro(s)` : "Pendente";

  const cols = activityColumns(activity);
  const host = $("detailFields");
  host.innerHTML = cols.map(c => {
    const value = columnValue(p, c);
    if (!c.technicianEditable) return `<div class="ro"><span>${escapeHTML(c.label)}</span><strong>${escapeHTML(formatColumnValue(c, value))}</strong></div>`;
    return "";
  }).join("") + (p.note ? `<div class="ro" style="grid-column:1/-1"><span>Observação do planejamento</span><strong>${escapeHTML(p.note)}</strong></div>` : "");

  const editable = { ...activity, columns: cols.filter(c => c.technicianEditable) };
  if (editable.columns.length) {
    const wrap = document.createElement("div");
    wrap.style.gridColumn = "1 / -1";
    wrap.className = "form-grid";
    wrap.id = "detailEditable";
    renderCustomInputs(wrap, editable, Object.fromEntries(editable.columns.map(c => [c.key, columnValue(p, c)])), { prefix: "df" });
    host.appendChild(wrap);
  }
  $("detailSaveRow").classList.toggle("hidden", !editable.columns.length);

  const reg = $("detailRegister");
  reg.querySelector("span").textContent = done ? "Registrar nova execução" : "Registrar execução";
  reg.classList.toggle("ghost", done);
  reg.classList.toggle("primary", !done);

  $("detailLog").innerHTML = executions.slice().reverse().map(e => `
    <div class="timeline-item"><div>
      <strong>${escapeHTML(fmtDateTime(e.executado_em))}</strong>
      <small>${escapeHTML(executorName(e))}</small>
      ${e.observacao ? `<p>${escapeHTML(e.observacao)}</p>` : ""}
    </div></div>`).join("");
}

function openFieldItem(id) {
  if (state.field.activeId !== id) {
    $("detailObs").value = "";
    $("detailDate").value = toISODate(new Date());
  }
  $("detailDate").max = toISODate(new Date());
  state.field.activeId = id;
  document.querySelectorAll(".task").forEach(el => el.classList.toggle("active", el.dataset.task === id));
  renderFieldDetail();
  if (window.matchMedia("(max-width: 960px)").matches) {
    $("fieldDetail").classList.add("open");
    document.body.classList.add("sheet-open");
  }
}

function closeFieldSheet() {
  $("fieldDetail").classList.remove("open");
  document.body.classList.remove("sheet-open");
}

async function registerExecution(ids, button) {
  const programs = ids.map(id => state.field.programs.find(p => p.id === id)).filter(Boolean);
  if (!programs.length) return;
  const repeat = programs.length === 1 && isDone(programs[0]);
  if (repeat) {
    const ok = await confirmDialog({ title: "Registrar nova execução?", text: "Este item já possui registro. Um novo registro será acrescentado ao histórico.", okLabel: "Registrar" });
    if (!ok) return;
  }
  const single = programs.length === 1;
  const obs = single ? $("detailObs").value.trim() : "";
  const date = single ? $("detailDate").value : $("bulkDate").value;
  if (date && date > toISODate(new Date())) return toast("A data da execução não pode ser futura.", "error");
  await withButton(button, async () => {
    try {
      const created = await withBusy(() => fieldRegister(programs.map(p => p.id), obs, executionTimestamp(date)));
      created.forEach(e => {
        const list = state.executions.get(e.programacao_id) || [];
        list.push(e);
        state.executions.set(e.programacao_id, list);
      });
      programs.forEach(p => { p.status = "EXECUTADO"; state.field.selected.delete(p.id); });
      $("detailObs").value = "";
      renderField();
      toast(programs.length === 1 ? "Execução registrada." : `${programs.length} execuções registradas.`);
    } catch (error) {
      toast(dbErrorMessage(error, "Não foi possível registrar."), "error");
    }
  });
}

async function saveDetailFields() {
  const p = state.field.programs.find(x => x.id === state.field.activeId);
  const host = $("detailEditable");
  if (!p || !host) return;
  const { data } = collectCustomInputs(host);
  await withButton($("detailSave"), async () => {
    try {
      p.customData = await withBusy(() => fieldSaveFields(p, data));
      renderField();
      toast("Campos salvos.");
    } catch (error) {
      toast(dbErrorMessage(error, "Não foi possível salvar os campos."), "error");
    }
  });
}

async function changeFieldWeek(delta) {
  state.field.weekNum += delta;
  state.field.selected.clear();
  state.field.activeId = null;
  setText("fieldWeek", weekLabel(state.field.weekNum));
  try { await withBusy(loadFieldWeek); state.loadError = ""; }
  catch (error) { state.loadError = dbErrorMessage(error); toast(state.loadError, "error"); state.field.programs = []; }
  renderScreen();
}

function renderFieldHistory() {
  setText("historyWeek", weekLabel(state.field.weekNum));
  const items = state.field.programs.flatMap(p => executionsOf(p.id).map(e => ({ p, e })))
    .sort((a, b) => String(b.e.executado_em).localeCompare(String(a.e.executado_em)));
  $("historyList").innerHTML = items.length ? items.map(({ p, e }) => `
    <div class="timeline-item"><div>
      <strong>${escapeHTML(programTitle(p))}</strong>
      <small>${escapeHTML(activityById(p.activityId)?.name || "")} · ${escapeHTML(fmtDateTime(e.executado_em))} · ${escapeHTML(executorName(e))}</small>
      ${e.observacao ? `<p>${escapeHTML(e.observacao)}</p>` : ""}
    </div></div>`).join("") : `<div class="empty inline"><strong>Nenhuma execução nesta semana.</strong><span>Os registros feitos em “Atividades da semana” aparecem aqui.</span></div>`;
}

/* =========================================================
   EXPORTAÇÃO — PDF e JPEG
   ========================================================= */

function hexToRgb(hex) {
  const m = String(hex).replace("#", "").match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  return m ? m.slice(1).map(x => parseInt(x, 16)) : [15, 27, 45];
}

function pdfHeader(doc, title, subtitle) {
  const s = state.settings;
  doc.setFillColor(...hexToRgb(s.header));
  doc.rect(0, 0, 210, 30, "F");
  doc.setFillColor(...hexToRgb(s.primary));
  doc.rect(0, 30, 210, 1.6, "F");
  let x = 12;
  if (s.logo) {
    try {
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(10, 6, 30, 18, 2, 2, "F");
      const props = doc.getImageProperties(s.logo);
      const ratio = Math.min(26 / props.width, 14 / props.height);
      doc.addImage(s.logo, "PNG", 25 - props.width * ratio / 2, 15 - props.height * ratio / 2, props.width * ratio, props.height * ratio);
      x = 46;
    } catch (error) { console.warn("Logo não aplicada ao PDF:", error); }
  }
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(title, x, 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text(`${subtitle} · Responsável: ${state.user?.nome || "—"}`, x, 21);
  return 42;
}

function pdfFooter(doc) {
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(120, 134, 152);
    doc.text(`Gerado em ${nowStamp()} · Planning Pro`, 12, 290);
    doc.text(`${i}/${pages}`, 198, 290, { align: "right" });
  }
}

function pdfKpis(doc, y, s) {
  const cards = [["PROGRAMADAS", s.total], ["EXECUTADAS", s.done], ["PENDENTES", s.pending], ["REALIZAÇÃO", `${s.rate}%`]];
  cards.forEach(([label, value], i) => {
    const x = 12 + i * 47;
    doc.setFillColor(244, 246, 249);
    doc.roundedRect(x, y, 44, 20, 2, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...hexToRgb(state.settings.primary));
    doc.text(label, x + 4, y + 7);
    doc.setFontSize(14);
    doc.setTextColor(15, 27, 45);
    doc.text(String(value), x + 4, y + 16);
  });
  return y + 28;
}

function pdfTable(doc, y, title, headers, rows, widths) {
  if (y > 250) { doc.addPage(); y = 18; }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(15, 27, 45);
  doc.text(title, 12, y);
  y += 4;
  const drawHead = () => {
    doc.setFillColor(...hexToRgb(state.settings.header));
    doc.rect(12, y, 186, 7, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7);
    let x = 14;
    headers.forEach((h, i) => { doc.text(h, i === 0 ? x : x + widths[i] - 4, y + 4.8, { align: i === 0 ? "left" : "right" }); x += widths[i]; });
    y += 7;
  };
  drawHead();
  doc.setFont("helvetica", "normal");
  rows.forEach((row, r) => {
    if (y > 278) { doc.addPage(); y = 18; drawHead(); doc.setFont("helvetica", "normal"); }
    if (r % 2) { doc.setFillColor(248, 250, 252); doc.rect(12, y, 186, 6.5, "F"); }
    doc.setTextColor(35, 48, 65);
    doc.setFontSize(7.5);
    let x = 14;
    row.forEach((cell, i) => {
      const text = String(cell ?? "");
      doc.text(i === 0 ? text.slice(0, Math.floor(widths[0] / 1.7)) : text, i === 0 ? x : x + widths[i] - 4, y + 4.5, { align: i === 0 ? "left" : "right" });
      x += widths[i];
    });
    y += 6.5;
  });
  return y + 8;
}

function groupRows(groups) {
  return groups.map(g => [g.label, g.total, g.done, g.pending, `${g.rate}%`]);
}

function exportSummaryPDF(title, subtitle, programs, filename) {
  const jsPDF = window.jspdf?.jsPDF;
  if (!jsPDF) return toast("A biblioteca de PDF não carregou.", "error");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let y = pdfHeader(doc, title, subtitle);
  y = pdfKpis(doc, y, summarize(programs));
  const headers = ["", "PROG.", "EXEC.", "PEND.", "%"];
  const widths = [106, 20, 20, 20, 20];
  y = pdfTable(doc, y, "Por atividade", ["ATIVIDADE", ...headers.slice(1)], groupRows(byActivity(programs)), widths);
  pdfTable(doc, y, "Por equipe", ["EQUIPE", ...headers.slice(1)], groupRows(byTeam(programs)), widths);
  pdfFooter(doc);
  doc.save(filename);
}

function exportDashboardPDF() {
  const week = state.dashboardWeek;
  exportSummaryPDF("Previsto x realizado", `Semana ${week}`, state.programs.filter(p => p.week === week), `dashboard_${week}.pdf`);
}

function exportReportPDF() {
  const f = reportFilters();
  const parts = [f.week || "Todas as semanas", activityById(f.activity)?.name, teamName(f.team)].filter(Boolean);
  exportSummaryPDF("Relatório de programação", parts.join(" · "), reportPrograms(f), `relatorio_${makeKey(parts.join("_")) || "geral"}.pdf`);
}

function exportFieldPDF() {
  const jsPDF = window.jspdf?.jsPDF;
  if (!jsPDF) return toast("A biblioteca de PDF não carregou.", "error");
  const programs = filteredFieldPrograms();
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const week = weekLabel(state.field.weekNum);
  let y = pdfHeader(doc, "Relatório de campo", `${week} · ${teamName(state.user.equipeId) || "Todas as equipes"}`);
  y = pdfKpis(doc, y, summarize(programs));
  const rows = programs.map(p => {
    const last = executionsOf(p.id).at(-1);
    return [`${programTitle(p)} · ${activityById(p.activityId)?.name || ""}`, isDone(p) ? "EXECUTADA" : "PENDENTE", last ? fmtDateTime(last.executado_em) : "—"];
  });
  pdfTable(doc, y, "Itens programados", ["ITEM", "SITUAÇÃO", "ÚLTIMO REGISTRO"], rows, [116, 30, 40]);
  pdfFooter(doc);
  doc.save(`campo_${week}.pdf`);
}

function exportDashboardJPEG() {
  const week = state.dashboardWeek;
  const programs = state.programs.filter(p => p.week === week);
  const s = summarize(programs);
  const groups = byActivity(programs);
  const teams = byTeam(programs);
  const settings = state.settings;
  const W = 1600;
  const rowH = 54;
  const H = 360 + (groups.length + teams.length) * rowH + 200;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#f4f6f9";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = settings.header;
  ctx.fillRect(0, 0, W, 150);
  ctx.fillStyle = settings.primary;
  ctx.fillRect(0, 150, W, 6);
  ctx.fillStyle = "#fff";
  ctx.font = "700 40px Inter, Arial";
  ctx.fillText("Previsto x realizado", 60, 72);
  ctx.font = "22px Inter, Arial";
  ctx.fillText(`Semana ${week} · ${state.user?.nome || ""} · ${nowStamp()}`, 60, 112);

  [["PROGRAMADAS", s.total], ["EXECUTADAS", s.done], ["PENDENTES", s.pending], ["REALIZAÇÃO", `${s.rate}%`]].forEach(([label, value], i) => {
    const x = 60 + i * 375;
    ctx.fillStyle = "#fff";
    ctx.fillRect(x, 190, 350, 120);
    ctx.fillStyle = settings.primary;
    ctx.font = "700 18px Inter, Arial";
    ctx.fillText(label, x + 24, 228);
    ctx.fillStyle = "#0f1b2d";
    ctx.font = "700 48px Inter, Arial";
    ctx.fillText(String(value), x + 24, 288);
  });

  let y = 360;
  const block = (title, list) => {
    ctx.fillStyle = "#0f1b2d";
    ctx.font = "700 24px Inter, Arial";
    ctx.fillText(title, 60, y);
    y += 24;
    list.forEach(g => {
      ctx.fillStyle = "#fff";
      ctx.fillRect(60, y, W - 120, rowH - 8);
      ctx.fillStyle = "#0f1b2d";
      ctx.font = "600 20px Inter, Arial";
      ctx.fillText(String(g.label).slice(0, 48), 80, y + 31);
      ctx.fillStyle = "#e2e8ef";
      ctx.fillRect(760, y + 18, 560, 12);
      ctx.fillStyle = settings.chartDone;
      ctx.fillRect(760, y + 18, 560 * g.rate / 100, 12);
      ctx.fillStyle = "#5a6a7e";
      ctx.font = "600 20px Inter, Arial";
      ctx.fillText(`${g.done}/${g.total} · ${g.rate}%`, 1350, y + 31);
      y += rowH;
    });
    y += 40;
  };
  block("Por atividade", groups);
  block("Por equipe", teams);

  canvas.toBlob(blob => downloadBlob(blob, `dashboard_${week}.jpg`), "image/jpeg", 0.92);
}

/* =========================================================
   EVENTOS
   ========================================================= */

function bindEvents() {
  // Login
  document.querySelectorAll(".access-option").forEach(b => b.addEventListener("click", () => showLoginStep(b.dataset.role)));
  document.querySelectorAll("[data-back-login]").forEach(b => b.addEventListener("click", () => showLoginStep("chooser")));
  $("adminLoginForm").addEventListener("submit", loginAdmin);
  $("technicianLoginForm").addEventListener("submit", loginTechnician);

  // Shell
  window.addEventListener("hashchange", route);
  document.querySelectorAll(".nav-item[data-screen]").forEach(b => b.addEventListener("click", () => goTo(b.dataset.screen)));
  $("sidebarToggle").addEventListener("click", () => {
    const collapsed = $("appShell").classList.toggle("collapsed");
    storageSet(localStorage, "ppaSidebarCollapsed", collapsed ? "1" : "0");
  });
  $("mobileMenuBtn").addEventListener("click", () => { $("sidebar").classList.add("open"); $("sidebarOverlay").classList.add("show"); });
  $("sidebarOverlay").addEventListener("click", () => { closeSidebar(); closeFieldSheet(); });
  $("themeToggle").addEventListener("click", toggleTheme);
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", applyTheme);
  $("logoutBtn").addEventListener("click", logout);

  // Modais
  document.addEventListener("click", e => {
    const closer = e.target.closest("[data-close-modal]");
    if (closer) closeModal(closer.closest(".modal").id);
  });
  document.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    const open = [...document.querySelectorAll(".modal:not(.hidden)")].at(-1);
    if (open) closeModal(open.id);
    else { closeSidebar(); closeFieldSheet(); }
  });
  $("confirmOk").addEventListener("click", () => resolveConfirm(true));
  $("confirmCancel").addEventListener("click", () => resolveConfirm(false));

  // Dashboard
  $("dashboardWeek").addEventListener("change", e => { state.dashboardWeek = e.target.value; renderDashboard(); });
  $("dashboardRefresh").addEventListener("click", e => withButton(e.currentTarget, async () => { await syncAll(); renderDashboard(); toast("Dados atualizados."); }));
  $("dashboardPdf").addEventListener("click", exportDashboardPDF);
  $("dashboardJpeg").addEventListener("click", exportDashboardJPEG);

  // Programação
  $("programActivity").addEventListener("change", e => { Object.assign(state.program, { activityId: e.target.value, week: "", page: 0 }); state.program.selected.clear(); renderProgramacao(); });
  $("programWeekFilter").addEventListener("change", e => { state.program.week = e.target.value; state.program.page = 0; renderProgramacao(); });
  $("programTeamFilter").addEventListener("change", e => { state.program.team = e.target.value; state.program.page = 0; renderProgramacao(); });
  $("programStatusFilter").addEventListener("change", e => { state.program.status = e.target.value; state.program.page = 0; renderProgramacao(); });
  let searchTimer;
  $("programSearch").addEventListener("input", e => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.program.search = e.target.value; state.program.page = 0; renderProgramacao(); }, 200);
  });
  // Ações por linha (Programação e Backlog usam os mesmos atributos).
  const rowActions = e => {
    const del = e.target.closest("[data-delete-program]");
    const edit = e.target.closest("[data-edit-program]");
    const move = e.target.closest("[data-move-program]");
    if (del) deleteProgram(del.dataset.deleteProgram);
    if (edit) openProgramModal(edit.dataset.editProgram);
    if (move) openReprogram([move.dataset.moveProgram]);
  };
  $("programTableBody").addEventListener("click", rowActions);
  $("backlogBody").addEventListener("click", rowActions);
  $("programTableBody").addEventListener("change", e => {
    const box = e.target.closest("[data-select-program]");
    if (!box) return;
    box.checked ? state.program.selected.add(box.dataset.selectProgram) : state.program.selected.delete(box.dataset.selectProgram);
    renderProgramacao();
  });
  $("programTableHead").addEventListener("change", e => {
    if (!e.target.matches("[data-select-page]")) return;
    const ids = [...$("programTableBody").querySelectorAll("[data-select-program]")].map(b => b.dataset.selectProgram);
    ids.forEach(id => e.target.checked ? state.program.selected.add(id) : state.program.selected.delete(id));
    renderProgramacao();
  });
  $("programBulkClear").addEventListener("click", () => { state.program.selected.clear(); renderProgramacao(); });
  $("programBulkMove").addEventListener("click", () => openReprogram([...state.program.selected]));
  $("programBulkDelete").addEventListener("click", deleteSelectedPrograms);

  // Backlog
  $("backlogBody").addEventListener("change", e => {
    const box = e.target.closest("[data-select-backlog]");
    if (!box) return;
    box.checked ? state.backlog.selected.add(box.dataset.selectBacklog) : state.backlog.selected.delete(box.dataset.selectBacklog);
    renderBacklog();
  });
  $("backlogSelectAll").addEventListener("change", e => {
    filteredBacklog().forEach(p => e.target.checked ? state.backlog.selected.add(p.id) : state.backlog.selected.delete(p.id));
    renderBacklog();
  });
  [["backlogActivity", "activity"], ["backlogTeam", "team"], ["backlogWeek", "week"]].forEach(([id, key]) =>
    $(id).addEventListener("change", e => { state.backlog[key] = e.target.value; renderBacklog(); }));
  let backlogTimer;
  $("backlogSearch").addEventListener("input", e => { clearTimeout(backlogTimer); backlogTimer = setTimeout(() => { state.backlog.search = e.target.value; renderBacklog(); }, 200); });
  $("backlogBulkClear").addEventListener("click", () => { state.backlog.selected.clear(); renderBacklog(); });
  $("backlogBulkMove").addEventListener("click", () => openReprogram([...state.backlog.selected]));
  $("reprogramWeek").addEventListener("change", renderReprogramWarning);
  $("reprogramConfirm").addEventListener("click", confirmReprogram);
  $("kpiBacklogCard").addEventListener("click", () => goTo("backlog"));
  $("dashboardBacklogBtn").addEventListener("click", () => goTo("backlog"));
  $("programPager").addEventListener("click", e => {
    const b = e.target.closest("[data-page]");
    if (!b) return;
    state.program.page += Number(b.dataset.page);
    renderProgramacao();
    $("programTableHead").scrollIntoView({ block: "nearest" });
  });
  $("programTemplateBtn").addEventListener("click", () => downloadTemplate(activityById(state.program.activityId)));
  $("programImportBtn").addEventListener("click", () => {
    if (!activityById(state.program.activityId)) return toast("Cadastre uma atividade primeiro.", "error");
    $("programFileInput").value = "";
    $("programFileInput").click();
  });
  $("programFileInput").addEventListener("change", e => handleProgramFile(e.target.files?.[0]));
  $("programExportBtn").addEventListener("click", exportProgramList);
  $("programNewBtn").addEventListener("click", () => openProgramModal());
  $("pfActivity").addEventListener("change", e => renderCustomInputs($("pfCustom"), activityById(e.target.value)));
  $("programForm").addEventListener("submit", saveProgramForm);
  $("importConfirm").addEventListener("click", confirmImport);
  document.querySelectorAll('input[name="importMode"]').forEach(r => r.addEventListener("change", () => {
    $("importDupWrap").classList.toggle("hidden", r.value === "replace" || !state.pendingImport?.duplicates);
    setText("importConfirm", document.querySelector('input[name="importMode"]:checked').value === "replace" ? "Substituir e importar" : "Importar");
  }));

  // Relatórios
  ["reportWeek", "reportActivity", "reportTeam"].forEach(id => $(id).addEventListener("change", renderReports));
  $("reportPdf").addEventListener("click", exportReportPDF);

  // Atividades
  $("activityList").addEventListener("click", e => {
    const item = e.target.closest("[data-activity]");
    if (!item) return;
    state.activityId = item.dataset.activity;
    renderActivities();
  });
  $("activityNewBtn").addEventListener("click", () => openActivityModal());
  $("activityEditBtn").addEventListener("click", () => openActivityModal(state.activityId));
  $("activityDeleteBtn").addEventListener("click", deactivateActivity);
  $("activityForm").addEventListener("submit", saveActivity);
  $("activityTemplateBtn").addEventListener("click", () => downloadTemplate(activityById(state.activityId)));
  $("activityPdfBtn").addEventListener("click", exportActivityForm);
  $("columnNewBtn").addEventListener("click", () => openColumnModal());
  $("columnForm").addEventListener("submit", saveColumn);
  $("cfType").addEventListener("change", e => $("cfOptionsWrap").classList.toggle("hidden", e.target.value !== "select"));
  $("cfLabel").addEventListener("input", e => { if (!state.editingColumnId) $("cfKey").value = makeKey(e.target.value); });
  $("columnList").addEventListener("click", e => {
    const move = e.target.closest("[data-move]");
    const edit = e.target.closest("[data-edit-col]");
    const del = e.target.closest("[data-delete-col]");
    if (move) {
      const activity = activityById(state.activityId);
      const index = activity.columns.findIndex(c => c.id === move.dataset.col);
      moveColumn(move.dataset.col, index + Number(move.dataset.move));
    }
    if (edit) openColumnModal(edit.dataset.editCol);
    if (del) deleteColumn(del.dataset.deleteCol);
  });
  bindColumnDrag();

  // Equipes e acessos
  $("peopleSearch").addEventListener("input", renderEquipes);
  $("peopleBody").addEventListener("click", e => { const b = e.target.closest("[data-edit-person]"); if (b) openPersonModal(b.dataset.editPerson); });
  $("teamList").addEventListener("click", e => { const b = e.target.closest("[data-toggle-team]"); if (b) toggleTeam(b.dataset.toggleTeam); });
  $("personNewBtn").addEventListener("click", () => openPersonModal());
  $("personForm").addEventListener("submit", savePerson);
  $("psGenerate").addEventListener("click", () => { $("psCode").value = randomAccessCode(); });
  $("teamForm").addEventListener("submit", saveTeam);

  // Configurações
  $("settingsLogo").addEventListener("change", async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    try { state.settings.logo = await readLogo(file); renderSettings(); }
    catch (error) { setMessage("settingsMessage", error.message); }
  });
  $("settingsLogoRemove").addEventListener("click", () => { state.settings.logo = ""; $("settingsLogo").value = ""; renderSettings(); });
  ["settingsPrimary", "settingsHeader", "settingsPlanned", "settingsDone"].forEach(id => $(id).addEventListener("input", () => {
    Object.assign(state.settings, { primary: $("settingsPrimary").value, header: $("settingsHeader").value, chartPlanned: $("settingsPlanned").value, chartDone: $("settingsDone").value });
    applySettings();
    renderSettings();
  }));
  $("settingsSave").addEventListener("click", () => { if (saveSettings()) setMessage("settingsMessage", "Configurações salvas neste navegador.", true); });
  $("settingsReset").addEventListener("click", () => { state.settings = { ...DEFAULT_SETTINGS }; saveSettings(); renderSettings(); setMessage("settingsMessage", "Padrão restaurado.", true); });

  // Campo
  $("fieldWeekPrev").addEventListener("click", () => changeFieldWeek(-1));
  $("fieldWeekNext").addEventListener("click", () => changeFieldWeek(1));
  $("fieldRefresh").addEventListener("click", e => withButton(e.currentTarget, async () => { await syncAll(); renderScreen(); toast("Dados atualizados."); }));
  $("fieldPdf").addEventListener("click", exportFieldPDF);
  let fieldTimer;
  $("fieldSearch").addEventListener("input", e => { clearTimeout(fieldTimer); fieldTimer = setTimeout(() => { state.field.search = e.target.value; renderField(); }, 150); });
  $("fieldActivity").addEventListener("change", e => { state.field.activity = e.target.value; renderField(); });
  document.querySelectorAll("[data-field-status]").forEach(b => b.addEventListener("click", () => { state.field.status = b.dataset.fieldStatus; renderField(); }));
  $("fieldList").addEventListener("click", e => {
    if (e.target.closest(".check")) return;
    const task = e.target.closest("[data-task]");
    if (task) openFieldItem(task.dataset.task);
  });
  $("fieldList").addEventListener("change", e => {
    const box = e.target.closest("[data-select]");
    if (!box) return;
    box.checked ? state.field.selected.add(box.dataset.select) : state.field.selected.delete(box.dataset.select);
    renderField();
  });
  $("fieldSelectAll").addEventListener("change", e => {
    filteredFieldPrograms().filter(p => !isDone(p)).forEach(p => e.target.checked ? state.field.selected.add(p.id) : state.field.selected.delete(p.id));
    renderField();
  });
  $("bulkClear").addEventListener("click", () => { state.field.selected.clear(); renderField(); });
  $("bulkRegister").addEventListener("click", async e => {
    const button = e.currentTarget;
    const ids = [...state.field.selected];
    const ok = await confirmDialog({ title: `Registrar ${ids.length} execução(ões)?`, text: `Todos os itens selecionados serão marcados como executados em ${fmtDate($("bulkDate").value || toISODate(new Date()))}, em seu nome.`, okLabel: "Registrar" });
    if (ok) registerExecution(ids, button);
  });
  $("detailRegister").addEventListener("click", e => registerExecution([state.field.activeId], e.currentTarget));
  $("detailSave").addEventListener("click", saveDetailFields);
  $("detailClose").addEventListener("click", closeFieldSheet);
}

/* =========================================================
   INICIALIZAÇÃO
   ========================================================= */

async function init() {
  applyTheme();
  loadSettings();
  if (storageGet(localStorage, "ppaSidebarCollapsed") === "1") $("appShell").classList.add("collapsed");
  bindEvents();

  // Remove chaves de versões antigas que guardavam dados de negócio no navegador.
  ["ppaModules", "ppaModuleRecords", "ppaProgramacoes", "ppaImportedRows", "ppaProgramHistory", "ppaSession", "ppaCurrentWeek", "ppaColumnViewMode"]
    .forEach(key => { storageRemove(localStorage, key); storageRemove(sessionStorage, key); });

  if (!db()) {
    showLoginStep("chooser");
    setMessage("adminLoginMessage", "Supabase não configurado. Verifique supabase-config.js.");
    toast("Supabase não configurado. Verifique supabase-config.js.", "error");
    return;
  }

  const restored = await restoreSession();
  if (restored?.error) {
    showLoginStep("chooser");
    toast(restored.error, "error");
  } else if (restored) {
    await enterApp(restored);
  } else {
    showLoginStep("chooser");
  }
}

init().catch(error => {
  console.error("Falha na inicialização:", error);
  showLoginStep("chooser");
  toast(dbErrorMessage(error, "Falha ao iniciar o sistema."), "error");
});
