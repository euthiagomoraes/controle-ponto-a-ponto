/*
 * Planning Pro — app.js consolidado
 * Rev. 14 — Supabase real + autenticação + dashboard + programação + módulos
 *
 * Compatível com o index.html atual do projeto.
 * Dados administrativos e operacionais usam o Supabase quando configurado.
 * localStorage fica apenas como cache/estado visual auxiliar.
 */

const CONFIG = {
  SUPABASE_URL: window.PPA_SUPABASE_CONFIG?.url || "",
  SUPABASE_ANON_KEY: window.PPA_SUPABASE_CONFIG?.anonKey || "",
  DATA_URL: "",
  WRITE_URL: "",
  TABLE_NAME: "tbPontoAPonto",
  LOGIN_TABLE: "tbLogin"
};

const WEEK_ANCHOR = new Date(2026, 8, 7);
const WEEK_ANCHOR_NUMBER = 132;

const ROLE_LABELS = {
  admin: "Administrador",
  technician: "Técnico de campo"
};

const DISCIPLINES = [
  "ELÉTRICA",
  "INSTRUMENTAÇÃO",
  "TUBULAÇÃO",
  "MECÂNICA",
  "AUTOMAÇÃO",
  "CIVIL"
];

const state = {
  currentUser: null,
  role: null,
  supabase: null,
  selectedTag: null,
  selectedTags: new Set(),
  rows: [],
  programacoes: [],
  teams: [],
  peopleRecords: [],
  accesses: [],
  moduleCatalog: [],
  selectedModuleId: null,
  editingModuleId: null,
  editingColumnId: null,
  pendingImport: null,
  pendingProgramImport: null,
  pendingDeleteModuleId: null,
  programHistory: [],
  moduleRecords: {},
  columnViewMode: localStorage.getItem("ppaColumnViewMode") || "stacked",
  settings: {
    primary: "#0b5cff",
    accent: "#12a66a",
    header: "#07111f",
    background: "#f6f8fb",
    logo: ""
  },
  dashboardSeed: [
    { week: "W133", planned: 42, done: 39 },
    { week: "W134", planned: 48, done: 44 },
    { week: "W135", planned: 56, done: 38 },
    { week: "W136", planned: 60, done: 35 }
  ],
  activityStats: [
    { name: "Ponto a Ponto", planned: 32, done: 21 },
    { name: "Loop Teste", planned: 16, done: 10 },
    { name: "Preservação", planned: 12, done: 4 }
  ],
  mockRows: [],
  mockProgramacoes: []
};

const MODULE_DEFAULTS = [
  {
    id: "ppa",
    name: "Ponto a Ponto",
    description: "Execução e controle dos pontos a ponto de campo.",
    dbId: null,
    columns: [
      ["forn", "FORN.", "text", false],
      ["sys", "SYS", "text", false],
      ["subsys", "SUBSYS", "text", false],
      ["loop", "LOOP", "text", false],
      ["tag", "TAG", "text", true],
      ["service", "SERVICE", "text", false],
      ["type", "TIPE", "text", false],
      ["descricao", "DESCRIÇÃO", "text", false],
      ["week", "WEEK", "text", false],
      ["ponto_a_ponto", "PONTO-A-PONTO", "date", false],
      ["logs", "LOGS", "text", false]
    ].map(([key, label, type, required]) => ({
      id: `col-${key}`,
      dbId: null,
      key,
      label,
      type,
      required,
      technicianEditable: false,
      options: []
    }))
  },
  {
    id: "loop",
    name: "Loop Teste",
    description: "Módulo independente para testes de loop e seus resultados.",
    dbId: null,
    columns: [
      ["forn", "FORN.", "text", false],
      ["sys", "SYS", "text", true],
      ["subsys", "SUBSYS", "text", false],
      ["loop", "LOOP", "text", true],
      ["tag", "TAG", "text", true],
      ["teste", "TESTE", "text", true],
      ["resultado", "RESULTADO", "select", true],
      ["data_teste", "DATA TESTE", "date", false],
      ["week", "WEEK", "text", true],
      ["observacao", "OBSERVAÇÃO", "text", false]
    ].map(([key, label, type, required]) => ({
      id: `col-${key}`,
      dbId: null,
      key,
      label,
      type,
      required,
      technicianEditable: false,
      options: key === "resultado" ? ["APROVADO", "REPROVADO", "PENDENTE"] : []
    }))
  },
  {
    id: "pres",
    name: "Preservação",
    description: "Módulo de preservação de equipamentos e acompanhamento de status.",
    dbId: null,
    columns: [
      ["forn", "FORN.", "text", false],
      ["sys", "SYS", "text", true],
      ["subsys", "SUBSYS", "text", false],
      ["tag", "TAG", "text", true],
      ["equipamento", "EQUIPAMENTO", "text", true],
      ["metodo", "MÉTODO", "text", false],
      ["data", "DATA", "date", false],
      ["status", "STATUS", "select", true],
      ["week", "WEEK", "text", true],
      ["observacao", "OBSERVAÇÃO", "text", false]
    ].map(([key, label, type, required]) => ({
      id: `col-${key}`,
      dbId: null,
      key,
      label,
      type,
      required,
      technicianEditable: false,
      options: key === "status" ? ["ATIVO", "PRESERVADO", "BLOQUEADO", "LIBERADO"] : []
    }))
  }
];

const ACCESS_DEFAULTS = [];

const $ = id => document.getElementById(id);

const nowBR = () =>
  new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date()).replace(",", "");

const fmtDate = value => {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(date);
};

const escapeHTML = value =>
  String(value ?? "—").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[c]);

const clone = value => JSON.parse(JSON.stringify(value));

function getSupabaseClient() {
  if (state.supabase) return state.supabase;

  const validUrl = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(String(CONFIG.SUPABASE_URL || ""));
  const key = String(CONFIG.SUPABASE_ANON_KEY || "");
  const validKey = key.length > 30 && !key.includes("COLE_AQUI") && !key.includes("SUA_CHAVE");

  if (!validUrl || !validKey || !window.supabase?.createClient) {
    return null;
  }

  state.supabase = window.supabase.createClient(
    CONFIG.SUPABASE_URL,
    CONFIG.SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    }
  );

  return state.supabase;
}

function dbEnabled() {
  return Boolean(getSupabaseClient());
}

function currentWeekNumber() {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diff = Math.floor((start - WEEK_ANCHOR) / 86400000);
  return WEEK_ANCHOR_NUMBER + Math.floor(diff / 7);
}

function currentWeek() {
  return `W${currentWeekNumber()}`;
}

function weekToNumber(value) {
  const match = String(value || "").trim().toUpperCase().match(/^W?(\d+)$/);
  return match ? Number(match[1]) : null;
}

function normalizeWeek(value) {
  const number = weekToNumber(value);
  return Number.isFinite(number) ? `W${number}` : String(value || "").trim().toUpperCase();
}

function makeKey(label) {
  return String(label || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || `campo_${Date.now()}`;
}

function columnTypeLabel(type) {
  return ({
    text: "Texto",
    number: "Número",
    date: "Data",
    select: "Lista",
    boolean: "Sim/Não"
  })[type] || "Texto";
}

function moduleById(id) {
  return state.moduleCatalog.find(m => m.id === id) || null;
}

function moduleByDbId(id) {
  return state.moduleCatalog.find(m => m.dbId === id) || null;
}

function selectedModule() {
  return moduleById(state.selectedModuleId);
}

function currentUserLabel() {
  return state.currentUser?.nome || "Usuário";
}

function currentTeamName() {
  const person = state.peopleRecords.find(p => p.id === state.currentUser?.id);
  if (person?.equipe_id) {
    return state.teams.find(t => t.id === person.equipe_id)?.nome || "";
  }
  return state.currentUser?.team || "";
}

function teamByName(name) {
  return state.teams.find(t => String(t.name || t.nome).toLowerCase() === String(name || "").toLowerCase()) || null;
}

function personByName(name) {
  return state.peopleRecords.find(p => String(p.nome).toLowerCase() === String(name || "").toLowerCase()) || null;
}

function setupSidebar() {
  const sidebar = $("appSidebar");
  const shell = $("appShell");
  const toggle = $("sidebarToggle");
  if (!sidebar || !shell || !toggle) return;

  const collapsed = localStorage.getItem("ppaSidebarCollapsed") === "1";
  sidebar.classList.toggle("collapsed", collapsed);
  shell.classList.toggle("sidebar-collapsed", collapsed);

  toggle.setAttribute("aria-label", collapsed ? "Expandir menu" : "Recolher menu");
  toggle.title = collapsed ? "Expandir menu" : "Recolher menu";

  toggle.onclick = () => {
    const next = !sidebar.classList.contains("collapsed");
    sidebar.classList.toggle("collapsed", next);
    shell.classList.toggle("sidebar-collapsed", next);
    localStorage.setItem("ppaSidebarCollapsed", next ? "1" : "0");
    toggle.setAttribute("aria-label", next ? "Expandir menu" : "Recolher menu");
    toggle.title = next ? "Expandir menu" : "Recolher menu";
  };
}

function toast(message) {
  const target = $("toast");
  if (!target) return;
  target.textContent = message;
  target.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => target.classList.remove("show"), 2800);
}

function showLogin(role) {
  $("accessChooser")?.classList.add("hidden");
  $("adminLoginCard")?.classList.toggle("hidden", role !== "admin");
  $("technicianLoginCard")?.classList.toggle("hidden", role !== "technician");
  if ($("adminLoginMessage")) $("adminLoginMessage").textContent = "";
  if ($("techLoginMessage")) $("techLoginMessage").textContent = "";
}

function backToAccessChooser() {
  $("accessChooser")?.classList.remove("hidden");
  $("adminLoginCard")?.classList.add("hidden");
  $("technicianLoginCard")?.classList.add("hidden");
}

function showAppForRole(role) {
  state.role = role;
  $("loginScreen")?.classList.add("hidden");
  $("appShell")?.classList.remove("hidden");
  $("adminNav")?.classList.toggle("hidden", role !== "admin");
  $("techNav")?.classList.toggle("hidden", role !== "technician");

  if ($("roleBadge")) $("roleBadge").textContent = ROLE_LABELS[role] || role;
  if ($("sidebarRoleText")) $("sidebarRoleText").textContent = role === "admin" ? "Painel administrativo" : "Operação de campo";

  if (role === "admin") {
    $("topbarEyebrow") && ($("topbarEyebrow").textContent = "GESTÃO OPERACIONAL");
    $("topbarTitle") && ($("topbarTitle").textContent = "PLANNING PRO");
    $("topbarSubtitle") && ($("topbarSubtitle").textContent = "Dashboard, programação e gestão do projeto");
    nav("dashboard");
  } else {
    $("topbarEyebrow") && ($("topbarEyebrow").textContent = "OPERAÇÃO DE CAMPO");
    $("topbarTitle") && ($("topbarTitle").textContent = "PLANNING PRO");
    $("topbarSubtitle") && ($("topbarSubtitle").textContent = "Acompanhe e registre as atividades em campo");
    nav("home");
  }

  setupProfile();
}

async function loginAdmin(email, password) {
  const sb = getSupabaseClient();
  if (!sb) {
    if ($("adminLoginMessage")) $("adminLoginMessage").textContent = "Supabase não está configurado.";
    return false;
  }

  try {
    if ($("adminLoginMessage")) $("adminLoginMessage").textContent = "Entrando...";

    const { data: authData, error: authError } = await sb.auth.signInWithPassword({
      email,
      password
    });

    if (authError) throw authError;

    const user = authData?.user;
    if (!user) throw new Error("Usuário autenticado não encontrado.");

    const ok = await loadAuthenticatedProfile();
    if (!ok) {
      await sb.auth.signOut();
      throw new Error("O usuário Auth não possui um perfil ativo em tb_pessoas ou a leitura foi bloqueada pelo banco.");
    }

    if (state.currentUser?.role !== "admin") {
      await sb.auth.signOut();
      state.currentUser = null;
      state.role = null;
      throw new Error("Esta conta não possui perfil de Administrador.");
    }

    sessionStorage.setItem("ppaSession", JSON.stringify(state.currentUser));
    if ($("adminLoginMessage")) $("adminLoginMessage").textContent = "";

    showAppForRole("admin");
    await syncAll();
    return true;
  } catch (error) {
    console.error("Erro no login administrativo:", error);
    if ($("adminLoginMessage")) {
      const message = error?.message || "Não foi possível realizar o login.";
      $("adminLoginMessage").textContent = message;
    }
    return false;
  }
}

async function loginTechnician(code) {
  const normalizedCode = String(code || "").trim();

  if (dbEnabled()) {
    try {
      const sb = getSupabaseClient();
      const { data: pessoa, error } = await sb
        .from("tb_pessoas")
        .select("id,nome,cracha,perfil,ativo,auth_user_id,equipe_id,disciplina")
        .eq("cracha", normalizedCode)
        .eq("ativo", true)
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (!pessoa || pessoa.perfil === "ADMINISTRADOR") {
        throw new Error("Código não encontrado, inativo ou sem permissão de técnico.");
      }

      const team = state.teams.find(t => t.id === pessoa.equipe_id);
      state.currentUser = {
        id: pessoa.id,
        authUserId: pessoa.auth_user_id,
        nome: pessoa.nome,
        identificador: pessoa.cracha,
        perfil: pessoa.perfil,
        disciplina: pessoa.disciplina,
        equipeId: pessoa.equipe_id,
        team: team?.nome || "",
        role: "technician"
      };
      sessionStorage.setItem("ppaSession", JSON.stringify(state.currentUser));
      showAppForRole("technician");
      await syncAll();
      return true;
    } catch (error) {
      console.error("Erro no login do técnico:", error);
      if ($("techLoginMessage")) $("techLoginMessage").textContent = error?.message || "Não foi possível entrar.";
      return false;
    }
  }

  if ($("techLoginMessage")) $("techLoginMessage").textContent = "Supabase não está configurado.";
  return false;
}

async function logout() {
  try {
    const sb = getSupabaseClient();
    if (sb) await sb.auth.signOut();
  } catch (error) {
    console.error("Erro ao sair:", error);
  }

  sessionStorage.removeItem("ppaSession");
  state.currentUser = null;
  state.role = null;
  state.rows = [];
  state.programacoes = [];

  $("appShell")?.classList.add("hidden");
  $("loginScreen")?.classList.remove("hidden");
  backToAccessChooser();
  $("adminLoginForm")?.reset();
  $("technicianLoginForm")?.reset();
}

function nav(screen) {
  const allowedAdmin = [
    "dashboard",
    "programacao",
    "program-history",
    "atividades",
    "acessos",
    "configuracoes",
    "profile"
  ];
  const allowedTech = ["home", "dashboard", "history", "profile"];
  const allowed = state.role === "admin" ? allowedAdmin : allowedTech;

  if (!allowed.includes(screen)) screen = state.role === "admin" ? "dashboard" : "home";

  document.querySelectorAll(".screen").forEach(el => el.classList.remove("active-screen"));
  $("screen-" + screen)?.classList.add("active-screen");

  document.querySelectorAll(".nav-item").forEach(button => {
    button.classList.toggle("active", button.dataset.screen === screen);
  });

  if (screen === "dashboard") renderDashboard();
  if (screen === "programacao") renderProgramacao();
  if (screen === "program-history") renderProgramHistory();
  if (screen === "atividades") renderModules();
  if (screen === "acessos") renderAccesses();
  if (screen === "configuracoes") setupSettings();
  if (screen === "history") renderHistory();
}

