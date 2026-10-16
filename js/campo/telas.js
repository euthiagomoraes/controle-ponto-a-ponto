/* Planning Pro · campo/telas.js
 * Telas de campo: atividades da semana, registro de execução e histórico.
 */
"use strict";

/* =========================================================
   CAMPO — telas
   ========================================================= */

function filteredFieldPrograms() {
  const f = state.field;
  const q = normalizeText(f.search);
  return f.programs.filter(p => {
    if (f.activity && p.activityId !== f.activity) return false;
    if (f.status === "done" && !isDone(p)) return false;
    if (f.status === "pending" && isDone(p)) return false;
    if (q) {
      const activity = activityById(p.activityId);
      const hay = [activity?.name, p.note, ...activityColumns(activity).map(c => columnValue(p, c))].map(normalizeText).join(" ");
      if (!hay.includes(q)) return false;
    }
    return true;
  }).sort((a, b) => Number(isDone(a)) - Number(isDone(b))
    || String(activityById(a.activityId)?.name).localeCompare(String(activityById(b.activityId)?.name), "pt-BR")
    || String(programTitle(a)).localeCompare(String(programTitle(b)), "pt-BR", { numeric: true }));
}

function executorName(execution) {
  if (execution.executante_nome) return execution.executante_nome;
  if (execution.executante_id === state.user?.id) return state.user.nome;
  return personById(execution.executante_id)?.nome || "Outro integrante";
}

function renderField() {
  const f = state.field;
  const all = f.programs;
  const s = summarize(all);
  setText("fieldWeek", weekLabel(f.weekNum));
  setText("fieldTeamLabel", teamName(state.user.equipeId) ? `Equipe ${teamName(state.user.equipeId).replace(/^equipe\s+/i, "")}` : "Todas as equipes");
  setText("fieldProgressText", `${s.done} de ${s.total} executadas · ${s.rate}%`);
  $("fieldProgressBar").style.width = `${s.rate}%`;
  setText("fieldTotal", s.total);
  setText("fieldDone", s.done);
  setText("fieldPending", s.pending);

  const acts = state.activities.filter(a => all.some(p => p.activityId === a.id));
  fillSelect($("fieldActivity"), acts.map(a => ({ value: a.id, label: a.name })), { value: f.activity, placeholder: "Todas as atividades" });
  f.activity = $("fieldActivity").value;
  document.querySelectorAll("[data-field-status]").forEach(b => b.classList.toggle("active", b.dataset.fieldStatus === f.status));

  const rows = filteredFieldPrograms();
  setText("fieldListMeta", `${rows.length} de ${all.length} item(ns)`);
  $("fieldList").innerHTML = rows.map(p => {
    const activity = activityById(p.activityId);
    const done = isDone(p);
    const title = titleColumn(activity);
    const fields = activityColumns(activity).filter(c => c !== title).map(c => [c, columnValue(p, c)]).filter(([, v]) => v !== "").slice(0, 4);
    const last = executionsOf(p.id).at(-1);
    return `<article class="task ${done ? "done" : ""} ${p.id === f.activeId ? "active" : ""}" data-task="${escapeHTML(p.id)}">
      <label class="check" title="${done ? "Já executada" : "Selecionar"}"><input type="checkbox" data-select="${escapeHTML(p.id)}" ${f.selected.has(p.id) ? "checked" : ""} ${done ? "disabled" : ""} aria-label="Selecionar"></label>
      <div>
        <div class="task-head"><span class="chip primary">${escapeHTML(activity?.name || "")}</span>${previousWeeks(p).length ? `<span class="chip warn" title="Reprogramado de ${escapeHTML(previousWeeks(p).map(weekLabel).join(", "))}">Reprogramado de ${escapeHTML(weekLabel(previousWeeks(p).at(-1)))}</span>` : ""}</div>
        <div class="task-title">${escapeHTML(programTitle(p))}</div>
        <div class="task-fields">${fields.map(([c, v]) => `<span>${escapeHTML(c.label)} <b>${escapeHTML(formatColumnValue(c, v))}</b></span>`).join("")}</div>
      </div>
      <div class="task-side">
        <span class="status ${done ? "done" : "pending"}">${done ? "Executada" : "Pendente"}</span>
        ${last ? `<small>${escapeHTML(fmtDateTime(last.executado_em))}</small>` : p.date ? `<small>Prev. ${escapeHTML(fmtDate(p.date))}</small>` : ""}
      </div>
    </article>`;
  }).join("");
  $("fieldEmpty").classList.toggle("hidden", rows.length > 0);
  setText("fieldEmptyText", state.loadError || (all.length ? "Ajuste a busca ou os filtros." : `Não há programação para ${teamName(state.user.equipeId) || "a equipe"} em ${weekLabel(f.weekNum)}.`));

  const selectable = rows.filter(p => !isDone(p));
  const allSel = $("fieldSelectAll");
  allSel.checked = selectable.length > 0 && selectable.every(p => f.selected.has(p.id));
  allSel.indeterminate = !allSel.checked && selectable.some(p => f.selected.has(p.id));
  allSel.disabled = !selectable.length;
  renderBulkBar();
  renderFieldDetail();
}

