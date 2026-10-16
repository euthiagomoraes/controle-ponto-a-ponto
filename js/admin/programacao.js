/* Planning Pro · admin/programacao.js
 * Programação: tabela por atividade, lançamento/edição, reprogramação, backlog e equipamentos.
 */
"use strict";

/* =========================================================
   PROGRAMAÇÃO
   ========================================================= */

// Colunas da atividade que entram no template/tabela (exclui as que duplicam campos fixos).
function activityColumns(activity) {
  return (activity?.columns || []).filter(c => !RESERVED_COLUMN_KEYS.has(c.key));
}

// SEMANA, EQUIPE e depois as colunas da atividade, na ordem configurada.
function templateColumns(activity) {
  return [
    ...FIXED_COLUMNS.map(f => ({ ...f, fixed: true })),
    ...activityColumns(activity).map(c => ({ ...c, fixed: false }))
  ];
}

function equipmentValue(program, key) {
  const eq = state.equipment.get(program.equipmentId);
  if (!eq) return undefined;
  return eq[key === "type" ? "tipe" : key];
}

function columnValue(program, column) {
  const v = program.customData?.[column.key];
  if (v !== undefined && v !== null && v !== "") return v;
  return equipmentValue(program, column.key) ?? "";
}

function titleColumn(activity) {
  const cols = activityColumns(activity);
  return cols.find(c => c.key === "tag") || cols.find(c => /tag|equipamento/.test(c.key)) || cols[0] || null;
}

function programTitle(program) {
  const activity = activityById(program.activityId);
  const col = titleColumn(activity);
  return (col && columnValue(program, col)) || activity?.name || "Item programado";
}

function filteredAdminPrograms() {
  const f = state.program;
  const q = normalizeText(f.search);
  const activity = activityById(f.activityId);
  const cols = activityColumns(activity);
  return state.programs.filter(p => {
    if (p.activityId !== f.activityId) return false;
    if (f.week && p.week !== f.week) return false;
    if (f.team && p.teamId !== f.team) return false;
    if (f.status === "done" && !isDone(p)) return false;
    if (f.status === "pending" && isDone(p)) return false;
    if (f.status === "backlog" && !isBacklog(p)) return false;
    if (q) {
      const hay = [p.week, teamName(p.teamId), p.note, ...cols.map(c => columnValue(p, c))].map(normalizeText).join(" ");
      if (!hay.includes(q)) return false;
    }
    return true;
  }).sort((a, b) => b.weekNum - a.weekNum || teamName(a.teamId).localeCompare(teamName(b.teamId), "pt-BR") || String(programTitle(a)).localeCompare(String(programTitle(b)), "pt-BR", { numeric: true }));
}

function renderProgramFilters() {
  if (!activityById(state.program.activityId)) state.program.activityId = state.activities[0]?.id || null;
  fillSelect($("programActivity"), state.activities.map(a => ({ value: a.id, label: a.name })), { value: state.program.activityId });
  const weeks = sortWeeks(state.programs.filter(p => p.activityId === state.program.activityId).map(p => p.week)).reverse();
  fillSelect($("programWeekFilter"), weeks.map(w => ({ value: w, label: w })), { value: state.program.week, placeholder: "Todas" });
  fillSelect($("programTeamFilter"), state.teams.map(t => ({ value: t.id, label: t.nome })), { value: state.program.team, placeholder: "Todas" });
  state.program.week = $("programWeekFilter").value;
  state.program.team = $("programTeamFilter").value;
}

