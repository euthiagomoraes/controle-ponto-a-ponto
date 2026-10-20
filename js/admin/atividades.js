/* Planning Pro · admin/atividades.js
 * Cadastro de atividades e colunas (estrutura modular) e formulário PDF de campo.
 */
"use strict";

/* =========================================================
   ATIVIDADES E COLUNAS
   ========================================================= */

function renderActivities() {
  if (!activityById(state.activityId)) state.activityId = state.activities[0]?.id || null;
  setText("activityCount", state.activities.length);
  $("activityList").innerHTML = state.activities.map(a => `
    <button class="select-item ${a.id === state.activityId ? "active" : ""}" type="button" data-activity="${escapeHTML(a.id)}">
      <strong>${escapeHTML(a.name)}</strong>
      <small>${activityColumns(a).length} coluna(s) · ${state.programs.filter(p => p.activityId === a.id).length} programação(ões)</small>
    </button>`).join("") || `<div class="empty inline"><span>Nenhuma atividade.</span></div>`;

  const activity = activityById(state.activityId);
  $("activityEmpty").classList.toggle("hidden", Boolean(activity));
  $("activityEditor").classList.toggle("hidden", !activity);
  if (!activity) return;

  const cols = activity.columns;
  setText("activityTitle", activity.name);
  setText("activityDescription", activity.description || "Sem descrição.");
  setText("activityColCount", cols.length);
  setText("activityEditCount", cols.filter(c => c.technicianEditable).length);
  setText("activityProgCount", state.programs.filter(p => p.activityId === activity.id).length);
  setText("templateFileName", `template_${makeKey(activity.name)}.xlsx`);

  $("columnList").innerHTML = cols.map((c, i) => {
    const reserved = RESERVED_COLUMN_KEYS.has(c.key);
    return `<div class="column-row" draggable="true" data-column="${escapeHTML(c.id)}">
      <span class="grip" title="Arrastar"><svg class="icon"><use href="#i-grip"/></svg></span>
      <span class="order">${i + 1}</span>
      <div class="name"><strong>${escapeHTML(c.label)}</strong><small>${escapeHTML(c.key)}</small></div>
      <span class="type"><span class="chip">${COLUMN_TYPES[c.type]}</span></span>
      <div class="flags">
        ${c.technicianEditable ? `<span class="chip primary">Editável em campo</span>` : ""}
        ${c.type === "select" ? `<span class="chip" title="${escapeHTML(c.options.join(", "))}">${c.options.length} opções</span>` : ""}
        ${reserved ? `<span class="chip warn" title="Coberta pelas colunas padrão SEMANA/EQUIPE ou pelos registros de execução">Ignorada no template</span>` : ""}
      </div>
      <div class="row-actions">
        <button class="icon-btn sm" type="button" data-move="-1" data-col="${escapeHTML(c.id)}" ${i === 0 ? "disabled" : ""} title="Subir"><svg class="icon"><use href="#i-up"/></svg></button>
        <button class="icon-btn sm" type="button" data-move="1" data-col="${escapeHTML(c.id)}" ${i === cols.length - 1 ? "disabled" : ""} title="Descer"><svg class="icon"><use href="#i-down"/></svg></button>
        <button class="icon-btn sm" type="button" data-edit-col="${escapeHTML(c.id)}" title="Editar"><svg class="icon"><use href="#i-edit"/></svg></button>
        <button class="icon-btn sm danger" type="button" data-delete-col="${escapeHTML(c.id)}" title="Excluir"><svg class="icon"><use href="#i-trash"/></svg></button>
      </div>
    </div>`;
  }).join("");

  const tcols = templateColumns(activity);
  $("templatePreview").innerHTML = `<thead><tr>${tcols.map(c => `<th>${escapeHTML(c.label)}</th>`).join("")}</tr></thead>
    <tbody><tr>${tcols.map(c => `<td>${escapeHTML(c.key === "week" ? weekLabel(currentWeekNumber()) : c.key === "team" ? "Equipe A" :c.type === "select" ? (c.options[0] || "opção") : c.type === "date" ? "DD/MM/AAAA" : c.type === "number" ? "0" : c.type === "boolean" ? "SIM" : "")}</td>`).join("")}</tr></tbody>`;
}

function openActivityModal(id = null) {
  const activity = id ? activityById(id) : null;
  state.editingActivityId = activity?.id || null;
  setText("activityModalTitle", activity ? "Editar atividade" : "Nova atividade");
  $("afName").value = activity?.name || "";
  $("afDescription").value = activity?.description || "";
  setMessage("activityFormMessage", "");
  openModal("activityModal");
}