/* =========================
   AUTH / PROFILE
   ========================= */

async function loadAuthenticatedProfile() {
  const sb = getSupabaseClient();

  if (!sb) {
    console.error("Supabase não está configurado.");
    return false;
  }

  try {
    const { data: authData, error: authError } = await sb.auth.getUser();
    if (authError) throw authError;

    const user = authData?.user;
    if (!user) return false;

    const { data: pessoa, error } = await sb
      .from("tb_pessoas")
      .select("id,nome,cracha,perfil,ativo,auth_user_id,equipe_id,disciplina")
      .eq("auth_user_id", user.id)
      .eq("ativo", true)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Erro ao carregar tb_pessoas:", error);
      if (error.code === "42501" || error.status === 403) {
        console.error("A role authenticated precisa de SELECT em public.tb_pessoas além da política RLS.");
      }
      return false;
    }

    if (!pessoa) return false;

    const team = state.teams.find(t => t.id === pessoa.equipe_id);

    state.currentUser = {
      id: pessoa.id,
      authUserId: pessoa.auth_user_id,
      nome: pessoa.nome,
      identificador: pessoa.cracha,
      perfil: pessoa.perfil,
      disciplina: pessoa.disciplina,
      equipeId: pessoa.equipe_id,
      team: team?.nome || "",
      email: user.email || "",
      role: pessoa.perfil === "ADMINISTRADOR" ? "admin" : "technician"
    };

    sessionStorage.setItem("ppaSession", JSON.stringify(state.currentUser));
    return true;
  } catch (error) {
    console.error("Falha ao carregar perfil autenticado:", error);
    return false;
  }
}

function setupProfile() {
  const user = state.currentUser;
  if (!user) return;

  const initials = String(user.nome || "Usuário")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(x => x[0])
    .join("")
    .toUpperCase();

  $("profileAvatar") && ($("profileAvatar").textContent = initials || "US");
  $("profileName") && ($("profileName").textContent = user.nome || "Usuário");
  $("profileName2") && ($("profileName2").textContent = user.nome || "—");
  $("profileBadge") && ($("profileBadge").textContent = user.email || user.identificador || "—");
  $("profileBadge2") && ($("profileBadge2").textContent = user.identificador || user.email || "—");
  $("profileRole2") && ($("profileRole2").textContent = user.perfil || ROLE_LABELS[user.role] || "—");
  $("profileWeek") && ($("profileWeek").textContent = currentWeek());
}

/* =========================
   SETTINGS
   ========================= */

const DEFAULT_SETTINGS = clone(state.settings);

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem("ppaSettings") || "null");
    state.settings = { ...DEFAULT_SETTINGS, ...(saved || {}) };
  } catch {
    state.settings = clone(DEFAULT_SETTINGS);
  }
  applySettings();
}

function persistSettings() {
  localStorage.setItem("ppaSettings", JSON.stringify(state.settings));
  applySettings();
}

function applySettings() {
  const root = document.documentElement;
  root.style.setProperty("--sys-primary", state.settings.primary);
  root.style.setProperty("--sys-accent", state.settings.accent);
  root.style.setProperty("--sys-header", state.settings.header);
  root.style.setProperty("--sys-bg", state.settings.background);

  document.querySelectorAll(".brand-mark").forEach(element => {
    if (state.settings.logo) {
      element.style.backgroundImage = `url(${state.settings.logo})`;
      element.style.backgroundSize = "contain";
      element.style.backgroundRepeat = "no-repeat";
      element.style.backgroundPosition = "center";
      element.textContent = "";
    } else {
      element.style.backgroundImage = "";
      element.textContent = "PP";
    }
  });
}

function currentSettings() {
  return state.settings || DEFAULT_SETTINGS;
}

function setupSettings() {
  const settings = currentSettings();
  const colorMap = {
    settingsPrimaryColor: "primary",
    settingsAccentColor: "accent",
    settingsHeaderColor: "header",
    settingsBgColor: "background"
  };

  Object.entries(colorMap).forEach(([id, key]) => {
    if ($(id)) $(id).value = settings[key];
  });

  const preview = $("settingsLogoPreview");
  const placeholder = $("settingsLogoPlaceholder");
  if (preview && placeholder) {
    if (settings.logo) {
      preview.src = settings.logo;
      preview.classList.remove("hidden");
      placeholder.classList.add("hidden");
    } else {
      preview.classList.add("hidden");
      placeholder.classList.remove("hidden");
    }
  }

  const input = $("settingsLogoInput");
  if (input && !input.dataset.bound) {
    input.dataset.bound = "1";
    input.onchange = event => {
      const file = event.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        state.settings.logo = String(reader.result || "");
        setupSettings();
      };
      reader.readAsDataURL(file);
    };
  }

  if ($("removeSettingsLogoBtn")) {
    $("removeSettingsLogoBtn").onclick = () => {
      state.settings.logo = "";
      if ($("settingsLogoInput")) $("settingsLogoInput").value = "";
      setupSettings();
    };
  }

  if ($("saveSettingsBtn")) {
    $("saveSettingsBtn").onclick = () => {
      state.settings = {
        ...state.settings,
        primary: $("settingsPrimaryColor")?.value || state.settings.primary,
        accent: $("settingsAccentColor")?.value || state.settings.accent,
        header: $("settingsHeaderColor")?.value || state.settings.header,
        background: $("settingsBgColor")?.value || state.settings.background
      };
      persistSettings();
      if ($("settingsMessage")) {
        $("settingsMessage").textContent = "Configurações salvas.";
        $("settingsMessage").classList.add("ok");
      }
    };
  }

  if ($("resetSettingsBtn")) {
    $("resetSettingsBtn").onclick = () => {
      state.settings = clone(DEFAULT_SETTINGS);
      persistSettings();
      setupSettings();
      if ($("settingsMessage")) {
        $("settingsMessage").textContent = "Padrão restaurado.";
        $("settingsMessage").classList.add("ok");
      }
    };
  }
}

/* =========================
   MODULES / ACTIVITIES
   ========================= */

function normalizeModules() {
  try {
    const saved = JSON.parse(localStorage.getItem("ppaModules") || "null");
    state.moduleCatalog = Array.isArray(saved) && saved.length ? saved : clone(MODULE_DEFAULTS);
  } catch {
    state.moduleCatalog = clone(MODULE_DEFAULTS);
  }

  state.moduleCatalog = state.moduleCatalog.map(module => ({
    ...module,
    columns: (module.columns || []).map(column => ({
      ...column,
      technicianEditable: Boolean(column.technicianEditable),
      options: Array.isArray(column.options) ? column.options : []
    }))
  }));

  if (!state.selectedModuleId || !moduleById(state.selectedModuleId)) {
    state.selectedModuleId = state.moduleCatalog[0]?.id || null;
  }

  localStorage.setItem("ppaModules", JSON.stringify(state.moduleCatalog));
}

async function loadModulesFromDB() {
  const sb = getSupabaseClient();
  if (!sb) return false;

  const { data: modules, error } = await sb
    .from("tb_atividades")
    .select("id,nome,descricao,ativo,created_at,updated_at")
    .eq("ativo", true)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Erro ao carregar tb_atividades:", error);
    return false;
  }

  const { data: columns, error: columnError } = await sb
    .from("tb_atividade_colunas")
    .select("*")
    .order("ordem", { ascending: true });

  if (columnError) {
    console.warn("Não foi possível carregar tb_atividade_colunas:", columnError.message);
  }

  if (!modules?.length) return false;

  const rebuilt = modules.map(dbModule => {
    const existing = state.moduleCatalog.find(m => String(m.name).toLowerCase() === String(dbModule.nome).toLowerCase()) || null;
    const dbColumns = (columns || [])
      .filter(column => column.atividade_id === dbModule.id)
      .map(column => ({
        id: existing?.columns?.find(c => c.dbId === column.id || c.key === column.chave)?.id || `col-${column.id}`,
        dbId: column.id,
        key: column.chave,
        label: column.rotulo,
        type: column.tipo,
        required: Boolean(column.obrigatorio),
        technicianEditable: Boolean(column.editavel_tecnico),
        options: Array.isArray(column.opcoes) ? column.opcoes : []
      }));

    return {
      id: existing?.id || makeKey(dbModule.nome),
      dbId: dbModule.id,
      name: dbModule.nome,
      description: dbModule.descricao || "",
      columns: dbColumns.length ? dbColumns : (existing?.columns || [])
    };
  });

  state.moduleCatalog = rebuilt;
  if (!state.selectedModuleId || !moduleById(state.selectedModuleId)) {
    state.selectedModuleId = state.moduleCatalog[0]?.id || null;
  }
  localStorage.setItem("ppaModules", JSON.stringify(state.moduleCatalog));
  return true;
}

async function syncModulesToDB() {
  const sb = getSupabaseClient();
  if (!sb || state.role !== "admin") return;

  for (const module of state.moduleCatalog) {
    let dbId = module.dbId || null;

    if (dbId) {
      const { error } = await sb
        .from("tb_atividades")
        .update({
          nome: module.name,
          descricao: module.description || null,
          ativo: true,
          updated_at: new Date().toISOString()
        })
        .eq("id", dbId);
      if (error) throw error;
    } else {
      const { data: existing, error: findError } = await sb
        .from("tb_atividades")
        .select("id,nome")
        .ilike("nome", module.name)
        .limit(1)
        .maybeSingle();
      if (findError) throw findError;

      if (existing) {
        dbId = existing.id;
        module.dbId = dbId;
      } else {
        const { data: inserted, error: insertError } = await sb
          .from("tb_atividades")
          .insert({
            nome: module.name,
            descricao: module.description || null,
            ativo: true
          })
          .select("id")
          .single();
        if (insertError) throw insertError;
        dbId = inserted.id;
        module.dbId = dbId;
      }
    }

    const { data: existingColumns, error: existingColumnError } = await sb
      .from("tb_atividade_colunas")
      .select("id,chave")
      .eq("atividade_id", dbId);
    if (existingColumnError) throw existingColumnError;

    for (let index = 0; index < module.columns.length; index += 1) {
      const column = module.columns[index];
      const old = existingColumns?.find(item => item.chave === column.key) || null;
      const payload = {
        atividade_id: dbId,
        chave: column.key,
        rotulo: column.label,
        tipo: column.type,
        obrigatorio: Boolean(column.required),
        editavel_tecnico: Boolean(column.technicianEditable),
        opcoes: Array.isArray(column.options) ? column.options : [],
        ordem: index,
        updated_at: new Date().toISOString()
      };

      let result;
      if (old?.id || column.dbId) {
        result = await sb
          .from("tb_atividade_colunas")
          .update(payload)
          .eq("id", column.dbId || old.id);
      } else {
        result = await sb
          .from("tb_atividade_colunas")
          .insert(payload)
          .select("id")
          .single();
        if (!result.error && result.data?.id) column.dbId = result.data.id;
      }
      if (result.error) throw result.error;
    }
  }

  localStorage.setItem("ppaModules", JSON.stringify(state.moduleCatalog));
}

function loadModuleCatalog() {
  normalizeModules();
  moduleRecordStore();
}

function persistModules() {
  localStorage.setItem("ppaModules", JSON.stringify(state.moduleCatalog));
  syncModulesToDB().catch(error => {
    console.error("Erro ao sincronizar atividades:", error);
    toast("Atividade salva localmente, mas não foi sincronizada no banco.");
  });
}

function moduleRecordStore() {
  try {
    state.moduleRecords = JSON.parse(localStorage.getItem("ppaModuleRecords") || "{}") || {};
  } catch {
    state.moduleRecords = {};
  }
  if (typeof state.moduleRecords !== "object") state.moduleRecords = {};
  return state.moduleRecords;
}

function persistModuleRecords() {
  localStorage.setItem("ppaModuleRecords", JSON.stringify(state.moduleRecords || {}));
}

function renderModules() {
  normalizeModules();
  const modules = state.moduleCatalog;

  if ($("moduleCountBadge")) $("moduleCountBadge").textContent = modules.length;
  if ($("moduleCards")) {
    $("moduleCards").innerHTML = modules.map(module => `
      <button class="module-card ${module.id === state.selectedModuleId ? "active" : ""}" data-module-id="${escapeHTML(module.id)}">
        <h4>${escapeHTML(module.name)}</h4>
        <p>${escapeHTML(module.description || "Sem descrição")}</p>
        <div class="module-card-meta">
          <span><b>${module.columns.length}</b> colunas</span>
          <span><b>${(moduleRecordStore()[module.id] || []).length}</b> registros</span>
        </div>
      </button>
    `).join("");

    $("moduleCards").querySelectorAll("[data-module-id]").forEach(button => {
      button.onclick = () => {
        state.selectedModuleId = button.dataset.moduleId;
        renderModules();
      };
    });
  }

  const module = selectedModule();
  $("moduleEditorEmpty")?.classList.toggle("hidden", Boolean(module));
  $("moduleEditor")?.classList.toggle("hidden", !module);
  if (!module) return;

  $("moduleTitle") && ($("moduleTitle").textContent = module.name);
  $("moduleDescription") && ($("moduleDescription").textContent = module.description || "");
  $("moduleColumnCount") && ($("moduleColumnCount").textContent = module.columns.length);
  $("moduleRequiredCount") && ($("moduleRequiredCount").textContent = module.columns.filter(c => c.required).length);
  $("moduleRecordCount") && ($("moduleRecordCount").textContent = (moduleRecordStore()[module.id] || []).length);
  $("maskFileName") && ($("maskFileName").textContent = `mascara_${makeKey(module.name)}.xlsx`);

  const host = $("columnRows");
  if (host) {
    host.className = `column-list${state.columnViewMode === "side" ? " side-view" : " stacked-view"}`;
    host.innerHTML = module.columns.map((column, index) => `
      <div class="column-row" draggable="true" data-column-id="${escapeHTML(column.id)}">
        <div class="column-grip">☷</div>
        <div class="column-order">
          <button class="mini-btn" data-move-column-up="${escapeHTML(column.id)}" ${index === 0 ? "disabled" : ""}>↑</button>
          <button class="mini-btn" data-move-column-down="${escapeHTML(column.id)}" ${index === module.columns.length - 1 ? "disabled" : ""}>↓</button>
        </div>
        <div class="column-info"><strong>${escapeHTML(column.label)}</strong><small>${escapeHTML(column.key)}</small></div>
        <div class="column-type"><span class="module-badge">${columnTypeLabel(column.type)}</span></div>
        <div class="column-required">${column.required ? "Obrigatória" : "Opcional"}</div>
        <div class="column-required">${column.technicianEditable ? "Editável pelo Técnico" : "Bloqueada"}</div>
        <div class="drag-hint">${column.type === "select" ? escapeHTML((column.options || []).join(", ")) : ""}</div>
        <div class="column-actions">
          <button class="mini-btn" data-edit-column="${escapeHTML(column.id)}">✎</button>
          <button class="mini-btn danger" data-delete-column="${escapeHTML(column.id)}">×</button>
        </div>
      </div>
    `).join("");

    host.querySelectorAll("[data-edit-column]").forEach(button => {
      button.onclick = () => openColumnModal(button.dataset.editColumn);
    });
    host.querySelectorAll("[data-delete-column]").forEach(button => {
      button.onclick = () => deleteColumn(button.dataset.deleteColumn);
    });
    host.querySelectorAll("[data-move-column-up]").forEach(button => {
      button.onclick = () => moveColumn(button.dataset.moveColumnUp, -1);
    });
    host.querySelectorAll("[data-move-column-down]").forEach(button => {
      button.onclick = () => moveColumn(button.dataset.moveColumnDown, 1);
    });

    setupColumnDragDrop();
  }

  renderColumnViewPreview(module);
  renderMaskPreview(module);
}

