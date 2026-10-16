/* Planning Pro · admin/importacao-excel.js
 * Template Excel, leitura, validação e gravação da importação (com desfazer em caso de falha).
 */
"use strict";

/* =========================================================
   EXCEL — TEMPLATE, LEITURA E IMPORTAÇÃO
   ========================================================= */

function requireXLSX() {
  if (!window.XLSX) throw new Error("A biblioteca de Excel não carregou. Verifique a conexão e recarregue a página.");
}

function styleHeaderRow(sheet, count) {
  const headerFill = state.settings.header.replace("#", "").toUpperCase();
  for (let c = 0; c < count; c++) {
    const cell = sheet[XLSX.utils.encode_cell({ r: 0, c })];
    if (cell) cell.s = { fill: { fgColor: { rgb: headerFill } }, font: { bold: true, color: { rgb: "FFFFFF" } }, alignment: { horizontal: "center", vertical: "center" } };
  }
  sheet["!rows"] = [{ hpt: 24 }];
}

function downloadTemplate(activity) {
  if (!activity) return toast("Selecione uma atividade.", "error");
  try {
    requireXLSX();
    const cols = templateColumns(activity);
    const headers = cols.map(c => c.label);
    const example = cols.map(c => {
      if (c.key === "week") return weekLabel(currentWeekNumber());
      if (c.key === "team") return state.teams.find(t => t.ativo)?.nome || "Equipe A";
      return "";
    });
    const sheet = XLSX.utils.aoa_to_sheet([headers, example]);
    sheet["!cols"] = headers.map(h => ({ wch: Math.max(14, Math.min(36, h.length + 6)) }));
    sheet["!autofilter"] = { ref: `A1:${XLSX.utils.encode_col(headers.length - 1)}1` };
    styleHeaderRow(sheet, headers.length);

    const info = [
      ["Atividade", activity.name],
      ["Gerado em", nowStamp()],
      [],
      ["Como preencher"],
      ["1", "Não altere nem renomeie os cabeçalhos. SEMANA e EQUIPE são as colunas padrão; as demais são as colunas da atividade."],
      ["2", "SEMANA: escreva a semana em cada linha, como W137 ou apenas 137 (o sistema grava como W137)."],
      ["3", "EQUIPE: nome de uma equipe cadastrada (lista abaixo)."],
      ["4", "As colunas da atividade podem ficar em branco. Datas em DD/MM/AAAA ou como data do Excel."],
      ["5", "Cada linha vira um item programado para a equipe de campo."],
      [],
      ["Coluna", "Tipo", "Equipe de campo edita", "Opções aceitas"],
      ...cols.map(c => [c.label, c.fixed ? "Padrão" : COLUMN_TYPES[c.type], c.technicianEditable ? "Sim" : "Não",
        c.type === "select" ? c.options.join(", ") : c.type === "boolean" ? "SIM, NÃO" : ""]),
      [],
      ["Equipes cadastradas"],
      ...state.teams.filter(t => t.ativo).map(t => [t.nome, DISCIPLINE_LABELS[t.disciplina] || t.disciplina || ""])
    ];
    const infoSheet = XLSX.utils.aoa_to_sheet(info);
    infoSheet["!cols"] = [{ wch: 26 }, { wch: 60 }, { wch: 22 }, { wch: 40 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, "Programação");
    XLSX.utils.book_append_sheet(wb, infoSheet, "Leia-me");
    XLSX.writeFile(wb, `template_${makeKey(activity.name)}.xlsx`);
    toast("Template gerado.");
  } catch (error) {
    toast(error.message, "error");
  }
}

async function readSheetRows(file) {
  requireXLSX();
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  const name = wb.SheetNames.find(n => makeKey(n) === "programacao") || wb.SheetNames[0];
  if (!name) throw new Error("O arquivo não possui planilhas.");
  return XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: "", raw: true, blankrows: false });
}