async function saveActivity(event) {
  event.preventDefault();
  const name = $("afName").value.trim().replace(/\s+/g, " ");
  const description = $("afDescription").value.trim();
  if (!name) return setMessage("activityFormMessage", "Informe o nome.");
  if (state.activities.some(a => normalizeText(a.name) === normalizeText(name) && a.id !== state.editingActivityId)) {
    return setMessage("activityFormMessage", "Já existe uma atividade com esse nome.");
  }
  await withButton(event.submitter, async () => {
    try {
      await withBusy(async () => {
        const sb = requireDb();
        if (state.editingActivityId) {
          const { error } = await sb.from("tb_atividades").update({ nome: name, descricao: description || null, updated_at: new Date().toISOString() }).eq("id", state.editingActivityId);
          if (error) throw error;
          Object.assign(activityById(state.editingActivityId), { name, description });
        } else {
          const { data, error } = await sb.from("tb_atividades").insert({ nome: name, descricao: description || null, ativo: true }).select("id").single();
          if (error) throw error;
          state.activities.push({ id: data.id, name, description, columns: [] });
          state.activityId = data.id;
        }
      });
      closeModal("activityModal");
      renderActivities();
      toast("Atividade salva.");
    } catch (error) {
      setMessage("activityFormMessage", dbErrorMessage(error));
    }
  });
}

async function deactivateActivity() {
  const activity = activityById(state.activityId);
  if (!activity) return;
  const count = state.programs.filter(p => p.activityId === activity.id).length;
  const ok = await confirmDialog({
    title: `Desativar “${activity.name}”?`,
    text: `A atividade deixa de aparecer para programação e para o campo.${count ? ` As ${count} programação(ões) existentes são preservadas no banco.` : ""}`,
    okLabel: "Desativar", danger: true
  });
  if (!ok) return;
  try {
    await withBusy(async () => {
      const { error } = await requireDb().from("tb_atividades").update({ ativo: false, updated_at: new Date().toISOString() }).eq("id", activity.id);
      if (error) throw error;
    });
    state.activities = state.activities.filter(a => a.id !== activity.id);
    state.activityId = state.activities[0]?.id || null;
    renderActivities();
    toast("Atividade desativada.");
  } catch (error) {
    toast(dbErrorMessage(error), "error");
  }
}

function openColumnModal(id = null) {
  const activity = activityById(state.activityId);
  if (!activity) return;
  const column = id ? activity.columns.find(c => c.id === id) : null;
  state.editingColumnId = column?.id || null;
  setText("columnModalTitle", column ? "Editar coluna" : "Nova coluna");
  $("cfLabel").value = column?.label || "";
  $("cfKey").value = column?.key || "";
  $("cfKey").disabled = Boolean(column);
  setText("cfKeyHint", column ? "A chave não pode ser alterada: os dados já gravados usam este identificador." : "Gerada a partir do nome. Identificador usado no banco.");
  $("cfType").value = column?.type || "text";
  $("cfOptions").value = (column?.options || []).join(", ");
  $("cfEditable").checked = Boolean(column?.technicianEditable);
  $("cfOptionsWrap").classList.toggle("hidden", $("cfType").value !== "select");
  setMessage("columnFormMessage", "");
  openModal("columnModal");
}

async function saveColumn(event) {
  event.preventDefault();
  const activity = activityById(state.activityId);
  if (!activity) return;
  const editing = activity.columns.find(c => c.id === state.editingColumnId) || null;
  const label = $("cfLabel").value.trim().replace(/\s+/g, " ");
  const key = editing ? editing.key : makeKey($("cfKey").value || label);
  const type = $("cfType").value;
  const options = type === "select" ? [...new Set($("cfOptions").value.split(",").map(o => o.trim()).filter(Boolean))] : [];

  if (!label || !key) return setMessage("columnFormMessage", "Informe o nome da coluna.");
  if (type === "select" && !options.length) return setMessage("columnFormMessage", "Informe ao menos uma opção para a lista.");
  if (activity.columns.some(c => c.id !== editing?.id && (c.key === key || makeKey(c.label) === makeKey(label)))) {
    return setMessage("columnFormMessage", "Já existe uma coluna com esse nome ou chave nesta atividade.");
  }
  if (!editing && FIXED_COLUMNS.some(f => f.key === key || [makeKey(f.label), ...f.aliases].includes(makeKey(label)))) {
    return setMessage("columnFormMessage", `“${label}” já é uma coluna padrão do template (SEMANA e EQUIPE).`);
  }

  // Nenhuma coluna é obrigatória: a importação aceita células em branco.
  const payload = {
    rotulo: label, tipo: type, obrigatorio: false, editavel_tecnico: $("cfEditable").checked,
    opcoes: options, updated_at: new Date().toISOString()
  };

  await withButton(event.submitter, async () => {
    try {
      await withBusy(async () => {
        const sb = requireDb();
        if (editing) {
          const { error } = await sb.from("tb_atividade_colunas").update(payload).eq("id", editing.id);
          if (error) throw error;
          Object.assign(editing, { label, type, required: payload.obrigatorio, technicianEditable: payload.editavel_tecnico, options });
        } else {
          const ordem = activity.columns.length;
          const { data, error } = await sb.from("tb_atividade_colunas").insert({ ...payload, atividade_id: activity.id, chave: key, ordem }).select("*").single();
          if (error) throw error;
          activity.columns.push(mapColumn(data));
        }
      });
      closeModal("columnModal");
      renderActivities();
      toast("Coluna salva.");
    } catch (error) {
      setMessage("columnFormMessage", dbErrorMessage(error));
    }
  });
}

