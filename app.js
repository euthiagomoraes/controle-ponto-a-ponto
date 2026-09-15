/* Integração Vercel + Power Automate + Excel.
   As URLs reais dos fluxos permanecem em variáveis de ambiente do Vercel.
   Nunca coloque credenciais, client secrets ou senha do OneDrive neste arquivo. */

const CONFIG = {
  LOGIN_URL: "/api/login",
  DATA_URL: "/api/consultar",
  WRITE_URL: "/api/registrar",
  DELETE_URL: "/api/excluir",
  DASHBOARD_URL: "/api/dashboard",
  TABLE_NAME: "tbPontoAPonto",
  LOGIN_TABLE: "tbLogin"
};

// Semana de negócio definida pelo projeto:
// 07/09/2026 = W132; 14/09/2026 = W133.
// A partir desse marco, cada segunda-feira incrementa uma semana.
const WEEK_ANCHOR = new Date(2026, 8, 7);
const WEEK_ANCHOR_NUMBER = 132;

const state = {
  currentUser: null,
  selectedTag: null,
  rows: [],
  supervisorRows: [],
  mockRows: [
    {FORN:"FORN-01",SYS:"20GHA",SUBSYS:"AA401",LOOP:"XV-20GHA10AA401",TAG:"ZSH-20GHA10AA401-S12",SERVICE:"WATER SERVICE TO TANK",TIPE:"AA - VÁLVULA",DESCRIÇÃO:"VÁLVULA ON/OFF",WEEK:"W133",PONTOAPONTO:""},
    {FORN:"FORN-01",SYS:"20GHA",SUBSYS:"AA402",LOOP:"XV-20GHA10AA402",TAG:"ZSL-20GHA10AA402-S12",SERVICE:"WATER SERVICE TO TANK",TIPE:"AA - VÁLVULA",DESCRIÇÃO:"VÁLVULA ON/OFF",WEEK:"W133",PONTOAPONTO:""},
    {FORN:"FORN-02",SYS:"20GMA",SUBSYS:"KB003",LOOP:"XV-20GMA10KB003",TAG:"ZSH-20GMA10KB003-S12",SERVICE:"NEUTRALIZATION EFFLUENT PIT",TIPE:"INTERFACE ELÉTRICA EQUIPAMENTO",DESCRIÇÃO:"VÁLVULA ON/OFF",WEEK:"W133",PONTOAPONTO:"12/09/2026"},
    {FORN:"FORN-02",SYS:"20GMA",SUBSYS:"KB004",LOOP:"XV-20GMA10KB004",TAG:"ZSL-20GMA10KB004-S12",SERVICE:"NEUTRALIZATION EFFLUENT PIT",TIPE:"INTERFACE ELÉTRICA EQUIPAMENTO",DESCRIÇÃO:"VÁLVULA ON/OFF",WEEK:"W132",PONTOAPONTO:""},
    {FORN:"FORN-02",SYS:"20GMA",SUBSYS:"BB001",LOOP:"P-20GMA10BB001",TAG:"PSH-20GMA10BB001-S12",SERVICE:"EFFLUENT PIT",TIPE:"PRESSURE SWITCH",DESCRIÇÃO:"CHAVE DE PRESSÃO",WEEK:"W133",PONTOAPONTO:""},
    {FORN:"FORN-02",SYS:"20GMA",SUBSYS:"BB002",LOOP:"L-20GMA10BB002",TAG:"LSH-20GMA10BB002-S12",SERVICE:"EFFLUENT PIT",TIPE:"LEVEL SWITCH",DESCRIÇÃO:"CHAVE DE NÍVEL",WEEK:"W133",PONTOAPONTO:""},
    {FORN:"FORN-01",SYS:"20GHA",SUBSYS:"AA401",LOOP:"FIC-20GHA10AA401",TAG:"FIC-20GHA10AA401-S12",SERVICE:"WATER SERVICE TO TANK",TIPE:"INSTRUMENTAÇÃO",DESCRIÇÃO:"CONTROLADOR DE VAZÃO",WEEK:"W133",PONTOAPONTO:"13/09/2026"},
    {FORN:"FORN-01",SYS:"20GHA",SUBSYS:"BB001",LOOP:"TIT-20GHA10BB001",TAG:"TIT-20GHA10BB001-S12",SERVICE:"TANK TEMPERATURE",TIPE:"INSTRUMENTAÇÃO",DESCRIÇÃO:"TRANSMISSOR DE TEMPERATURA",WEEK:"W134",PONTOAPONTO:""},
    {FORN:"FORN-01",SYS:"20GHA",SUBSYS:"AA410",LOOP:"XV-20GHA10AA410",TAG:"XV-20GHA10AA410-S12",SERVICE:"WATER SERVICE",TIPE:"AA - VÁLVULA",DESCRIÇÃO:"VÁLVULA ON/OFF",WEEK:"W133",PONTOAPONTO:""},
    {FORN:"FORN-01",SYS:"20GHA",SUBSYS:"AA411",LOOP:"XV-20GHA10AA411",TAG:"ZSH-20GHA10AA411-S12",SERVICE:"WATER SERVICE",TIPE:"AA - VÁLVULA",DESCRIÇÃO:"VÁLVULA ON/OFF",WEEK:"W133",PONTOAPONTO:""}
  ]
};