// Valida e converte as linhas do Excel. Retorna registros válidos e a lista completa de erros.
function parseProgramRows(rows, activity) {
  if (!rows.length) throw new Error("A planilha está vazia.");
  const headers = rows[0].map(h => makeKey(cellText(h)));
  const used = new Set();
  const findIndex = candidates => {
    const idx = headers.findIndex((h, i) => !used.has(i) && candidates.includes(h));
    if (idx >= 0) used.add(idx);
    return idx;
  };

  const customCols = activityColumns(activity).map(c => ({ col: c, index: findIndex([makeKey(c.label), c.key]) }));
  const fixed = Object.fromEntries(FIXED_COLUMNS.map(f => [f.key, findIndex([makeKey(f.label), ...f.aliases])]));

  // SEMANA e EQUIPE definem para quem e quando o item aparece: sem elas a linha não tem destino.
  const missingHeaders = FIXED_COLUMNS.filter(f => fixed[f.key] < 0).map(f => f.label);
  if (missingHeaders.length) throw new Error(`O arquivo precisa das colunas padrão ${missingHeaders.join(" e ")}. Baixe o template da atividade “${activity.name}”.`);

  const errors = [];
  const records = [];
  const at = (row, i) => (i >= 0 ? row[i] : "");

  rows.slice(1).forEach((row, i) => {
    if (!row.some(v => cellText(v) !== "")) return;
    const line = i + 2;
    const rowErrors = [];

    const weekNum = weekToNumber(cellText(at(row, fixed.week)));
    if (!weekNum) rowErrors.push(`SEMANA “${cellText(at(row, fixed.week)) || "vazia"}” inválida (use W137 ou 137)`);

    const teamText = cellText(at(row, fixed.team));
    const team = teamByName(teamText);
    if (!teamText) rowErrors.push("EQUIPE vazia");
    else if (!team) rowErrors.push(`equipe “${teamText}” não cadastrada`);
    else if (!team.ativo) rowErrors.push(`equipe “${team.nome}” está inativa`);

    const customData = {};
    customCols.forEach(({ col, index }) => {
      const raw = at(row, index);
      let value = cellText(raw);
      if (value && col.type === "date") {
        const d = normalizeDateValue(raw);
        if (d === null) rowErrors.push(`${col.label}: data inválida`); else value = d;
      } else if (value && col.type === "number") {
        const n = Number(value.replace(/\s/g, "").replace(",", "."));
        if (!Number.isFinite(n)) rowErrors.push(`${col.label}: número inválido`); else value = String(n);
      } else if (value && col.type === "boolean") {
        const b = normalizeBoolean(value);
        if (b === null) rowErrors.push(`${col.label}: use SIM ou NÃO`); else value = b;
      } else if (value && col.type === "select" && col.options.length) {
        const match = col.options.find(o => normalizeText(o) === normalizeText(value));
        if (!match) rowErrors.push(`${col.label}: “${value}” fora da lista (${col.options.join(", ")})`); else value = match;
      }
      customData[col.key] = value;
    });

    if (rowErrors.length) { errors.push(`Linha ${line}: ${rowErrors.join("; ")}.`); return; }
    records.push({ line, weekNum, week: weekLabel(weekNum), team, customData });
  });

  if (!records.length && !errors.length) throw new Error("O arquivo não possui linhas de dados.");
  return { records, errors };
}

// Converte de volta para linha do banco (usado para restaurar itens em caso de falha).
function programToRow(p) {
  return {
    id: p.id, equipamento_id: p.equipmentId, semana: p.weekNum, status: p.status, atividade_id: p.activityId,
    data_programacao: p.date || null, equipe_id: p.teamId, responsavel_id: p.responsibleId || null, quantidade: 1,
    observacao: p.note || null, dados_personalizados: p.customData, modo_importacao: p.mode || MODE_APPEND,
    arquivo_importacao: p.file || null, usuario_importacao: p.importedBy || null, created_at: p.createdAt
  };
}

const DB_COLUMN_LABELS = { equipamento_id: "EQUIPAMENTO", semana: "SEMANA", atividade_id: "ATIVIDADE", equipe_id: "EQUIPE" };

// Traduz a recusa de chave duplicada (23505) indicando quais linhas do arquivo causaram o conflito.
function describeUniqueViolation(error, records, equipmentIds) {
  const m = String(error?.details || "").match(/Key \(([^)]+)\)=\(([^)]*)\)/);
  const constraint = String(error?.message || "").match(/constraint "([^"]+)"/)?.[1] || "";
  if (!m) return `O banco recusou itens duplicados${constraint ? ` (restrição ${constraint})` : ""}. ${error?.details || error?.message || ""}`;
  const cols = m[1].split(",").map(s => s.trim());
  const vals = m[2].split(",").map(s => s.trim());
  const labelById = new Map();
  records.forEach(r => { const id = equipmentIds.get(equipmentKey(r.customData)); if (id) labelById.set(String(id), equipmentLabel(r.customData)); });
  const readable = cols.map((c, i) => `${DB_COLUMN_LABELS[c] || c} ${c === "equipamento_id" ? (labelById.get(vals[i]) || vals[i]) : c === "semana" ? weekLabel(vals[i]) : c === "equipe_id" ? (teamName(vals[i]) || vals[i]) : vals[i]}`);
  const lines = records.filter(r => cols.every((c, i) =>
    c === "equipamento_id" ? String(equipmentIds.get(equipmentKey(r.customData))) === vals[i]
      : c === "semana" ? String(r.weekNum) === vals[i]
      : c === "equipe_id" ? String(r.team.id) === vals[i]
      : true)).map(r => r.line);
  return `O banco não aceita duas programações com a mesma combinação ${cols.map(c => DB_COLUMN_LABELS[c] || c).join(" + ")} (restrição ${constraint}). `
    + `Conflito: ${readable.join(", ")}${lines.length ? ` — linha(s) ${lines.join(", ")} do arquivo` : ""}. `
    + (cols.includes("equipamento_id")
      ? "O banco ainda impede o mesmo equipamento duas vezes na semana, mesmo com campos diferentes. Execute 011_programacao_sem_unicidade_equipamento.sql no SQL Editor do Supabase e importe novamente."
      : "Esse item já está programado no banco ou repetido no arquivo.");
}