async function deleteColumn(id) {
  const activity = activityById(state.activityId);
  const column = activity?.columns.find(c => c.id === id);
  if (!column) return;
  const ok = await confirmDialog({
    title: `Excluir a coluna “${column.label}”?`,
    text: "Ela sai do template, da tabela e da tela de campo. Os valores já importados permanecem gravados nas programações.",
    okLabel: "Excluir", danger: true
  });
  if (!ok) return;
  try {
    await withBusy(async () => {
      const { error } = await requireDb().from("tb_atividade_colunas").delete().eq("id", id);
      if (error) throw error;
    });
    activity.columns = activity.columns.filter(c => c.id !== id);
    await persistColumnOrder(activity);
    renderActivities();
    toast("Coluna excluída.");
  } catch (error) {
    toast(dbErrorMessage(error), "error");
  }
}

async function persistColumnOrder(activity) {
  const changed = activity.columns.map((c, i) => ({ c, i })).filter(({ c, i }) => c.ordem !== i);
  if (!changed.length) return;
  await withBusy(async () => {
    const sb = requireDb();
    const results = await Promise.all(changed.map(({ c, i }) => sb.from("tb_atividade_colunas").update({ ordem: i }).eq("id", c.id)));
    const failed = results.find(r => r.error);
    if (failed) throw failed.error;
    changed.forEach(({ c, i }) => { c.ordem = i; });
  });
}

async function moveColumn(id, toIndex) {
  const activity = activityById(state.activityId);
  if (!activity) return;
  const from = activity.columns.findIndex(c => c.id === id);
  if (from < 0 || toIndex < 0 || toIndex >= activity.columns.length || from === toIndex) return;
  const [moved] = activity.columns.splice(from, 1);
  activity.columns.splice(toIndex, 0, moved);
  renderActivities();
  try { await persistColumnOrder(activity); }
  catch (error) { toast(`Ordem não salva: ${dbErrorMessage(error)}`, "error"); }
}

function bindColumnDrag() {
  const list = $("columnList");
  let dragId = null;
  list.addEventListener("dragstart", e => {
    const row = e.target.closest(".column-row");
    if (!row) return;
    dragId = row.dataset.column;
    row.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
  });
  list.addEventListener("dragend", () => {
    dragId = null;
    list.querySelectorAll(".dragging,.drag-over").forEach(el => el.classList.remove("dragging", "drag-over"));
  });
  list.addEventListener("dragover", e => {
    const row = e.target.closest(".column-row");
    if (!row || !dragId) return;
    e.preventDefault();
    list.querySelectorAll(".drag-over").forEach(el => el !== row && el.classList.remove("drag-over"));
    row.classList.add("drag-over");
  });
  list.addEventListener("drop", e => {
    const row = e.target.closest(".column-row");
    if (!row || !dragId) return;
    e.preventDefault();
    const activity = activityById(state.activityId);
    moveColumn(dragId, activity.columns.findIndex(c => c.id === row.dataset.column));
  });
}

function exportActivityForm() {
  const activity = activityById(state.activityId);
  if (!activity) return;
  const jsPDF = window.jspdf?.jsPDF;
  if (!jsPDF) return toast("A biblioteca de PDF não carregou.", "error");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  // Formulário em branco: Semana, Responsável e Equipe são preenchidos à mão em campo.
  let y = pdfHeader(doc, `Formulário de campo · ${activity.name}`, reportMeta({ week: null, responsible: null, team: null }));
  doc.setTextColor(15, 27, 45);
  doc.setFontSize(9);
  doc.text("Data da execução: ____/____/________", 12, y);
  y += 10;
  activityColumns(activity).forEach(c => {
    if (y > 260) { doc.addPage(); y = 18; }
    doc.setDrawColor(207, 216, 227);
    doc.setFillColor(248, 250, 252);
    doc.rect(12, y, 62, 9, "FD");
    doc.rect(74, y, 124, 9);
    doc.setFont("helvetica", "bold");
    doc.text(String(c.label).slice(0, 34), 15, y + 6);
    doc.setFont("helvetica", "normal");
    if (c.type === "select" || c.type === "boolean") {
      const opts = c.type === "boolean" ? ["SIM", "NÃO"] : c.options;
      let x = 78;
      opts.slice(0, 5).forEach(o => { doc.rect(x, y + 2.5, 4, 4); doc.text(String(o).slice(0, 16), x + 6, y + 6); x += 6 + Math.min(16, String(o).length) * 1.9 + 8; });
    }
    y += 11;
  });
  if (y > 230) { doc.addPage(); y = 18; }
  y += 4;
  doc.setFont("helvetica", "bold");
  doc.text("Observações", 12, y);
  doc.rect(12, y + 3, 186, 34);
  y += 48;
  doc.setFont("helvetica", "normal");
  doc.text("Executante: _____________________________________     Assinatura: ______________________________", 12, y);
  pdfFooter(doc);
  doc.save(`formulario_${makeKey(activity.name)}.pdf`);
}
