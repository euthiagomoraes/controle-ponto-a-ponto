/* REV. 2 — protótipo local.
   Na integração real, substitua DATA_URL/WRITE_URL por endpoints do Power Automate.
   Nunca coloque credenciais, client secrets ou senha do OneDrive neste arquivo. */

const CONFIG = {
  DATA_URL: "",   // GET: Power Automate -> List rows present in a table
  WRITE_URL: "",  // POST: Power Automate -> Get/Update row by TAG
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
  mockRows: [
    {FORN:"FORN-01",SYS:"20GHA",SUBSYS:"AA401",LOOP:"XV-20GHA10AA401",TAG:"ZSH-20GHA10AA401-S12",SERVICE:"WATER SERVICE TO TANK",TIPE:"AA - VÁLVULA",DESCRIÇÃO:"VÁLVULA ON/OFF",Week:"W133",Logs:""},
    {FORN:"FORN-01",SYS:"20GHA",SUBSYS:"AA402",LOOP:"XV-20GHA10AA402",TAG:"ZSL-20GHA10AA402-S12",SERVICE:"WATER SERVICE TO TANK",TIPE:"AA - VÁLVULA",DESCRIÇÃO:"VÁLVULA ON/OFF",Week:"W133",Logs:""},
    {FORN:"FORN-02",SYS:"20GMA",SUBSYS:"KB003",LOOP:"XV-20GMA10KB003",TAG:"ZSH-20GMA10KB003-S12",SERVICE:"NEUTRALIZATION EFFLUENT PIT",TIPE:"INTERFACE ELÉTRICA EQUIPAMENTO",DESCRIÇÃO:"VÁLVULA ON/OFF",Week:"W133",Logs:"12/09/2026 14:32 - @tecnico.campo"},
    {FORN:"FORN-02",SYS:"20GMA",SUBSYS:"KB004",LOOP:"XV-20GMA10KB004",TAG:"ZSL-20GMA10KB004-S12",SERVICE:"NEUTRALIZATION EFFLUENT PIT",TIPE:"INTERFACE ELÉTRICA EQUIPAMENTO",DESCRIÇÃO:"VÁLVULA ON/OFF",Week:"W132",Logs:""},
    {FORN:"FORN-02",SYS:"20GMA",SUBSYS:"BB001",LOOP:"P-20GMA10BB001",TAG:"PSH-20GMA10BB001-S12",SERVICE:"EFFLUENT PIT",TIPE:"PRESSURE SWITCH",DESCRIÇÃO:"CHAVE DE PRESSÃO",Week:"W133",Logs:""},
    {FORN:"FORN-02",SYS:"20GMA",SUBSYS:"BB002",LOOP:"L-20GMA10BB002",TAG:"LSH-20GMA10BB002-S12",SERVICE:"EFFLUENT PIT",TIPE:"LEVEL SWITCH",DESCRIÇÃO:"CHAVE DE NÍVEL",Week:"W133",Logs:""},
    {FORN:"FORN-01",SYS:"20GHA",SUBSYS:"AA401",LOOP:"FIC-20GHA10AA401",TAG:"FIC-20GHA10AA401-S12",SERVICE:"WATER SERVICE TO TANK",TIPE:"INSTRUMENTAÇÃO",DESCRIÇÃO:"CONTROLADOR DE VAZÃO",Week:"W133",Logs:"13/09/2026 08:05 - @operador.01"},
    {FORN:"FORN-01",SYS:"20GHA",SUBSYS:"BB001",LOOP:"TIT-20GHA10BB001",TAG:"TIT-20GHA10BB001-S12",SERVICE:"TANK TEMPERATURE",TIPE:"INSTRUMENTAÇÃO",DESCRIÇÃO:"TRANSMISSOR DE TEMPERATURA",Week:"W134",Logs:""},
    {FORN:"FORN-01",SYS:"20GHA",SUBSYS:"AA410",LOOP:"XV-20GHA10AA410",TAG:"XV-20GHA10AA410-S12",SERVICE:"WATER SERVICE",TIPE:"AA - VÁLVULA",DESCRIÇÃO:"VÁLVULA ON/OFF",Week:"W133",Logs:""},
    {FORN:"FORN-01",SYS:"20GHA",SUBSYS:"AA411",LOOP:"XV-20GHA10AA411",TAG:"ZSH-20GHA10AA411-S12",SERVICE:"WATER SERVICE",TIPE:"AA - VÁLVULA",DESCRIÇÃO:"VÁLVULA ON/OFF",Week:"W133",Logs:""}
  ]
};

const $ = id => document.getElementById(id);
const nowBR = () => new Intl.DateTimeFormat("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"}).format(new Date()).replace(",","");

function currentWeek() {
  const today = new Date();
  const diff = Math.floor((new Date(today.getFullYear(),today.getMonth(),today.getDate()) - WEEK_ANCHOR) / 86400000);
  return `W${WEEK_ANCHOR_NUMBER + Math.floor(diff / 7)}`;
}
function escapeHTML(value) {
  return String(value ?? "—").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}
function hasLog(row) { return String(row.Logs || "").trim().length > 0; }
function latestLog(row) {
  const logs = String(row.Logs || "").split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  return logs.length ? logs[logs.length-1] : "Não registrado";
}
function logEntries(row) {
  return String(row.Logs || "").split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
}

async function loadData() {
  if (!CONFIG.DATA_URL) {
    state.rows = state.mockRows.map(r=>({...r}));
    return;
  }
  const response = await fetch(CONFIG.DATA_URL, {method:"GET", headers:{"Accept":"application/json"}});
  if (!response.ok) throw new Error("Falha ao consultar o Power Automate.");
  const payload = await response.json();
  state.rows = Array.isArray(payload) ? payload : (payload.value || payload.rows || []);
}

