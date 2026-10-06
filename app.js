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

/* =========================
   EVENTS
   ========================= */
document.querySelectorAll(".access-option").forEach(btn=>{
  btn.addEventListener("click",()=>showLogin(btn.dataset.role));
});
document.querySelectorAll("[data-back-login]").forEach(btn=>btn.addEventListener("click",backToAccessChooser));

$("adminLoginForm").addEventListener("submit",e=>{
  e.preventDefault();
  const email = $("adminEmail").value.trim();
  const password = $("adminPassword").value;
  $("adminLoginMessage").classList.remove("ok");
  if (!email || password.length < 4) {
    $("adminLoginMessage").textContent = "Informe um e-mail e uma senha válida.";
    return;
  }
  loginAdmin(email);
});

$("technicianLoginForm").addEventListener("submit",e=>{
  e.preventDefault();
  const code = $("techAccessCode").value.trim();
  $("techLoginMessage").classList.remove("ok");
  if (!code) {
    $("techLoginMessage").textContent = "Informe o código de acesso.";
    return;
  }
  loginTechnician(code);
});

document.querySelectorAll(".nav-item").forEach(b=>b.onclick=()=>nav(b.dataset.screen));

$("newProgramacaoBtn").onclick = openProgramModal;
$("closeProgramModal").onclick = closeProgramModal;
$("cancelProgramModal").onclick = closeProgramModal;
$("programModal").querySelector(".modal-backdrop").onclick = closeProgramModal;
$("programForm").addEventListener("submit",e=>{
  e.preventDefault();
  createProgramacao();
});
$("programWeekFilter").onchange = renderProgramacao;
$("programActivityFilter").onchange = renderProgramacao;
$("programTeamFilter").onchange = renderProgramacao;
$("refreshDashboard").onclick = ()=>{ renderDashboard(); toast("Dashboard atualizado."); };

$("tagSearch").addEventListener("input",()=>{
  $("clearSearch").style.display = $("tagSearch").value ? "block" : "none";
  renderTable();
});
$("clearSearch").onclick=()=>{
  $("tagSearch").value="";
  $("clearSearch").style.display="none";
  renderTable();
};
$("sysFilter").onchange=renderTable;
$("subsysFilter").onchange=renderTable;
$("registerBtn").onclick=registerPonto;
$("repeatBtn").onclick=()=>$("confirmModal").classList.remove("hidden");
["closeModal","cancelModal"].forEach(id=>$(id).onclick=()=>$("confirmModal").classList.add("hidden"));
$("confirmModal").querySelector(".modal-backdrop").onclick=()=>$("confirmModal").classList.add("hidden");
$("confirmRepeat").onclick=()=>{
  $("confirmModal").classList.add("hidden");
  registerPonto();
};
$("refreshHistory").onclick=async()=>{
  await loadData();
  populateFilters();
  renderTable();
  renderHistory();
  toast("Dados atualizados.");
};
$("logoutBtn").onclick=logout;

setInterval(()=>{
  $("currentDateTime").textContent = nowBR();
  $("currentWeek").textContent = currentWeek();
},1000);

(async function init(){
  loadProgramacoes();
  $("currentDateTime").textContent = nowBR();
  $("currentWeek").textContent = currentWeek();

  const saved = sessionStorage.getItem("ppaSession");
  if (saved) {
    try {
      const session = JSON.parse(saved);
      if (session?.role && ROLE_LABELS[session.role]) {
        state.currentUser = session;
        showAppForRole(session.role);
        syncAll();
        return;
      }
    } catch {}
  }
  backToAccessChooser();
})();