function setColumnViewMode(mode) {
  state.columnViewMode = mode === "side" ? "side" : "stacked";
  localStorage.setItem("ppaColumnViewMode", state.columnViewMode);
  document.querySelectorAll("[data-column-view]").forEach(button => {
    button.classList.toggle("active", button.dataset.columnView === state.columnViewMode);
  });
  if (selectedModule()) renderModules();
}

function renderColumnViewPreview(module) {
  const preview = $("columnViewPreview");
  if (!preview) return;
  preview.classList.toggle("stacked", state.columnViewMode === "stacked");
  preview.classList.toggle("side", state.columnViewMode === "side");
  preview.innerHTML = module.columns.map((column, index) => `
    <div class="column-preview-card">
      <span class="preview-order">${index + 1}</span>
      <span class="preview-label">${escapeHTML(column.label)}</span>
      <span class="preview-meta">${columnTypeLabel(column.type)}</span>
      <span class="preview-chip">${column.required ? "Obrigatória" : "Opcional"}</span>
    </div>
  `).join("");
}

function setupColumnDragDrop() {
  const list = $("columnRows");
  if (!list) return;
  let dragged = null;

  list.querySelectorAll(".column-row").forEach(row => {
    row.addEventListener("dragstart", () => {
      dragged = row.dataset.columnId;
      row.classList.add("dragging");
    });
    row.addEventListener("dragend", () => row.classList.remove("dragging"));
    row.addEventListener("dragover", event => {
      event.preventDefault();
      row.classList.add("drag-over");
    });
    row.addEventListener("dragleave", () => row.classList.remove("drag-over"));
    row.addEventListener("drop", event => {
      event.preventDefault();
      row.classList.remove("drag-over");
      if (!dragged || dragged === row.dataset.columnId) return;
      const module = selectedModule();
      if (!module) return;
      const from = module.columns.findIndex(c => c.id === dragged);
      const to = module.columns.findIndex(c => c.id === row.dataset.columnId);
      if (from < 0 || to < 0) return;
      const [moved] = module.columns.splice(from, 1);
      module.columns.splice(to, 0, moved);
      persistModules();
      renderModules();
    });
  });
}

function openActivityModal(id = null) {
  state.editingModuleId = id;
  const module = id ? moduleById(id) : null;
  $("activityModal")?.classList.remove("hidden");
  if ($("activityModalTitle")) $("activityModalTitle").textContent = module ? "Editar atividade" : "Nova atividade";
  if ($("activityNameInput")) $("activityNameInput").value = module?.name || "";
  if ($("activityDescriptionInput")) $("activityDescriptionInput").value = module?.description || "";
  if ($("activityFormMessage")) $("activityFormMessage").textContent = "";
}

function closeActivityModal() {
  $("activityModal")?.classList.add("hidden");
  state.editingModuleId = null;
}

function saveActivity() {
  const name = $("activityNameInput")?.value.trim();
  const description = $("activityDescriptionInput")?.value.trim() || "";
  if (!name) {
    if ($("activityFormMessage")) $("activityFormMessage").textContent = "Informe o nome da atividade.";
    return;
  }

  const duplicate = state.moduleCatalog.some(
    module => module.name.toLowerCase() === name.toLowerCase() && module.id !== state.editingModuleId
  );
  if (duplicate) {
    if ($("activityFormMessage")) $("activityFormMessage").textContent = "Já existe uma atividade com esse nome.";
    return;
  }

  if (state.editingModuleId) {
    const module = moduleById(state.editingModuleId);
    if (module) {
      module.name = name;
      module.description = description;
    }
  } else {
    const id = `mod-${Date.now()}`;
    state.moduleCatalog.push({
      id,
      dbId: null,
      name,
      description,
      columns: []
    });
    state.selectedModuleId = id;
  }

  persistModules();
  closeActivityModal();
  renderModules();
  setupProgrammingSelectors();
  toast("Atividade salva.");
}

function deleteActivity() {
  const module = selectedModule();
  if (!module) return;
  state.pendingDeleteModuleId = module.id;
  if ($("deleteModuleText")) $("deleteModuleText").textContent = `A atividade “${module.name}” será removida do catálogo. As programações já gravadas não serão apagadas automaticamente.`;
  $("deleteModuleConfirm")?.classList.remove("hidden");
}

async function confirmDeleteActivity() {
  const id = state.pendingDeleteModuleId;
  const module = moduleById(id);
  if (!module) return;

  try {
    const sb = getSupabaseClient();
    if (sb && module.dbId) {
      const { error } = await sb
        .from("tb_atividades")
        .update({ ativo: false, updated_at: new Date().toISOString() })
        .eq("id", module.dbId);
      if (error) throw error;
    }

    state.moduleCatalog = state.moduleCatalog.filter(m => m.id !== id);
    delete moduleRecordStore()[id];
    persistModuleRecords();
    persistModules();
    state.selectedModuleId = state.moduleCatalog[0]?.id || null;
    $("deleteModuleConfirm")?.classList.add("hidden");
    renderModules();
    setupProgrammingSelectors();
    renderDashboard();
    toast("Atividade removida.");
  } catch (error) {
    toast(error?.message || "Não foi possível remover a atividade.");
  }
}

function openColumnModal(id = null) {
  const module = selectedModule();
  if (!module) return;
  state.editingColumnId = id;
  const column = id ? module.columns.find(item => item.id === id) : null;

  $("columnModal")?.classList.remove("hidden");
  $("columnModalTitle") && ($("columnModalTitle").textContent = column ? "Editar coluna" : "Nova coluna");
  $("columnLabelInput") && ($("columnLabelInput").value = column?.label || "");
  $("columnKeyInput") && ($("columnKeyInput").value = column?.key || "");
  $("columnTypeInput") && ($("columnTypeInput").value = column?.type || "text");
  $("columnRequiredInput") && ($("columnRequiredInput").checked = Boolean(column?.required));
  $("columnTechnicianEditableInput") && ($("columnTechnicianEditableInput").checked = Boolean(column?.technicianEditable));
  $("columnOptionsInput") && ($("columnOptionsInput").value = (column?.options || []).join(", "));
  $("columnFormMessage") && ($("columnFormMessage").textContent = "");
}

function closeColumnModal() {
  $("columnModal")?.classList.add("hidden");
  state.editingColumnId = null;
}

function saveColumn() {
  const module = selectedModule();
  if (!module) return;

  const label = $("columnLabelInput")?.value.trim() || "";
  const key = makeKey($("columnKeyInput")?.value.trim() || label);
  const type = $("columnTypeInput")?.value || "text";
  const required = Boolean($("columnRequiredInput")?.checked);
  const technicianEditable = Boolean($("columnTechnicianEditableInput")?.checked);
  const options = ($( "columnOptionsInput")?.value || "")
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);

  if (!label) {
    if ($("columnFormMessage")) $("columnFormMessage").textContent = "Informe o nome exibido.";
    return;
  }

  const duplicate = module.columns.some(column => column.key === key && column.id !== state.editingColumnId);
  if (duplicate) {
    if ($("columnFormMessage")) $("columnFormMessage").textContent = "A chave desta coluna já existe neste módulo.";
    return;
  }

  if (state.editingColumnId) {
    const column = module.columns.find(item => item.id === state.editingColumnId);
    if (column) Object.assign(column, { label, key, type, required, technicianEditable, options: type === "select" ? options : [] });
  } else {
    module.columns.push({
      id: `col-${Date.now()}`,
      dbId: null,
      label,
      key,
      type,
      required,
      technicianEditable,
      options: type === "select" ? options : []
    });
  }

  persistModules();
  closeColumnModal();
  renderModules();
  toast("Coluna salva.");
}

function deleteColumn(id) {
  const module = selectedModule();
  if (!module) return;
  const column = module.columns.find(item => item.id === id);
  if (!column) return;
  if (!confirm(`Excluir a coluna “${column.label}”?`)) return;
  module.columns = module.columns.filter(item => item.id !== id);
  persistModules();
  renderModules();
  toast("Coluna excluída.");
}

function moveColumn(id, direction) {
  const module = selectedModule();
  if (!module) return;
  const index = module.columns.findIndex(item => item.id === id);
  if (index < 0) return;
  const target = index + direction;
  if (target < 0 || target >= module.columns.length) return;
  [module.columns[index], module.columns[target]] = [module.columns[target], module.columns[index]];
  persistModules();
  renderModules();
}

function renderMaskPreview(module) {
  const table = $("maskPreviewTable");
  if (!table) return;
  const headers = module.columns.map(column => `<th>${escapeHTML(column.label)}${column.required ? " *" : ""}</th>`).join("");
  const sample = module.columns.map(column => {
    const value = column.type === "date"
      ? "AAAA-MM-DD"
      : column.type === "number"
        ? "0"
        : column.type === "select"
          ? (column.options?.[0] || "OPÇÃO")
          : column.type === "boolean"
            ? "SIM"
            : "—";
    return `<td>${escapeHTML(value)}</td>`;
  }).join("");
  table.innerHTML = `<thead><tr>${headers}</tr></thead><tbody><tr>${sample}</tr><tr>${module.columns.map(() => "<td></td>").join("")}</tr></tbody>`;
}

/* =========================
   TEAMS / PEOPLE
   ========================= */

async function loadTeamsAndPeople() {
  const sb = getSupabaseClient();
  if (!sb) return false;

  const [teamsResult, peopleResult] = await Promise.all([
    sb.from("tb_equipes").select("id,nome,disciplina,ativo,created_at,updated_at").eq("ativo", true).order("nome"),
    sb.from("tb_pessoas").select("id,nome,cracha,perfil,ativo,auth_user_id,equipe_id,disciplina,created_at,updated_at").eq("ativo", true).order("nome")
  ]);

  if (teamsResult.error) {
    console.error("Erro ao carregar equipes:", teamsResult.error);
    throw teamsResult.error;
  }
  if (peopleResult.error) {
    console.error("Erro ao carregar pessoas:", peopleResult.error);
    throw peopleResult.error;
  }

  state.teams = (teamsResult.data || []).map(team => ({
    id: team.id,
    dbId: team.id,
    name: team.nome,
    nome: team.nome,
    disciplina: team.disciplina,
    ativo: team.ativo
  }));

  state.peopleRecords = peopleResult.data || [];
  state.accesses = state.peopleRecords.map(person => {
    const team = state.teams.find(item => item.id === person.equipe_id);
    return {
      id: person.id,
      nome: person.nome,
      funcao: person.perfil === "ADMINISTRADOR" ? "Administrador" : "Executante",
      email: "",
      codigo: person.cracha,
      role: person.perfil === "ADMINISTRADOR" ? "admin" : "technician",
      team: team?.nome || "",
      status: person.ativo ? "ATIVO" : "INATIVO",
      disciplina: person.disciplina || team?.disciplina || ""
    };
  });

  if (state.currentUser?.id) {
    const me = state.peopleRecords.find(person => person.id === state.currentUser.id);
    if (me) {
      const team = state.teams.find(item => item.id === me.equipe_id);
      state.currentUser.team = team?.nome || "";
      state.currentUser.equipeId = me.equipe_id || null;
      state.currentUser.disciplina = me.disciplina || team?.disciplina || "";
      sessionStorage.setItem("ppaSession", JSON.stringify(state.currentUser));
    }
  }

  return true;
}

function normalizeAccesses() {
  if (dbEnabled()) return;
  state.accesses = clone(ACCESS_DEFAULTS);
}

function renderAccesses() {
  const search = $("accessSearch")?.value.trim().toLowerCase() || "";
  const rows = state.accesses.filter(person => {
    const values = [person.nome, person.email, person.funcao, person.team, person.codigo, person.disciplina];
    return !search || values.some(value => String(value || "").toLowerCase().includes(search));
  });

  $("accessTotal") && ($("accessTotal").textContent = state.accesses.length);
  $("accessActive") && ($("accessActive").textContent = state.accesses.filter(item => item.status === "ATIVO").length);
  $("accessCodes") && ($("accessCodes").textContent = state.accesses.filter(item => item.codigo).length);

  if ($("accessTableBody")) {
    $("accessTableBody").innerHTML = rows.map(person => `
      <tr>
        <td><strong>${escapeHTML(person.nome)}</strong></td>
        <td>${escapeHTML(person.funcao)}</td>
        <td>${escapeHTML(person.email || "—")}</td>
        <td class="tag-cell">${escapeHTML(person.codigo || "—")}</td>
        <td>${escapeHTML(person.team || "—")}</td>
        <td>${person.role === "admin" ? "Administrador" : "Técnico"}</td>
        <td><span class="status-chip ${person.status === "ATIVO" ? "active" : "inactive"}">${escapeHTML(person.status)}</span></td>
        <td><div class="profile-list-actions"><button class="mini-btn" data-edit-access="${escapeHTML(person.id)}" title="Editar">✎</button></div></td>
      </tr>
    `).join("");

    $("accessTableBody").querySelectorAll("[data-edit-access]").forEach(button => {
      button.onclick = () => openAccessModal(button.dataset.editAccess);
    });
  }

  $("accessEmpty")?.classList.toggle("hidden", rows.length !== 0);
  populateTeamSelectors();
}

function populateTeamSelectors() {
  const teamOptions = state.teams.map(team => `<option value="${escapeHTML(team.name)}">${escapeHTML(team.name)}</option>`).join("");
  if ($("accessTeamInput")) $("accessTeamInput").innerHTML = teamOptions;
}

function randomAccessCode() {
  const used = new Set(state.accesses.map(person => String(person.codigo)));
  let code = "";
  do {
    code = String(Math.floor(1000 + Math.random() * 9000));
  } while (used.has(code));
  return code;
}

function openAccessModal(id = null) {
  const person = id ? state.accesses.find(item => item.id === id) : null;
  populateTeamSelectors();

  $("accessModal")?.classList.remove("hidden");
  state.editingAccessId = id;
  $("accessModalTitle") && ($("accessModalTitle").textContent = person ? "Editar usuário" : "Novo usuário");
  $("accessNameInput") && ($("accessNameInput").value = person?.nome || "");
  $("accessFunctionInput") && ($("accessFunctionInput").value = person?.funcao || "Executante");
  $("accessEmailInput") && ($("accessEmailInput").value = person?.email || "");
  $("accessCodeInput") && ($("accessCodeInput").value = person?.codigo || randomAccessCode());
  $("accessRoleInput") && ($("accessRoleInput").value = person?.role || "technician");
  $("accessStatusInput") && ($("accessStatusInput").value = person?.status || "ATIVO");
  if ($("accessTeamInput")) $("accessTeamInput").value = person?.team || state.teams[0]?.nome || "";
  if ($("accessFormMessage")) $("accessFormMessage").textContent = "";
}

function closeAccessModal() {
  $("accessModal")?.classList.add("hidden");
  state.editingAccessId = null;
}