function renderProgramacao() {
  renderProgramFilters();
  const activity = activityById(state.program.activityId);
  const cols = activityColumns(activity);
  const rows = filteredAdminPrograms();
  const s = summarize(rows);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  state.program.page = Math.min(state.program.page, pages - 1);
  const pageRows = rows.slice(state.program.page * PAGE_SIZE, (state.program.page + 1) * PAGE_SIZE);

  setText("programTableTitle", activity ? activity.name : "Programações");
  setText("programTableMeta", activity ? `${rows.length} item(ns) · ${s.done} executado(s) · ${s.pending} pendente(s)` : "Cadastre uma atividade para começar.");

  const sel = state.program.selected;
  const allOnPage = pageRows.length > 0 && pageRows.every(p => sel.has(p.id));
  $("programTableHead").innerHTML = `<tr><th class="check-col"><input type="checkbox" data-select-page ${allOnPage ? "checked" : ""} aria-label="Selecionar página"></th><th>Semana</th><th>Equipe</th>${cols.map(c => `<th>${escapeHTML(c.label)}</th>`).join("")}<th>Situação</th><th>Executado em</th><th></th></tr>`;
  $("programTableBody").innerHTML = pageRows.map(p => {
    const done = isDone(p);
    const last = executionsOf(p.id).at(-1);
    return `<tr class="${sel.has(p.id) ? "selected" : ""}">
      <td class="check-col"><input type="checkbox" data-select-program="${escapeHTML(p.id)}" ${sel.has(p.id) ? "checked" : ""} aria-label="Selecionar"></td>
      <td class="mono">${escapeHTML(p.week)}${reprogramChip(p)}</td>
      <td>${escapeHTML(dash(teamName(p.teamId)))}</td>
      ${cols.map(c => `<td title="${escapeHTML(columnValue(p, c))}">${escapeHTML(formatColumnValue(c, columnValue(p, c)))}</td>`).join("")}
      <td>${statusBadge(p)}</td>
      <td title="${last ? escapeHTML(`${fmtDateTime(last.executado_em)} · ${executorName(last)}`) : ""}">${last ? `${escapeHTML(fmtDate(toISODate(new Date(last.executado_em))))}${executionsOf(p.id).length > 1 ? ` <span class="chip">${executionsOf(p.id).length}x</span>` : ""}` : "—"}</td>
      <td class="actions-cell"><span class="row-actions">
        <button class="icon-btn sm" type="button" data-edit-program="${escapeHTML(p.id)}" title="Editar"><svg class="icon"><use href="#i-edit"/></svg></button>
        <button class="icon-btn sm" type="button" data-move-program="${escapeHTML(p.id)}" title="Reprogramar" ${done ? "disabled" : ""}><svg class="icon"><use href="#i-forward"/></svg></button>
        <button class="icon-btn sm danger" type="button" data-delete-program="${escapeHTML(p.id)}" title="Excluir"><svg class="icon"><use href="#i-trash"/></svg></button>
      </span></td>
    </tr>`;
  }).join("");
  $("programEmpty").classList.toggle("hidden", rows.length > 0);
  setText("programBulkCount", sel.size);
  $("programBulk").classList.toggle("hidden", !sel.size);

  $("programPager").innerHTML = pages > 1 ? `
    <span>Página ${state.program.page + 1} de ${pages} · ${rows.length} itens</span>
    <div class="actions">
      <button class="btn ghost sm" type="button" data-page="-1" ${state.program.page === 0 ? "disabled" : ""}>Anterior</button>
      <button class="btn ghost sm" type="button" data-page="1" ${state.program.page >= pages - 1 ? "disabled" : ""}>Próxima</button>
    </div>` : "";
}

async function deleteProgram(id) {
  const program = state.programs.find(p => p.id === id);
  if (!program) return;
  const executed = executionsOf(id).length;
  const ok = await confirmDialog({
    title: "Excluir programação?",
    text: `${programTitle(program)} · ${program.week} · ${teamName(program.teamId) || "sem equipe"}.${executed ? ` Este item possui ${executed} registro(s) de execução.` : ""}`,
    okLabel: "Excluir", danger: true
  });
  if (!ok) return;
  try {
    await withBusy(async () => {
      const { error } = await requireDb().from("tb_programacoes").delete().eq("id", id);
      if (error) throw error;
    });
    state.programs = state.programs.filter(p => p.id !== id);
    renderProgramacao();
    toast("Programação excluída.");
  } catch (error) {
    toast(dbErrorMessage(error), "error");
  }
}

/* ---------- lançamento manual ---------- */

function weekOptionsForForm() {
  const current = currentWeekNumber();
  const near = [current - 1, current, current + 1, current + 2].map(weekLabel);
  return sortWeeks([...state.programs.map(p => p.week), ...near]).map(w => ({ value: w, label: w }));
}