const $ = id => document.getElementById(id);
const nowBR = () => new Intl.DateTimeFormat("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"}).format(new Date()).replace(",","");
const dateBR = () => new Intl.DateTimeFormat("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric"}).format(new Date());

function currentWeek() {
  const today = new Date();
  const diff = Math.floor((new Date(today.getFullYear(),today.getMonth(),today.getDate()) - WEEK_ANCHOR) / 86400000);
  return `W${WEEK_ANCHOR_NUMBER + Math.floor(diff / 7)}`;
}
function escapeHTML(value) {
  return String(value ?? "—").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}
function normalizeExcelRow(row) {
  // O Excel Online pode devolver nomes codificados (ex.: FORN_x002e_ e DESCRI_x00c7__x00c3_O).
  // A API do Vercel converte esses nomes para o formato usado pela interface.
  return {
    FORN: row.FORN ?? row.FORN_x002e_ ?? "",
    SYS: row.SYS ?? "",
    SUBSYS: row.SUBSYS ?? "",
    LOOP: row.LOOP ?? "",
    TAG: row.TAG ?? "",
    SERVICE: row.SERVICE ?? "",
    TIPE: row.TIPE ?? "",
    DESCRIÇÃO: row.DESCRIÇÃO ?? row.DESCRI_x00c7__x00c3_O ?? "",
    WEEK: row.WEEK ?? "",
    PONTOAPONTO: row["PONTO-A-PONTO"] ?? row.PONTOAPONTO ?? "",
    Logs: row.Logs ?? row.LOGS ?? ""
  };
}

function hasPontoAPonto(row) { return String(row.PONTOAPONTO || "").trim().length > 0; }
function latestPontoAPonto(row) { return String(row.PONTOAPONTO || "").trim() || "Não registrado"; }
function latestLog(row) {
  const raw = String(row.Logs || "").trim();
  if (!raw) return "Não registrado";
  const parts = raw.split(/\r?\n/).map(v => v.trim()).filter(Boolean);
  return parts[parts.length - 1] || raw;
}

async function loadData() {
  const response = await fetch(CONFIG.DATA_URL, {
    method: "POST",
    headers: {"Content-Type": "application/json", "Accept": "application/json"},
    body: JSON.stringify({week: currentWeek()})
  });

  if (!response.ok) {
    let message = "Falha ao consultar os equipamentos.";
    try {
      const error = await response.json();
      if (error?.error) message = error.error;
    } catch {}
    throw new Error(message);
  }

  const payload = await response.json();
  const rows = Array.isArray(payload) ? payload : (payload.value || payload.rows || []);
  state.rows = rows.map(normalizeExcelRow);
}
async function excluirPontoAPonto(row) {
  const usuario = state.currentUser?.nome || "Usuário";
  const cracha = state.currentUser?.CRACHA || state.currentUser?.cracha || "";

  const response = await fetch(CONFIG.DELETE_URL, {
    method:"POST",
    headers:{"Content-Type":"application/json","Accept":"application/json"},
    body:JSON.stringify({
      TAG: row.TAG,
      nome: usuario,
      cracha
    })
  });
  if (!response.ok) {
    let message = "Não foi possível excluir o registro no Excel.";
    try {
      const error = await response.json();
      if (error?.error || error?.mensagem) message = error.error || error.mensagem;
    } catch {}
    throw new Error(message);
  }

  const payload = await response.json().catch(() => ({}));
  if (payload?.sucesso === false) throw new Error(payload.mensagem || "Não foi possível excluir o registro.");

  row.PONTOAPONTO = payload.pontoAPonto ?? "";
  row.Logs = payload.logs ?? "";
  return payload;
}

