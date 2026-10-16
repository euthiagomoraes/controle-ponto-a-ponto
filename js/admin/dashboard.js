/* Planning Pro · admin/dashboard.js
 * Dashboard: KPIs da semana, evolução, equipes, atividades, backlog e apontamentos.
 */
"use strict";

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