function renderCustomInputs(host, activity, values = {}, { prefix = "pf", editableOnly = false } = {}) {
  host.innerHTML = activityColumns(activity).map(c => {
    const value = values[c.key] ?? "";
    const disabled = editableOnly && !c.technicianEditable ? "disabled" : "";
    const attrs = `data-custom-key="${escapeHTML(c.key)}" data-type="${c.type}" ${disabled}`;
    const label = escapeHTML(c.label);
    let control;
    if (c.type === "select" || c.type === "boolean") {
      const opts = c.type === "boolean" ? ["SIM", "NÃO"] : c.options;
      const hasValue = !value || opts.some(o => String(o) === String(value));
      control = `<select ${attrs}><option value="">Selecione</option>${opts.map(o => `<option ${String(o) === String(value) ? "selected" : ""}>${escapeHTML(o)}</option>`).join("")}${hasValue ? "" : `<option selected>${escapeHTML(value)}</option>`}</select>`;
    } else {
      const type = c.type === "number" ? "number" : c.type === "date" ? "date" : "text";
      control = `<input ${attrs} type="${type}" ${c.type === "number" ? 'step="any"' : ""} value="${escapeHTML(value)}">`;
    }
    return `<label class="field" id="${prefix}-${escapeHTML(c.key)}">${label}${control}</label>`;
  }).join("");
}

function collectCustomInputs(host) {
  const data = {};
  host.querySelectorAll("[data-custom-key]").forEach(input => {
    data[input.dataset.customKey] = String(input.value ?? "").trim();
  });
  return { data };
}

function openProgramModal(id = null) {
  if (!state.activities.length) return toast("Cadastre uma atividade primeiro.", "error");
  const editing = id ? state.programs.find(p => p.id === id) : null;
  state.editingProgramId = editing?.id || null;
  setText("programModalTitle", editing ? `Editar · ${programTitle(editing)}` : "Nova programação");
  setText("programModalText", editing
    ? `${activityById(editing.activityId)?.name || ""} · ${isDone(editing) ? "item já executado: a alteração não muda os registros de campo." : "altere a semana, a equipe ou os dados do item."}`
    : "Lançamento manual de um item. Para cargas grandes, use a importação de Excel.");
  setText("programFormSubmit", editing ? "Salvar alterações" : "Salvar programação");

  fillSelect($("pfActivity"), state.activities.map(a => ({ value: a.id, label: a.name })), { value: editing?.activityId || state.program.activityId });
  $("pfActivity").disabled = Boolean(editing);
  const weeks = weekOptionsForForm();
  if (editing && !weeks.some(w => w.value === editing.week)) weeks.unshift({ value: editing.week, label: editing.week });
  fillSelect($("pfWeek"), sortWeeks(weeks.map(w => w.value)).map(w => ({ value: w, label: w })), { value: editing?.week || state.program.week || weekLabel(currentWeekNumber()) });
  const teams = state.teams.filter(t => t.ativo || t.id === editing?.teamId);
  fillSelect($("pfTeam"), teams.map(t => ({ value: t.id, label: t.nome })), { value: editing?.teamId || state.program.team, placeholder: "Selecione a equipe" });
  const activity = activityById($("pfActivity").value);
  const values = editing ? Object.fromEntries(activityColumns(activity).map(c => [c.key, columnValue(editing, c)])) : {};
  renderCustomInputs($("pfCustom"), activity, values);
  setMessage("programFormMessage", "");
  openModal("programModal");
}