async function registrarPontoAPonto(row) {
  const registroData = dateBR();
  const registroDataHora = nowBR();
  const usuario = state.currentUser?.nome || "Usuário";
  const cracha = state.currentUser?.CRACHA || state.currentUser?.cracha || "";

  const response = await fetch(CONFIG.WRITE_URL, {
    method:"POST",
    headers:{"Content-Type":"application/json","Accept":"application/json"},
    body:JSON.stringify({
      TAG: row.TAG,
      nome: usuario,
      cracha
    })
  });
  if (!response.ok) {
    let message = "Não foi possível registrar o ponto a ponto no Excel.";
    try {
      const error = await response.json();
      if (error?.error || error?.mensagem) message = error.error || error.mensagem;
    } catch {}
    throw new Error(message);
  }

  // Atualização otimista da linha carregada; o Excel continua sendo a fonte oficial.
  row.PONTOAPONTO = registroData;
  row.Logs = [String(row.Logs || "").trim(), `${registroDataHora} - ${usuario}`].filter(Boolean).join("\n");
  return registroData;
}



function isSupervisor() {
  return String(state.currentUser?.perfil || "").trim().toUpperCase() === "SUPERVISOR";
}

function populateSelect(selectId, values, selected = "", firstLabel = "Todos") {
  const select = $(selectId);
  if (!select) return;
  const current = selected ?? "";
  select.innerHTML = `<option value="">${firstLabel}</option>` + values.map(v => `<option value="${escapeHTML(v)}">${escapeHTML(v)}</option>`).join("");
  if ([...select.options].some(o => o.value === current)) select.value = current;
}

async function loadSupervisorData() {
  const response = await fetch(CONFIG.DASHBOARD_URL, {
    method: "POST",
    headers: {"Content-Type": "application/json", "Accept": "application/json"},
    body: JSON.stringify({perfil: state.currentUser?.perfil || "SUPERVISOR"})
  });

  if (!response.ok) {
    let message = "Não foi possível carregar o dashboard do supervisor.";
    try {
      const error = await response.json();
      if (error?.error) message = error.error;
    } catch {}
    throw new Error(message);
  }

  const payload = await response.json();
  let rows = [];
  if (Array.isArray(payload)) rows = payload;
  else if (Array.isArray(payload?.rows)) rows = payload.rows;
  else if (typeof payload?.rows === "string") {
    try { rows = JSON.parse(payload.rows); } catch { rows = []; }
  } else if (Array.isArray(payload?.value)) rows = payload.value;
  state.supervisorRows = rows.map(normalizeExcelRow);
  populateSupervisorFilters();
  renderSupervisorDashboard();
  renderSupervisorSchedule();
}

function supervisorFilteredRows(ignoreWeek = false) {
  const week = ignoreWeek ? "" : $("supervisorWeekFilter")?.value || "";
  const forn = $("supervisorFornFilter")?.value || "";
  const sys = $("supervisorSysFilter")?.value || "";
  const subsys = $("supervisorSubsysFilter")?.value || "";
  return state.supervisorRows.filter(r =>
    (!week || String(r.WEEK).trim().toUpperCase() === week) &&
    (!forn || String(r.FORN).trim() === forn) &&
    (!sys || String(r.SYS).trim() === sys) &&
    (!subsys || String(r.SUBSYS).trim() === subsys)
  );
}