async function saveAccess() {
  const name = $("accessNameInput")?.value.trim() || "";
  const functionName = $("accessFunctionInput")?.value.trim() || "Executante";
  const email = $("accessEmailInput")?.value.trim() || "";
  const code = $("accessCodeInput")?.value.trim() || "";
  const role = $("accessRoleInput")?.value || "technician";
  const status = $("accessStatusInput")?.value || "ATIVO";
  const teamName = $("accessTeamInput")?.value || "";

  if (!name || !code) {
    if ($("accessFormMessage")) $("accessFormMessage").textContent = "Nome e código são obrigatórios.";
    return;
  }

  const team = teamByName(teamName);
  const perfil = role === "admin" ? "ADMINISTRADOR" : "EXECUTANTE";
  const active = status === "ATIVO";
  const sb = getSupabaseClient();

  if (!sb) {
    if ($("accessFormMessage")) $("accessFormMessage").textContent = "Supabase não está configurado.";
    return;
  }

  try {
    const payload = {
      nome: name,
      cracha: code,
      perfil,
      ativo: active,
      equipe_id: team?.id || null,
      disciplina: team?.disciplina || null,
      updated_at: new Date().toISOString()
    };

    if (state.editingAccessId) {
      const { error } = await sb.from("tb_pessoas").update(payload).eq("id", state.editingAccessId);
      if (error) throw error;
    } else {
      const { error } = await sb.from("tb_pessoas").insert(payload);
      if (error) throw error;
    }

    await loadTeamsAndPeople();
    closeAccessModal();
    renderAccesses();
    setupProgrammingSelectors();
    toast("Pessoa salva no banco.");
  } catch (error) {
    console.error("Erro ao salvar pessoa:", error);
    if ($("accessFormMessage")) $("accessFormMessage").textContent = error?.message || "Não foi possível salvar a pessoa.";
  }
}

/* =========================
   PROGRAMMING
   ========================= */

function weekOptions() {
  const weeks = new Set([currentWeek()]);
  state.dashboardSeed.forEach(item => weeks.add(normalizeWeek(item.week)));
  state.programacoes.forEach(item => weeks.add(normalizeWeek(item.week)));
  state.rows.forEach(item => {
    if (item.Week) weeks.add(normalizeWeek(item.Week));
  });

  return [...weeks]
    .filter(Boolean)
    .sort((a, b) => weekToNumber(a) - weekToNumber(b))
    .map(week => `<option value="${escapeHTML(week)}">${escapeHTML(week)}</option>`)
    .join("");
}

function setupProgrammingSelectors() {
  const selectedWeek = $("programWeekFilter")?.value || "";
  const selectedActivity = $("programActivityFilter")?.value || "";
  const selectedTeam = $("programTeamFilter")?.value || "";
  const selectedResponsible = $("programResponsible")?.value || "";
  const weeks = weekOptions();

  if ($("programWeekFilter")) {
    $("programWeekFilter").innerHTML = `<option value="">Todas</option>${weeks}`;
    if ([...$("programWeekFilter").options].some(option => option.value === selectedWeek)) $("programWeekFilter").value = selectedWeek;
  }

  if ($("programWeek")) {
    $("programWeek").innerHTML = weeks;
    $("programWeek").value = currentWeek();
  }

  if ($("programActivityFilter")) {
    $("programActivityFilter").innerHTML = `<option value="">Todas</option>` + state.moduleCatalog.map(module => `<option value="${escapeHTML(module.id)}">${escapeHTML(module.name)}</option>`).join("");
    if ([...$("programActivityFilter").options].some(option => option.value === selectedActivity)) $("programActivityFilter").value = selectedActivity;
  }

  if ($("programActivity")) {
    $("programActivity").innerHTML = state.moduleCatalog.map(module => `<option value="${escapeHTML(module.id)}">${escapeHTML(module.name)}</option>`).join("");
    if (!$("programActivity").value && state.moduleCatalog[0]) $("programActivity").value = state.moduleCatalog[0].id;
  }

  if ($("programTeamFilter")) {
    $("programTeamFilter").innerHTML = `<option value="">Todas</option>` + state.teams.map(team => `<option value="${escapeHTML(team.nome)}">${escapeHTML(team.nome)}</option>`).join("");
    if ([...$("programTeamFilter").options].some(option => option.value === selectedTeam)) $("programTeamFilter").value = selectedTeam;
  }

  if ($("programTeam")) {
    $("programTeam").innerHTML = state.teams.map(team => `<option value="${escapeHTML(team.nome)}">${escapeHTML(team.nome)}</option>`).join("");
    if (state.teams.length && !$("programTeam").value) $("programTeam").value = state.teams[0].nome;
  }

  if ($("programResponsible")) {
    const technicians = state.peopleRecords.filter(person => person.ativo && person.perfil !== "ADMINISTRADOR");
    $("programResponsible").innerHTML = technicians.map(person => `<option value="${escapeHTML(person.nome)}">${escapeHTML(person.nome)}</option>`).join("");
    if ([...$("programResponsible").options].some(option => option.value === selectedResponsible)) $("programResponsible").value = selectedResponsible;
  }
}

function filteredProgramacoes() {
  const week = $("programWeekFilter")?.value || "";
  const activity = $("programActivityFilter")?.value || "";
  const team = $("programTeamFilter")?.value || "";
  return state.programacoes
    .filter(program =>
      (!week || normalizeWeek(program.week) === normalizeWeek(week)) &&
      (!activity || program.activity === activity) &&
      (!team || program.team === team)
    )
    .sort((a, b) => `${a.date || ""}-${a.team || ""}`.localeCompare(`${b.date || ""}-${b.team || ""}`));
}

function programColumnsForModule(module) {
  const fixed = [
    { key: "week", label: "SEMANA", required: true },
    { key: "date", label: "DATA", required: true },
    { key: "activity", label: "ATIVIDADE", required: true },
    { key: "team", label: "EQUIPE", required: true },
    { key: "responsible", label: "RESPONSÁVEL", required: true },
    { key: "qty", label: "QTD.", required: true },
    { key: "note", label: "OBSERVAÇÃO", required: false }
  ];
  const custom = (module?.columns || []).filter(column => !["week", "date", "activity", "team", "responsible", "qty", "note"].includes(column.key));
  return [...fixed, ...custom];
}

function getPlanningColumnValue(column, row) {
  return row?.customData?.[column.key] ?? "";
}

function renderProgramCustomFields(activityId, values = {}) {
  const module = moduleById(activityId);
  const host = $("programCustomFields");
  if (!host) return;
  if (!module) {
    host.innerHTML = "";
    return;
  }

  const columns = module.columns.filter(column => !["week", "date", "activity", "team", "responsible", "qty", "note"].includes(column.key));
  host.innerHTML = columns.map(column => {
    const value = values[column.key] ?? "";
    if (column.type === "select") {
      const options = (column.options || []).map(option => `<option value="${escapeHTML(option)}" ${String(option) === String(value) ? "selected" : ""}>${escapeHTML(option)}</option>`).join("");
      return `<div class="dynamic-field"><label>${escapeHTML(column.label)}${column.required ? " *" : ""}<select data-custom-key="${escapeHTML(column.key)}" data-required="${column.required}"><option value="">Selecione</option>${options}</select></label></div>`;
    }
    if (column.type === "boolean") {
      return `<div class="dynamic-field"><label>${escapeHTML(column.label)}${column.required ? " *" : ""}<select data-custom-key="${escapeHTML(column.key)}" data-required="${column.required}"><option value="">Selecione</option><option value="SIM" ${value === "SIM" ? "selected" : ""}>SIM</option><option value="NÃO" ${value === "NÃO" ? "selected" : ""}>NÃO</option></select></label></div>`;
    }
    const inputType = column.type === "number" ? "number" : column.type === "date" ? "date" : "text";
    return `<div class="dynamic-field"><label>${escapeHTML(column.label)}${column.required ? " *" : ""}<input data-custom-key="${escapeHTML(column.key)}" data-required="${column.required}" type="${inputType}" value="${escapeHTML(value)}"></label></div>`;
  }).join("");
}

function renderProgramacao() {
  setupProgrammingSelectors();
  const rows = filteredProgramacoes();
  const selectedActivity = $("programActivityFilter")?.value || "";
  const module = selectedActivity ? moduleById(selectedActivity) : null;
  const customColumns = module?.columns?.filter(column => !["week", "date", "activity", "team", "responsible", "qty", "note"].includes(column.key)) || [];

  $("programCount") && ($("programCount").textContent = rows.length);
  $("programQuantity") && ($("programQuantity").textContent = rows.reduce((sum, row) => sum + Number(row.qty || 0), 0));

  const table = $("programTableBody")?.closest("table");
  if (table) {
    table.querySelector("thead tr").innerHTML = `<th>SEMANA</th><th>DATA</th><th>ATIVIDADE</th><th>EQUIPE</th><th>RESPONSÁVEL</th><th>QTD.</th>${customColumns.map(column => `<th>${escapeHTML(column.label)}</th>`).join("")}<th>OBSERVAÇÃO</th><th></th>`;
  }

  if ($("programTableBody")) {
    $("programTableBody").innerHTML = rows.map(row => {
      const rowModule = moduleById(row.activity);
      const customCells = selectedActivity
        ? customColumns.map(column => `<td>${escapeHTML(getPlanningColumnValue(column, row) || "—")}</td>`).join("")
        : "";
      return `<tr>
        <td class="week-cell">${escapeHTML(row.week)}</td>
        <td>${escapeHTML(fmtDate(row.date))}</td>
        <td class="program-activity">${escapeHTML(rowModule?.name || row.activity)}</td>
        <td class="program-team">${escapeHTML(row.team || "—")}</td>
        <td>${escapeHTML(row.responsible || "—")}</td>
        <td class="program-qty">${escapeHTML(row.qty)}</td>
        ${customCells}
        <td class="program-note">${escapeHTML(row.note || "—")}</td>
        <td><button class="delete-program" data-program-id="${escapeHTML(row.id)}" title="Excluir">×</button></td>
      </tr>`;
    }).join("");

    $("programTableBody").querySelectorAll(".delete-program").forEach(button => {
      button.onclick = () => deleteProgramacao(button.dataset.programId);
    });
  }

  $("programEmpty")?.classList.toggle("hidden", rows.length !== 0);
}

function openProgramModal() {
  setupProgrammingSelectors();
  $("programModal")?.classList.remove("hidden");
  $("programFormMessage") && ($("programFormMessage").textContent = "");
  $("programDate") && ($("programDate").value = new Date().toISOString().slice(0, 10));
  $("programWeek") && ($("programWeek").value = currentWeek());
  $("programQtyInput") && ($("programQtyInput").value = "1");
  $("programNote") && ($("programNote").value = "");
  if ($("programActivity")) renderProgramCustomFields($("programActivity").value);
}

function closeProgramModal() {
  $("programModal")?.classList.add("hidden");
}

async function resolveEquipmentId(customData, module) {
  const sb = getSupabaseClient();
  if (!sb) return null;

  const read = keys => {
    for (const key of keys) {
      if (customData?.[key] !== undefined && String(customData[key]).trim() !== "") return String(customData[key]).trim();
    }
    return "";
  };

  const tag = read(["tag", "TAG", "equipamento", "EQUIPAMENTO"]);
  if (!tag) {
    throw new Error(`Informe a TAG/equipamento na atividade “${module?.name || ""}”.`);
  }

  const { data: existing, error: findError } = await sb
    .from("tb_equipamentos")
    .select("id,tag")
    .eq("tag", tag)
    .limit(1)
    .maybeSingle();
  if (findError) throw findError;
  if (existing) return existing.id;

  const payload = {
    tag,
    forn: read(["forn", "FORN.", "FORN"] ) || null,
    sys: read(["sys", "SYS"]) || null,
    subsys: read(["subsys", "SUBSYS"]) || null,
    loop: read(["loop", "LOOP"]) || null,
    service: read(["service", "SERVICE"]) || null,
    tipe: read(["type", "tipe", "TIPE"]) || null,
    descricao: read(["descricao", "DESCRIÇÃO", "descricao_equipamento"]) || null,
    ativo: true
  };

  const { data: inserted, error: insertError } = await sb
    .from("tb_equipamentos")
    .insert(payload)
    .select("id")
    .single();
  if (insertError) throw insertError;
  return inserted.id;
}

function collectCustomData() {
  const data = {};
  let invalid = false;
  document.querySelectorAll("#programCustomFields [data-custom-key]").forEach(input => {
    const value = String(input.value || "").trim();
    data[input.dataset.customKey] = value;
    if (input.dataset.required === "true" && !value) invalid = true;
  });
  return { data, invalid };
}

async function createProgramacao() {
  const { data: customData, invalid } = collectCustomData();
  const week = normalizeWeek($("programWeek")?.value);
  const date = $("programDate")?.value || "";
  const activity = $("programActivity")?.value || "";
  const team = $("programTeam")?.value || "";
  const responsible = $("programResponsible")?.value || "";
  const qty = Number($("programQtyInput")?.value || 0);
  const note = $("programNote")?.value.trim() || "";
  const module = moduleById(activity);

  if (!week || !date || !activity || !team || !responsible || !qty || qty < 1 || invalid) {
    if ($("programFormMessage")) $("programFormMessage").textContent = "Preencha os campos obrigatórios do planejamento e da atividade.";
    return;
  }

  const sb = getSupabaseClient();
  if (!sb) {
    if ($("programFormMessage")) $("programFormMessage").textContent = "Supabase não está configurado.";
    return;
  }

  try {
    const teamRecord = teamByName(team);
    const person = personByName(responsible);
    if (!teamRecord) throw new Error("Equipe selecionada não encontrada no banco.");
    if (!person) throw new Error("Responsável selecionado não encontrado no banco.");
    if (!module?.dbId) {
      await syncModulesToDB();
    }
    const refreshedModule = moduleById(activity);
    const equipmentId = await resolveEquipmentId(customData, refreshedModule);

    const payload = {
      equipamento_id: equipmentId,
      semana: weekToNumber(week),
      status: "PROGRAMADO",
      atividade_id: refreshedModule.dbId,
      data_programacao: date || null,
      equipe_id: teamRecord.id,
      responsavel_id: person.id,
      quantidade: qty,
      observacao: note || null,
      dados_personalizados: customData,
      modo_importacao: "MANUAL",
      arquivo_importacao: null,
      usuario_importacao: state.currentUser?.authUserId || null,
      updated_at: new Date().toISOString()
    };

    const { data: inserted, error } = await sb
      .from("tb_programacoes")
      .insert(payload)
      .select("id,equipamento_id,semana,status,atividade_id,data_programacao,equipe_id,responsavel_id,quantidade,observacao,dados_personalizados,created_at")
      .single();
    if (error) throw error;

    const mapped = mapProgrammingRecord(inserted);
    state.programacoes.push(mapped);
    cacheProgramacoes();

    closeProgramModal();
    await loadProgramacoes();
    renderProgramacao();
    renderDashboard();
    toast("Programação cadastrada no Supabase.");
  } catch (error) {
    console.error("Erro ao criar programação:", error);
    if ($("programFormMessage")) $("programFormMessage").textContent = error?.message || "Não foi possível salvar a programação.";
  }
}

function mapProgrammingRecord(row) {
  const module = moduleByDbId(row.atividade_id);
  const team = state.teams.find(item => item.id === row.equipe_id);
  const person = state.peopleRecords.find(item => item.id === row.responsavel_id);
  return {
    id: row.id,
    week: `W${row.semana}`,
    date: row.data_programacao || "",
    activity: module?.id || row.atividade_id,
    activityDbId: row.atividade_id,
    team: team?.nome || "",
    teamId: row.equipe_id,
    responsible: person?.nome || "",
    responsibleId: row.responsavel_id,
    qty: Number(row.quantidade || 0),
    note: row.observacao || "",
    status: row.status || "PROGRAMADO",
    equipamentoId: row.equipamento_id,
    customData: row.dados_personalizados || {},
    createdAt: row.created_at
  };
}