async function saveProgramForm(event) {
  event.preventDefault();
  const activity = activityById($("pfActivity").value);
  const weekNum = weekToNumber($("pfWeek").value);
  const team = teamById($("pfTeam").value);
  const { data: customData } = collectCustomInputs($("pfCustom"));
  if (!activity || !weekNum || !team) return setMessage("programFormMessage", "Escolha atividade, semana e equipe.");
  const editing = state.programs.find(p => p.id === state.editingProgramId) || null;
  if (editing) return updateProgram(event.submitter, editing, { weekNum, team, customData });

  await withButton(event.submitter, async () => {
    try {
      await withBusy(async () => {
        const equipmentIds = await resolveEquipment([customData]);
        const payload = {
          equipamento_id: equipmentIds.get(equipmentKey(customData)) || null,
          semana: weekNum,
          status: "PROGRAMADO",
          atividade_id: activity.id,
          data_programacao: null,
          equipe_id: team.id,
          responsavel_id: null,
          quantidade: 1,
          observacao: null,
          dados_personalizados: customData,
          modo_importacao: MODE_APPEND,
          arquivo_importacao: null,
          usuario_importacao: state.user.authUserId
        };
        const { data, error } = await requireDb().from("tb_programacoes").insert(payload).select(PROGRAM_COLUMNS).single();
        if (error) throw error;
        state.programs.push(mapProgram(data));
      });
      closeModal("programModal");
      state.program.activityId = activity.id;
      renderProgramacao();
      toast("Programação cadastrada.");
    } catch (error) {
      setMessage("programFormMessage", dbErrorMessage(error));
    }
  });
}

/* ---------- edição, reprogramação e backlog ---------- */

function statusBadge(p) {
  if (isDone(p)) return `<span class="status done">Executado</span>`;
  if (isBacklog(p)) return `<span class="status late" title="Semana já passou e o item não foi executado">Backlog</span>`;
  return `<span class="status pending">Pendente</span>`;
}

function reprogramChip(p) {
  const prev = previousWeeks(p);
  if (!prev.length) return "";
  return `<span class="chip warn" title="Reprogramado de ${escapeHTML(prev.map(weekLabel).join(" → "))}">↻ ${escapeHTML(weekLabel(prev.at(-1)))}</span>`;
}

// Atualiza um item no banco e no estado local. Mudar a semana de um item pendente registra o histórico.
function programUpdatePayload(p, { weekNum, teamId, customData, equipmentId }) {
  const data = { ...p.customData, ...(customData || {}) };
  if (weekNum !== p.weekNum && !isDone(p)) data[HISTORY_KEY] = [...previousWeeks(p), p.weekNum];
  return {
    semana: weekNum,
    equipe_id: teamId,
    dados_personalizados: data,
    ...(equipmentId !== undefined ? { equipamento_id: equipmentId } : {}),
    updated_at: new Date().toISOString()
  };
}

async function updateProgram(button, p, { weekNum, team, customData }) {
  await withButton(button, async () => {
    try {
      await withBusy(async () => {
        let equipmentId;
        const merged = { ...p.customData, ...customData };
        if (equipmentKey(merged) !== equipmentKey(p.customData)) {
          equipmentId = equipmentKey(merged) ? (await resolveEquipment([merged])).get(equipmentKey(merged)) || null : null;
        }
        const payload = programUpdatePayload(p, { weekNum, teamId: team.id, customData, equipmentId });
        const { data, error } = await requireDb().from("tb_programacoes").update(payload).eq("id", p.id).select(PROGRAM_COLUMNS).single();
        if (error) throw error;
        Object.assign(p, mapProgram(data));
      });
      closeModal("programModal");
      renderScreen();
      updateBacklogBadge();
      toast("Programação atualizada.");
    } catch (error) {
      setMessage("programFormMessage", error?.code === "23505"
        ? `O banco recusou: já existe este equipamento em ${weekLabel(weekNum)}. Se os itens têm campos diferentes, execute 011_programacao_sem_unicidade_equipamento.sql no Supabase.`
        : dbErrorMessage(error));
    }
  });
}

function suggestedTargetWeek(programs) {
  const current = currentWeekNumber();
  const latest = Math.max(...programs.map(p => p.weekNum));
  return Math.max(current, latest) + 1;
}