function supervisorScheduleFilteredRows() {
  const week = $("supervisorScheduleWeek")?.value || "";
  const forn = $("supervisorScheduleForn")?.value || "";
  const sys = $("supervisorScheduleSys")?.value || "";
  const subsys = $("supervisorScheduleSubsys")?.value || "";
  return state.supervisorRows.filter(r =>
    (!week || String(r.WEEK).trim().toUpperCase() === week) &&
    (!forn || String(r.FORN).trim() === forn) &&
    (!sys || String(r.SYS).trim() === sys) &&
    (!subsys || String(r.SUBSYS).trim() === subsys)
  );
}

function populateSupervisorFilters() {
  const weeks = [...new Set(state.supervisorRows.map(r => String(r.WEEK || "").trim().toUpperCase()).filter(Boolean))].sort((a,b) => Number(a.slice(1))-Number(b.slice(1)));
  const forns = [...new Set(state.supervisorRows.map(r => String(r.FORN || "").trim()).filter(Boolean))].sort();
  const sys = [...new Set(state.supervisorRows.map(r => String(r.SYS || "").trim()).filter(Boolean))].sort();
  const subsys = [...new Set(state.supervisorRows.map(r => String(r.SUBSYS || "").trim()).filter(Boolean))].sort();

  populateSelect("supervisorWeekFilter", weeks, "", "Todas");
  populateSelect("supervisorFornFilter", forns);
  populateSelect("supervisorSysFilter", sys);
  populateSelect("supervisorSubsysFilter", subsys);

  const currentWeekValue = currentWeek();
  populateSelect("supervisorScheduleWeek", weeks, weeks.includes(currentWeekValue) ? currentWeekValue : "", "Todas");
  populateSelect("supervisorScheduleForn", forns);
  populateSelect("supervisorScheduleSys", sys);
  populateSelect("supervisorScheduleSubsys", subsys);
}

function supervisorStats(rows) {
  const previsto = rows.length;
  const realizado = rows.filter(hasPontoAPonto).length;
  const pendente = previsto - realizado;
  const percentual = previsto ? (realizado / previsto) * 100 : 0;
  return { previsto, realizado, pendente, percentual };
}

function renderSupervisorCharts(stats) {
  $("supervisorPrevisto").textContent = stats.previsto.toLocaleString("pt-BR");
  $("supervisorRealizado").textContent = stats.realizado.toLocaleString("pt-BR");
  $("supervisorPendente").textContent = stats.pendente.toLocaleString("pt-BR");
  $("supervisorPercentual").textContent = `${stats.percentual.toLocaleString("pt-BR", {minimumFractionDigits:1, maximumFractionDigits:1})}%`;
  $("supervisorDonutValue").textContent = `${stats.percentual.toLocaleString("pt-BR", {maximumFractionDigits:1})}%`;
  $("supervisorLegendDone").textContent = stats.realizado.toLocaleString("pt-BR");
  $("supervisorLegendPending").textContent = stats.pendente.toLocaleString("pt-BR");
  $("supervisorChartCaption").textContent = $("supervisorWeekFilter").value || "Toda a base";

  const max = Math.max(stats.previsto, stats.realizado, 1);
  const previstoHeight = Math.max(12, (stats.previsto / max) * 100);
  const realizadoHeight = Math.max(12, (stats.realizado / max) * 100);
  $("supervisorBars").innerHTML = `
    <div class="bar-columns">
      <div class="bar-column"><div class="bar-value">${stats.previsto.toLocaleString("pt-BR")}</div><div class="bar-track"><div class="bar-fill bar-blue" style="height:${previstoHeight}%"></div></div><span>Previsto</span></div>
      <div class="bar-column"><div class="bar-value">${stats.realizado.toLocaleString("pt-BR")}</div><div class="bar-track"><div class="bar-fill bar-green" style="height:${realizadoHeight}%"></div></div><span>Realizado</span></div>
    </div>
    <div class="bar-axis"><span>0</span><span>${Math.ceil(max/4).toLocaleString("pt-BR")}</span><span>${Math.ceil(max/2).toLocaleString("pt-BR")}</span><span>${Math.ceil(max*0.75).toLocaleString("pt-BR")}</span><span>${max.toLocaleString("pt-BR")}</span></div>`;

  $("supervisorDonut").style.setProperty("--done", `${stats.percentual}%`);
}