function cacheProgramacoes() {
  localStorage.setItem("ppaProgramacoes", JSON.stringify(state.programacoes));
}

async function loadProgramacoes() {
  const sb = getSupabaseClient();
  if (!sb) {
    try {
      const saved = JSON.parse(localStorage.getItem("ppaProgramacoes") || "null");
      state.programacoes = Array.isArray(saved) ? saved : [];
    } catch {
      state.programacoes = [];
    }
    return;
  }

  const { data, error } = await sb
    .from("tb_programacoes")
    .select("id,equipamento_id,semana,status,atividade_id,data_programacao,equipe_id,responsavel_id,quantidade,observacao,dados_personalizados,modo_importacao,arquivo_importacao,usuario_importacao,created_at,updated_at")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Erro ao carregar tb_programacoes:", error);
    return;
  }

  state.programacoes = (data || []).map(mapProgrammingRecord);
  cacheProgramacoes();
}

async function deleteProgramacao(id) {
  const sb = getSupabaseClient();
  if (!sb) return;

  try {
    const { error } = await sb.from("tb_programacoes").delete().eq("id", id);
    if (error) throw error;
    state.programacoes = state.programacoes.filter(program => program.id !== id);
    cacheProgramacoes();
    renderProgramacao();
    renderDashboard();
    toast("Programação removida.");
  } catch (error) {
    console.error("Erro ao excluir programação:", error);
    toast(error?.message || "Não foi possível excluir.");
  }
}

/* =========================
   PROGRAM EXCEL
   ========================= */

async function readModuleFile(file) {
  if (!file) throw new Error("Nenhum arquivo selecionado.");
  if (window.XLSX) {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array", cellDates: true, raw: false });
    if (!workbook.SheetNames.length) throw new Error("O arquivo não possui uma planilha.");
    return XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {
      header: 1,
      defval: "",
      raw: false
    });
  }
  const text = await file.text();
  return text.split(/\r?\n/).filter(Boolean).map(line => line.split(/;|,/).map(item => item.replace(/^"|"$/g, "").trim()));
}

function normalizeImportedProgramDate(value) {
  const stringValue = String(value ?? "").trim();
  if (!stringValue) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(stringValue)) return stringValue;
  const br = stringValue.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
  if (br) return `${br[3]}-${String(br[2]).padStart(2, "0")}-${String(br[1]).padStart(2, "0")}`;
  return stringValue;
}

function validateAndMapProgramImport(rows, module) {
  if (!rows.length) throw new Error("Arquivo sem dados.");
  const headers = rows[0].map(header => String(header ?? "").trim());
  if (!headers.some(Boolean)) throw new Error("A primeira linha não contém cabeçalhos.");

  const normalizedHeaders = headers.map(makeKey);
  const columns = programColumnsForModule(module);
  const missing = columns.filter(column =>
    column.required &&
    !normalizedHeaders.includes(makeKey(column.label)) &&
    !normalizedHeaders.includes(makeKey(column.key))
  );
  if (missing.length) throw new Error(`Colunas obrigatórias ausentes: ${missing.map(column => column.label).join(", ")}.`);

  const getValue = (row, column) => {
    const index = normalizedHeaders.findIndex(header => header === makeKey(column.label) || header === makeKey(column.key));
    return index >= 0 ? (row[index] ?? "") : "";
  };

  const imported = [];
  const errors = [];

  rows.slice(1).forEach((row, index) => {
    if (!row.some(value => String(value ?? "").trim() !== "")) return;
    const line = index + 2;
    const values = {};

    columns.forEach(column => {
      values[column.key] = String(getValue(row, column)).trim();
    });

    values.activity = values.activity || module.name;
    values.week = normalizeWeek(values.week);
    values.date = normalizeImportedProgramDate(values.date);
    values.qty = Number(String(values.qty).replace(",", "."));

    if (makeKey(values.activity) !== makeKey(module.name)) {
      errors.push(`Linha ${line}: ATIVIDADE diferente de “${module.name}”.`);
    }

    const missingRow = columns.filter(column =>
      column.required &&
      (values[column.key] === "" || (column.key === "qty" && (!Number.isFinite(values.qty) || values.qty < 1)))
    );
    if (missingRow.length) errors.push(`Linha ${line}: preencha ${missingRow.map(column => column.label).join(", ")}.`);

    const customData = {};
    module.columns
      .filter(column => !["week", "date", "activity", "team", "responsible", "qty", "note"].includes(column.key))
      .forEach(column => {
        customData[column.key] = values[column.key] ?? "";
      });

    imported.push({
      week: values.week,
      date: values.date,
      activity: module.id,
      team: values.team,
      responsible: values.responsible,
      qty: values.qty,
      note: values.note,
      customData
    });
  });

  if (!imported.length) throw new Error("O arquivo não possui linhas de dados para importar.");
  if (errors.length) throw new Error(errors.slice(0, 8).join(" ") + (errors.length > 8 ? ` E mais ${errors.length - 8} erro(s).` : ""));
  return { headers, imported };
}

