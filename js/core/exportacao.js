/* Planning Pro · core/exportacao.js
 * Exportação de relatórios em PDF e JPEG.
 */
"use strict";

/* =========================================================
   EXPORTAÇÃO — PDF e JPEG
   ========================================================= */

function hexToRgb(hex) {
  const m = String(hex).replace("#", "").match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  return m ? m.slice(1).map(x => parseInt(x, 16)) : [15, 27, 45];
}

function pdfHeader(doc, title, subtitle) {
  const s = state.settings;
  doc.setFillColor(...hexToRgb(s.header));
  doc.rect(0, 0, 210, 30, "F");
  doc.setFillColor(...hexToRgb(s.primary));
  doc.rect(0, 30, 210, 1.6, "F");
  let x = 12;
  if (s.logo) {
    try {
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(10, 6, 30, 18, 2, 2, "F");
      const props = doc.getImageProperties(s.logo);
      const ratio = Math.min(26 / props.width, 14 / props.height);
      doc.addImage(s.logo, "PNG", 25 - props.width * ratio / 2, 15 - props.height * ratio / 2, props.width * ratio, props.height * ratio);
      x = 46;
    } catch (error) { console.warn("Logo não aplicada ao PDF:", error); }
  }
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(title, x, 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text(`${subtitle} · Responsável: ${state.user?.nome || "—"}`, x, 21);
  return 42;
}

function pdfFooter(doc) {
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(120, 134, 152);
    doc.text(`Gerado em ${nowStamp()} · Planning Pro`, 12, 290);
    doc.text(`${i}/${pages}`, 198, 290, { align: "right" });
  }
}

function pdfKpis(doc, y, s) {
  const cards = [["PROGRAMADAS", s.total], ["EXECUTADAS", s.done], ["PENDENTES", s.pending], ["REALIZAÇÃO", `${s.rate}%`]];
  cards.forEach(([label, value], i) => {
    const x = 12 + i * 47;
    doc.setFillColor(244, 246, 249);
    doc.roundedRect(x, y, 44, 20, 2, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...hexToRgb(state.settings.primary));
    doc.text(label, x + 4, y + 7);
    doc.setFontSize(14);
    doc.setTextColor(15, 27, 45);
    doc.text(String(value), x + 4, y + 16);
  });
  return y + 28;
}

function pdfTable(doc, y, title, headers, rows, widths) {
  if (y > 250) { doc.addPage(); y = 18; }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(15, 27, 45);
  doc.text(title, 12, y);
  y += 4;
  const drawHead = () => {
    doc.setFillColor(...hexToRgb(state.settings.header));
    doc.rect(12, y, 186, 7, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7);
    let x = 14;
    headers.forEach((h, i) => { doc.text(h, i === 0 ? x : x + widths[i] - 4, y + 4.8, { align: i === 0 ? "left" : "right" }); x += widths[i]; });
    y += 7;
  };
  drawHead();
  doc.setFont("helvetica", "normal");
  rows.forEach((row, r) => {
    if (y > 278) { doc.addPage(); y = 18; drawHead(); doc.setFont("helvetica", "normal"); }
    if (r % 2) { doc.setFillColor(248, 250, 252); doc.rect(12, y, 186, 6.5, "F"); }
    doc.setTextColor(35, 48, 65);
    doc.setFontSize(7.5);
    let x = 14;
    row.forEach((cell, i) => {
      const text = String(cell ?? "");
      doc.text(i === 0 ? text.slice(0, Math.floor(widths[0] / 1.7)) : text, i === 0 ? x : x + widths[i] - 4, y + 4.5, { align: i === 0 ? "left" : "right" });
      x += widths[i];
    });
    y += 6.5;
  });
  return y + 8;
}

function groupRows(groups) {
  return groups.map(g => [g.label, g.total, g.done, g.pending, `${g.rate}%`]);
}

function exportSummaryPDF(title, subtitle, programs, filename) {
  const jsPDF = window.jspdf?.jsPDF;
  if (!jsPDF) return toast("A biblioteca de PDF não carregou.", "error");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let y = pdfHeader(doc, title, subtitle);
  y = pdfKpis(doc, y, summarize(programs));
  const headers = ["", "PROG.", "EXEC.", "PEND.", "%"];
  const widths = [106, 20, 20, 20, 20];
  y = pdfTable(doc, y, "Por atividade", ["ATIVIDADE", ...headers.slice(1)], groupRows(byActivity(programs)), widths);
  pdfTable(doc, y, "Por equipe", ["EQUIPE", ...headers.slice(1)], groupRows(byTeam(programs)), widths);
  pdfFooter(doc);
  doc.save(filename);
}