function renderSupervisorWeekSummary() {
  const filteredBase = supervisorFilteredRows(true);
  const weeks = [...new Set(filteredBase.map(r => String(r.WEEK || "").trim().toUpperCase()).filter(Boolean))].sort((a,b) => Number(a.slice(1))-Number(b.slice(1)));
  const body = $("supervisorWeekSummaryBody");
  body.innerHTML = weeks.map(week => {
    const stats = supervisorStats(filteredBase.filter(r => String(r.WEEK || "").trim().toUpperCase() === week));
    return `<tr><td><strong>${escapeHTML(week)}</strong></td><td>${stats.previsto.toLocaleString("pt-BR")}</td><td>${stats.realizado.toLocaleString("pt-BR")}</td><td>${stats.pendente.toLocaleString("pt-BR")}</td><td>${stats.percentual.toLocaleString("pt-BR", {minimumFractionDigits:1, maximumFractionDigits:1})}%</td></tr>`;
  }).join("") || `<tr><td colspan="5" class="empty-table-cell">Nenhum item encontrado.</td></tr>`;
}

function renderSupervisorDashboard() {
  const rows = supervisorFilteredRows(false);
  const stats = supervisorStats(rows);
  renderSupervisorCharts(stats);
  renderSupervisorWeekSummary();
}

function renderSupervisorSchedule() {
  const rows = supervisorScheduleFilteredRows();
  const body = $("supervisorScheduleBody");
  body.innerHTML = rows.map(r => `<tr>
    <td class="tag-cell">${escapeHTML(r.TAG)}</td>
    <td>${escapeHTML(r.LOOP)}</td>
    <td>${escapeHTML(r.SERVICE)}</td>
    <td>${escapeHTML(r.TIPE)}</td>
    <td>${escapeHTML(r.DESCRIÇÃO)}</td>
    <td>${escapeHTML(r.FORN)}</td>
    <td>${escapeHTML(r.SYS)}</td>
    <td>${escapeHTML(r.SUBSYS)}</td>
    <td>${escapeHTML(r.WEEK)}</td>
    <td>${hasPontoAPonto(r) ? escapeHTML(r.PONTOAPONTO) : "—"}</td>
    <td class="supervisor-log-cell">${escapeHTML(latestLog(r))}</td>
  </tr>`).join("");
  $("supervisorScheduleEmpty").classList.toggle("hidden", rows.length !== 0);
}

function applyRoleUI() {
  const supervisor = isSupervisor();
  $("sideNavTechnician").classList.toggle("hidden", supervisor);
  $("sideNavSupervisor").classList.toggle("hidden", !supervisor);
  $("topbarSubtitle").textContent = supervisor
    ? "Acompanhe previsto x realizado e consulte a programação em modo somente leitura"
    : "Acompanhe e registre os testes de campo em tempo real";
  $("profileWeek").textContent = currentWeek();
  const access = document.querySelector("#screen-profile .info-row:nth-of-type(3) strong");
  if (access) access.textContent = supervisor ? "Acesso de supervisor" : "Operação de campo";
}

function populateFilters() {
  const week = currentWeek();
  const rows = state.rows.filter(r => String(r.WEEK).trim().toUpperCase() === week);
  const sys = [...new Set(rows.map(r=>String(r.SYS||"").trim()).filter(Boolean))].sort();
  const subsys = [...new Set(rows.map(r=>String(r.SUBSYS||"").trim()).filter(Boolean))].sort();
  $("sysFilter").innerHTML = `<option value="">Todos</option>` + sys.map(v=>`<option>${escapeHTML(v)}</option>`).join("");
  $("subsysFilter").innerHTML = `<option value="">Todos</option>` + subsys.map(v=>`<option>${escapeHTML(v)}</option>`).join("");
}

function filteredRows() {
  const week = currentWeek();
  const q = $("tagSearch").value.trim().toLowerCase();
  const sys = $("sysFilter").value;
  const subsys = $("subsysFilter").value;
  return state.rows.filter(r =>
    String(r.WEEK).trim().toUpperCase() === week &&
    (!q || String(r.TAG).toLowerCase().includes(q)) &&
    (!sys || String(r.SYS) === sys) &&
    (!subsys || String(r.SUBSYS) === subsys)
  );
}