function downloadProgramTemplate() {
  const activityId = $("programActivityFilter")?.value || "";
  const module = moduleById(activityId);
  if (!module) {
    toast("Selecione uma atividade no filtro ATIVIDADE para gerar o template.");
    return;
  }

  const columns = programColumnsForModule(module);
  const headers = columns.map(column => column.label);
  const blank = columns.map(column => {
    if (column.key === "activity") return module.name;
    if (column.key === "week") return currentWeek();
    return "";
  });

  if (window.XLSX) {
    const sheet = XLSX.utils.aoa_to_sheet([headers, blank]);
    sheet["!cols"] = columns.map(column => ({ wch: Math.max(12, Math.min(32, String(column.label).length + 4)) }));
    const info = XLSX.utils.aoa_to_sheet([
      ["Atividade", module.name],
      ["Instruções", "Não altere os cabeçalhos. Campos com * são obrigatórios."],
      ["Importação", "As importações são cumulativas e nunca apagam programações anteriores."],
      ["Equipamento", "Para programar, a linha deve conter TAG/equipamento nas colunas do módulo."]
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Programação");
    XLSX.utils.book_append_sheet(workbook, info, "Leia-me");
    XLSX.writeFile(workbook, `template_programacao_${makeKey(module.name)}.xlsx`);
  } else {
    exportCSV(headers, [blank], `template_programacao_${makeKey(module.name)}.csv`);
  }
  toast("Template gerado.");
}

function exportCSV(headers, rows, filename) {
  const esc = value => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const csv = [headers, ...rows].map(row => row.map(esc).join(";")).join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function importProgramFile(file) {
  const activityId = $("programActivityFilter")?.value || "";
  const module = moduleById(activityId);
  if (!module) {
    toast("Selecione uma atividade no filtro ATIVIDADE antes de importar.");
    return;
  }
  if (!file) return;

  readModuleFile(file)
    .then(rows => {
      const mapped = validateAndMapProgramImport(rows, module);
      state.pendingProgramImport = {
        fileName: file.name,
        modId: module.id,
        records: mapped.imported
      };
      $("programImportFileName") && ($("programImportFileName").textContent = file.name);
      $("programImportCount") && ($("programImportCount").textContent = mapped.imported.length);
      $("programImportDescription") && ($("programImportDescription").textContent = `${mapped.imported.length} programação(ões) válida(s). Os registros serão acrescentados à base atual.`);
      $("programImportMessage") && ($("programImportMessage").textContent = "");
      $("programImportModal")?.classList.remove("hidden");
    })
    .catch(error => toast(error?.message || "Não foi possível ler o Excel."));
}

function closeProgramImportModal() {
  $("programImportModal")?.classList.add("hidden");
  state.pendingProgramImport = null;
}

async function confirmProgramImport(mode) {
  const pending = state.pendingProgramImport;
  if (!pending) return;
  const module = moduleById(pending.modId);
  const sb = getSupabaseClient();
  if (!module || !sb) {
    if ($("programImportMessage")) $("programImportMessage").textContent = "Supabase não está configurado.";
    return;
  }

  try {
    if (!module.dbId) await syncModulesToDB();

    let insertedCount = 0;
    for (const record of pending.records) {
      const team = teamByName(record.team);
      const person = personByName(record.responsible);
      if (!team) throw new Error(`Equipe “${record.team || ""}” não encontrada no cadastro.`);
      if (!person) throw new Error(`Responsável “${record.responsible || ""}” não encontrado no cadastro.`);

      const equipmentId = await resolveEquipmentId(record.customData || {}, module);
      const payload = {
        equipamento_id: equipmentId,
        semana: weekToNumber(record.week),
        status: "PROGRAMADO",
        atividade_id: module.dbId,
        data_programacao: record.date || null,
        equipe_id: team.id,
        responsavel_id: person.id,
        quantidade: Number(record.qty || 1),
        observacao: record.note || null,
        dados_personalizados: record.customData || {},
        modo_importacao: mode === "new" ? "NOVA_CARGA" : "INCLUSAO",
        arquivo_importacao: pending.fileName,
        usuario_importacao: state.currentUser?.authUserId || null,
        updated_at: new Date().toISOString()
      };

      const { error } = await sb.from("tb_programacoes").insert(payload);
      if (error) throw error;
      insertedCount += 1;
    }

    recordProgramImport(mode === "new" ? "new" : "append", pending);
    closeProgramImportModal();
    await loadProgramacoes();
    await loadData();
    renderProgramacao();
    renderDashboard();
    toast(`${insertedCount} programação(ões) importada(s). A base anterior foi preservada.`);
  } catch (error) {
    console.error("Erro na importação:", error);
    if ($("programImportMessage")) $("programImportMessage").textContent = error?.message || "Não foi possível gravar a importação.";
  }
}

/* =========================
   PROGRAM HISTORY
   ========================= */

function loadProgramHistory() {
  try {
    state.programHistory = JSON.parse(localStorage.getItem("ppaProgramHistory") || "[]") || [];
  } catch {
    state.programHistory = [];
  }
}

function persistProgramHistory() {
  localStorage.setItem("ppaProgramHistory", JSON.stringify(state.programHistory));
}

function recordProgramImport(mode, pending) {
  const byWeek = {};
  pending.records.forEach(record => {
    const week = normalizeWeek(record.week);
    (byWeek[week] ||= []).push(record);
  });

  Object.entries(byWeek).forEach(([week, records]) => {
    state.programHistory.unshift({
      id: `imp-${Date.now()}-${week}`,
      week,
      mode,
      fileName: pending.fileName,
      createdAt: nowBR(),
      count: records.length,
      items: records.map(record => ({
        date: record.date,
        activity: record.activity,
        team: record.team,
        responsible: record.responsible,
        qty: record.qty,
        note: record.note,
        customData: record.customData || {}
      }))
    });
  });
  persistProgramHistory();
}

function renderProgramHistory() {
  const host = $("programHistoryList");
  if (!host) return;
  if (!state.programHistory.length) {
    host.innerHTML = `<div class="empty-state card"><strong>Nenhuma importação registrada.</strong><span>As cargas de Excel aparecerão aqui.</span></div>`;
    return;
  }

  const grouped = {};
  state.programHistory.forEach(batch => (grouped[batch.week] ||= []).push(batch));
  const weeks = Object.keys(grouped).sort((a, b) => weekToNumber(b) - weekToNumber(a));

  host.innerHTML = weeks.map(week => {
    const batches = grouped[week];
    return `<section class="card program-history-week">
      <div class="program-history-week-head">
        <div><span class="section-kicker">SEMANA</span><h3>${escapeHTML(week)}</h3></div>
        <span class="tag-badge">${batches.reduce((total, batch) => total + batch.count, 0)} itens</span>
      </div>
      <div class="program-history-batches">
        ${batches.map((batch, index) => `<details class="program-history-batch" ${index === 0 ? "open" : ""}>
          <summary>
            <span class="history-mode ${batch.mode === "new" ? "new" : "append"}">${batch.mode === "new" ? "NOVA CARGA" : "INCLUSÃO"}</span>
            <strong>${batch.count} itens</strong>
            <span>${escapeHTML(batch.createdAt)}</span>
            <span class="history-file">${escapeHTML(batch.fileName)}</span>
          </summary>
          <div class="history-batch-body">
            <div><b>Importação:</b> ${escapeHTML(week)}</div>
            <div class="compact-items">${batch.items.map(item => `<span>${escapeHTML(item.date || "—")} · ${escapeHTML(moduleById(item.activity)?.name || item.activity)} · ${escapeHTML(item.team || "—")} · Qtd. ${escapeHTML(item.qty)}</span>`).join("")}</div>
          </div>
        </details>`).join("")}
      </div>
    </section>`;
  }).join("");
}

/* =========================
   PPA / EXECUTION
   ========================= */

function hasLog(row) {
  return Array.isArray(row.executionLogs) && row.executionLogs.length > 0;
}

function latestLog(row) {
  const logs = Array.isArray(row.executionLogs) ? row.executionLogs : [];
  if (!logs.length) return "Não registrado";
  const last = logs[logs.length - 1];
  return formatExecutionLog(last);
}

function formatExecutionLog(log) {
  const time = log?.executado_em ? new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(log.executado_em)) : "";
  const person = log?.executante_id ? state.peopleRecords.find(item => item.id === log.executante_id)?.nome : "";
  const team = log?.equipeNome || "";
  return [time, person || "Usuário", team].filter(Boolean).join(" - ");
}

function logEntries(row) {
  return Array.isArray(row.executionLogs) ? row.executionLogs : [];
}

async function loadData() {
  const sb = getSupabaseClient();
  const ppaModule = moduleById("ppa");

  if (!sb || !ppaModule?.dbId) {
    state.rows = [];
    return;
  }

  const currentNumber = currentWeekNumber();

  const { data: programData, error: programError } = await sb
    .from("tb_programacoes")
    .select("id,equipamento_id,semana,status,atividade_id,data_programacao,equipe_id,responsavel_id,quantidade,observacao,dados_personalizados,created_at")
    .eq("atividade_id", ppaModule.dbId)
    .eq("semana", currentNumber)
    .order("created_at", { ascending: true });

  if (programError) {
    console.error("Erro ao carregar programação PPA:", programError);
    state.rows = [];
    return;
  }

  const programs = programData || [];
  const equipmentIds = programs.map(item => item.equipamento_id).filter(Boolean);
  const programIds = programs.map(item => item.id).filter(Boolean);

  const [equipmentResult, executionResult] = await Promise.all([
    equipmentIds.length
      ? sb.from("tb_equipamentos").select("id,tag,forn,sys,subsys,loop,service,tipe,descricao,ativo").in("id", equipmentIds)
      : Promise.resolve({ data: [], error: null }),
    programIds.length
      ? sb.from("tb_execucoes").select("id,programacao_id,executante_id,executado_em,observacao,created_at,foto_url").in("programacao_id", programIds).order("executado_em", { ascending: true })
      : Promise.resolve({ data: [], error: null })
  ]);

  if (equipmentResult.error) throw equipmentResult.error;
  if (executionResult.error) throw executionResult.error;

  const equipmentById = new Map((equipmentResult.data || []).map(item => [item.id, item]));
  const executionByProgram = new Map();
  (executionResult.data || []).forEach(execution => {
    const list = executionByProgram.get(execution.programacao_id) || [];
    const team = programs.find(program => program.id === execution.programacao_id)?.equipe_id;
    execution.equipeNome = state.teams.find(item => item.id === team)?.nome || "";
    list.push(execution);
    executionByProgram.set(execution.programacao_id, list);
  });

  state.rows = programs.map(program => {
    const equipment = equipmentById.get(program.equipamento_id) || {};
    const executionLogs = executionByProgram.get(program.id) || [];
    const customData = program.dados_personalizados || {};
    return {
      programacaoId: program.id,
      activityModuleId: "ppa",
      FORN: equipment.forn || customData.forn || "",
      SYS: equipment.sys || customData.sys || "",
      SUBSYS: equipment.subsys || customData.subsys || "",
      LOOP: equipment.loop || customData.loop || "",
      TAG: equipment.tag || customData.tag || "",
      SERVICE: equipment.service || customData.service || "",
      TIPE: equipment.tipe || customData.tipe || customData.type || "",
      DESCRIÇÃO: equipment.descricao || customData.descricao || "",
      Week: `W${program.semana}`,
      Logs: executionLogs.map(formatExecutionLog).join("\n"),
      executionLogs,
      customData,
      equipamentoId: program.equipamento_id,
      team: state.teams.find(item => item.id === program.equipe_id)?.nome || "",
      status: program.status
    };
  });
}

function populateFilters() {
  const rows = state.rows.filter(row => normalizeWeek(row.Week) === currentWeek());
  const sys = [...new Set(rows.map(row => String(row.SYS || "").trim()).filter(Boolean))].sort();
  const subsys = [...new Set(rows.map(row => String(row.SUBSYS || "").trim()).filter(Boolean))].sort();

  if ($("sysFilter")) $("sysFilter").innerHTML = `<option value="">Todos</option>` + sys.map(value => `<option>${escapeHTML(value)}</option>`).join("");
  if ($("subsysFilter")) $("subsysFilter").innerHTML = `<option value="">Todos</option>` + subsys.map(value => `<option>${escapeHTML(value)}</option>`).join("");
}

function filteredRows() {
  const week = currentWeek();
  const query = $("tagSearch")?.value.trim().toLowerCase() || "";
  const sys = $("sysFilter")?.value || "";
  const subsys = $("subsysFilter")?.value || "";
  return state.rows.filter(row =>
    normalizeWeek(row.Week) === week &&
    (!query || String(row.TAG || "").toLowerCase().includes(query)) &&
    (!sys || String(row.SYS || "") === sys) &&
    (!subsys || String(row.SUBSYS || "") === subsys)
  );
}

function counters(rows) {
  const done = rows.filter(hasLog).length;
  $("totalCount") && ($("totalCount").textContent = rows.length);
  $("doneCount") && ($("doneCount").textContent = done);
  $("pendingCount") && ($("pendingCount").textContent = rows.length - done);
}

function renderTable() {
  const rows = filteredRows();
  const body = $("tagTableBody");
  if (!body) return;

  body.innerHTML = rows.map(row => `
    <tr class="${row.TAG === state.selectedTag ? "selected" : ""}" data-tag="${escapeHTML(row.TAG)}">
      <td class="select-cell"><input type="checkbox" class="row-select" data-tag-select="${escapeHTML(row.TAG)}" ${state.selectedTags.has(row.TAG) ? "checked" : ""} aria-label="Selecionar ${escapeHTML(row.TAG)}"></td>
      <td class="tag-cell">${escapeHTML(row.TAG)}</td>
      <td>${escapeHTML(row.LOOP)}</td>
      <td>${escapeHTML(row.SERVICE)}</td>
      <td>${escapeHTML(row.TIPE)}</td>
      <td>${escapeHTML(row.DESCRIÇÃO)}</td>
      <td class="week-cell">${escapeHTML(row.Week)}</td>
      <td class="log-cell">${hasLog(row) ? escapeHTML(latestLog(row)) : "—"}</td>
    </tr>
  `).join("");

  body.querySelectorAll("tr[data-tag]").forEach(row => {
    row.onclick = event => {
      if (event.target.closest("input")) return;
      selectItem(row.dataset.tag);
    };
  });

  body.querySelectorAll("[data-tag-select]").forEach(input => {
    input.onchange = event => {
      event.stopPropagation();
      if (input.checked) state.selectedTags.add(input.dataset.tagSelect);
      else state.selectedTags.delete(input.dataset.tagSelect);
      updateMultiSelectionUI();
    };
  });

  $("emptyState")?.classList.toggle("hidden", rows.length !== 0);
  counters(rows);
  updateMultiSelectionUI();

  if (!state.selectedTag && rows.length) selectItem(rows[0].TAG, false);
  else if (state.selectedTag && !rows.some(row => row.TAG === state.selectedTag)) {
    state.selectedTag = null;
    clearSelection();
  }
}

function updateMultiSelectionUI() {
  const count = state.selectedTags.size;
  $("selectedCount") && ($("selectedCount").textContent = count);
  if ($("registerSelectedBtn")) $("registerSelectedBtn").disabled = count === 0;

  const visible = filteredRows();
  if ($("selectAllTags")) {
    $("selectAllTags").checked = visible.length > 0 && visible.every(row => state.selectedTags.has(row.TAG));
    $("selectAllTags").indeterminate = visible.some(row => state.selectedTags.has(row.TAG)) && !$("selectAllTags").checked;
  }
}

function toggleSelectAllTags() {
  const visible = filteredRows();
  if ($("selectAllTags")?.checked) visible.forEach(row => state.selectedTags.add(row.TAG));
  else visible.forEach(row => state.selectedTags.delete(row.TAG));
  renderTable();
}

function selectItem(tag, rerender = true) {
  const row = state.rows.find(item => item.TAG === tag);
  if (!row) return;

  state.selectedTag = tag;
  const fields = {
    selectedTagTitle: row.TAG,
    fieldTag: row.TAG,
    fieldLoop: row.LOOP,
    fieldService: row.SERVICE,
    fieldType: row.TIPE,
    fieldForn: row.FORN,
    fieldSys: row.SYS,
    fieldSubsys: row.SUBSYS,
    fieldWeek: row.Week,
    fieldDescription: row.DESCRIÇÃO,
    fieldLog: latestLog(row)
  };

  Object.entries(fields).forEach(([id, value]) => {
    if ($(id)) $(id).textContent = value || "—";
  });

  if ($("selectedBadge")) {
    $("selectedBadge").textContent = hasLog(row) ? "COM LOG" : "PENDENTE";
    $("selectedBadge").className = `tag-badge ${hasLog(row) ? "done" : "pending"}`;
  }

  $("registerBtn") && ($("registerBtn").disabled = false);
  $("repeatBtn") && ($("repeatBtn").disabled = !hasLog(row));
  $("actionMessage") && ($("actionMessage").textContent = "");

  renderTechnicianCustomFields(row);
  if (rerender) renderTable();
}

function clearSelection() {
  $("selectedTagTitle") && ($("selectedTagTitle").textContent = "Selecione uma TAG");
  ["fieldTag", "fieldLoop", "fieldService", "fieldType", "fieldForn", "fieldSys", "fieldSubsys", "fieldWeek", "fieldDescription"].forEach(id => {
    if ($(id)) $(id).textContent = "—";
  });
  $("fieldLog") && ($("fieldLog").textContent = "Não registrado");
  $("selectedBadge") && ($("selectedBadge").textContent = "AGUARDANDO");
  $("registerBtn") && ($("registerBtn").disabled = true);
  $("repeatBtn") && ($("repeatBtn").disabled = true);
}

function renderTechnicianCustomFields(row) {
  const host = $("technicianCustomFields");
  if (!host) return;
  const module = moduleById(row?.activityModuleId || "ppa");
  if (!module) {
    host.innerHTML = "";
    return;
  }

  const columns = module.columns.filter(column => !["week", "date", "activity", "team", "responsible", "qty", "note", "logs"].includes(column.key));
  if (!columns.length) {
    host.innerHTML = "";
    return;
  }

  host.innerHTML = `<div class="dynamic-fields-heading"><span>Dados da atividade</span><small>Campos bloqueados não podem ser alterados pelo Técnico.</small></div>` + columns.map(column => {
    const value = row.customData?.[column.key] ?? "";
    const disabled = column.technicianEditable ? "" : "disabled";
    if (column.type === "select") {
      return `<label class="dynamic-field"><span>${escapeHTML(column.label)}${column.required ? " *" : ""}</span><select data-tech-custom-key="${escapeHTML(column.key)}" ${disabled}><option value="">Selecione</option>${(column.options || []).map(option => `<option value="${escapeHTML(option)}" ${String(option) === String(value) ? "selected" : ""}>${escapeHTML(option)}</option>`).join("")}</select></label>`;
    }
    if (column.type === "boolean") {
      return `<label class="dynamic-field"><span>${escapeHTML(column.label)}</span><select data-tech-custom-key="${escapeHTML(column.key)}" ${disabled}><option value="">Selecione</option><option value="SIM" ${value === "SIM" ? "selected" : ""}>SIM</option><option value="NÃO" ${value === "NÃO" ? "selected" : ""}>NÃO</option></select></label>`;
    }
    const inputType = column.type === "number" ? "number" : column.type === "date" ? "date" : "text";
    return `<label class="dynamic-field"><span>${escapeHTML(column.label)}${column.required ? " *" : ""}</span><input data-tech-custom-key="${escapeHTML(column.key)}" type="${inputType}" value="${escapeHTML(value)}" ${disabled}></label>`;
  }).join("");

  host.querySelectorAll("[data-tech-custom-key]:not([disabled])").forEach(input => {
    input.addEventListener("change", () => saveTechnicianCustomField(row, input.dataset.techCustomKey, input.value));
  });
}

async function saveTechnicianCustomField(row, key, value) {
  row.customData = row.customData || {};
  row.customData[key] = value;
  const sb = getSupabaseClient();
  if (sb && row.programacaoId) {
    const { error } = await sb
      .from("tb_programacoes")
      .update({
        dados_personalizados: row.customData,
        updated_at: new Date().toISOString()
      })
      .eq("id", row.programacaoId);
    if (error) {
      toast("Não foi possível salvar o campo no banco.");
      return;
    }
  }
  toast("Campo atualizado.");
}

async function appendLog(row) {
  const sb = getSupabaseClient();
  if (!sb || !row?.programacaoId || !state.currentUser?.id) {
    throw new Error("Programação, usuário ou conexão com o Supabase não encontrados.");
  }

  const { data: execution, error } = await sb
    .from("tb_execucoes")
    .insert({
      programacao_id: row.programacaoId,
      executante_id: state.currentUser.id,
      executado_em: new Date().toISOString(),
      observacao: null
    })
    .select("id,programacao_id,executante_id,executado_em,observacao,created_at,foto_url")
    .single();

  if (error) throw error;

  row.executionLogs = [...(row.executionLogs || []), execution];
  row.Logs = row.executionLogs.map(formatExecutionLog).join("\n");
  row.status = "EXECUTADO";

  const { error: statusError } = await sb
    .from("tb_programacoes")
    .update({ status: "EXECUTADO", updated_at: new Date().toISOString() })
    .eq("id", row.programacaoId);

  if (statusError) console.warn("Execução criada, mas status da programação não foi atualizado:", statusError.message);

  return formatExecutionLog(execution);
}

async function registerPonto() {
  const row = state.rows.find(item => item.TAG === state.selectedTag);
  if (!row) return;

  try {
    $("registerBtn") && ($("registerBtn").disabled = true);
    $("repeatBtn") && ($("repeatBtn").disabled = true);
    const entry = await appendLog(row);
    selectItem(row.TAG);
    $("actionMessage") && ($("actionMessage").textContent = `Registro acrescentado: ${entry}`);
    toast("Execução registrada no Supabase.");
    renderHistory();
    renderDashboard();
  } catch (error) {
    console.error("Erro ao registrar execução:", error);
    toast(error?.message || "Erro ao registrar execução.");
    selectItem(row.TAG);
  }
}

async function registerSelectedPontos() {
  const tags = [...state.selectedTags];
  if (!tags.length) return;

  try {
    $("registerSelectedBtn") && ($("registerSelectedBtn").disabled = true);
    let done = 0;
    for (const tag of tags) {
      const row = state.rows.find(item => item.TAG === tag);
      if (!row || hasLog(row)) continue;
      await appendLog(row);
      done += 1;
    }
    state.selectedTags.clear();
    renderTable();
    renderHistory();
    renderDashboard();
    toast(`${done} execução(ões) registrada(s).`);
  } catch (error) {
    console.error("Erro nas execuções selecionadas:", error);
    toast(error?.message || "Não foi possível registrar os selecionados.");
  } finally {
    updateMultiSelectionUI();
  }
}

function renderHistory() {
  const rows = state.rows.filter(row => normalizeWeek(row.Week) === currentWeek());
  const done = rows.filter(hasLog);
  $("historyDone") && ($("historyDone").textContent = done.length);
  $("historyPending") && ($("historyPending").textContent = rows.length - done.length);
  $("historyTotal") && ($("historyTotal").textContent = rows.length);

  const logs = [];
  rows.forEach(row => {
    (row.executionLogs || []).forEach(execution => logs.push({ tag: row.TAG, execution, team: row.team }));
  });
  logs.reverse();

  $("historyLog") && ($("historyLog").innerHTML = logs.length
    ? logs.slice(0, 30).map(item => `
        <div class="history-log-row">
          <span class="time">${escapeHTML(formatExecutionLog(item.execution).split(" - ")[0])}</span>
          <div><strong>Ponto a ponto</strong><span>${escapeHTML(item.tag)}</span></div>
          <span class="user">${escapeHTML(formatExecutionLog(item.execution))}</span>
        </div>
      `).join("")
    : `<div class="empty-state inline"><strong>Nenhuma execução na semana atual.</strong><span>Os registros aparecerão aqui.</span></div>`);
}

/* =========================
   DASHBOARD
   ========================= */

function dashboardFilterState() {
  return {
    week: $("dashboardWeekFilter")?.value || "",
    activity: $("dashboardActivityFilter")?.value || "",
    team: $("dashboardTeamFilter")?.value || ""
  };
}

function setupDashboardFilters() {
  const previous = dashboardFilterState();
  const weeks = [...new Set([
    currentWeek(),
    ...state.dashboardSeed.map(item => normalizeWeek(item.week)),
    ...state.programacoes.map(item => normalizeWeek(item.week)),
    ...state.rows.map(item => normalizeWeek(item.Week)).filter(Boolean)
  ])].sort((a, b) => weekToNumber(a) - weekToNumber(b));

  if ($("dashboardWeekFilter")) {
    $("dashboardWeekFilter").innerHTML = `<option value="">Todas</option>` + weeks.map(week => `<option value="${escapeHTML(week)}">${escapeHTML(week)}</option>`).join("");
    $("dashboardWeekFilter").value = weeks.includes(previous.week) ? previous.week : "";
  }

  if ($("dashboardActivityFilter")) {
    $("dashboardActivityFilter").innerHTML = `<option value="">Todas</option>` + state.moduleCatalog.map(module => `<option value="${escapeHTML(module.id)}">${escapeHTML(module.name)}</option>`).join("");
    $("dashboardActivityFilter").value = moduleById(previous.activity) ? previous.activity : "";
  }

  if ($("dashboardTeamFilter")) {
    $("dashboardTeamFilter").innerHTML = `<option value="">Todas</option>` + state.teams.map(team => `<option value="${escapeHTML(team.nome)}">${escapeHTML(team.nome)}</option>`).join("");
    $("dashboardTeamFilter").value = state.teams.some(team => team.nome === previous.team) ? previous.team : "";
  }
}

function executionRowsForWeek(week, activity, team) {
  if (activity && activity !== "ppa") return [];
  return state.rows
    .filter(row => normalizeWeek(row.Week) === normalizeWeek(week))
    .flatMap(row => (row.executionLogs || []).map(execution => ({
      row,
      execution,
      meta: {
        time: formatExecutionLog(execution).split(" - ")[0] || "",
        user: state.peopleRecords.find(person => person.id === execution.executante_id)?.nome || "Usuário",
        team: row.team || ""
      }
    })))
    .filter(item => !team || !item.meta.team || item.meta.team === team);
}

function dashboardData() {
  const filters = dashboardFilterState();
  const weeks = [...new Set([
    ...state.dashboardSeed.map(item => normalizeWeek(item.week)),
    ...state.programacoes.map(item => normalizeWeek(item.week)),
    ...state.rows.map(item => normalizeWeek(item.Week)).filter(Boolean),
    currentWeek()
  ])].sort((a, b) => weekToNumber(a) - weekToNumber(b));

  const selectedWeeks = filters.week ? weeks.filter(week => week === filters.week) : weeks;
  const chart = selectedWeeks.map(week => {
    const planned = state.programacoes
      .filter(program => normalizeWeek(program.week) === week && (!filters.activity || program.activity === filters.activity) && (!filters.team || program.team === filters.team))
      .reduce((sum, program) => sum + Number(program.qty || 0), 0);
    const done = executionRowsForWeek(week, filters.activity, filters.team).length;

    const seed = state.dashboardSeed.find(item => normalizeWeek(item.week) === week);
    return {
      week,
      planned: planned || (!state.programacoes.length && !filters.activity && !filters.team ? Number(seed?.planned || 0) : 0),
      done: done || (!state.rows.length && !filters.activity && !filters.team ? Number(seed?.done || 0) : 0)
    };
  });

  const planned = chart.reduce((sum, item) => sum + item.planned, 0);
  const done = chart.reduce((sum, item) => sum + item.done, 0);
  const balance = Math.max(planned - done, 0);
  const rate = planned ? Math.min(done / planned, 1) : 0;

  const activityMap = new Map();
  state.moduleCatalog.forEach(module => activityMap.set(module.id, { name: module.name, planned: 0, done: 0 }));

  state.programacoes
    .filter(program => (!filters.week || normalizeWeek(program.week) === normalizeWeek(filters.week)) && (!filters.activity || program.activity === filters.activity) && (!filters.team || program.team === filters.team))
    .forEach(program => {
      const item = activityMap.get(program.activity) || { name: moduleById(program.activity)?.name || program.activity, planned: 0, done: 0 };
      item.planned += Number(program.qty || 0);
      activityMap.set(program.activity, item);
    });

  if (filters.activity) {
    const item = activityMap.get(filters.activity);
    if (item) item.done = done;
  } else if (activityMap.has("ppa")) {
    activityMap.get("ppa").done = executionRowsForWeek(filters.week || currentWeek(), "ppa", filters.team).length;
  }

  return {
    filters,
    weeks: selectedWeeks,
    chart,
    planned,
    done,
    balance,
    rate,
    breakdown: [...activityMap.entries()]
      .filter(([, value]) => value.planned || value.done)
      .map(([id, value]) => ({ id, ...value, pct: value.planned ? Math.round(value.done / value.planned * 100) : 0 }))
  };
}

function renderDashboard() {
  setupDashboardFilters();
  const data = dashboardData();
  const pct = Math.round(data.rate * 100);

  const setText = (id, value) => { if ($(id)) $(id).textContent = String(value); };
  setText("dashboardWeek", data.filters.week || currentWeek());
  setText("metricPlanned", data.planned);
  setText("metricDone", data.done);
  setText("metricBalance", data.balance);
  setText("metricRate", `${pct}%`);
  setText("ringRate", `${pct}%`);
  setText("ringPlanned", data.planned);
  setText("ringDone", data.done);
  setText("ringPending", data.balance);

  if ($("progressRing")) $("progressRing").style.background = `conic-gradient(var(--sys-accent) ${pct * 3.6}deg, #e7edf4 0deg)`;

  const maxValue = Math.max(1, ...data.chart.flatMap(item => [item.planned, item.done]));
  if ($("weeklyBars")) {
    $("weeklyBars").innerHTML = data.chart.length
      ? data.chart.map(item => {
          const plannedHeight = Math.max(4, Math.round(item.planned / maxValue * 150));
          const doneHeight = Math.max(4, Math.round(item.done / maxValue * 150));
          return `<div class="week-bar-group">
            <div class="week-bar-values"><span>${item.planned}</span><span>${item.done}</span></div>
            <div class="week-bar-track"><i class="week-bar planned" style="height:${plannedHeight}px"></i><i class="week-bar done" style="height:${doneHeight}px"></i></div>
            <small>${escapeHTML(item.week)}</small>
          </div>`;
        }).join("")
      : `<div class="empty-state inline"><strong>Sem dados para os filtros.</strong></div>`;
  }

  if ($("activityBreakdownRows")) {
    $("activityBreakdownRows").innerHTML = data.breakdown.length
      ? data.breakdown.map(item => `<div class="breakdown-row">
          <div class="breakdown-main"><span class="activity-color-dot"></span><strong>${escapeHTML(item.name)}</strong></div>
          <div class="breakdown-numbers"><span>${item.done}/${item.planned}</span><strong>${item.pct}%</strong></div>
          <div class="breakdown-progress"><i style="width:${Math.min(item.pct, 100)}%"></i></div>
        </div>`).join("")
      : `<div class="empty-state inline"><strong>Nenhuma atividade encontrada.</strong><span>Ajuste os filtros ou importe uma programação.</span></div>`;
  }

  const executions = executionRowsForWeek(data.filters.week || currentWeek(), data.filters.activity, data.filters.team).slice(-8).reverse();
  if ($("recentExecutions")) {
    $("recentExecutions").innerHTML = executions.length
      ? executions.map(item => `<div class="execution-item">
          <div><strong>${escapeHTML(item.row.TAG || "—")}</strong><span>${escapeHTML(item.meta.user)}${item.meta.team ? ` • ${escapeHTML(item.meta.team)}` : ""}</span></div>
          <time>${escapeHTML(item.meta.time)}</time>
        </div>`).join("")
      : `<div class="empty-state inline"><strong>Nenhuma execução registrada.</strong><span>Os registros de campo aparecerão aqui.</span></div>`;
  }
}

function reportRowsForDashboard() {
  return dashboardData().breakdown.map(item => ({
    label: item.name,
    planned: item.planned,
    done: item.done,
    pending: Math.max(item.planned - item.done, 0),
    pct: item.pct
  }));
}

function exportDashboardJPEG() {
  const rows = reportRowsForDashboard();
  drawStationeryCanvas("PLANNING PRO", `Relatório gerencial • ${nowBR()}`, rows, `dashboard-${currentWeek()}.jpg`);
}

function exportTechReportJPEG() {
  const rows = state.rows.filter(row => normalizeWeek(row.Week) === currentWeek());
  const done = rows.filter(hasLog).length;
  drawStationeryCanvas("PLANNING PRO", `Relatório de campo • ${currentWeek()}`, [{ label: "Total da semana", planned: rows.length, done, pending: Math.max(rows.length - done, 0), pct: rows.length ? Math.round(done / rows.length * 100) : 0 }], `campo-${currentWeek()}.jpg`);
}

function drawStationeryCanvas(title, subtitle, rows, filename) {
  const canvas = document.createElement("canvas");
  canvas.width = 1600;
  canvas.height = Math.max(900, 420 + rows.length * 55);
  const context = canvas.getContext("2d");
  const settings = currentSettings();

  context.fillStyle = settings.background;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = settings.header;
  context.fillRect(0, 0, canvas.width, 180);
  context.fillStyle = settings.primary;
  context.fillRect(0, 173, canvas.width, 7);

  context.fillStyle = "#fff";
  context.font = "800 34px Arial";
  context.fillText(title, 60, 65);
  context.font = "20px Arial";
  context.fillText(subtitle, 60, 104);
  context.font = "16px Arial";
  context.fillText(`Responsável: ${currentUserLabel()}`, 60, 138);

  let y = 225;
  context.fillStyle = settings.header;
  context.fillRect(60, y, 1480, 46);
  context.fillStyle = "#fff";
  context.font = "700 17px Arial";
  context.fillText("ATIVIDADE", 80, y + 29);
  context.fillText("PREVISTO", 930, y + 29);
  context.fillText("EXECUTADO", 1110, y + 29);
  context.fillText("PENDENTE", 1300, y + 29);
  y += 46;

  rows.forEach((row, index) => {
    context.fillStyle = index % 2 ? "#f8fafc" : "#fff";
    context.fillRect(60, y, 1480, 52);
    context.fillStyle = settings.header;
    context.font = "600 17px Arial";
    context.fillText(String(row.label).slice(0, 70), 80, y + 32);
    context.fillText(String(row.planned), 955, y + 32);
    context.fillStyle = settings.accent;
    context.fillText(String(row.done), 1140, y + 32);
    context.fillStyle = "#d97706";
    context.fillText(String(row.pending), 1330, y + 32);
    y += 52;
  });

  context.fillStyle = "#64748b";
  context.font = "15px Arial";
  context.fillText(`Gerado em ${nowBR()}`, 60, y + 65);

  const link = document.createElement("a");
  link.download = filename;
  link.href = canvas.toDataURL("image/jpeg", 0.95);
  link.click();
}

function exportStyledPDF(subtitle, rows, filename) {
  if (!window.jspdf?.jsPDF) {
    window.print();
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const settings = currentSettings();
  const planned = rows.reduce((sum, row) => sum + row.planned, 0);
  const done = rows.reduce((sum, row) => sum + row.done, 0);
  const pending = rows.reduce((sum, row) => sum + row.pending, 0);
  const pct = planned ? Math.round(done / planned * 100) : 0;

  doc.setFillColor(settings.header);
  doc.rect(0, 0, 210, 31, "F");
  doc.setFillColor(settings.primary);
  doc.rect(0, 28, 210, 3, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("PLANNING PRO", 28, 13);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(subtitle, 28, 20);
  doc.text(`Responsável: ${currentUserLabel()}`, 28, 26);

  doc.setTextColor(15, 30, 48);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(10, 39, 190, 23, 3, 3, "F");
  const cards = [["PREVISTO", planned], ["EXECUTADO", done], ["PENDENTE", pending], ["EXECUÇÃO", `${pct}%`]];
  cards.forEach((card, index) => {
    const x = 15 + index * 47;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(settings.primary);
    doc.text(card[0], x, 46);
    doc.setFontSize(13);
    doc.setTextColor(15, 30, 48);
    doc.text(String(card[1]), x, 56);
  });

  let y = 72;
  doc.setFillColor(settings.header);
  doc.rect(10, y, 190, 9, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7);
  doc.text("ATIVIDADE", 14, y + 6);
  doc.text("PREVISTO", 125, y + 6);
  doc.text("EXECUTADO", 153, y + 6);
  doc.text("PENDENTE", 180, y + 6);
  y += 9;

  rows.forEach((row, index) => {
    doc.setFillColor(index % 2 ? 248 : 255, index % 2 ? 250 : 255, index % 2 ? 252 : 255);
    doc.rect(10, y, 190, 8, "F");
    doc.setTextColor(35, 48, 65);
    doc.text(String(row.label).slice(0, 48), 14, y + 5.3);
    doc.text(String(row.planned), 129, y + 5.3);
    doc.setTextColor(settings.accent);
    doc.text(String(row.done), 158, y + 5.3);
    doc.setTextColor(217, 119, 6);
    doc.text(String(row.pending), 185, y + 5.3);
    y += 8;
  });

  doc.setTextColor(100, 116, 139);
  doc.setFontSize(6.5);
  doc.text(`Gerado em ${nowBR()} • Planning Pro`, 10, 286);
  doc.save(filename);
}

function exportDashboardPDF() {
  const filters = dashboardFilterState();
  exportStyledPDF(`Relatório gerencial • ${filters.week || "Todas as semanas"}`, reportRowsForDashboard(), `dashboard-${filters.week || "todas"}.pdf`);
}

function exportTechReportPDF() {
  const rows = state.rows.filter(row => normalizeWeek(row.Week) === currentWeek());
  const done = rows.filter(hasLog).length;
  exportStyledPDF(`Relatório de campo • ${currentWeek()}`, [{ label: "Total da semana", planned: rows.length, done, pending: Math.max(rows.length - done, 0), pct: rows.length ? Math.round(done / rows.length * 100) : 0 }], `campo-${currentWeek()}.pdf`);
}

/* =========================
   MODULE EXCEL / RECORDS
   ========================= */

function exportModuleMask() {
  const module = selectedModule();
  if (!module) {
    toast("Selecione um módulo.");
    return;
  }

  const headers = module.columns.map(column => column.label);
  const blank = module.columns.map(() => "");
  if (window.XLSX) {
    const sheet = XLSX.utils.aoa_to_sheet([headers, blank]);
    sheet["!cols"] = module.columns.map(column => ({ wch: Math.max(12, Math.min(32, column.label.length + 3)) }));
    const info = XLSX.utils.aoa_to_sheet([
      ["Módulo", module.name],
      ["Instruções", "Não altere os cabeçalhos. Campos com * são obrigatórios."],
      ["Importação", "As importações do cadastro Ponto a Ponto são cumulativas."]
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Importação");
    XLSX.utils.book_append_sheet(workbook, info, "Leia-me");
    XLSX.writeFile(workbook, `mascara_${makeKey(module.name)}.xlsx`);
  } else {
    exportCSV(headers, [blank], `mascara_${makeKey(module.name)}.csv`);
  }
}

function triggerModuleImport() {
  const module = selectedModule();
  if (!module) {
    toast("Selecione um módulo.");
    return;
  }
  if ($("moduleExcelInput")) {
    $("moduleExcelInput").value = "";
    $("moduleExcelInput").click();
  }
}

function validateAndMapImportRows(rows, module) {
  if (!rows.length) throw new Error("Arquivo sem dados.");
  const headers = rows[0].map(value => String(value ?? "").trim());
  const normalized = headers.map(makeKey);
  const missing = module.columns.filter(column => column.required && !normalized.includes(makeKey(column.label)) && !normalized.includes(makeKey(column.key)));
  if (missing.length) throw new Error(`Colunas obrigatórias ausentes: ${missing.map(column => column.label).join(", ")}.`);

  const imported = rows.slice(1)
    .filter(row => row.some(value => String(value ?? "").trim() !== ""))
    .map((row, index) => {
      const data = { _linha_excel: index + 2, _imported_at: new Date().toISOString() };
      module.columns.forEach(column => {
        const position = normalized.findIndex(header => header === makeKey(column.label) || header === makeKey(column.key));
        data[column.key] = position >= 0 ? row[position] ?? "" : "";
      });
      return data;
    });
  return { headers, imported };
}

function openImportModeModal(file, rows) {
  const module = selectedModule();
  if (!module) return;
  state.pendingImport = { fileName: file.name, rows, modId: module.id };
  $("importFileName") && ($("importFileName").textContent = file.name);
  $("importExistingCount") && ($("importExistingCount").textContent = (moduleRecordStore()[module.id] || []).length);
  $("importModeDescription") && ($("importModeDescription").textContent = `${rows.imported.length} registro(s) encontrado(s) para “${module.name}”.`);
  $("importModeMessage") && ($("importModeMessage").textContent = "");
  $("importModeModal")?.classList.remove("hidden");
}

function closeImportModeModal() {
  $("importModeModal")?.classList.add("hidden");
  state.pendingImport = null;
}

async function persistImportedRecords(module, records, mode) {
  const store = moduleRecordStore();
  const existing = Array.isArray(store[module.id]) ? store[module.id] : [];
  const stamped = records.map(record => ({ ...record, _module_id: module.id, _import_id: `imp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }));
  store[module.id] = mode === "append" || mode === "new" ? [...existing, ...stamped] : stamped;
  persistModuleRecords();
  return store[module.id];
}

async function confirmModuleImport(mode) {
  const pending = state.pendingImport;
  const module = pending ? moduleById(pending.modId) : null;
  if (!pending || !module) return;

  try {
    if (module.id === "ppa") {
      const sb = getSupabaseClient();
      if (!sb) throw new Error("Supabase não está configurado.");

      let processed = 0;
      for (const record of pending.rows.imported) {
        const tag = String(record.tag || "").trim();
        if (!tag) continue;

        const payload = {
          tag,
          forn: record.forn || null,
          sys: record.sys || null,
          subsys: record.subsys || null,
          loop: record.loop || null,
          service: record.service || null,
          tipe: record.type || record.tipe || null,
          descricao: record.descricao || null,
          ativo: true,
          updated_at: new Date().toISOString()
        };

        const { data: existing, error: findError } = await sb
          .from("tb_equipamentos")
          .select("id")
          .eq("tag", tag)
          .limit(1)
          .maybeSingle();
        if (findError) throw findError;

        if (existing) {
          const { error } = await sb.from("tb_equipamentos").update(payload).eq("id", existing.id);
          if (error) throw error;
        } else {
          const { error } = await sb.from("tb_equipamentos").insert(payload);
          if (error) throw error;
        }
        processed += 1;
      }
      toast(`${processed} equipamento(s) importado(s). A base anterior foi preservada.`);
    }

    const records = await persistImportedRecords(module, pending.rows.imported, "append");
    if ($("importModeMessage")) {
      $("importModeMessage").textContent = `Importação concluída: ${pending.rows.imported.length} registro(s). Base total: ${records.length}.`;
      $("importModeMessage").classList.add("ok");
    }

    setTimeout(closeImportModeModal, 400);
    if (module.id === "ppa") {
      await loadData();
      populateFilters();
      renderTable();
      renderDashboard();
    }
    renderModules();
  } catch (error) {
    console.error("Erro na importação do módulo:", error);
    if ($("importModeMessage")) $("importModeMessage").textContent = error?.message || "Não foi possível importar.";
  }
}

async function importModuleFile(file) {
  const module = selectedModule();
  if (!module || !file) return;
  try {
    const rows = await readModuleFile(file);
    const mapped = validateAndMapImportRows(rows, module);
    if (!mapped.imported.length) throw new Error("O arquivo não possui linhas de dados para importar.");
    openImportModeModal(file, mapped);
  } catch (error) {
    if ($("importResultMessage")) $("importResultMessage").textContent = error?.message || "Não foi possível importar o arquivo.";
  }
}

/* =========================
   PROGRAMMING / MISC
   ========================= */

function syncImportedPpa(records, module, mode = "append") {
  const mapped = records
    .map(record => ({
      FORN: record.forn || "",
      SYS: record.sys || "",
      SUBSYS: record.subsys || "",
      LOOP: record.loop || "",
      TAG: record.tag || "",
      SERVICE: record.service || "",
      TIPE: record.type || record.tipe || "",
      DESCRIÇÃO: record.descricao || "",
      Week: normalizeWeek(record.week || currentWeek()),
      Logs: record.logs || ""
    }))
    .filter(row => row.TAG);
  state.rows = mode === "append" ? [...state.rows, ...mapped] : mapped;
}

async function syncAll() {
  try {
    loadModuleCatalog();
    loadProgramHistory();

    const modulesLoaded = await loadModulesFromDB();
    if (state.role === "admin" && !modulesLoaded) {
      await syncModulesToDB();
      await loadModulesFromDB();
    }

    await loadTeamsAndPeople();
    await loadProgramacoes();

    if (state.role === "technician") {
      await loadData();
      populateFilters();
      renderTable();
      renderHistory();
      renderDashboard();
    }

    if (state.role === "admin") {
      renderDashboard();
      renderProgramacao();
      renderModules();
      renderAccesses();
    }

    if ($("currentDateTime")) $("currentDateTime").textContent = nowBR();
    if ($("currentWeek")) $("currentWeek").textContent = currentWeek();
  } catch (error) {
    console.error("Erro na sincronização:", error);
    toast(error?.message || "Não foi possível sincronizar todos os dados.");
  }
}

/* =========================
   EVENTS
   ========================= */

function bindEvents() {
  document.querySelectorAll(".access-option").forEach(button => {
    button.addEventListener("click", () => showLogin(button.dataset.role));
  });

  document.querySelectorAll("[data-back-login]").forEach(button => {
    button.addEventListener("click", backToAccessChooser);
  });

  $("adminLoginForm")?.addEventListener("submit", async event => {
    event.preventDefault();
    const email = $("adminEmail")?.value.trim() || "";
    const password = $("adminPassword")?.value || "";
    if (!email || !password) {
      if ($("adminLoginMessage")) $("adminLoginMessage").textContent = "Informe e-mail e senha.";
      return;
    }
    if (email.toLowerCase() !== "thiagomoraes.projetos@gmail.com") {
      if ($("adminLoginMessage")) $("adminLoginMessage").textContent = "Esta conta não possui acesso administrativo.";
      return;
    }
    await loginAdmin(email, password);
  });

  $("technicianLoginForm")?.addEventListener("submit", async event => {
    event.preventDefault();
    const code = $("techAccessCode")?.value.trim() || "";
    if (!code) {
      if ($("techLoginMessage")) $("techLoginMessage").textContent = "Informe o código de acesso.";
      return;
    }
    await loginTechnician(code);
  });

  document.querySelectorAll(".nav-item").forEach(button => {
    button.onclick = () => nav(button.dataset.screen);
  });

  $("downloadProgramTemplateBtn") && ($("downloadProgramTemplateBtn").onclick = downloadProgramTemplate);
  $("importProgramExcelBtn") && ($("importProgramExcelBtn").onclick = () => { $("programExcelInput").value = ""; $("programExcelInput").click(); });
  $("programExcelInput")?.addEventListener("change", event => importProgramFile(event.target.files?.[0]));

  $("closeProgramImportModal") && ($("closeProgramImportModal").onclick = closeProgramImportModal);
  $("cancelProgramImport") && ($("cancelProgramImport").onclick = closeProgramImportModal);
  $("programImportModal .modal-backdrop") && ($( "programImportModal .modal-backdrop").onclick = closeProgramImportModal);
  document.querySelectorAll("[data-program-import-mode]").forEach(button => {
    button.onclick = () => confirmProgramImport(button.dataset.programImportMode);
  });

  $("closeProgramModal") && ($("closeProgramModal").onclick = closeProgramModal);
  $("cancelProgramModal") && ($("cancelProgramModal").onclick = closeProgramModal);
  $("programModal .modal-backdrop") && ($("programModal .modal-backdrop").onclick = closeProgramModal);
  $("programForm")?.addEventListener("submit", event => { event.preventDefault(); createProgramacao(); });
  $("programWeekFilter") && ($("programWeekFilter").onchange = renderProgramacao);
  $("programActivityFilter") && ($("programActivityFilter").onchange = renderProgramacao);
  $("programTeamFilter") && ($("programTeamFilter").onchange = renderProgramacao);
  $("programActivity") && ($("programActivity").onchange = () => renderProgramCustomFields($("programActivity").value));

  $("refreshDashboard") && ($("refreshDashboard").onclick = async () => { await syncAll(); toast("Dashboard atualizado."); });
  $("exportDashboardPdfBtn") && ($("exportDashboardPdfBtn").onclick = exportDashboardPDF);
  $("exportDashboardJpegBtn") && ($("exportDashboardJpegBtn").onclick = exportDashboardJPEG);
  $("exportTechJpegBtn") && ($("exportTechJpegBtn").onclick = exportTechReportJPEG);
  $("exportTechPdfBtn") && ($("exportTechPdfBtn").onclick = exportTechReportPDF);

  $("tagSearch")?.addEventListener("input", () => { if ($("clearSearch")) $("clearSearch").style.display = $("tagSearch").value ? "block" : "none"; renderTable(); });
  $("clearSearch") && ($("clearSearch").onclick = () => { $("tagSearch").value = ""; $("clearSearch").style.display = "none"; renderTable(); });
  $("sysFilter") && ($("sysFilter").onchange = renderTable);
  $("subsysFilter") && ($("subsysFilter").onchange = renderTable);
  $("selectAllTags") && ($("selectAllTags").onchange = toggleSelectAllTags);
  $("registerSelectedBtn") && ($("registerSelectedBtn").onclick = registerSelectedPontos);
  $("registerBtn") && ($("registerBtn").onclick = registerPonto);
  $("repeatBtn") && ($("repeatBtn").onclick = () => $("confirmModal")?.classList.remove("hidden"));
  ["closeModal", "cancelModal"].forEach(id => { if ($(id)) $(id).onclick = () => $("confirmModal")?.classList.add("hidden"); });
  $("confirmModal .modal-backdrop") && ($("confirmModal .modal-backdrop").onclick = () => $("confirmModal")?.classList.add("hidden"));
  $("confirmRepeat") && ($("confirmRepeat").onclick = async () => { $("confirmModal")?.classList.add("hidden"); await registerPonto(); });
  $("refreshHistory") && ($("refreshHistory").onclick = async () => { await loadData(); populateFilters(); renderTable(); renderHistory(); toast("Dados atualizados."); });
  $("logoutBtn") && ($("logoutBtn").onclick = logout);

  $("newActivityBtn") && ($("newActivityBtn").onclick = () => openActivityModal());
  $("editActivityBtn") && ($("editActivityBtn").onclick = () => openActivityModal(state.selectedModuleId));
  $("deleteActivityBtn") && ($("deleteActivityBtn").onclick = deleteActivity);
  $("newColumnBtn") && ($("newColumnBtn").onclick = () => openColumnModal());
  $("exportModuleMaskBtn") && ($("exportModuleMaskBtn").onclick = exportModuleMask);
  $("importModuleMaskBtn") && ($("importModuleMaskBtn").onclick = triggerModuleImport);
  $("moduleExcelInput")?.addEventListener("change", event => importModuleFile(event.target.files?.[0]));

  $("closeActivityModal") && ($("closeActivityModal").onclick = closeActivityModal);
  $("cancelActivityModal") && ($("cancelActivityModal").onclick = closeActivityModal);
  $("activityModal .modal-backdrop") && ($("activityModal .modal-backdrop").onclick = closeActivityModal);
  $("activityForm")?.addEventListener("submit", event => { event.preventDefault(); saveActivity(); });

  $("closeColumnModal") && ($("closeColumnModal").onclick = closeColumnModal);
  $("cancelColumnModal") && ($("cancelColumnModal").onclick = closeColumnModal);
  $("columnModal .modal-backdrop") && ($("columnModal .modal-backdrop").onclick = closeColumnModal);
  $("columnForm")?.addEventListener("submit", event => { event.preventDefault(); saveColumn(); });
  document.querySelectorAll("[data-column-view]").forEach(button => {
    button.onclick = () => setColumnViewMode(button.dataset.columnView);
  });

  $("closeImportModeModal") && ($("closeImportModeModal").onclick = closeImportModeModal);
  $("cancelImportMode") && ($("cancelImportMode").onclick = closeImportModeModal);
  $("importModeModal .modal-backdrop") && ($("importModeModal .modal-backdrop").onclick = closeImportModeModal);
  document.querySelectorAll("[data-import-mode]").forEach(button => {
    button.onclick = () => confirmModuleImport(button.dataset.importMode);
  });

  $("closeDeleteModuleConfirm") && ($("closeDeleteModuleConfirm").onclick = () => $("deleteModuleConfirm")?.classList.add("hidden"));
  $("cancelDeleteModule") && ($("cancelDeleteModule").onclick = () => $("deleteModuleConfirm")?.classList.add("hidden"));
  $("deleteModuleConfirm .modal-backdrop") && ($("deleteModuleConfirm .modal-backdrop").onclick = () => $("deleteModuleConfirm")?.classList.add("hidden"));
  $("confirmDeleteModule") && ($("confirmDeleteModule").onclick = confirmDeleteActivity);

  $("newAccessBtn") && ($("newAccessBtn").onclick = () => openAccessModal());
  $("closeAccessModal") && ($("closeAccessModal").onclick = closeAccessModal);
  $("cancelAccessModal") && ($("cancelAccessModal").onclick = closeAccessModal);
  $("accessModal .modal-backdrop") && ($("accessModal .modal-backdrop").onclick = closeAccessModal);
  $("accessForm")?.addEventListener("submit", event => { event.preventDefault(); saveAccess(); });
  $("generateAccessCodeBtn") && ($("generateAccessCodeBtn").onclick = () => { if ($("accessCodeInput")) $("accessCodeInput").value = randomAccessCode(); });
  $("accessSearch")?.addEventListener("input", renderAccesses);

  $("dashboardWeekFilter") && ($("dashboardWeekFilter").onchange = renderDashboard);
  $("dashboardActivityFilter") && ($("dashboardActivityFilter").onchange = renderDashboard);
  $("dashboardTeamFilter") && ($("dashboardTeamFilter").onchange = renderDashboard);
}

/* =========================
   INIT
   ========================= */

async function init() {
  setupSidebar();
  loadSettings();
  loadModuleCatalog();
  loadProgramHistory();
  bindEvents();

  if ($("currentDateTime")) $("currentDateTime").textContent = nowBR();
  if ($("currentWeek")) $("currentWeek").textContent = currentWeek();
  setColumnViewMode(state.columnViewMode);

  const sb = getSupabaseClient();
  if (!sb) {
    console.error("Supabase não está configurado. Confira supabase-config.js.");
    backToAccessChooser();
    return;
  }

  const savedSession = sessionStorage.getItem("ppaSession");
  if (savedSession) {
    try {
      const cached = JSON.parse(savedSession);
      if (cached?.role && ROLE_LABELS[cached.role]) {
        const authenticated = await loadAuthenticatedProfile();
        if (authenticated && state.currentUser) {
          showAppForRole(state.currentUser.role);
          await syncAll();
          return;
        }
      }
    } catch (error) {
      console.warn("Sessão armazenada inválida:", error);
    }
  }

  const authenticated = await loadAuthenticatedProfile();
  if (authenticated && state.currentUser) {
    showAppForRole(state.currentUser.role);
    await syncAll();
    return;
  }

  backToAccessChooser();
}

setInterval(() => {
  if ($("currentDateTime")) $("currentDateTime").textContent = nowBR();
  if ($("currentWeek")) $("currentWeek").textContent = currentWeek();
}, 1000);

init().catch(error => {
  console.error("Falha na inicialização do Planning Pro:", error);
  backToAccessChooser();
});
