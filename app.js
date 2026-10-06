/* Rev. 3 — Dashboard previsto x realizado + Programação + Login separado Adm/Técnico
   Esta entrega usa dados mock/localStorage para permitir validação visual e funcional.
   Integração final: conectar os loaders/actions às tabelas do ecossistema Supabase. */

const CONFIG = {
  SUPABASE_URL: "",
  SUPABASE_ANON_KEY: "",
  // Endpoints legados do Excel/Power Automate ficam apenas como fallback.
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

const state = {
  currentUser: null,
  selectedTag: null,
  rows: [],
  role: null,
  programacoes: [],
  mockRows: [
    {FORN:"FORN-01",SYS:"20GHA",SUBSYS:"AA401",LOOP:"XV-20GHA10AA401",TAG:"ZSH-20GHA10AA401-S12",SERVICE:"WATER SERVICE TO TANK",TIPE:"AA - VÁLVULA",DESCRIÇÃO:"VÁLVULA ON/OFF",Week:"W136",Logs:""},
    {FORN:"FORN-01",SYS:"20GHA",SUBSYS:"AA402",LOOP:"XV-20GHA10AA402",TAG:"ZSL-20GHA10AA402-S12",SERVICE:"WATER SERVICE TO TANK",TIPE:"AA - VÁLVULA",DESCRIÇÃO:"VÁLVULA ON/OFF",Week:"W136",Logs:""},
    {FORN:"FORN-02",SYS:"20GMA",SUBSYS:"KB003",LOOP:"XV-20GMA10KB003",TAG:"ZSH-20GMA10KB003-S12",SERVICE:"NEUTRALIZATION EFFLUENT PIT",TIPE:"INTERFACE ELÉTRICA EQUIPAMENTO",DESCRIÇÃO:"VÁLVULA ON/OFF",Week:"W136",Logs:"06/10/2026 08:32 - Carlos Técnico"},
    {FORN:"FORN-02",SYS:"20GMA",SUBSYS:"KB004",LOOP:"XV-20GMA10KB004",TAG:"ZSL-20GMA10KB004-S12",SERVICE:"NEUTRALIZATION EFFLUENT PIT",TIPE:"INTERFACE ELÉTRICA EQUIPAMENTO",DESCRIÇÃO:"VÁLVULA ON/OFF",Week:"W136",Logs:""},
    {FORN:"FORN-02",SYS:"20GMA",SUBSYS:"BB001",LOOP:"P-20GMA10BB001",TAG:"PSH-20GMA10BB001-S12",SERVICE:"EFFLUENT PIT",TIPE:"PRESSURE SWITCH",DESCRIÇÃO:"CHAVE DE PRESSÃO",Week:"W136",Logs:"05/10/2026 15:21 - Carlos Técnico"},
    {FORN:"FORN-02",SYS:"20GMA",SUBSYS:"BB002",LOOP:"L-20GMA10BB002",TAG:"LSH-20GMA10BB002-S12",SERVICE:"EFFLUENT PIT",TIPE:"LEVEL SWITCH",DESCRIÇÃO:"CHAVE DE NÍVEL",Week:"W136",Logs:""},
    {FORN:"FORN-01",SYS:"20GHA",SUBSYS:"AA401",LOOP:"FIC-20GHA10AA401",TAG:"FIC-20GHA10AA401-S12",SERVICE:"WATER SERVICE TO TANK",TIPE:"INSTRUMENTAÇÃO",DESCRIÇÃO:"CONTROLADOR DE VAZÃO",Week:"W136",Logs:"05/10/2026 08:05 - Rafael Técnico"},
    {FORN:"FORN-01",SYS:"20GHA",SUBSYS:"BB001",LOOP:"TIT-20GHA10BB001",TAG:"TIT-20GHA10BB001-S12",SERVICE:"TANK TEMPERATURE",TIPE:"INSTRUMENTAÇÃO",DESCRIÇÃO:"TRANSMISSOR DE TEMPERATURA",Week:"W135",Logs:""},
    {FORN:"FORN-01",SYS:"20GHA",SUBSYS:"AA410",LOOP:"XV-20GHA10AA410",TAG:"XV-20GHA10AA410-S12",SERVICE:"WATER SERVICE",TIPE:"AA - VÁLVULA",DESCRIÇÃO:"VÁLVULA ON/OFF",Week:"W136",Logs:""},
    {FORN:"FORN-01",SYS:"20GHA",SUBSYS:"AA411",LOOP:"XV-20GHA10AA411",TAG:"ZSH-20GHA10AA411-S12",SERVICE:"WATER SERVICE",TIPE:"AA - VÁLVULA",DESCRIÇÃO:"VÁLVULA ON/OFF",Week:"W136",Logs:""}
  ],
  dashboardSeed: [
    {week:"W133", planned:42, done:39},
    {week:"W134", planned:48, done:44},
    {week:"W135", planned:56, done:38},
    {week:"W136", planned:60, done:35}
  ],
  activityStats: [
    {name:"Ponto a Ponto", planned:32, done:21},
    {name:"Loop Teste", planned:16, done:10},
    {name:"Preservação", planned:12, done:4}
  ],
  mockProgramacoes: [
    {id:"p-01",week:"W136",date:"2026-10-05",activity:"Ponto a Ponto",team:"Equipe A",responsible:"Carlos Técnico",qty:20,note:"Instrumentação da área 20GHA"},
    {id:"p-02",week:"W136",date:"2026-10-06",activity:"Ponto a Ponto",team:"Equipe A",responsible:"Rafael Técnico",qty:12,note:"Validação de válvulas"},
    {id:"p-03",week:"W136",date:"2026-10-07",activity:"Loop Teste",team:"Equipe B",responsible:"Marcos Técnico",qty:16,note:"Testes de loop conforme plano"},
    {id:"p-04",week:"W136",date:"2026-10-08",activity:"Preservação",team:"Equipe C",responsible:"João Técnico",qty:12,note:"Preservação dos equipamentos liberados"},
    {id:"p-05",week:"W135",date:"2026-09-28",activity:"Ponto a Ponto",team:"Equipe A",responsible:"Carlos Técnico",qty:24,note:"Fechamento da W135"}
  ],
  teams: [
    {id:"A",name:"Equipe A",activity:"Ponto a Ponto"},
    {id:"B",name:"Equipe B",activity:"Loop Teste"},
    {id:"C",name:"Equipe C",activity:"Preservação"}
  ],
  activities: [
    {id:"ppa",name:"Ponto a Ponto"},
    {id:"loop",name:"Loop Teste"},
    {id:"pres",name:"Preservação"}
  ],
  people: ["Carlos Técnico","Rafael Técnico","Marcos Técnico","João Técnico"]
};

const $ = id => document.getElementById(id);
const nowBR = () => new Intl.DateTimeFormat("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"}).format(new Date()).replace(",","");
const fmtDate = value => {
  if (!value) return "—";
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? value : new Intl.DateTimeFormat("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric"}).format(d);
};
const escapeHTML = value => String(value ?? "—").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const hasLog = row => String(row.Logs || "").trim().length > 0;
const latestLog = row => {
  const logs = String(row.Logs || "").split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  return logs.length ? logs[logs.length-1] : "Não registrado";
};
const logEntries = row => String(row.Logs || "").split(/\r?\n/).map(x=>x.trim()).filter(Boolean);

function currentWeek() {
  const today = new Date();
  const start = new Date(today.getFullYear(),today.getMonth(),today.getDate());
  const diff = Math.floor((start - WEEK_ANCHOR) / 86400000);
  return `W${WEEK_ANCHOR_NUMBER + Math.floor(diff / 7)}`;
}

function weekOptions() {
  return [...new Set([
    currentWeek(),
    ...state.dashboardSeed.map(x=>x.week),
    ...state.programacoes.map(x=>x.week)
  ])]
    .sort((a,b)=>Number(a.slice(1))-Number(b.slice(1)))
    .map(w=>`<option value="${escapeHTML(w)}">${escapeHTML(w)}</option>`)
    .join("");
}

function showLogin(role) {
  $("accessChooser").classList.add("hidden");
  $("adminLoginCard").classList.toggle("hidden", role !== "admin");
  $("technicianLoginCard").classList.toggle("hidden", role !== "technician");
  $("adminLoginMessage").textContent = "";
  $("techLoginMessage").textContent = "";
}

function backToAccessChooser() {
  $("accessChooser").classList.remove("hidden");
  $("adminLoginCard").classList.add("hidden");
  $("technicianLoginCard").classList.add("hidden");
}