function counters(rows) {
  const done = rows.filter(hasPontoAPonto).length;
  $("totalCount").textContent = rows.length;
  $("doneCount").textContent = done;
  $("pendingCount").textContent = rows.length - done;
}

function renderTable() {
  const rows = filteredRows();
  const body = $("tagTableBody");
  body.innerHTML = rows.map(r => {
    const selected = r.TAG === state.selectedTag ? "selected" : "";
    const log = latestPontoAPonto(r);
    return `<tr class="${selected}" data-tag="${escapeHTML(r.TAG)}">
      <td class="tag-cell">${escapeHTML(r.TAG)}</td>
      <td>${escapeHTML(r.LOOP)}</td>
      <td>${escapeHTML(r.SERVICE)}</td>
      <td>${escapeHTML(r.TIPE)}</td>
      <td>${escapeHTML(r.DESCRIÇÃO)}</td>
      <td class="week-cell">${escapeHTML(r.WEEK)}</td>
      <td class="log-cell">${hasPontoAPonto(r) ? escapeHTML(log) : "—"}</td>
    </tr>`;
  }).join("");
  body.querySelectorAll("tr").forEach(tr => tr.onclick = () => selectItem(tr.dataset.tag));
  $("emptyState").classList.toggle("hidden", rows.length !== 0);
  counters(rows);

  if (!state.selectedTag && rows.length) selectItem(rows[0].TAG, false);
  else if (state.selectedTag && !rows.some(r=>r.TAG===state.selectedTag)) {
    state.selectedTag = null;
    clearSelection();
  }
}

function selectItem(tag, rerender=true) {
  const row = state.rows.find(r => r.TAG === tag);
  if (!row) return;
  state.selectedTag = tag;
  $("selectedTagTitle").textContent = row.TAG;
  $("fieldTag").textContent = row.TAG;
  $("fieldLoop").textContent = row.LOOP;
  $("fieldService").textContent = row.SERVICE;
  $("fieldType").textContent = row.TIPE;
  $("fieldForn").textContent = row.FORN;
  $("fieldSys").textContent = row.SYS;
  $("fieldSubsys").textContent = row.SUBSYS;
  $("fieldWeek").textContent = row.WEEK;
  $("fieldDescription").textContent = row.DESCRIÇÃO;
  $("fieldLog").textContent = latestLog(row);
  const done = hasPontoAPonto(row);
  const badge = $("selectedBadge");
  badge.textContent = done ? "COM LOG" : "PENDENTE";
  badge.className = `tag-badge ${done ? "done" : "pending"}`;
  $("registerBtn").disabled = false;
  $("repeatBtn").disabled = !done;
  $("deleteBtn").disabled = !done;
  $("actionMessage").textContent = "";
  if (rerender) renderTable();
}

function clearSelection() {
  $("selectedTagTitle").textContent = "Selecione uma TAG";
  ["fieldTag","fieldLoop","fieldService","fieldType","fieldForn","fieldSys","fieldSubsys","fieldWeek","fieldDescription"].forEach(id => $(id).textContent = "—");
  $("fieldLog").textContent = "Não registrado";
  $("selectedBadge").textContent = "AGUARDANDO";
  $("selectedBadge").className = "tag-badge";
  $("registerBtn").disabled = true;
  $("repeatBtn").disabled = true;
  $("deleteBtn").disabled = true;
}

function toast(message) {
  const t = $("toast");
  t.textContent = message; t.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(()=>t.classList.remove("show"),2800);
}

async function registerPonto() {
  const row = state.rows.find(r => r.TAG === state.selectedTag);
  if (!row) return;
  try {
    $("registerBtn").disabled = true;
    $("repeatBtn").disabled = true;
    const entry = await registrarPontoAPonto(row);
    selectItem(row.TAG);
    $("actionMessage").textContent = `Registro salvo em PONTO-A-PONTO: ${entry}. Log gravado com usuário, data e hora.`;
    toast("Ponto a ponto registrado no Excel.");
    renderHistory();
  } catch (error) {
    toast(error.message || "Erro ao registrar.");
    selectItem(row.TAG);
  }
}