function exportDashboardPDF() {
  const week = state.dashboardWeek;
  exportSummaryPDF("Previsto x realizado", `Semana ${week}`, state.programs.filter(p => p.week === week), `dashboard_${week}.pdf`);
}

function exportReportPDF() {
  const f = reportFilters();
  const parts = [f.week || "Todas as semanas", activityById(f.activity)?.name, teamName(f.team)].filter(Boolean);
  exportSummaryPDF("Relatório de programação", parts.join(" · "), reportPrograms(f), `relatorio_${makeKey(parts.join("_")) || "geral"}.pdf`);
}

function exportFieldPDF() {
  const jsPDF = window.jspdf?.jsPDF;
  if (!jsPDF) return toast("A biblioteca de PDF não carregou.", "error");
  const programs = filteredFieldPrograms();
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const week = weekLabel(state.field.weekNum);
  let y = pdfHeader(doc, "Relatório de campo", `${week} · ${teamName(state.user.equipeId) || "Todas as equipes"}`);
  y = pdfKpis(doc, y, summarize(programs));
  const rows = programs.map(p => {
    const last = executionsOf(p.id).at(-1);
    return [`${programTitle(p)} · ${activityById(p.activityId)?.name || ""}`, isDone(p) ? "EXECUTADA" : "PENDENTE", last ? fmtDateTime(last.executado_em) : "—"];
  });
  pdfTable(doc, y, "Itens programados", ["ITEM", "SITUAÇÃO", "ÚLTIMO REGISTRO"], rows, [116, 30, 40]);
  pdfFooter(doc);
  doc.save(`campo_${week}.pdf`);
}

function exportDashboardJPEG() {
  const week = state.dashboardWeek;
  const programs = state.programs.filter(p => p.week === week);
  const s = summarize(programs);
  const groups = byActivity(programs);
  const teams = byTeam(programs);
  const settings = state.settings;
  const W = 1600;
  const rowH = 54;
  const H = 360 + (groups.length + teams.length) * rowH + 200;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#f4f6f9";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = settings.header;
  ctx.fillRect(0, 0, W, 150);
  ctx.fillStyle = settings.primary;
  ctx.fillRect(0, 150, W, 6);
  ctx.fillStyle = "#fff";
  ctx.font = "700 40px Inter, Arial";
  ctx.fillText("Previsto x realizado", 60, 72);
  ctx.font = "22px Inter, Arial";
  ctx.fillText(`Semana ${week} · ${state.user?.nome || ""} · ${nowStamp()}`, 60, 112);

  [["PROGRAMADAS", s.total], ["EXECUTADAS", s.done], ["PENDENTES", s.pending], ["REALIZAÇÃO", `${s.rate}%`]].forEach(([label, value], i) => {
    const x = 60 + i * 375;
    ctx.fillStyle = "#fff";
    ctx.fillRect(x, 190, 350, 120);
    ctx.fillStyle = settings.primary;
    ctx.font = "700 18px Inter, Arial";
    ctx.fillText(label, x + 24, 228);
    ctx.fillStyle = "#0f1b2d";
    ctx.font = "700 48px Inter, Arial";
    ctx.fillText(String(value), x + 24, 288);
  });

  let y = 360;
  const block = (title, list) => {
    ctx.fillStyle = "#0f1b2d";
    ctx.font = "700 24px Inter, Arial";
    ctx.fillText(title, 60, y);
    y += 24;
    list.forEach(g => {
      ctx.fillStyle = "#fff";
      ctx.fillRect(60, y, W - 120, rowH - 8);
      ctx.fillStyle = "#0f1b2d";
      ctx.font = "600 20px Inter, Arial";
      ctx.fillText(String(g.label).slice(0, 48), 80, y + 31);
      ctx.fillStyle = "#e2e8ef";
      ctx.fillRect(760, y + 18, 560, 12);
      ctx.fillStyle = settings.chartDone;
      ctx.fillRect(760, y + 18, 560 * g.rate / 100, 12);
      ctx.fillStyle = "#5a6a7e";
      ctx.font = "600 20px Inter, Arial";
      ctx.fillText(`${g.done}/${g.total} · ${g.rate}%`, 1350, y + 31);
      y += rowH;
    });
    y += 40;
  };
  block("Por atividade", groups);
  block("Por equipe", teams);

  canvas.toBlob(blob => downloadBlob(blob, `dashboard_${week}.jpg`), "image/jpeg", 0.92);
}