async function handleProgramFile(file) {
  const activity = activityById(state.program.activityId);
  if (!file) return;
  if (!activity) return toast("Selecione uma atividade antes de importar.", "error");
  try {
    const rows = await readSheetRows(file);
    // Recarrega do banco: a base pode ter sido alterada fora do app (ex.: limpeza via SQL).
    await withBusy(loadAdminPrograms);
    const { records, errors } = parseProgramRows(rows, activity);
    state.pendingImport = { file: file.name, activityId: activity.id, records, errors };
    renderImportModal();
    openModal("importModal");
  } catch (error) {
    toast(error.message || "Não foi possível ler o arquivo.", "error");
  }
}

function replaceCandidates(pending) {
  const weeks = new Set(pending.records.map(r => r.weekNum));
  return state.programs.filter(p => p.activityId === pending.activityId && weeks.has(p.weekNum) && !isDone(p));
}

function renderImportModal() {
  const pending = state.pendingImport;
  if (!pending) return;
  const activity = activityById(pending.activityId);
  const weeks = sortWeeks(pending.records.map(r => r.week));
  setText("importFile", pending.file);
  setText("importActivity", activity?.name || "—");
  setText("importCount", pending.records.length);
  setText("importWeeks", weeks.join(", ") || "—");

  const errorsBox = $("importErrors");
  errorsBox.classList.toggle("hidden", !pending.errors.length);
  if (!pending.errors.length) errorsBox.innerHTML = "";
  if (pending.errors.length) {
    errorsBox.innerHTML = `<strong>${pending.errors.length} problema(s) no arquivo. Corrija o arquivo e importe novamente — nenhuma linha será gravada enquanto houver erros.</strong><ul>${pending.errors.slice(0, 200).map(e => `<li>${escapeHTML(e)}</li>`).join("")}</ul>${pending.errors.length > 200 ? `<p>… e mais ${pending.errors.length - 200}.</p>` : ""}`;
  }

  const cols = templateColumns(activity);
  const preview = pending.records.slice(0, 6);
  $("importPreview").innerHTML = `<thead><tr><th>Linha</th>${cols.map(c => `<th>${escapeHTML(c.label)}</th>`).join("")}</tr></thead><tbody>${preview.map(r => `<tr><td class="mono">${r.line}</td>${cols.map(c => {
    const v = c.key === "week" ? r.week : c.key === "team" ? r.team.nome : formatColumnValue(c, r.customData[c.key]);
    return `<td>${escapeHTML(dash(v))}</td>`;
  }).join("")}</tr>`).join("")}</tbody>`;
  $("importPreview").querySelectorAll("tbody td").forEach(td => { td.style.fontStyle = "normal"; td.style.color = "var(--text)"; });
  $("importPreviewWrap").classList.toggle("hidden", !preview.length);

  const replaceCount = replaceCandidates(pending).length;
  $("importReplaceHint").innerHTML = `Remove <b>${replaceCount}</b> item(ns) <b>pendente(s)</b> de ${escapeHTML(activity?.name || "")} em ${escapeHTML(weeks.join(", ") || "—")} e grava o arquivo. Itens já executados são mantidos.`;
  setMessage("importMessage", "");
  $("importConfirm").disabled = Boolean(pending.errors.length) || !pending.records.length;
  $("importModes").classList.toggle("hidden", Boolean(pending.errors.length));
}

