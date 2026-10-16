/* Planning Pro · admin/relatorios.js
 * Relatórios com filtros de semana, atividade e equipe.
 */
"use strict";

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