async function appendLog(row) {
  const entry = `${nowBR()} - ${state.currentUser.nome}`;
  const existing = String(row.Logs || "").trim();
  const newLogs = existing ? `${existing}\n${entry}` : entry;

  if (CONFIG.WRITE_URL) {
    const response = await fetch(CONFIG.WRITE_URL, {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({TAG:row.TAG, Logs:newLogs})
    });
    if (!response.ok) throw new Error("Não foi possível atualizar o log no Excel.");
  }
  row.Logs = newLogs;
  return entry;
}

function populateFilters() {
  const week = currentWeek();
  const rows = state.rows.filter(r => String(r.Week).trim().toUpperCase() === week);
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
    String(r.Week).trim().toUpperCase() === week &&
    (!q || String(r.TAG).toLowerCase().includes(q)) &&
    (!sys || String(r.SYS) === sys) &&
    (!subsys || String(r.SUBSYS) === subsys)
  );
}

function counters(rows) {
  const done = rows.filter(hasLog).length;
  $("totalCount").textContent = rows.length;
  $("doneCount").textContent = done;
  $("pendingCount").textContent = rows.length - done;
}

function renderTable() {
  const rows = filteredRows();
  const body = $("tagTableBody");
  body.innerHTML = rows.map(r => {
    const selected = r.TAG === state.selectedTag ? "selected" : "";
    const log = latestLog(r);
    return `<tr class="${selected}" data-tag="${escapeHTML(r.TAG)}">
      <td class="tag-cell">${escapeHTML(r.TAG)}</td>
      <td>${escapeHTML(r.LOOP)}</td>
      <td>${escapeHTML(r.SERVICE)}</td>
      <td>${escapeHTML(r.TIPE)}</td>
      <td>${escapeHTML(r.DESCRIÇÃO)}</td>
      <td class="week-cell">${escapeHTML(r.Week)}</td>
      <td class="log-cell">${hasLog(r) ? escapeHTML(log) : "—"}</td>
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
  $("fieldWeek").textContent = row.Week;
  $("fieldDescription").textContent = row.DESCRIÇÃO;
  $("fieldLog").textContent = latestLog(row);
  const done = hasLog(row);
  const badge = $("selectedBadge");
  badge.textContent = done ? "COM LOG" : "PENDENTE";
  badge.className = `tag-badge ${done ? "done" : "pending"}`;
  $("registerBtn").disabled = false;
  $("repeatBtn").disabled = !done;
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
    const entry = await appendLog(row);
    selectItem(row.TAG);
    $("actionMessage").textContent = `Registro acrescentado: ${entry}`;
    toast("Ponto a ponto registrado.");
    renderHistory();
  } catch (error) {
    toast(error.message || "Erro ao registrar.");
    selectItem(row.TAG);
  }
}

function renderHistory() {
  const rows = state.rows.filter(r => String(r.Week).trim().toUpperCase() === currentWeek());
  const done = rows.filter(hasLog);
  $("historyDone").textContent = done.length;
  $("historyPending").textContent = rows.length - done.length;
  $("historyTotal").textContent = rows.length;

  const logs = [];
  rows.forEach(r => logEntries(r).forEach(log => logs.push({tag:r.TAG, log})));
  logs.reverse();

  $("historyLog").innerHTML = logs.length ? logs.slice(0,30).map(item => {
    const parts = item.log.split(" - ");
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
  document.querySelectorAll(".screen").forEach(s=>s.classList.remove("active-screen"));
  $(`screen-${screen}`).classList.add("active-screen");
  document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.screen===screen));
  if (screen === "history") renderHistory();
}

function setupProfile() {
  const u = state.currentUser;
  const initials = String(u.nome).trim().split(/\s+/).slice(0,2).map(x=>x[0]).join("").toUpperCase();
  $("profileAvatar").textContent = initials || "TC";
  $("profileName").textContent = u.nome;
  $("profileName2").textContent = u.nome;
  $("profileBadge").textContent = `Crachá: ${u.cracHa || u.CRACHA || "—"}`;
  $("profileBadge2").textContent = u.cracHa || u.CRACHA || "—";
  $("profileWeek").textContent = currentWeek();
}

function login(name, badge) {
  // Mock local para demonstração. Na produção, validar NOME + CRACHA + ATIVO=SIM via Power Automate.
  state.currentUser = {nome:name, CRACHA:badge};
  sessionStorage.setItem("ppaUser", JSON.stringify(state.currentUser));
  $("loginScreen").classList.add("hidden");
  $("appShell").classList.remove("hidden");
  $("currentWeek").textContent = currentWeek();
  setupProfile();
}

function logout() {
  sessionStorage.removeItem("ppaUser");
  state.currentUser = null;
  $("appShell").classList.add("hidden");
  $("loginScreen").classList.remove("hidden");
  $("loginForm").reset();
}

$("loginForm").addEventListener("submit", e => {
  e.preventDefault();
  const name = $("loginName").value.trim();
  const badge = $("loginBadge").value.trim();
  if (!name || !badge) return;
  login(name, badge);
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
["closeModal","cancelModal"].forEach(id => $(id).onclick = () => $("confirmModal").classList.add("hidden"));
$("confirmRepeat").onclick = () => { $("confirmModal").classList.add("hidden"); registerPonto(); };
$("refreshHistory").onclick = async () => { await syncData(); toast("Dados atualizados."); };
$("logoutBtn").onclick = logout;
document.querySelectorAll(".nav-item").forEach(b => b.onclick = () => nav(b.dataset.screen));

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
  await syncData();
  const saved = sessionStorage.getItem("ppaUser");
  if (saved) {
    try { login(JSON.parse(saved).nome, JSON.parse(saved).CRACHA); } catch { }
  }
})();
