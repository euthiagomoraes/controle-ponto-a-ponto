/* Planning Pro · app.js
 * Ligação dos eventos da interface e inicialização. Carregado por último.
 */
"use strict";

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
  $("reprogramConfirm").addEventListener("click", confirmReprogram);
  $("kpiBacklogCard").addEventListener("click", () => { if (state.user?.role === "admin") goTo("backlog"); });
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
  const persistSettings = (button, okText) => withButton(button, async () => {
    try {
      await withBusy(saveSettings);
      renderSettings();
      setMessage("settingsMessage", okText, true);
    } catch (error) {
      setMessage("settingsMessage", error.message);
    }
  });
  $("settingsSave").addEventListener("click", e => persistSettings(e.currentTarget, "Identidade salva. Vale para todos os usuários e para a tela de login."));
  $("settingsReset").addEventListener("click", e => { state.settings = { ...DEFAULT_SETTINGS }; renderSettings(); persistSettings(e.currentTarget, "Padrão restaurado para todos os usuários."); });

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
  setLoginBackgroundRunning(true);
  fitLoginBackground();
  window.addEventListener("resize", fitLoginBackground);
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

  // Identidade visual do banco (logo/cores da tela de login) em paralelo com a sessão.
  const settingsReady = loadSystemSettings().catch(error => console.warn("Identidade visual:", error));
  const restored = await restoreSession();
  await settingsReady;
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