function openReprogram(ids) {
  const programs = ids.map(id => state.programs.find(p => p.id === id)).filter(Boolean);
  const pending = programs.filter(p => !isDone(p));
  if (!pending.length) return toast("Os itens selecionados já foram executados; não há o que reprogramar.", "error");
  state.reprogramIds = pending.map(p => p.id);
  const skipped = programs.length - pending.length;
  setText("reprogramTitle", pending.length === 1 ? `Reprogramar ${programTitle(pending[0])}` : `Reprogramar ${pending.length} itens`);
  const fromWeeks = sortWeeks(pending.map(p => p.week)).join(", ");
  setText("reprogramText", `Origem: ${fromWeeks}.${skipped ? ` ${skipped} item(ns) já executado(s) ficam onde estão.` : ""} O histórico da semana original fica registrado no item.`);

  const target = suggestedTargetWeek(pending);
  const current = currentWeekNumber();
  const options = [];
  for (let w = current; w <= Math.max(target, current) + 6; w++) options.push({ value: String(w), label: `${weekLabel(w)}${w === current ? " · atual" : w === current + 1 ? " · próxima" : ""}` });
  fillSelect($("reprogramWeek"), options, { value: String(target) });
  fillSelect($("reprogramTeam"), state.teams.filter(t => t.ativo).map(t => ({ value: t.id, label: t.nome })), { value: "", placeholder: "Manter a equipe de cada item" });
  setMessage("reprogramMessage", "");
  openModal("reprogramModal");
}

async function confirmReprogram() {
  const target = Number($("reprogramWeek").value);
  const teamId = $("reprogramTeam").value || null;
  const programs = state.reprogramIds.map(id => state.programs.find(p => p.id === id)).filter(p => p && p.weekNum !== target);
  if (!programs.length) return setMessage("reprogramMessage", `Os itens selecionados já estão em ${weekLabel(target)}.`);

  await withButton($("reprogramConfirm"), async () => {
    const failed = [];
    let moved = 0;
    await withBusy(async () => {
      const sb = requireDb();
      for (const part of chunk(programs, 10)) {
        const results = await Promise.all(part.map(async p => {
          const payload = programUpdatePayload(p, { weekNum: target, teamId: teamId || p.teamId });
          payload.status = "PROGRAMADO";
          const { data, error } = await sb.from("tb_programacoes").update(payload).eq("id", p.id).select(PROGRAM_COLUMNS).single();
          return { p, data, error };
        }));
        results.forEach(({ p, data, error }) => {
          if (error) failed.push(`${programTitle(p)}: ${error.code === "23505" ? `o banco recusou duplicidade em ${weekLabel(target)} (execute 011_programacao_sem_unicidade_equipamento.sql)` : dbErrorMessage(error)}`);
          else { Object.assign(p, mapProgram(data)); moved++; }
        });
      }
    });
    state.program.selected.clear();
    state.backlog.selected.clear();
    updateBacklogBadge();
    renderScreen();
    if (failed.length) {
      setMessage("reprogramMessage", `${moved} reprogramado(s). Não foi possível mover ${failed.length}: ${failed.slice(0, 5).join("; ")}${failed.length > 5 ? "…" : ""}`);
    } else {
      closeModal("reprogramModal");
      toast(`${moved} item(ns) reprogramado(s) para ${weekLabel(target)}.`);
    }
  });
}

async function deleteSelectedPrograms() {
  const ids = [...state.program.selected];
  if (!ids.length) return;
  const executed = ids.filter(id => executionsOf(id).length).length;
  const ok = await confirmDialog({
    title: `Excluir ${ids.length} programação(ões)?`,
    text: executed ? `${executed} delas têm registro de execução e o banco pode recusar a exclusão desses itens.` : "Os itens serão removidos da programação.",
    okLabel: "Excluir", danger: true
  });
  if (!ok) return;
  const removed = new Set();
  const failed = [];
  await withBusy(async () => {
    const sb = requireDb();
    for (const part of chunk(ids, IN_CHUNK)) {
      const { error } = await sb.from("tb_programacoes").delete().in("id", part);
      if (!error) { part.forEach(id => removed.add(id)); continue; }
      // Algum item do lote está vinculado (ex.: execução): tenta um a um para remover os demais.
      for (const id of part) {
        const { error: one } = await sb.from("tb_programacoes").delete().eq("id", id);
        if (one) failed.push(id); else removed.add(id);
      }
    }
  });
  state.programs = state.programs.filter(p => !removed.has(p.id));
  state.program.selected = new Set(failed);
  updateBacklogBadge();
  renderProgramacao();
  toast(failed.length ? `${removed.size} excluída(s); ${failed.length} não puderam ser excluídas (possuem execuções).` : `${removed.size} programação(ões) excluída(s).`, failed.length ? "error" : "");
}

