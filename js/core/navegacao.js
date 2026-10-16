/* Planning Pro · core/navegacao.js
 * Rotas por hash (#programacao) e renderização da tela ativa.
 */
"use strict";

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
