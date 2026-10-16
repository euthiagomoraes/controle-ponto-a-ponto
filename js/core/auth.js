/* Planning Pro · core/auth.js
 * Login do planejamento (Supabase Auth) e da equipe de campo (código), sessão e logout.
 */
"use strict";

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
  state.equipment = new Map();
  state.dashboardWeek = null;
  state.dashboardError = "";
  state.field = { ...state.field, weekNum: null, programs: [], selected: new Set(), activeId: null };
  delete document.body.dataset.role;
  setLoginBackgroundRunning(true);
  $("appShell").classList.add("hidden");
  $("loginScreen").classList.remove("hidden");
  $("adminLoginForm").reset();
  $("technicianLoginForm").reset();
  history.replaceState(null, "", location.pathname);
  showLoginStep("chooser");
}

// As animações SMIL do fundo do login (pulsos, nível do tanque) ficam paradas fora da tela de login
// e quando o sistema pede movimento reduzido.
function setLoginBackgroundRunning(running) {
  const svg = $("loginBg");
  if (!svg?.pauseAnimations) return;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (running && !reduce) svg.unpauseAnimations(); else svg.pauseAnimations();
}

// Em tela vertical (celular) o fundo alinha à esquerda, mostrando tanque, bomba e instrumentos.
function fitLoginBackground() {
  const svg = $("loginBg");
  if (!svg) return;
  const portrait = window.innerHeight > window.innerWidth;
  svg.setAttribute("preserveAspectRatio", portrait ? "xMinYMid slice" : "xMidYMid slice");
}

async function enterApp(user) {
  state.user = user;
  document.body.dataset.role = user.role;
  setLoginBackgroundRunning(false);
  $("loginScreen").classList.add("hidden");
  $("appShell").classList.remove("hidden");
  document.querySelectorAll("[data-nav-role]").forEach(nav => nav.classList.toggle("active", nav.dataset.navRole === user.role));
  renderUserChrome();
  updateBacklogBadge();
  await syncAll();
  publishSettingsIfNeeded();
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