function showAppForRole(role) {
  state.role = role;
  $("loginScreen").classList.add("hidden");
  $("appShell").classList.remove("hidden");
  $("adminNav").classList.toggle("hidden", role !== "admin");
  $("techNav").classList.toggle("hidden", role !== "technician");
  $("roleBadge").textContent = ROLE_LABELS[role];
  $("sidebarRoleText").textContent = role === "admin" ? "Painel administrativo" : "Operação de campo";

  if (role === "admin") {
    $("topbarEyebrow").textContent = "GESTÃO OPERACIONAL";
    $("topbarTitle").textContent = "CONTROLE DE PONTO A PONTO";
    $("topbarSubtitle").textContent = "Dashboard e programação de atividades";
    nav("dashboard");
  } else {
    $("topbarEyebrow").textContent = "OPERAÇÃO DE CAMPO";
    $("topbarTitle").textContent = "CONTROLE DE PONTO A PONTO";
    $("topbarSubtitle").textContent = "Acompanhe e registre os testes de campo em tempo real";
    nav("home");
  }
  setupProfile();
}

function loginAdmin(email) {
  state.currentUser = {nome: "Administrador", email, identificador: email, role:"admin"};
  sessionStorage.setItem("ppaSession", JSON.stringify(state.currentUser));
  showAppForRole("admin");
  syncAll();
}

function loginTechnician(code) {
  // Demo local. Na integração, consultar tb_acessos/tb_pessoas/tb_permissoes.
  const peopleByCode = {
    "1001": {nome:"Carlos Técnico", identificador:"1001"},
    "1002": {nome:"Rafael Técnico", identificador:"1002"},
    "1003": {nome:"Marcos Técnico", identificador:"1003"}
  };
  const found = peopleByCode[code];
  if (!found) {
    $("techLoginMessage").textContent = "Código não encontrado ou sem permissão de acesso.";
    return;
  }
  state.currentUser = {...found, role:"technician"};
  sessionStorage.setItem("ppaSession", JSON.stringify(state.currentUser));
  showAppForRole("technician");
  syncAll();
}

function logout() {
  sessionStorage.removeItem("ppaSession");
  state.currentUser = null;
  state.role = null;
  $("appShell").classList.add("hidden");
  $("loginScreen").classList.remove("hidden");
  backToAccessChooser();
  $("adminLoginForm").reset();
  $("technicianLoginForm").reset();
}

function nav(screen) {
  const allowedAdmin = ["dashboard","programacao","profile"];
  const allowedTech = ["home","history","profile"];
  const allowed = state.role === "admin" ? allowedAdmin : allowedTech;
  if (!allowed.includes(screen)) screen = state.role === "admin" ? "dashboard" : "home";

  document.querySelectorAll(".screen").forEach(s=>s.classList.remove("active-screen"));
  const target = $(`screen-${screen}`);
  if (target) target.classList.add("active-screen");

  document.querySelectorAll(".nav-item").forEach(b=>{
    b.classList.toggle("active", b.dataset.screen===screen);
  });

  if (screen === "dashboard") renderDashboard();
  if (screen === "programacao") renderProgramacao();
  if (screen === "history") renderHistory();
}

function toast(message) {
  const t = $("toast");
  t.textContent = message;
  t.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(()=>t.classList.remove("show"),2800);
}

/* =========================
   DASHBOARD
   ========================= */
function dashboardMetrics() {
  const week = currentWeek();
  const seeded = state.dashboardSeed.find(x=>x.week===week);
  const scheduled = state.programacoes.filter(x=>x.week===week).reduce((sum,x)=>sum+Number(x.qty||0),0);
  const planned = Math.max(scheduled, seeded?.planned || 0);
  const done = seeded?.done || 0;
  const balance = Math.max(planned-done,0);
  const rate = planned ? Math.min(done/planned,1) : 0;
  return {planned,done,balance,rate,week};
}

function renderDashboard() {
  const m = dashboardMetrics();
  $("dashboardWeek").textContent = m.week;
  $("metricPlanned").textContent = m.planned;
  $("metricDone").textContent = m.done;
  $("metricBalance").textContent = m.balance;
  $("metricRate").textContent = `${Math.round(m.rate*100)}%`;

  $("ringRate").textContent = `${Math.round(m.rate*100)}%`;
  $("ringPlanned").textContent = m.planned;
  $("ringDone").textContent = m.done;
  $("ringPending").textContent = m.balance;
  const deg = Math.round(m.rate*360);
  $("progressRing").style.background = `conic-gradient(#12a66a 0deg, #12a66a ${deg}deg, #e7edf4 ${deg}deg, #e7edf4 360deg)`;

  const seed = state.dashboardSeed.map(x=>({...x}));
  const maxValue = Math.max(...seed.map(x=>Math.max(x.planned,x.done)),1);
  $("weeklyBars").innerHTML = seed.map(item=>{
    const plannedH = Math.max(5,Math.round((item.planned/maxValue)*178));
    const doneH = Math.max(5,Math.round((item.done/maxValue)*178));
    return `<div class="week-group">
      <div class="bar-pair" aria-label="${escapeHTML(item.week)}">
        <div class="bar planned" style="height:${plannedH}px"><span class="bar-value">${item.planned}</span></div>
        <div class="bar done" style="height:${doneH}px"><span class="bar-value">${item.done}</span></div>
      </div>
      <span class="week-label">${escapeHTML(item.week)}</span>
    </div>`;
  }).join("");

  $("activityBreakdownRows").innerHTML = state.activityStats.map(item=>{
    const pct = item.planned ? Math.round(item.done/item.planned*100) : 0;
    return `<div class="breakdown-row">
      <div class="activity-name">${escapeHTML(item.name)}<small>${item.done} de ${item.planned}</small></div>
      <div class="bar-track"><i style="width:${Math.min(pct,100)}%"></i></div>
      <div class="breakdown-value">${pct}%</div>
    </div>`;
  }).join("");

  const logs = [];
  state.rows.forEach(row=>{
    logEntries(row).forEach(log=>{
      logs.push({tag:row.TAG,log});
    });
  });
  logs.reverse();
  $("recentExecutions").innerHTML = logs.length ? logs.slice(0,5).map(item=>{
    const parts = item.log.split(" - ");
    const time = parts.shift() || "";
    const user = parts.join(" - ") || "Usuário";
    return `<div class="execution-item">
      <div class="exec-icon">✓</div>
      <div><strong>${escapeHTML(item.tag)}</strong><span>${escapeHTML(user)}</span></div>
      <span class="exec-time">${escapeHTML(time)}</span>
    </div>`;
  }).join("") : `<div class="empty-state inline"><strong>Nenhuma execução registrada.</strong></div>`;
}

/* =========================
   PROGRAMMING
   ========================= */
function loadProgramacoes() {
  const saved = localStorage.getItem("ppaProgramacoes");
  if (saved) {
    try {
      state.programacoes = JSON.parse(saved);
      return;
    } catch {}
  }
  state.programacoes = state.mockProgramacoes.map(x=>({...x}));
}

function persistProgramacoes() {
  localStorage.setItem("ppaProgramacoes", JSON.stringify(state.programacoes));
}

function setupProgrammingSelectors() {
  const weeks = weekOptions();
  $("programWeekFilter").innerHTML = `<option value="">Todas</option>${weeks}`;
  $("programWeek").innerHTML = weeks;
  $("programWeek").value = currentWeek();

  $("programActivityFilter").innerHTML = `<option value="">Todas</option>` +
    state.activities.map(a=>`<option value="${escapeHTML(a.name)}">${escapeHTML(a.name)}</option>`).join("");
  $("programActivity").innerHTML = state.activities.map(a=>`<option value="${escapeHTML(a.name)}">${escapeHTML(a.name)}</option>`).join("");

  $("programTeamFilter").innerHTML = `<option value="">Todas</option>` +
    state.teams.map(t=>`<option value="${escapeHTML(t.name)}">${escapeHTML(t.name)}</option>`).join("");
  $("programTeam").innerHTML = state.teams.map(t=>`<option value="${escapeHTML(t.name)}">${escapeHTML(t.name)}</option>`).join("");

  $("programResponsible").innerHTML = state.people.map(p=>`<option value="${escapeHTML(p)}">${escapeHTML(p)}</option>`).join("");
}

function filteredProgramacoes() {
  const week = $("programWeekFilter").value;
  const activity = $("programActivityFilter").value;
  const team = $("programTeamFilter").value;
  return state.programacoes.filter(p =>
    (!week || p.week===week) &&
    (!activity || p.activity===activity) &&
    (!team || p.team===team)
  ).sort((a,b)=>`${a.date}-${a.team}`.localeCompare(`${b.date}-${b.team}`));
}

