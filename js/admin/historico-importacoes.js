/* Planning Pro · admin/historico-importacoes.js
 * Histórico de importações agrupado a partir dos registros do banco.
 */
"use strict";

/* =========================================================
   HISTÓRICO DE IMPORTAÇÕES (derivado do banco)
   ========================================================= */

function importBatches() {
  // Uma importação grava as linhas em sequência; agrupa por arquivo/modo/usuário com até 3 min de intervalo.
  const sorted = [...state.programs].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  const batches = [];
  const open = new Map();
  sorted.forEach(p => {
    const key = `${p.file || "manual"}|${p.mode}|${p.importedBy}|${p.file ? "" : String(p.createdAt).slice(0, 10)}`;
    const time = new Date(p.createdAt).getTime();
    const current = open.get(key);
    if (current && (!p.file || time - current.last <= 180000)) {
      current.items.push(p);
      current.last = time;
    } else {
      const batch = { key, file: p.file, mode: p.mode, importedBy: p.importedBy, first: p.createdAt, last: time, items: [p] };
      batches.push(batch);
      open.set(key, batch);
    }
  });
  return batches.reverse();
}

function renderImportHistory() {
  const host = $("importHistory");
  const batches = importBatches();
  if (!batches.length) {
    host.innerHTML = `<div class="card empty"><svg class="icon xl"><use href="#i-history"/></svg><strong>Nenhuma programação cadastrada</strong><span>As importações de Excel aparecerão aqui.</span></div>`;
    return;
  }
  host.innerHTML = batches.slice(0, 100).map((b, index) => {
    const s = summarize(b.items);
    const acts = [...new Set(b.items.map(p => activityById(p.activityId)?.name || "Atividade removida"))].join(", ");
    const weeks = sortWeeks(b.items.map(p => p.week)).join(", ");
    const who = state.people.find(p => p.auth_user_id && p.auth_user_id === b.importedBy)?.nome || "";
    const modeChip = !b.file ? `<span class="chip">MANUAL</span>` : b.mode === MODE_REPLACE ? `<span class="chip warn">NOVA PROGRAMAÇÃO</span>` : `<span class="chip primary">INCLUSÃO</span>`;
    const activity = activityById(b.items[0].activityId);
    const cols = activityColumns(activity).slice(0, 4);
    return `<details class="card import-batch" ${index === 0 ? "open" : ""}>
      <summary>
        ${modeChip}
        <div class="grow"><strong>${escapeHTML(b.file || "Lançamentos manuais")}</strong><small>${escapeHTML(fmtDateTime(b.first))}${who ? ` · ${escapeHTML(who)}` : ""} · ${escapeHTML(acts)} · ${escapeHTML(weeks)}</small></div>
        <span class="badge">${b.items.length} itens</span>
        <span class="chip ok">${s.rate}% executado</span>
      </summary>
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr><th>Semana</th><th>Equipe</th>${cols.map(c => `<th>${escapeHTML(c.label)}</th>`).join("")}<th>Situação</th></tr></thead>
          <tbody>${b.items.slice(0, 200).map(p => `<tr><td class="mono">${escapeHTML(p.week)}</td><td>${escapeHTML(dash(teamName(p.teamId)))}</td>${cols.map(c => `<td>${escapeHTML(formatColumnValue(c, columnValue(p, c)))}</td>`).join("")}<td><span class="status ${isDone(p) ? "done" : "pending"}">${isDone(p) ? "Executado" : "Pendente"}</span></td></tr>`).join("")}</tbody>
        </table>
      </div>
    </details>`;
  }).join("");
}