function renderBulkBar() {
  const n = state.field.selected.size;
  const today = toISODate(new Date());
  $("bulkDate").max = today;
  if (!$("bulkDate").value) $("bulkDate").value = today;
  $("bulkBar").classList.toggle("hidden", n === 0 || currentScreen() !== "campo");
  setText("bulkCount", n);
}

function renderFieldDetail() {
  const p = state.field.programs.find(x => x.id === state.field.activeId);
  $("fieldDetailEmpty").classList.toggle("hidden", Boolean(p));
  $("fieldDetailBody").classList.toggle("hidden", !p);
  if (!p) { closeFieldSheet(); return; }

  const activity = activityById(p.activityId);
  const done = isDone(p);
  const executions = executionsOf(p.id);
  setText("detailActivity", activity?.name || "");
  setText("detailTitle", programTitle(p));
  setText("detailMeta", [p.week, teamName(p.teamId), p.date ? `previsto ${fmtDate(p.date)}` : ""].filter(Boolean).join(" · "));
  const status = $("detailStatus");
  status.className = `status ${done ? "done" : "pending"}`;
  status.textContent = done ? `Executada · ${executions.length} registro(s)` : "Pendente";

  const cols = activityColumns(activity);
  const host = $("detailFields");
  host.innerHTML = cols.map(c => {
    const value = columnValue(p, c);
    if (!c.technicianEditable) return `<div class="ro"><span>${escapeHTML(c.label)}</span><strong>${escapeHTML(formatColumnValue(c, value))}</strong></div>`;
    return "";
  }).join("") + (p.note ? `<div class="ro" style="grid-column:1/-1"><span>Observação do planejamento</span><strong>${escapeHTML(p.note)}</strong></div>` : "");

  const editable = { ...activity, columns: cols.filter(c => c.technicianEditable) };
  if (editable.columns.length) {
    const wrap = document.createElement("div");
    wrap.style.gridColumn = "1 / -1";
    wrap.className = "form-grid";
    wrap.id = "detailEditable";
    renderCustomInputs(wrap, editable, Object.fromEntries(editable.columns.map(c => [c.key, columnValue(p, c)])), { prefix: "df" });
    host.appendChild(wrap);
  }
  $("detailSaveRow").classList.toggle("hidden", !editable.columns.length);

  const reg = $("detailRegister");
  reg.querySelector("span").textContent = done ? "Registrar nova execução" : "Registrar execução";
  reg.classList.toggle("ghost", done);
  reg.classList.toggle("primary", !done);

  $("detailLog").innerHTML = executions.slice().reverse().map(e => `
    <div class="timeline-item"><div>
      <strong>${escapeHTML(fmtDateTime(e.executado_em))}</strong>
      <small>${escapeHTML(executorName(e))}</small>
      ${e.observacao ? `<p>${escapeHTML(e.observacao)}</p>` : ""}
    </div></div>`).join("");
}