function renderProgramacao() {
  setupProgrammingSelectors();
  const rows = filteredProgramacoes();
  $("programCount").textContent = rows.length;
  $("programQuantity").textContent = rows.reduce((s,r)=>s+Number(r.qty||0),0);

  $("programTableBody").innerHTML = rows.map(row=>`
    <tr>
      <td class="week-cell">${escapeHTML(row.week)}</td>
      <td>${escapeHTML(fmtDate(row.date))}</td>
      <td class="program-activity">${escapeHTML(row.activity)}</td>
      <td class="program-team">${escapeHTML(row.team)}</td>
      <td>${escapeHTML(row.responsible)}</td>
      <td class="program-qty">${escapeHTML(row.qty)}</td>
      <td class="program-note">${escapeHTML(row.note || "—")}</td>
      <td><button class="delete-program" data-program-id="${escapeHTML(row.id)}" title="Excluir">×</button></td>
    </tr>
  `).join("");

  $("programEmpty").classList.toggle("hidden", rows.length !== 0);
  document.querySelectorAll(".delete-program").forEach(btn=>{
    btn.onclick = () => deleteProgramacao(btn.dataset.programId);
  });
}

function openProgramModal() {
  $("programModal").classList.remove("hidden");
  $("programFormMessage").textContent = "";
  $("programDate").value = new Date().toISOString().slice(0,10);
  $("programWeek").value = currentWeek();
  $("programQtyInput").value = "1";
  $("programNote").value = "";
}

function closeProgramModal() {
  $("programModal").classList.add("hidden");
}

function deleteProgramacao(id) {
  state.programacoes = state.programacoes.filter(p=>p.id!==id);
  persistProgramacoes();
  renderProgramacao();
  renderDashboard();
  toast("Programação removida.");
}

function createProgramacao() {
  const row = {
    id:`p-${Date.now()}`,
    week:$("programWeek").value,
    date:$("programDate").value,
    activity:$("programActivity").value,
    team:$("programTeam").value,
    responsible:$("programResponsible").value,
    qty:Number($("programQtyInput").value),
    note:$("programNote").value.trim()
  };

  if (!row.week || !row.date || !row.activity || !row.team || !row.responsible || !row.qty || row.qty < 1) {
    $("programFormMessage").textContent = "Preencha todos os campos obrigatórios.";
    return;
  }

  state.programacoes.push(row);
  persistProgramacoes();
  closeProgramModal();
  renderProgramacao();
  renderDashboard();
  toast("Programação cadastrada com sucesso.");
}

/* =========================
   TECHNICIAN / PPA
   ========================= */
async function loadData() {
  if (!CONFIG.DATA_URL) {
    state.rows = state.mockRows.map(r=>({...r}));
    return;
  }
  const response = await fetch(CONFIG.DATA_URL,{method:"GET",headers:{"Accept":"application/json"}});
  if (!response.ok) throw new Error("Falha ao consultar a fonte de dados.");
  const payload = await response.json();
  state.rows = Array.isArray(payload) ? payload : (payload.value || payload.rows || []);
}

async function appendLog(row) {
  const name = state.currentUser?.nome || "Usuário";
  const entry = `${nowBR()} - ${name}`;
  const existing = String(row.Logs || "").trim();
  const newLogs = existing ? `${existing}\n${entry}` : entry;

  if (CONFIG.WRITE_URL) {
    const response = await fetch(CONFIG.WRITE_URL,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({TAG:row.TAG,Logs:newLogs})
    });
    if (!response.ok) throw new Error("Não foi possível atualizar o registro.");
  }

  row.Logs = newLogs;
  return entry;
}

function populateFilters() {
  const week = currentWeek();
  const rows = state.rows.filter(r=>String(r.Week).trim().toUpperCase()===week);
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
    String(r.Week).trim().toUpperCase()===week &&
    (!q || String(r.TAG).toLowerCase().includes(q)) &&
    (!sys || String(r.SYS)===sys) &&
    (!subsys || String(r.SUBSYS)===subsys)
  );
}

function counters(rows) {
  const done = rows.filter(hasLog).length;
  $("totalCount").textContent = rows.length;
  $("doneCount").textContent = done;
  $("pendingCount").textContent = rows.length-done;
}