function filteredBacklog() {
  const f = state.backlog;
  const q = normalizeText(f.search);
  return state.programs.filter(p => isBacklog(p)
    && (!f.activity || p.activityId === f.activity)
    && (!f.team || p.teamId === f.team)
    && (!f.week || p.week === f.week)
    && (!q || [programTitle(p), teamName(p.teamId), activityById(p.activityId)?.name, ...activityColumns(activityById(p.activityId)).map(c => columnValue(p, c))].map(normalizeText).join(" ").includes(q)))
    .sort((a, b) => a.weekNum - b.weekNum || teamName(a.teamId).localeCompare(teamName(b.teamId), "pt-BR") || String(programTitle(a)).localeCompare(String(programTitle(b)), "pt-BR", { numeric: true }));
}

function renderBacklog() {
  const current = currentWeekNumber();
  const all = state.programs.filter(p => isBacklog(p));
  setText("backlogCurrentWeek", weekLabel(current));
  setText("backlogTotal", all.length);
  const oldest = all.reduce((min, p) => Math.min(min, p.weekNum), Infinity);
  setText("backlogOldest", Number.isFinite(oldest) ? weekLabel(oldest) : "—");
  setText("backlogOldestText", Number.isFinite(oldest) ? `${current - oldest} semana(s) de atraso` : "semana de origem");
  setText("backlogTeams", new Set(all.map(p => p.teamId)).size);
  setText("backlogMoved", all.filter(p => previousWeeks(p).length).length);

  const f = state.backlog;
  fillSelect($("backlogActivity"), state.activities.filter(a => all.some(p => p.activityId === a.id)).map(a => ({ value: a.id, label: a.name })), { value: f.activity, placeholder: "Todas" });
  fillSelect($("backlogTeam"), state.teams.filter(t => all.some(p => p.teamId === t.id)).map(t => ({ value: t.id, label: t.nome })), { value: f.team, placeholder: "Todas" });
  fillSelect($("backlogWeek"), sortWeeks(all.map(p => p.week)).map(w => ({ value: w, label: w })), { value: f.week, placeholder: "Todas" });
  Object.assign(f, { activity: $("backlogActivity").value, team: $("backlogTeam").value, week: $("backlogWeek").value });

  const visibleIds = new Set(all.map(p => p.id));
  f.selected = new Set([...f.selected].filter(id => visibleIds.has(id)));
  const rows = filteredBacklog();
  setText("backlogMeta", `${rows.length} de ${all.length} item(ns)`);
  $("backlogBody").innerHTML = rows.slice(0, 500).map(p => {
    const activity = activityById(p.activityId);
    const details = activityColumns(activity).filter(c => c !== titleColumn(activity)).map(c => [c, columnValue(p, c)]).filter(([, v]) => v !== "").slice(0, 3);
    const prev = previousWeeks(p);
    return `<tr class="${f.selected.has(p.id) ? "selected" : ""}">
      <td class="check-col"><input type="checkbox" data-select-backlog="${escapeHTML(p.id)}" ${f.selected.has(p.id) ? "checked" : ""} aria-label="Selecionar"></td>
      <td class="mono">${escapeHTML(p.week)}</td>
      <td><span class="chip danger">${current - p.weekNum} sem.</span></td>
      <td>${escapeHTML(activity?.name || "—")}</td>
      <td class="wrap"><strong class="mono">${escapeHTML(programTitle(p))}</strong><br><small class="muted">${details.map(([c, v]) => `${escapeHTML(c.label)} ${escapeHTML(formatColumnValue(c, v))}`).join(" · ")}</small></td>
      <td>${escapeHTML(dash(teamName(p.teamId)))}</td>
      <td>${prev.length ? `<span class="muted sm">${escapeHTML([...prev, p.weekNum].map(weekLabel).join(" → "))}</span>` : `<span class="muted sm">—</span>`}</td>
      <td class="actions-cell"><span class="row-actions">
        <button class="icon-btn sm" type="button" data-edit-program="${escapeHTML(p.id)}" title="Editar"><svg class="icon"><use href="#i-edit"/></svg></button>
        <button class="icon-btn sm" type="button" data-move-program="${escapeHTML(p.id)}" title="Reprogramar"><svg class="icon"><use href="#i-forward"/></svg></button>
      </span></td>
    </tr>`;
  }).join("");
  $("backlogEmpty").classList.toggle("hidden", rows.length > 0);
  const allSel = $("backlogSelectAll");
  allSel.checked = rows.length > 0 && rows.every(p => f.selected.has(p.id));
  allSel.indeterminate = !allSel.checked && rows.some(p => f.selected.has(p.id));
  setText("backlogBulkCount", f.selected.size);
  $("backlogBulk").classList.toggle("hidden", !f.selected.size);
}