async function deletePontoAPonto() {
  const row = state.rows.find(r => r.TAG === state.selectedTag);
  if (!row || !hasPontoAPonto(row)) return;

  try {
    $("registerBtn").disabled = true;
    $("repeatBtn").disabled = true;
    $("deleteBtn").disabled = true;
    const payload = await excluirPontoAPonto(row);
    selectItem(row.TAG);
    $("actionMessage").textContent = payload.mensagem || "Último registro de ponto a ponto excluído.";
    toast("Registro excluído do Excel.");
    renderHistory();
  } catch (error) {
    toast(error.message || "Erro ao excluir registro.");
    selectItem(row.TAG);
  }
}

function renderHistory() {
  const rows = state.rows.filter(r => String(r.WEEK).trim().toUpperCase() === currentWeek());
  const done = rows.filter(hasPontoAPonto);
  $("historyDone").textContent = done.length;
  $("historyPending").textContent = rows.length - done.length;
  $("historyTotal").textContent = rows.length;

  const logs = [];
  rows.forEach(r => {
    if (String(r.Logs || "").trim()) {
      logs.push({tag:r.TAG, log:r.Logs});
    }
  });
  logs.reverse();

  $("historyLog").innerHTML = logs.length ? logs.slice(0,30).map(item => {
    const entries = String(item.log || "").split(/\r?\n/).map(v => v.trim()).filter(Boolean);
    const latest = entries[entries.length - 1] || "";
    const parts = latest.split(" - ");
    const time = parts.shift() || "";
    const user = parts.join(" - ") || "Usuário";
    return `<div class="history-log-row">
      <span class="time">${escapeHTML(time)}</span>
      <div><strong>Ponto a ponto</strong><span>${escapeHTML(item.tag)}</span></div>
      <span class="user">${escapeHTML(user)}</span>
    </div>`;
  }).join("") : `<div class="empty-state inline"><strong>Nenhum log na semana atual.</strong><span>Os registros aparecerão aqui após a execução.</span></div>`;
}

function nav(screen) {
  const allowedSupervisor = ["supervisorDashboard", "supervisorSchedule", "profile"];
  const allowedTechnician = ["home", "history", "profile"];
  const allowed = isSupervisor() ? allowedSupervisor : allowedTechnician;
  if (!allowed.includes(screen)) screen = isSupervisor() ? "supervisorDashboard" : "home";
  document.querySelectorAll(".screen").forEach(s=>s.classList.remove("active-screen"));
  const target = $(`screen-${screen}`);
  if (target) target.classList.add("active-screen");
  document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.screen===screen));
  if (screen === "history") renderHistory();
  if (screen === "supervisorDashboard") renderSupervisorDashboard();
  if (screen === "supervisorSchedule") renderSupervisorSchedule();
}

function setupProfile() {
  const u = state.currentUser;
  const initials = String(u.nome).trim().split(/\s+/).slice(0,2).map(x=>x[0]).join("").toUpperCase();
  $("profileAvatar").textContent = initials || "TC";
  $("profileName").textContent = u.nome;
  $("profileName2").textContent = u.nome;
  $("profileBadge").textContent = `Crachá: ${u.CRACHA || u.cracha || "—"}`;
  $("profileBadge2").textContent = u.CRACHA || u.cracha || "—";
  $("profileWeek").textContent = currentWeek();
}

async function login(name, badge) {
  const response = await fetch(CONFIG.LOGIN_URL, {
    method: "POST",
    headers: {"Content-Type": "application/json", "Accept": "application/json"},
    body: JSON.stringify({nome: name, cracha: badge})
  });

  let payload = {};
  try { payload = await response.json(); } catch {}

  if (!response.ok || payload.autorizado !== true) {
    throw new Error(payload.mensagem || payload.error || "Usuário não autorizado.");
  }

  state.currentUser = {
    nome: payload.nome || name,
    CRACHA: payload.cracha || badge,
    perfil: payload.perfil || ""
  };

  sessionStorage.setItem("ppaUser", JSON.stringify(state.currentUser));
  $("loginScreen").classList.add("hidden");
  $("appShell").classList.remove("hidden");
  $("currentWeek").textContent = currentWeek();
  $("loginMessage").textContent = "";
  applyRoleUI();
  setupProfile();
}