function renderTable() {
  const rows = filteredRows();
  const body = $("tagTableBody");
  body.innerHTML = rows.map(r=>{
    const selected = r.TAG===state.selectedTag ? "selected" : "";
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

  body.querySelectorAll("tr").forEach(tr=>tr.onclick=()=>selectItem(tr.dataset.tag));
  $("emptyState").classList.toggle("hidden",rows.length!==0);
  counters(rows);

  if (!state.selectedTag && rows.length) selectItem(rows[0].TAG,false);
  else if (state.selectedTag && !rows.some(r=>r.TAG===state.selectedTag)) {
    state.selectedTag = null;
    clearSelection();
  }
}

function selectItem(tag,rerender=true) {
  const row = state.rows.find(r=>r.TAG===tag);
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
  $("selectedBadge").textContent = done ? "COM LOG" : "PENDENTE";
  $("selectedBadge").className = `tag-badge ${done?"done":"pending"}`;
  $("registerBtn").disabled = false;
  $("repeatBtn").disabled = !done;
  $("actionMessage").textContent = "";
  if (rerender) renderTable();
}

function clearSelection() {
  $("selectedTagTitle").textContent = "Selecione uma TAG";
  ["fieldTag","fieldLoop","fieldService","fieldType","fieldForn","fieldSys","fieldSubsys","fieldWeek","fieldDescription"].forEach(id=>$(id).textContent="—");
  $("fieldLog").textContent = "Não registrado";
  $("selectedBadge").textContent = "AGUARDANDO";
  $("selectedBadge").className = "tag-badge";
  $("registerBtn").disabled = true;
  $("repeatBtn").disabled = true;
}

async function registerPonto() {
  const row = state.rows.find(r=>r.TAG===state.selectedTag);
  if (!row) return;
  try {
    $("registerBtn").disabled = true;
    $("repeatBtn").disabled = true;
    const entry = await appendLog(row);
    selectItem(row.TAG);
    $("actionMessage").textContent = `Registro acrescentado: ${entry}`;
    toast("Ponto a ponto registrado.");
    renderHistory();
    renderDashboard();
  } catch(error) {
    toast(error.message || "Erro ao registrar.");
    selectItem(row.TAG);
  }
}

function renderHistory() {
  const rows = state.rows.filter(r=>String(r.Week).trim().toUpperCase()===currentWeek());
  const done = rows.filter(hasLog);
  $("historyDone").textContent = done.length;
  $("historyPending").textContent = rows.length-done.length;
  $("historyTotal").textContent = rows.length;

  const logs = [];
  rows.forEach(r=>logEntries(r).forEach(log=>logs.push({tag:r.TAG,log})));
  logs.reverse();
  $("historyLog").innerHTML = logs.length ? logs.slice(0,30).map(item=>{
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

function setupProfile() {
  const u = state.currentUser;
  if (!u) return;
  const initials = String(u.nome || "Usuário").trim().split(/\s+/).slice(0,2).map(x=>x[0]).join("").toUpperCase();
  $("profileAvatar").textContent = initials || "US";
  $("profileName").textContent = u.nome || "Usuário";
  $("profileName2").textContent = u.nome || "—";
  $("profileBadge").textContent = u.role === "admin" ? (u.email || "Administrador") : `Código: ${u.identificador || "—"}`;
  $("profileBadge2").textContent = u.role === "admin" ? (u.email || "—") : (u.identificador || "—");
  $("profileRole2").textContent = ROLE_LABELS[u.role] || "—";
  $("profileWeek").textContent = currentWeek();
  if (u.role === "admin") {
    $("profileRole2").textContent = "Administrador";
  }
}

function syncAll() {
  $("currentDateTime").textContent = nowBR();
  $("currentWeek").textContent = currentWeek();
  loadProgramacoes();
  if (state.role === "technician") {
    loadData().then(()=>{
      populateFilters();
      renderTable();
      renderHistory();
    }).catch(e=>toast(e.message || "Não foi possível sincronizar."));
  }
  if (state.role === "admin") {
    renderDashboard();
    renderProgramacao();
  }
}


/* =========================================================
   Rev. 4 — arquitetura modular + usuários/códigos + Excel
   ========================================================= */

const MODULE_DEFAULTS = [
  {
    id:"ppa", name:"Ponto a Ponto", description:"Execução e controle dos pontos a ponto de campo.",
    columns:[
      ["forn","FORN.","text",false],
      ["sys","SYS","text",false],
      ["subsys","SUBSYS","text",false],
      ["loop","LOOP","text",false],
      ["tag","TAG","text",true],
      ["service","SERVICE","text",false],
      ["type","TIPE","text",false],
      ["descricao","DESCRIÇÃO","text",false],
      ["week","WEEK","text",false],
      ["ponto_a_ponto","PONTO-A-PONTO","date",false],
      ["logs","LOGS","text",false]
    ].map(([key,label,type,required])=>({id:`col-${key}`,key,label,type,required,options:[]}))
  },
  {
    id:"loop", name:"Loop Teste", description:"Módulo independente para testes de loop e seus resultados.",
    columns:[
      ["forn","FORN.","text",false],["sys","SYS","text",true],["subsys","SUBSYS","text",false],["loop","LOOP","text",true],["tag","TAG","text",true],["teste","TESTE","text",true],["resultado","RESULTADO","select",true],["data_teste","DATA TESTE","date",false],["week","WEEK","text",true],["observacao","OBSERVAÇÃO","text",false]
    ].map(([key,label,type,required])=>({id:`col-${key}`,key,label,type,required,options:key==="resultado"?["APROVADO","REPROVADO","PENDENTE"]:[]}))
  },
  {
    id:"pres", name:"Preservação", description:"Módulo de preservação de equipamentos e acompanhamento de status.",
    columns:[
      ["forn","FORN.","text",false],["sys","SYS","text",true],["subsys","SUBSYS","text",false],["tag","TAG","text",true],["equipamento","EQUIPAMENTO","text",true],["metodo","MÉTODO","text",false],["data","DATA","date",false],["status","STATUS","select",true],["week","WEEK","text",true],["observacao","OBSERVAÇÃO","text",false]
    ].map(([key,label,type,required])=>({id:`col-${key}`,key,label,type,required,options:key==="status"?["ATIVO","PRESERVADO","BLOQUEADO","LIBERADO"]:[]}))
  }
];

const ACCESS_DEFAULTS = [
  {id:"u-1001",nome:"Carlos Técnico",funcao:"Técnico de Instrumentação",email:"carlos@empresa.com",codigo:"1001",role:"technician",team:"Equipe A",status:"ATIVO"},
  {id:"u-1002",nome:"Rafael Técnico",funcao:"Técnico de Campo",email:"rafael@empresa.com",codigo:"1002",role:"technician",team:"Equipe A",status:"ATIVO"},
  {id:"u-1003",nome:"Marcos Técnico",funcao:"Técnico de Testes",email:"marcos@empresa.com",codigo:"1003",role:"technician",team:"Equipe B",status:"ATIVO"},
  {id:"u-1004",nome:"João Técnico",funcao:"Técnico de Campo",email:"joao@empresa.com",codigo:"1004",role:"technician",team:"Equipe C",status:"INATIVO"}
];

function clone(v){ return JSON.parse(JSON.stringify(v)); }

function normalizeModules(){
  const saved=localStorage.getItem("ppaModules");
  if(saved){
    try{
      const parsed=JSON.parse(saved);
      state.moduleCatalog=Array.isArray(parsed)&&parsed.length?parsed:clone(MODULE_DEFAULTS);
      const ppa=state.moduleCatalog.find(m=>m.id==='ppa');
      const oldPpaKeys=['forn','sys','subsys','loop','tag','service','type','descricao','area','cabinet','week','programado','ponto_a_ponto'];
      if(ppa && Array.isArray(ppa.columns) && ppa.columns.map(c=>c.key).join('|')===oldPpaKeys.join('|')){
        const fresh=clone(MODULE_DEFAULTS.find(m=>m.id==='ppa'));
        ppa.columns=fresh.columns;
      }
    }catch{ state.moduleCatalog=clone(MODULE_DEFAULTS); }
  } else state.moduleCatalog=clone(MODULE_DEFAULTS);
  state.activities=state.moduleCatalog;
  localStorage.setItem("ppaModules",JSON.stringify(state.moduleCatalog));
  if(!state.selectedModuleId) state.selectedModuleId=state.moduleCatalog[0]?.id||null;
}

function persistModules(){
  state.activities=state.moduleCatalog;
  localStorage.setItem("ppaModules",JSON.stringify(state.moduleCatalog));
}

function normalizeAccesses(){
  const saved=localStorage.getItem("ppaAccesses");
  if(saved){try{state.accesses=JSON.parse(saved);if(!Array.isArray(state.accesses))throw 0;}catch{state.accesses=clone(ACCESS_DEFAULTS);}} else state.accesses=clone(ACCESS_DEFAULTS);
  localStorage.setItem("ppaAccesses",JSON.stringify(state.accesses));
}
function persistAccesses(){ localStorage.setItem("ppaAccesses",JSON.stringify(state.accesses)); }

function moduleById(id){ return state.moduleCatalog.find(m=>m.id===id)||null; }
function selectedModule(){ return moduleById(state.selectedModuleId); }
function makeKey(label){
  return String(label||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"").slice(0,40) || `campo_${Date.now()}`;
}
function columnTypeLabel(type){ return ({text:"Texto",number:"Número",date:"Data",select:"Lista",boolean:"Sim/Não"})[type]||"Texto"; }
function moduleRecordStore(){
  const saved=localStorage.getItem("ppaModuleRecords");
  if(!state.moduleRecords){
    try{state.moduleRecords=saved?JSON.parse(saved):{};}catch{state.moduleRecords={};}
    if(!state.moduleRecords||typeof state.moduleRecords!=="object") state.moduleRecords={};
  }
  return state.moduleRecords;
}
function persistModuleRecords(){ localStorage.setItem("ppaModuleRecords",JSON.stringify(moduleRecordStore())); }

function loadModuleCatalog(){ normalizeModules(); normalizeAccesses(); moduleRecordStore(); }

function currentUserLabel(){ return state.currentUser?.nome || "Usuário"; }

function loginTechnician(code){
  normalizeAccesses();
  const found=state.accesses.find(x=>String(x.codigo)===String(code).trim() && x.status==="ATIVO" && x.role==="technician");
  if(!found){ $("techLoginMessage").textContent="Código não encontrado, inativo ou sem permissão de técnico."; return; }
  state.currentUser={nome:found.nome,identificador:found.codigo,email:found.email,role:"technician",funcao:found.funcao,team:found.team};
  sessionStorage.setItem("ppaSession",JSON.stringify(state.currentUser));
  showAppForRole("technician"); syncAll();
}

function showAppForRole(role){
  state.role=role;
  $("loginScreen").classList.add("hidden");
  $("appShell").classList.remove("hidden");
  $("adminNav").classList.toggle("hidden",role!=="admin");
  $("techNav").classList.toggle("hidden",role!=="technician");
  $("roleBadge").textContent=ROLE_LABELS[role];
  $("sidebarRoleText").textContent=role==="admin"?"Painel administrativo":"Operação de campo";
  if(role==="admin"){
    $("topbarEyebrow").textContent="GESTÃO OPERACIONAL";
    $("topbarTitle").textContent="CONTROLE DE PONTO A PONTO";
    $("topbarSubtitle").textContent="Dashboard, programação e arquitetura dos módulos";
    nav("dashboard");
  } else {
    $("topbarEyebrow").textContent="OPERAÇÃO DE CAMPO";
    $("topbarTitle").textContent="CONTROLE DE PONTO A PONTO";
    $("topbarSubtitle").textContent="Acompanhe e registre os testes de campo em tempo real";
    nav("home");
  }
  setupProfile();
}

function nav(screen){
  const allowedAdmin=["dashboard","programacao","atividades","acessos","profile"];
  const allowedTech=["home","history","profile"];
  const allowed=state.role==="admin"?allowedAdmin:allowedTech;
  if(!allowed.includes(screen)) screen=state.role==="admin"?"dashboard":"home";
  document.querySelectorAll(".screen").forEach(s=>s.classList.remove("active-screen"));
  const target=$(`screen-${screen}`); if(target) target.classList.add("active-screen");
  document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.screen===screen));
  if(screen==="dashboard") renderDashboard();
  if(screen==="programacao") renderProgramacao();
  if(screen==="atividades") renderModules();
  if(screen==="acessos") renderAccesses();
  if(screen==="history") renderHistory();
}

function loginAdmin(email){
  state.currentUser={nome:"Administrador",email,identificador:email,role:"admin"};
  sessionStorage.setItem("ppaSession",JSON.stringify(state.currentUser)); showAppForRole("admin"); syncAll();
}

function setupProgrammingSelectors(){
  const currentWeekFilter=$("programWeekFilter").value;
  const currentActivityFilter=$("programActivityFilter").value;
  const currentTeamFilter=$("programTeamFilter").value;
  const weeks=weekOptions();
  $("programWeekFilter").innerHTML=`<option value="">Todas</option>${weeks}`;
  $("programWeekFilter").value=currentWeekFilter;
  if(!$("programWeekFilter").value && currentWeekFilter) $("programWeekFilter").value="";
  $("programWeek").innerHTML=weeks;
  $("programWeek").value=currentWeek();
  $("programActivityFilter").innerHTML=`<option value="">Todas</option>`+state.moduleCatalog.map(a=>`<option value="${escapeHTML(a.id)}">${escapeHTML(a.name)}</option>`).join("");
  $("programActivityFilter").value=currentActivityFilter;
  $("programActivity").innerHTML=state.moduleCatalog.map(a=>`<option value="${escapeHTML(a.id)}">${escapeHTML(a.name)}</option>`).join("");
  if(!$("programActivity").value) $("programActivity").value=state.moduleCatalog[0]?.id||"";
  $("programTeamFilter").innerHTML=`<option value="">Todas</option>`+state.teams.map(t=>`<option value="${escapeHTML(t.name)}">${escapeHTML(t.name)}</option>`).join("");
  $("programTeamFilter").value=currentTeamFilter;
  $("programTeam").innerHTML=state.teams.map(t=>`<option value="${escapeHTML(t.name)}">${escapeHTML(t.name)}</option>`).join("");
  const existing=$('programResponsible').value;
  $("programResponsible").innerHTML=state.accesses.filter(p=>p.status==="ATIVO"&&p.role==="technician").map(p=>`<option value="${escapeHTML(p.nome)}">${escapeHTML(p.nome)}</option>`).join("");
  if(existing) $("programResponsible").value=existing;
}

function weekOptions(){
  return [...new Set([currentWeek(),...state.dashboardSeed.map(x=>x.week),...state.programacoes.map(x=>x.week)])]
    .sort((a,b)=>Number(a.slice(1))-Number(b.slice(1))).map(w=>`<option value="${escapeHTML(w)}">${escapeHTML(w)}</option>`).join("");
}

function getPlanningColumnValue(column,row){ return row?.customData?.[column.key] ?? ""; }

function renderProgramCustomFields(activityId, values={}){
  const mod=moduleById(activityId); const host=$("programCustomFields"); if(!mod){host.innerHTML="";return;}
  host.innerHTML=mod.columns.filter(c=>!['week','date','activity','team','responsible','qty','note'].includes(c.key)).map(c=>{
    const value=values[c.key]??"";
    if(c.type==="select"){
      const opts=(c.options||[]).map(o=>`<option value="${escapeHTML(o)}" ${String(o)===String(value)?"selected":""}>${escapeHTML(o)}</option>`).join("");
      return `<div class="dynamic-field"><label>${escapeHTML(c.label)}${c.required?' *':''}<select data-custom-key="${escapeHTML(c.key)}" data-required="${c.required}"><option value="">Selecione</option>${opts}</select></label></div>`;
    }
    if(c.type==="boolean") return `<div class="dynamic-field"><label>${escapeHTML(c.label)}${c.required?' *':''}<select data-custom-key="${escapeHTML(c.key)}" data-required="${c.required}"><option value="">Selecione</option><option value="SIM" ${value==='SIM'?"selected":""}>SIM</option><option value="NÃO" ${value==='NÃO'?"selected":""}>NÃO</option></select></label></div>`;
    return `<div class="dynamic-field"><label>${escapeHTML(c.label)}${c.required?' *':''}<input data-custom-key="${escapeHTML(c.key)}" data-required="${c.required}" type="${c.type==="number"?"number":c.type==="date"?"date":"text"}" value="${escapeHTML(value)}"></label></div>`;
  }).join("");
}

function renderProgramacao(){
  setupProgrammingSelectors();
  const rows=filteredProgramacoes();
  const activityFilter=$("programActivityFilter").value;
  const selectedMod=activityFilter?moduleById(activityFilter):null;
  const customCols=selectedMod?.columns?.filter(c=>!['week','date','activity','team','responsible','qty','note'].includes(c.key))||[];
  $("programCount").textContent=rows.length;
  $("programQuantity").textContent=rows.reduce((s,r)=>s+Number(r.qty||0),0);
  const headCols=`<th>SEMANA</th><th>DATA</th><th>ATIVIDADE</th><th>EQUIPE</th><th>RESPONSÁVEL</th><th>QTD.</th>${customCols.map(c=>`<th>${escapeHTML(c.label)}</th>`).join('')}<th>OBSERVAÇÃO</th><th></th>`;
  const head=$("programTableBody").closest("table").querySelector("thead tr"); head.innerHTML=headCols;
  $("programTableBody").innerHTML=rows.map(row=>{
    const mod=moduleById(row.activity); const cols=activityFilter?customCols.map(c=>`<td>${escapeHTML(getPlanningColumnValue(c,row)||"—")}</td>`).join(""):"";
    return `<tr><td class="week-cell">${escapeHTML(row.week)}</td><td>${escapeHTML(fmtDate(row.date))}</td><td class="program-activity">${escapeHTML(mod?.name||row.activity)}</td><td class="program-team">${escapeHTML(row.team)}</td><td>${escapeHTML(row.responsible)}</td><td class="program-qty">${escapeHTML(row.qty)}</td>${cols}<td class="program-note">${escapeHTML(row.note||"—")}</td><td><button class="delete-program" data-program-id="${escapeHTML(row.id)}" title="Excluir">×</button></td></tr>`;
  }).join("");
  $("programEmpty").classList.toggle("hidden",rows.length!==0);
  $("programTableBody").querySelectorAll(".delete-program").forEach(btn=>btn.onclick=()=>deleteProgramacao(btn.dataset.programId));
}

function filteredProgramacoes(){
  const week=$("programWeekFilter").value, activity=$("programActivityFilter").value, team=$("programTeamFilter").value;
  return state.programacoes.filter(p=>(!week||p.week===week)&&(!activity||p.activity===activity)&&(!team||p.team===team)).sort((a,b)=>`${a.date}-${a.team}`.localeCompare(`${b.date}-${b.team}`));
}

function openProgramModal(){
  $("programModal").classList.remove("hidden"); $("programFormMessage").textContent="";
  $("programDate").value=new Date().toISOString().slice(0,10); $("programWeek").value=currentWeek(); $("programQtyInput").value="1"; $("programNote").value="";
  setupProgrammingSelectors(); renderProgramCustomFields($("programActivity").value);
}
function closeProgramModal(){ $("programModal").classList.add("hidden"); }
function deleteProgramacao(id){ state.programacoes=state.programacoes.filter(p=>p.id!==id); persistProgramacoes(); renderProgramacao(); renderDashboard(); toast("Programação removida."); }
function createProgramacao(){
  const customData={}; let invalid=false;
  document.querySelectorAll("#programCustomFields [data-custom-key]").forEach(input=>{ customData[input.dataset.customKey]=input.value.trim(); if(input.dataset.required==="true"&&!input.value.trim()) invalid=true; });
  const row={id:`p-${Date.now()}`,week:$("programWeek").value,date:$("programDate").value,activity:$("programActivity").value,team:$("programTeam").value,responsible:$("programResponsible").value,qty:Number($("programQtyInput").value),note:$("programNote").value.trim(),customData};
  if(!row.week||!row.date||!row.activity||!row.team||!row.responsible||!row.qty||row.qty<1||invalid){ $("programFormMessage").textContent="Preencha os campos obrigatórios do planejamento e do módulo.";return; }
  state.programacoes.push(row); persistProgramacoes(); closeProgramModal(); renderProgramacao(); renderDashboard(); toast("Programação cadastrada com a estrutura do módulo.");
}

function persistProgramacoes(){ localStorage.setItem("ppaProgramacoes",JSON.stringify(state.programacoes)); }
function loadProgramacoes(){
  const saved=localStorage.getItem("ppaProgramacoes");
  let parsed=null;
  if(saved){try{parsed=JSON.parse(saved);if(!Array.isArray(parsed))parsed=null;}catch{parsed=null;}}
  state.programacoes=parsed||clone(state.mockProgramacoes);
  /* compatibilidade: versões anteriores guardavam o nome da atividade,
     enquanto a arquitetura modular passa a guardar o ID do módulo. */
  state.programacoes=state.programacoes.map(p=>{
    if(!p.activity)return p;
    const mod=state.moduleCatalog?.find(m=>m.id===p.activity)||state.moduleCatalog?.find(m=>m.name===p.activity);
    return mod?{...p,activity:mod.id,customData:p.customData||{}}:{...p,customData:p.customData||{}};
  });
  persistProgramacoes();
}

/* ---------- MÓDULOS / COLUNAS ---------- */
function renderModules(){
  normalizeModules();
  const mods=state.moduleCatalog; $("moduleCountBadge").textContent=mods.length;
  $("moduleCards").innerHTML=mods.map(m=>`<button class="module-card ${m.id===state.selectedModuleId?'active':''}" data-module-id="${escapeHTML(m.id)}"><h4>${escapeHTML(m.name)}</h4><p>${escapeHTML(m.description||"Sem descrição")}</p><div class="module-card-meta"><span><b>${m.columns.length}</b> colunas</span><span><b>${(moduleRecordStore()[m.id]||[]).length}</b> registros</span></div></button>`).join("");
  $("moduleCards").querySelectorAll(".module-card").forEach(btn=>btn.onclick=()=>{state.selectedModuleId=btn.dataset.moduleId;renderModules();});
  const mod=selectedModule();
  $("moduleEditorEmpty").classList.toggle("hidden",!!mod); $("moduleEditor").classList.toggle("hidden",!mod); if(!mod)return;
  $("moduleTitle").textContent=mod.name; $("moduleDescription").textContent=mod.description||""; $("moduleColumnCount").textContent=mod.columns.length; $("moduleRequiredCount").textContent=mod.columns.filter(c=>c.required).length; $("moduleRecordCount").textContent=(moduleRecordStore()[mod.id]||[]).length; $("maskFileName").textContent=`mascara_${makeKey(mod.name)}.xlsx`;
  $("columnRows").innerHTML=mod.columns.map((c,i)=>`<div class="column-row" draggable="true" data-column-id="${escapeHTML(c.id)}"><div class="column-grip" title="Arraste para mover">☷</div><div class="column-order"><button class="mini-btn" data-move-column-up="${escapeHTML(c.id)}" title="Mover para cima" ${i===0?'disabled':''}>↑</button><button class="mini-btn" data-move-column-down="${escapeHTML(c.id)}" title="Mover para baixo" ${i===mod.columns.length-1?'disabled':''}>↓</button></div><div class="column-info"><strong>${escapeHTML(c.label)}</strong><small>${escapeHTML(c.key)}</small></div><div class="column-type"><span class="module-badge">${columnTypeLabel(c.type)}</span></div><div class="column-required">${c.required?'Obrigatória':'Opcional'}</div><div class="drag-hint">${c.type==='select'?(c.options||[]).join(', ')||'Sem opções':''}</div><div class="column-actions"><button class="mini-btn" data-edit-column="${escapeHTML(c.id)}" title="Editar">✎</button><button class="mini-btn danger" data-delete-column="${escapeHTML(c.id)}" title="Excluir">×</button></div></div>`).join("");
  $("columnRows").querySelectorAll("[data-edit-column]").forEach(b=>b.onclick=()=>openColumnModal(b.dataset.editColumn));
  $("columnRows").querySelectorAll("[data-delete-column]").forEach(b=>b.onclick=()=>deleteColumn(b.dataset.deleteColumn));
  $("columnRows").querySelectorAll("[data-move-column-up]").forEach(b=>b.onclick=()=>moveColumn(b.dataset.moveColumnUp,-1));
  $("columnRows").querySelectorAll("[data-move-column-down]").forEach(b=>b.onclick=()=>moveColumn(b.dataset.moveColumnDown,1));
  setupColumnDragDrop(); renderMaskPreview(mod);
}

function setupColumnDragDrop(){
  const list=$("columnRows"); let dragged=null;
  list.querySelectorAll(".column-row").forEach(row=>{ row.addEventListener("dragstart",()=>{dragged=row.dataset.columnId;row.classList.add("dragging")}); row.addEventListener("dragend",()=>row.classList.remove("dragging")); row.addEventListener("dragover",e=>{e.preventDefault();row.classList.add("drag-over")}); row.addEventListener("dragleave",()=>row.classList.remove("drag-over")); row.addEventListener("drop",e=>{e.preventDefault();row.classList.remove("drag-over"); if(!dragged||dragged===row.dataset.columnId)return; const mod=selectedModule(); const a=mod.columns.findIndex(c=>c.id===dragged), b=mod.columns.findIndex(c=>c.id===row.dataset.columnId); if(a<0||b<0)return; const [moved]=mod.columns.splice(a,1); mod.columns.splice(b,0,moved); persistModules(); renderModules(); }); });
}

function openActivityModal(id=null){
  $("activityModal").classList.remove("hidden"); $("activityFormMessage").textContent=""; state.editingModuleId=id;
  const m=id?moduleById(id):null; $("activityModalTitle").textContent=m?"Editar atividade":"Nova atividade"; $("activityNameInput").value=m?.name||""; $("activityDescriptionInput").value=m?.description||"";
}
function closeActivityModal(){ $("activityModal").classList.add("hidden"); state.editingModuleId=null; }
function saveActivity(){
  const name=$("activityNameInput").value.trim(), description=$("activityDescriptionInput").value.trim(); if(!name){$("activityFormMessage").textContent="Informe o nome da atividade.";return;}
  const duplicate=state.moduleCatalog.some(m=>m.name.toLowerCase()===name.toLowerCase()&&m.id!==state.editingModuleId); if(duplicate){$("activityFormMessage").textContent="Já existe um módulo com esse nome.";return;}
  if(state.editingModuleId){ const m=moduleById(state.editingModuleId); m.name=name;m.description=description; }
  else { const id=`mod-${Date.now()}`; state.moduleCatalog.push({id,name,description,columns:[]}); state.selectedModuleId=id; }
  persistModules(); closeActivityModal(); renderModules(); setupProgrammingSelectors(); toast("Módulo de atividade salvo.");
}
function deleteActivity(){
  const m=selectedModule(); if(!m)return; state.pendingDeleteModuleId=m.id; $("deleteModuleText").textContent=`A atividade “${m.name}”, suas colunas e registros importados serão removidos. As programações vinculadas também serão excluídas.`; $("deleteModuleConfirm").classList.remove("hidden");
}
function confirmDeleteActivity(){
  const id=state.pendingDeleteModuleId; if(!id)return; state.moduleCatalog=state.moduleCatalog.filter(m=>m.id!==id); delete moduleRecordStore()[id]; state.programacoes=state.programacoes.filter(p=>p.activity!==id); persistModules(); persistModuleRecords(); persistProgramacoes(); state.selectedModuleId=state.moduleCatalog[0]?.id||null; $("deleteModuleConfirm").classList.add("hidden"); renderModules(); renderProgramacao(); renderDashboard(); toast("Módulo excluído.");
}

function openColumnModal(id=null){
  const mod=selectedModule(); if(!mod)return; state.editingColumnId=id; const c=id?mod.columns.find(x=>x.id===id):null;
  $("columnModalTitle").textContent=c?"Editar coluna":"Nova coluna"; $("columnLabelInput").value=c?.label||""; $("columnKeyInput").value=c?.key||""; $("columnTypeInput").value=c?.type||"text"; $("columnRequiredInput").checked=!!c?.required; $("columnOptionsInput").value=(c?.options||[]).join(", "); $("columnFormMessage").textContent=""; $("columnModal").classList.remove("hidden");
}
function closeColumnModal(){ $("columnModal").classList.add("hidden"); state.editingColumnId=null; }
function saveColumn(){
  const mod=selectedModule(); if(!mod)return;
  const label=$("columnLabelInput").value.trim(); let key=makeKey($("columnKeyInput").value.trim()||label); const type=$("columnTypeInput").value; const required=$("columnRequiredInput").checked; const options=$("columnOptionsInput").value.split(",").map(x=>x.trim()).filter(Boolean);
  if(!label){$("columnFormMessage").textContent="Informe o nome exibido.";return;}
  if(mod.columns.some(c=>c.key===key&&c.id!==state.editingColumnId)){ $("columnFormMessage").textContent="A chave desta coluna já existe neste módulo.";return; }
  if(state.editingColumnId){ const c=mod.columns.find(x=>x.id===state.editingColumnId); Object.assign(c,{label,key,type,required,options:type==='select'?options:[]}); }
  else mod.columns.push({id:`col-${Date.now()}`,label,key,type,required,options:type==='select'?options:[]});
  persistModules(); closeColumnModal(); renderModules(); toast("Coluna salva.");
}
function deleteColumn(id){ const mod=selectedModule(); if(!mod)return; if(!confirm(`Excluir a coluna “${mod.columns.find(c=>c.id===id)?.label||''}”?`))return; mod.columns=mod.columns.filter(c=>c.id!==id); persistModules(); renderModules(); toast("Coluna excluída."); }
function moveColumn(id,direction){
  const mod=selectedModule(); if(!mod)return;
  const index=mod.columns.findIndex(c=>c.id===id); if(index<0)return;
  const target=index+direction; if(target<0||target>=mod.columns.length)return;
  [mod.columns[index],mod.columns[target]]=[mod.columns[target],mod.columns[index]];
  persistModules(); renderModules();
}

function renderMaskPreview(mod){
  const header=mod.columns.map(c=>`<th>${escapeHTML(c.label)}${c.required?' *':''}</th>`).join("");
  const sample=mod.columns.map(c=>`<td>${c.type==='date'?"AAAA-MM-DD":c.type==='number'?"0":c.type==='select'?(c.options?.[0]||"OPÇÃO"):c.type==='boolean'?"SIM":"—"}</td>`).join("");
  $("maskPreviewTable").innerHTML=`<thead><tr>${header}</tr></thead><tbody><tr>${sample}</tr><tr>${mod.columns.map(()=>"<td></td>").join("")}</tr></tbody>`;
}

/* ---------- EXCEL ---------- */
function exportModuleMask(){
  const mod=selectedModule(); if(!mod){toast("Selecione um módulo.");return;}
  const headers=mod.columns.map(c=>c.label); const blank=Array(mod.columns.length).fill("");
  if(window.XLSX){
    const ws=XLSX.utils.aoa_to_sheet([headers,blank]); const info=[["Módulo",mod.name],["Instruções","Não altere os cabeçalhos. Campos com * são obrigatórios."],["Colunas",mod.columns.length],["Tipos",mod.columns.map(c=>`${c.label}: ${columnTypeLabel(c.type)}`).join(" | ")]]; const infoWs=XLSX.utils.aoa_to_sheet(info); const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,"Importação"); XLSX.utils.book_append_sheet(wb,infoWs,"Leia-me"); XLSX.writeFile(wb,`mascara_${makeKey(mod.name)}.xlsx`);
  } else exportCSV(mod,headers,blank);
  toast(`Máscara de ${mod.name} exportada.`);
}
function exportCSV(mod,headers,blank){ const esc=v=>`"${String(v??"").replace(/"/g,'""')}"`; const csv=[headers,blank].map(row=>row.map(esc).join(";")).join("\n"); const blob=new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8;"}); const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=`mascara_${makeKey(mod.name)}.csv`; a.click(); URL.revokeObjectURL(a.href); }
function triggerModuleImport(){ $("moduleExcelInput").value=""; $("moduleExcelInput").click(); }
async function importModuleFile(file){
  const mod=selectedModule(); if(!mod||!file)return;
  try{
    let rows=[];
    if(window.XLSX){ const data=await file.arrayBuffer(); const wb=XLSX.read(data,{type:"array",cellDates:true}); const sheet=wb.Sheets[wb.SheetNames[0]]; rows=XLSX.utils.sheet_to_json(sheet,{header:1,defval:"",raw:false}); }
    else { const text=await file.text(); rows=text.split(/\r?\n/).filter(Boolean).map(line=>line.split(/;|,/).map(v=>v.replace(/^"|"$/g,"").trim())); }
    if(!rows.length){throw new Error("Arquivo sem dados.");}
    const headers=rows[0].map(h=>String(h||"").trim()); const normalizedHeaders=headers.map(h=>makeKey(h));
    const expected=mod.columns.map(c=>makeKey(c.label)); const missing=mod.columns.filter((c,i)=>c.required&&!headers.some(h=>makeKey(h)===makeKey(c.label)&&h!==""));
    if(missing.length) throw new Error(`Colunas obrigatórias ausentes: ${missing.map(c=>c.label).join(", ")}.`);
    const imported=rows.slice(1).filter(r=>r.some(v=>String(v??"").trim()!=="")).map(r=>{ const obj={}; mod.columns.forEach(c=>{ const idx=normalizedHeaders.findIndex(h=>h===makeKey(c.label)||h===makeKey(c.key)); if(idx>=0)obj[c.key]=r[idx]??""; }); return obj; });
    moduleRecordStore()[mod.id]=imported; persistModuleRecords();
    if(mod.id==="ppa") syncImportedPpa(imported,mod);
    $("importResultMessage").classList.add("ok"); $("importResultMessage").textContent=`Importação concluída: ${imported.length} registros carregados no módulo ${mod.name}.`;
    renderModules(); renderDashboard(); toast("Excel importado com sucesso.");
  }catch(e){ $("importResultMessage").classList.remove("ok"); $("importResultMessage").textContent=e.message||"Não foi possível importar o arquivo."; }
}
function syncImportedPpa(records,mod){
  const read=(r,keys)=>{for(const k of keys){ if(r[k]!==undefined && String(r[k]).trim()!=="") return r[k]; }return "";};
  const mapped=records.map(r=>({FORN:read(r,["forn"]),SYS:read(r,["sys"]),SUBSYS:read(r,["subsys"]),LOOP:read(r,["loop"]),TAG:read(r,["tag"]),SERVICE:read(r,["service"]),TIPE:read(r,["type","tipe"]),DESCRIÇÃO:read(r,["descricao","descrição"]),Week:read(r,["week"]),Logs:""})).filter(r=>r.TAG);
  if(mapped.length){ state.rows=mapped; localStorage.setItem("ppaImportedRows",JSON.stringify(mapped)); }
}

/* ---------- ACESSOS ---------- */
function renderAccesses(){
  normalizeAccesses(); const q=$("accessSearch")?.value.trim().toLowerCase()||""; const rows=state.accesses.filter(u=>!q||[u.nome,u.email,u.funcao,u.team,u.codigo].some(v=>String(v||"").toLowerCase().includes(q)));
  $("accessTotal").textContent=state.accesses.length; $("accessActive").textContent=state.accesses.filter(u=>u.status==="ATIVO").length; $("accessCodes").textContent=state.accesses.filter(u=>u.codigo).length;
  $("accessTableBody").innerHTML=rows.map(u=>`<tr><td><strong>${escapeHTML(u.nome)}</strong></td><td>${escapeHTML(u.funcao)}</td><td>${escapeHTML(u.email||"—")}</td><td class="tag-cell">${escapeHTML(u.codigo)}</td><td>${escapeHTML(u.team||"—")}</td><td>${u.role==='admin'?'Administrador':'Técnico'}</td><td><span class="status-chip ${u.status==='ATIVO'?'active':'inactive'}">${u.status}</span></td><td><div class="profile-list-actions"><button class="mini-btn" data-edit-access="${escapeHTML(u.id)}" title="Editar">✎</button><button class="mini-btn danger" data-delete-access="${escapeHTML(u.id)}" title="Excluir">×</button></div></td></tr>`).join("");
  $("accessEmpty").classList.toggle("hidden",rows.length!==0);
  $("accessTableBody").querySelectorAll("[data-edit-access]").forEach(b=>b.onclick=()=>openAccessModal(b.dataset.editAccess));
  $("accessTableBody").querySelectorAll("[data-delete-access]").forEach(b=>b.onclick=()=>deleteAccess(b.dataset.deleteAccess));
  $("accessTeamInput").innerHTML=state.teams.map(t=>`<option value="${escapeHTML(t.name)}">${escapeHTML(t.name)}</option>`).join("");
}
function randomAccessCode(){
  normalizeAccesses(); let code=""; do{code=String(Math.floor(1000+Math.random()*9000));}while(state.accesses.some(u=>String(u.codigo)===code)); return code;
}
function openAccessModal(id=null){
  normalizeAccesses(); state.editingAccessId=id; const u=id?state.accesses.find(x=>x.id===id):null; $("accessModalTitle").textContent=u?"Editar usuário":"Novo usuário"; $("accessNameInput").value=u?.nome||""; $("accessFunctionInput").value=u?.funcao||""; $("accessEmailInput").value=u?.email||""; $("accessCodeInput").value=u?.codigo||randomAccessCode(); $("accessRoleInput").value=u?.role||"technician"; $("accessStatusInput").value=u?.status||"ATIVO"; $("accessFormMessage").textContent=""; $("accessTeamInput").innerHTML=state.teams.map(t=>`<option value="${escapeHTML(t.name)}">${escapeHTML(t.name)}</option>`).join(""); $("accessTeamInput").value=u?.team||state.teams[0]?.name||""; $("accessModal").classList.remove("hidden");
}
function closeAccessModal(){ $("accessModal").classList.add("hidden");state.editingAccessId=null; }
function saveAccess(){
  const nome=$("accessNameInput").value.trim(), funcao=$("accessFunctionInput").value.trim(), email=$("accessEmailInput").value.trim(), codigo=$("accessCodeInput").value.trim(), role=$("accessRoleInput").value, status=$("accessStatusInput").value, team=$("accessTeamInput").value;
  if(!nome||!funcao||!codigo){$("accessFormMessage").textContent="Nome, função e código são obrigatórios.";return;}
  const duplicate=state.accesses.some(u=>String(u.codigo)===codigo&&u.id!==state.editingAccessId); if(duplicate){$("accessFormMessage").textContent="Este código já está sendo usado por outra pessoa.";return;}
  const obj={nome,funcao,email,codigo,role,status,team};
  if(state.editingAccessId){ const u=state.accesses.find(x=>x.id===state.editingAccessId); Object.assign(u,obj); }
  else state.accesses.push({id:`u-${Date.now()}`,...obj});
  persistAccesses(); closeAccessModal(); renderAccesses(); setupProgrammingSelectors(); toast("Usuário e código de acesso salvos.");
}
function deleteAccess(id){ const u=state.accesses.find(x=>x.id===id); if(!u)return; if(!confirm(`Excluir o usuário “${u.nome}”?`))return; state.accesses=state.accesses.filter(x=>x.id!==id); persistAccesses(); renderAccesses(); setupProgrammingSelectors(); toast("Usuário excluído."); }

/* ---------- PROFILE / SYNC ---------- */
function setupProfile(){
  const u=state.currentUser;if(!u)return; const initials=String(u.nome||"Usuário").trim().split(/\s+/).slice(0,2).map(x=>x[0]).join("").toUpperCase(); $("profileAvatar").textContent=initials||"US"; $("profileName").textContent=u.nome||"Usuário"; $("profileName2").textContent=u.nome||"—"; $("profileBadge").textContent=u.role==="admin"?(u.email||"Administrador"):`Código: ${u.identificador||"—"}`; $("profileBadge2").textContent=u.role==="admin"?(u.email||"—"):(u.identificador||"—"); $("profileRole2").textContent=ROLE_LABELS[u.role]||"—"; $("profileWeek").textContent=currentWeek();
}
function loadData(){
  const imported=localStorage.getItem("ppaImportedRows"); if(imported){try{const parsed=JSON.parse(imported);if(Array.isArray(parsed)&&parsed.length){state.rows=parsed;return;}}catch{}}
  if(!CONFIG.DATA_URL){ state.rows=clone(state.mockRows); return; }
  return fetch(CONFIG.DATA_URL,{method:"GET",headers:{Accept:"application/json"}}).then(r=>{if(!r.ok)throw new Error("Falha ao consultar a fonte de dados.");return r.json();}).then(payload=>{state.rows=Array.isArray(payload)?payload:(payload.value||payload.rows||[]);});
}
async function appendLog(row){
  const entry=`${nowBR()} - ${currentUserLabel()}`, existing=String(row.Logs||"").trim(), newLogs=existing?`${existing}\n${entry}`:entry;
  if(CONFIG.WRITE_URL){const response=await fetch(CONFIG.WRITE_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({TAG:row.TAG,Logs:newLogs})});if(!response.ok)throw new Error("Não foi possível atualizar o registro.");}
  row.Logs=newLogs; localStorage.setItem("ppaImportedRows",JSON.stringify(state.rows)); return entry;
}

function syncAll(){
  loadModuleCatalog(); loadProgramacoes(); $("currentDateTime").textContent=nowBR(); $("currentWeek").textContent=currentWeek();
  if(state.role==="technician") loadData().then(()=>{populateFilters();renderTable();renderHistory();}).catch(e=>toast(e.message||"Não foi possível sincronizar."));
  if(state.role==="admin"){renderDashboard();renderProgramacao();renderModules();renderAccesses();}
}

/* ---------- MODAL EVENTS ---------- */

document.querySelectorAll(".access-option").forEach(btn=>btn.addEventListener("click",()=>showLogin(btn.dataset.role)));
document.querySelectorAll("[data-back-login]").forEach(btn=>btn.addEventListener("click",backToAccessChooser));
$("adminLoginForm").addEventListener("submit",e=>{e.preventDefault();const email=$("adminEmail").value.trim(),password=$("adminPassword").value;$("adminLoginMessage").classList.remove("ok");if(!email||password.length<4){$("adminLoginMessage").textContent="Informe um e-mail e uma senha válida.";return;}loginAdmin(email);});
$("technicianLoginForm").addEventListener("submit",e=>{e.preventDefault();const code=$("techAccessCode").value.trim();$("techLoginMessage").classList.remove("ok");if(!code){$("techLoginMessage").textContent="Informe o código de acesso.";return;}loginTechnician(code);});
document.querySelectorAll(".nav-item").forEach(b=>b.onclick=()=>nav(b.dataset.screen));

$("newProgramacaoBtn").onclick=openProgramModal; $("closeProgramModal").onclick=closeProgramModal; $("cancelProgramModal").onclick=closeProgramModal; $("programModal").querySelector(".modal-backdrop").onclick=closeProgramModal; $("programForm").addEventListener("submit",e=>{e.preventDefault();createProgramacao();});
$("programWeekFilter").onchange=renderProgramacao; $("programActivityFilter").onchange=renderProgramacao; $("programTeamFilter").onchange=renderProgramacao; $("programActivity").onchange=()=>renderProgramCustomFields($("programActivity").value);
$("refreshDashboard").onclick=()=>{renderDashboard();toast("Dashboard atualizado.");};
$("tagSearch").addEventListener("input",()=>{$("clearSearch").style.display=$("tagSearch").value?"block":"none";renderTable();}); $("clearSearch").onclick=()=>{$("tagSearch").value="";$("clearSearch").style.display="none";renderTable();}; $("sysFilter").onchange=renderTable;$("subsysFilter").onchange=renderTable; $("registerBtn").onclick=registerPonto; $("repeatBtn").onclick=()=>$("confirmModal").classList.remove("hidden"); ["closeModal","cancelModal"].forEach(id=>$(id).onclick=()=>$("confirmModal").classList.add("hidden")); $("confirmModal").querySelector(".modal-backdrop").onclick=()=>$("confirmModal").classList.add("hidden"); $("confirmRepeat").onclick=()=>{$("confirmModal").classList.add("hidden");registerPonto();}; $("refreshHistory").onclick=async()=>{await loadData();populateFilters();renderTable();renderHistory();toast("Dados atualizados.");}; $("logoutBtn").onclick=logout;

/* módulos */
$("newActivityBtn").onclick=()=>openActivityModal(); $("editActivityBtn").onclick=()=>openActivityModal(state.selectedModuleId); $("deleteActivityBtn").onclick=deleteActivity; $("newColumnBtn").onclick=()=>openColumnModal(); $("exportModuleMaskBtn").onclick=exportModuleMask; $("importModuleMaskBtn").onclick=triggerModuleImport; $("moduleExcelInput").addEventListener("change",e=>importModuleFile(e.target.files[0]));
$("closeActivityModal").onclick=closeActivityModal; $("cancelActivityModal").onclick=closeActivityModal; $("activityModal").querySelector(".modal-backdrop").onclick=closeActivityModal; $("activityForm").addEventListener("submit",e=>{e.preventDefault();saveActivity();});
$("closeColumnModal").onclick=closeColumnModal; $("cancelColumnModal").onclick=closeColumnModal; $("columnModal").querySelector(".modal-backdrop").onclick=closeColumnModal; $("columnForm").addEventListener("submit",e=>{e.preventDefault();saveColumn();});
$("closeDeleteModuleConfirm").onclick=()=>$("deleteModuleConfirm").classList.add("hidden"); $("cancelDeleteModule").onclick=()=>$("deleteModuleConfirm").classList.add("hidden"); $("deleteModuleConfirm").querySelector(".modal-backdrop").onclick=()=>$("deleteModuleConfirm").classList.add("hidden"); $("confirmDeleteModule").onclick=confirmDeleteActivity;

/* acessos */
$("newAccessBtn").onclick=()=>openAccessModal(); $("closeAccessModal").onclick=closeAccessModal; $("cancelAccessModal").onclick=closeAccessModal; $("accessModal").querySelector(".modal-backdrop").onclick=closeAccessModal; $("accessForm").addEventListener("submit",e=>{e.preventDefault();saveAccess();}); $("generateAccessCodeBtn").onclick=()=>$("accessCodeInput").value=randomAccessCode(); $("accessSearch").addEventListener("input",renderAccesses);

setInterval(()=>{$("currentDateTime").textContent=nowBR();$("currentWeek").textContent=currentWeek();},1000);

(async function init(){
  loadModuleCatalog(); loadProgramacoes(); $("currentDateTime").textContent=nowBR(); $("currentWeek").textContent=currentWeek();
  const saved=sessionStorage.getItem("ppaSession");
  if(saved){try{const session=JSON.parse(saved);if(session?.role&&ROLE_LABELS[session.role]){state.currentUser=session;showAppForRole(session.role);syncAll();return;}}catch{}}
  backToAccessChooser();
})();