/* ---------- equipamentos (TAG) ---------- */

function tagOf(data) {
  for (const key of ["tag", "TAG", "equipamento", "EQUIPAMENTO"]) {
    const v = String(data?.[key] ?? "").trim();
    if (v) return v;
  }
  return "";
}

const pickValue = (data, keys) => { for (const k of keys) { const v = String(data?.[k] ?? "").trim(); if (v) return v; } return ""; };
const sysOf = data => pickValue(data, ["sys", "SYS", "sistema"]);
const subsysOf = data => pickValue(data, ["subsys", "SUBSYS", "subsistema", "sub_sistema"]);

// Um equipamento é identificado por TAG + SYS + SUBSYS: o mesmo TAG pode existir em sistemas diferentes.
function equipmentKey(data) {
  const tag = normalizeText(tagOf(data));
  return tag ? `${tag}|${normalizeText(sysOf(data))}|${normalizeText(subsysOf(data))}` : "";
}

// Texto legível da identificação: "FT-001 (SYS S1 / SUBSYS S1.1)".
function equipmentLabel(data) {
  const parts = [sysOf(data) && `SYS ${sysOf(data)}`, subsysOf(data) && `SUBSYS ${subsysOf(data)}`].filter(Boolean);
  return `${tagOf(data)}${parts.length ? ` (${parts.join(" / ")})` : ""}`;
}

// Garante tb_equipamentos em lote (1 consulta + 1 inserção). Retorna Map equipmentKey → id.
async function resolveEquipment(records) {
  const sb = requireDb();
  const byKey = new Map();
  records.forEach(r => { const key = equipmentKey(r); if (key && !byKey.has(key)) byKey.set(key, r); });
  const ids = new Map();
  if (!byKey.size) return ids;

  const tags = [...new Set([...byKey.values()].map(tagOf))];
  const existing = await fetchIn("tb_equipamentos", "id,tag,sys,subsys", "tag", tags);
  existing.forEach(e => { const key = equipmentKey(e); if (byKey.has(key) && !ids.has(key)) ids.set(key, e.id); });

  const missing = [...byKey.entries()].filter(([key]) => !ids.has(key)).map(([, r]) => ({
    tag: tagOf(r),
    forn: pickValue(r, ["forn"]) || null, sys: sysOf(r) || null, subsys: subsysOf(r) || null, loop: pickValue(r, ["loop"]) || null,
    service: pickValue(r, ["service"]) || null, tipe: pickValue(r, ["tipe", "type"]) || null, descricao: pickValue(r, ["descricao", "equipamento"]) || null,
    ativo: true
  }));
  for (const part of chunk(missing, 500)) {
    const { data, error } = await sb.from("tb_equipamentos").insert(part).select("id,tag,sys,subsys");
    if (error?.code === "23505") {
      throw new Error("O cadastro de equipamentos do banco ainda exige TAG única, mas o arquivo tem o mesmo TAG em sistemas diferentes. Execute 010_equipamento_tag_por_sistema.sql no SQL Editor do Supabase e importe novamente.");
    }
    if (error) throw error;
    (data || []).forEach(e => ids.set(equipmentKey(e), e.id));
  }
  return ids;
}