async function confirmImport() {
  const pending = state.pendingImport;
  if (!pending || pending.errors.length) return;
  const activity = activityById(pending.activityId);
  const mode = document.querySelector('input[name="importMode"]:checked')?.value === "replace" ? MODE_REPLACE : MODE_APPEND;
  const toReplace = mode === MODE_REPLACE ? replaceCandidates(pending).map(p => p.id) : [];

  if (mode === MODE_REPLACE && toReplace.length) {
    const ok = await confirmDialog({ title: "Substituir programação?", text: `${toReplace.length} item(ns) pendente(s) serão removidos e substituídos pelas ${pending.records.length} linhas do arquivo.`, okLabel: "Substituir", danger: true });
    if (!ok) return;
  }

  const records = pending.records;
  let equipmentIds = new Map();
  await withButton($("importConfirm"), async () => {
    try {
      const inserted = await withBusy(async () => {
        const sb = requireDb();
        equipmentIds = await resolveEquipment(records.map(r => r.customData));
        const payloads = records.map(r => ({
          equipamento_id: equipmentIds.get(equipmentKey(r.customData)) || null,
          semana: r.weekNum,
          status: "PROGRAMADO",
          atividade_id: activity.id,
          data_programacao: null,
          equipe_id: r.team.id,
          responsavel_id: null,
          quantidade: 1,
          observacao: null,
          dados_personalizados: r.customData,
          modo_importacao: mode,
          arquivo_importacao: pending.file,
          usuario_importacao: state.user.authUserId
        }));
        // Remove os pendentes substituídos ANTES de gravar: a nova carga normalmente traz as mesmas
        // TAGs/semanas, e o banco recusaria duplicidade. Se qualquer etapa falhar, tudo é desfeito.
        const removed = state.programs.filter(p => toReplace.includes(p.id));
        const created = [];
        try {
          for (const part of chunk(toReplace, IN_CHUNK)) {
            const { error } = await sb.from("tb_programacoes").delete().in("id", part);
            if (error) throw error;
          }
          for (const part of chunk(payloads, 500)) {
            const { data, error } = await sb.from("tb_programacoes").insert(part).select(PROGRAM_COLUMNS);
            if (error) throw error;
            created.push(...(data || []).map(mapProgram));
          }
        } catch (error) {
          const rollbackFailed = await rollbackImport(created, removed);
          if (rollbackFailed) error.rollbackFailed = rollbackFailed;
          throw error;
        }
        const removedIds = new Set(toReplace);
        state.programs = [...state.programs.filter(p => !removedIds.has(p.id)), ...created];
        return { created: created.length };
      });
      closeModal("importModal");
      state.program.week = "";
      renderProgramacao();
      const parts = [`${inserted.created} item(ns) importado(s)`];
      if (toReplace.length) parts.push(`${toReplace.length} substituído(s)`);
      toast(parts.join(" · ") + ".");
    } catch (error) {
      console.warn("Importação recusada:", error?.code, error?.message, error?.details);
      const base = error?.code === "23505"
        ? describeUniqueViolation(error, records, equipmentIds)
        : dbErrorMessage(error, "Não foi possível gravar a importação.");
      setMessage("importMessage", error?.rollbackFailed
        ? `${base} ATENÇÃO: não foi possível desfazer totalmente (${error.rollbackFailed}). Clique em Atualizar e confira a programação.`
        : `${base} Nenhuma programação foi alterada.`);
    }
  });
}

// Desfaz uma importação que falhou no meio: apaga o que foi gravado e restaura os itens substituídos.
async function rollbackImport(created, removed) {
  const sb = requireDb();
  const problems = [];
  for (const part of chunk(created.map(p => p.id), IN_CHUNK)) {
    const { error } = await sb.from("tb_programacoes").delete().in("id", part);
    if (error) problems.push(`remover itens novos: ${error.message}`);
  }
  for (const part of chunk(removed.map(programToRow), 500)) {
    const { error } = await sb.from("tb_programacoes").upsert(part, { onConflict: "id", ignoreDuplicates: true });
    if (error) problems.push(`restaurar itens substituídos: ${error.message}`);
  }
  return problems.join("; ");
}

function exportProgramList() {
  const activity = activityById(state.program.activityId);
  if (!activity) return;
  try {
    requireXLSX();
    const cols = activityColumns(activity);
    const rows = filteredAdminPrograms();
    const headers = ["SEMANA", "EQUIPE", ...cols.map(c => c.label), "SITUAÇÃO", "ÚLTIMA EXECUÇÃO", "EXECUTADO POR", "EXECUÇÕES"];
    const data = rows.map(p => {
      const ex = executionsOf(p.id);
      return [p.week, teamName(p.teamId), ...cols.map(c => columnValue(p, c)),
        isDone(p) ? "EXECUTADO" : "PENDENTE", ex.length ? fmtDateTime(ex.at(-1).executado_em) : "", ex.length ? executorName(ex.at(-1)) : "", ex.length];
    });
    const sheet = XLSX.utils.aoa_to_sheet([headers, ...data]);
    sheet["!cols"] = headers.map(h => ({ wch: Math.max(12, Math.min(34, h.length + 6)) }));
    sheet["!autofilter"] = { ref: `A1:${XLSX.utils.encode_col(headers.length - 1)}${data.length + 1}` };
    styleHeaderRow(sheet, headers.length);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, "Programação");
    XLSX.writeFile(wb, `programacao_${makeKey(activity.name)}${state.program.week ? `_${state.program.week}` : ""}.xlsx`);
  } catch (error) {
    toast(error.message, "error");
  }
}
