/* Planning Pro · core/graficos.js
 * Agregações (programado x executado) e gráficos: barras com tendência e listas de progresso.
 */
"use strict";

/* =========================================================
   ESTATÍSTICAS
   ========================================================= */

function summarize(programs) {
  const total = programs.length;
  const done = programs.filter(isDone).length;
  return { total, done, pending: total - done, rate: pct(done, total) };
}

function groupBy(programs, keyOf, labelOf) {
  const map = new Map();
  programs.forEach(p => {
    const key = keyOf(p) ?? "";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(p);
  });
  return [...map.entries()]
    .map(([key, list]) => ({ key, label: labelOf(key), ...summarize(list) }))
    .sort((a, b) => b.total - a.total || String(a.label).localeCompare(String(b.label), "pt-BR"));
}

const byActivity = programs => groupBy(programs, p => p.activityId, id => activityById(id)?.name || "Atividade removida");
const byTeam = programs => groupBy(programs, p => p.teamId, id => teamName(id) || "Sem equipe");

function allWeeks() {
  // As semanas vêm da própria programação importada (coluna SEMANA do Excel).
  return sortWeeks([...state.programs.map(p => p.week), weekLabel(currentWeekNumber())]);
}

// Reta de mínimos quadrados sobre os valores semanais (x = posição da semana no gráfico).
function linearTrend(values) {
  const n = values.length;
  if (n < 2) return null;
  const mx = (n - 1) / 2;
  const my = values.reduce((a, b) => a + b, 0) / n;
  const den = values.reduce((acc, _, i) => acc + (i - mx) ** 2, 0);
  const slope = values.reduce((acc, v, i) => acc + (i - mx) * (v - my), 0) / den;
  return { slope, at: i => my + slope * (i - mx) };
}

const fmtSlope = v => `${v > 0.05 ? "+" : v < -0.05 ? "−" : "±"}${Math.abs(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}`;

const CHART_AREA = 170;   // altura da área das barras (px)
const CHART_BAR_MAX = 150; // altura da maior barra (px)

function renderBarChart(host, series, currentWeek) {
  if (!host) return;
  if (!series.length) { host.innerHTML = `<div class="empty inline"><span>Sem programação no período.</span></div>`; return; }
  const max = Math.max(1, ...series.flatMap(s => [s.total, s.done]));
  const n = series.length;
  const y = v => Math.max(0, CHART_AREA - Math.min(Math.max(v, 0), max * CHART_AREA / CHART_BAR_MAX) / max * CHART_BAR_MAX);
  const x = i => (i + 0.5) / n * 100;

  const trends = [
    { key: "planned", label: "previsto", trend: linearTrend(series.map(s => s.total)) },
    { key: "done", label: "realizado", trend: linearTrend(series.map(s => s.done)) }
  ];
  const lines = trends.filter(t => t.trend).map(t => {
    const coords = `x1="${x(0)}" y1="${y(t.trend.at(0))}" x2="${x(n - 1)}" y2="${y(t.trend.at(n - 1))}"`;
    return `<line class="trend-halo" ${coords}/><line class="trend-line ${t.key}" ${coords}><title>Tendência ${t.label}: ${fmtSlope(t.trend.slope)} item(ns)/semana</title></line>`;
  }).join("");

  host.innerHTML = `
    <div class="bar-plot" style="min-width:${n * 56}px">
      <div class="bar-area">
        ${series.map(s => `
          <div class="bar-slot ${s.week === currentWeek ? "current" : ""}" title="${escapeHTML(s.week)}: ${s.done} de ${s.total} (${s.rate}%)">
            <i class="bar planned" style="height:${Math.round(s.total / max * CHART_BAR_MAX)}px"><b>${s.total}</b></i>
            <i class="bar done" style="height:${Math.round(s.done / max * CHART_BAR_MAX)}px"><b>${s.done}</b></i>
          </div>`).join("")}
        <svg class="trend-svg" viewBox="0 0 100 ${CHART_AREA}" preserveAspectRatio="none" aria-hidden="true">${lines}</svg>
      </div>
      <div class="bar-labels">${series.map(s => `<small class="${s.week === currentWeek ? "current" : ""}">${escapeHTML(s.week)}</small>`).join("")}</div>
    </div>
    <p class="trend-note">${n < 2
      ? "A tendência aparece a partir de 2 semanas com programação."
      : trends.map(t => `<span><i class="trend-swatch ${t.key}"></i><span>Tendência ${t.label}: <b>${fmtSlope(t.trend.slope)}</b> item(ns)/semana</span></span>`).join("")}</p>`;
}

function renderProgressList(host, groups, emptyText = "Sem dados.") {
  if (!host) return;
  host.innerHTML = groups.length ? groups.map(g => `
    <div class="progress-row">
      <strong title="${escapeHTML(g.label)}">${escapeHTML(g.label)}</strong>
      <span><b>${g.done}</b>/${g.total} · ${g.rate}%</span>
      <div class="meter"><i style="width:${g.rate}%"></i></div>
    </div>`).join("") : `<div class="empty inline"><span>${escapeHTML(emptyText)}</span></div>`;
}

function weeklySeries(programs, weeks) {
  return weeks.map(week => ({ week, ...summarize(programs.filter(p => p.week === week)) }));
}