function openFieldItem(id) {
  if (state.field.activeId !== id) {
    $("detailObs").value = "";
    $("detailDate").value = toISODate(new Date());
  }
  $("detailDate").max = toISODate(new Date());
  state.field.activeId = id;
  document.querySelectorAll(".task").forEach(el => el.classList.toggle("active", el.dataset.task === id));
  renderFieldDetail();
  if (window.matchMedia("(max-width: 960px)").matches) {
    $("fieldDetail").classList.add("open");
    document.body.classList.add("sheet-open");
  }
}

function closeFieldSheet() {
  $("fieldDetail").classList.remove("open");
  document.body.classList.remove("sheet-open");
}

async function registerExecution(ids, button) {
  const programs = ids.map(id => state.field.programs.find(p => p.id === id)).filter(Boolean);
  if (!programs.length) return;
  const repeat = programs.length === 1 && isDone(programs[0]);
  if (repeat) {
    const ok = await confirmDialog({ title: "Registrar nova execução?", text: "Este item já possui registro. Um novo registro será acrescentado ao histórico.", okLabel: "Registrar" });
    if (!ok) return;
  }
  const single = programs.length === 1;
  const obs = single ? $("detailObs").value.trim() : "";
  const date = single ? $("detailDate").value : $("bulkDate").value;
  if (date && date > toISODate(new Date())) return toast("A data da execução não pode ser futura.", "error");
  await withButton(button, async () => {
    try {
      const created = await withBusy(() => fieldRegister(programs.map(p => p.id), obs, executionTimestamp(date)));
      created.forEach(e => {
        const list = state.executions.get(e.programacao_id) || [];
        list.push(e);
        state.executions.set(e.programacao_id, list);
      });
      programs.forEach(p => { p.status = "EXECUTADO"; state.field.selected.delete(p.id); });
      $("detailObs").value = "";
      renderField();
      toast(programs.length === 1 ? "Execução registrada." : `${programs.length} execuções registradas.`);
    } catch (error) {
      toast(dbErrorMessage(error, "Não foi possível registrar."), "error");
    }
  });
}

async function saveDetailFields() {
  const p = state.field.programs.find(x => x.id === state.field.activeId);
  const host = $("detailEditable");
  if (!p || !host) return;
  const { data } = collectCustomInputs(host);
  await withButton($("detailSave"), async () => {
    try {
      p.customData = await withBusy(() => fieldSaveFields(p, data));
      renderField();
      toast("Campos salvos.");
    } catch (error) {
      toast(dbErrorMessage(error, "Não foi possível salvar os campos."), "error");
    }
  });
}

async function changeFieldWeek(delta) {
  state.field.weekNum += delta;
  state.field.selected.clear();
  state.field.activeId = null;
  setText("fieldWeek", weekLabel(state.field.weekNum));
  try { await withBusy(loadFieldWeek); state.loadError = ""; }
  catch (error) { state.loadError = dbErrorMessage(error); toast(state.loadError, "error"); state.field.programs = []; }
  renderScreen();
}

function renderFieldHistory() {
  setText("historyWeek", weekLabel(state.field.weekNum));
  const items = state.field.programs.flatMap(p => executionsOf(p.id).map(e => ({ p, e })))
    .sort((a, b) => String(b.e.executado_em).localeCompare(String(a.e.executado_em)));
  $("historyList").innerHTML = items.length ? items.map(({ p, e }) => `
    <div class="timeline-item"><div>
      <strong>${escapeHTML(programTitle(p))}</strong>
      <small>${escapeHTML(activityById(p.activityId)?.name || "")} · ${escapeHTML(fmtDateTime(e.executado_em))} · ${escapeHTML(executorName(e))}</small>
      ${e.observacao ? `<p>${escapeHTML(e.observacao)}</p>` : ""}
    </div></div>`).join("") : `<div class="empty inline"><strong>Nenhuma execução nesta semana.</strong><span>Os registros feitos em “Atividades da semana” aparecem aqui.</span></div>`;
}