function logout() {
  sessionStorage.removeItem("ppaUser");
  state.currentUser = null;
  $("appShell").classList.add("hidden");
  $("loginScreen").classList.remove("hidden");
  $("loginForm").reset();
  $("loginMessage").textContent = "";
}

$("loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  const name = $("loginName").value.trim();
  const badge = $("loginBadge").value.trim();
  if (!name || !badge) return;

  const button = e.submitter || $("loginForm").querySelector('button[type="submit"]');
  button.disabled = true;
  $("loginMessage").textContent = "Validando acesso...";
  $("loginMessage").className = "form-message";

  try {
    await login(name, badge);
    if (isSupervisor()) {
      nav("supervisorDashboard");
      await loadSupervisorData();
    } else {
      nav("home");
      await syncData();
    }
  } catch (error) {
    $("loginMessage").textContent = error.message || "Usuário não autorizado.";
    $("loginMessage").className = "form-message error";
    sessionStorage.removeItem("ppaUser");
  } finally {
    button.disabled = false;
  }
});

$("tagSearch").addEventListener("input", () => {
  $("clearSearch").style.display = $("tagSearch").value ? "block" : "none";
  renderTable();
});
$("clearSearch").onclick = () => { $("tagSearch").value=""; $("clearSearch").style.display="none"; renderTable(); };
$("sysFilter").onchange = renderTable;
$("subsysFilter").onchange = renderTable;
$("registerBtn").onclick = registerPonto;
$("repeatBtn").onclick = () => $("confirmModal").classList.remove("hidden");
$("deleteBtn").onclick = () => $("deleteModal").classList.remove("hidden");
["closeModal","cancelModal"].forEach(id => $(id).onclick = () => $("confirmModal").classList.add("hidden"));
["closeDeleteModal","cancelDeleteModal"].forEach(id => $(id).onclick = () => $("deleteModal").classList.add("hidden"));
$("confirmRepeat").onclick = () => { $("confirmModal").classList.add("hidden"); registerPonto(); };
$("confirmDelete").onclick = async () => { $("deleteModal").classList.add("hidden"); await deletePontoAPonto(); };
$("refreshHistory").onclick = async () => { await syncData(); toast("Dados atualizados."); };
$("logoutBtn").onclick = logout;
document.querySelectorAll(".nav-item").forEach(b => b.onclick = () => nav(b.dataset.screen));

["supervisorWeekFilter","supervisorFornFilter","supervisorSysFilter","supervisorSubsysFilter"].forEach(id => {
  const el = $(id);
  if (el) el.onchange = renderSupervisorDashboard;
});
["supervisorScheduleWeek","supervisorScheduleForn","supervisorScheduleSys","supervisorScheduleSubsys"].forEach(id => {
  const el = $(id);
  if (el) el.onchange = renderSupervisorSchedule;
});
$("supervisorClearFilters").onclick = () => {
  ["supervisorWeekFilter","supervisorFornFilter","supervisorSysFilter","supervisorSubsysFilter"].forEach(id => { if ($(id)) $(id).value = ""; });
  renderSupervisorDashboard();
};
$("supervisorRefreshSchedule").onclick = async () => {
  try { await loadSupervisorData(); toast("Dashboard atualizado."); } catch (e) { toast(e.message || "Não foi possível atualizar o dashboard."); }
};

async function syncData() {
  try {
    await loadData();
    $("currentWeek").textContent = currentWeek();
    populateFilters();
    renderTable();
    renderHistory();
  } catch (e) {
    toast(e.message || "Não foi possível sincronizar.");
  }
}

setInterval(() => {
  $("currentDateTime").textContent = nowBR();
  $("currentWeek").textContent = currentWeek();
}, 1000);

(async function init() {
  $("currentDateTime").textContent = nowBR();
  const saved = sessionStorage.getItem("ppaUser");
  if (!saved) return;

  try {
    const user = JSON.parse(saved);
    await login(user.nome, user.CRACHA || user.cracha);
    if (isSupervisor()) {
      nav("supervisorDashboard");
      await loadSupervisorData();
    } else {
      nav("home");
      await syncData();
    }
  } catch {
    sessionStorage.removeItem("ppaUser");
    state.currentUser = null;
    $("appShell").classList.add("hidden");
    $("loginScreen").classList.remove("hidden");
  }
})();
