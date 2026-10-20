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

// Equipe exibida no cabeçalho: a escolhida no filtro, a da pessoa de campo ou "Todas as equipes".
function reportTeamLabel(teamId = "") {
  if (teamId) return teamName(teamId) || "—";
  if (state.user?.role === "technician") return teamName(state.user.equipeId) || "Todas as equipes";
  return "Todas as equipes";
}

// Campos do cabeçalho. Valor null = campo em branco para preencher à mão (formulários).
function reportMeta({ week, team, responsible } = {}) {
  return [
    ["SEMANA", week === null ? null : (week || "Todas as semanas")],
    ["RESPONSÁVEL", responsible === null ? null : (responsible || state.user?.nome || "—")],
    ["EQUIPE", team === null ? null : (team || reportTeamLabel())],
    ["EMITIDO EM", nowStamp()]
  ];
}

// Cabeçalho padrão dos PDFs: faixa com logo e título + linha de informações (Semana / Responsável / Equipe / Emitido em).
function pdfHeader(doc, title, meta = reportMeta()) {
  const s = state.settings;
  doc.setFillColor(...hexToRgb(s.header));
  doc.rect(0, 0, 210, 26, "F");
  doc.setFillColor(...hexToRgb(s.primary));
  doc.rect(0, 26, 210, 1.4, "F");
  let x = 12;
  if (s.logo) {
    try {
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(10, 5, 32, 16, 2, 2, "F");
      const props = doc.getImageProperties(s.logo);
      const ratio = Math.min(28 / props.width, 12 / props.height);
      doc.addImage(s.logo, "PNG", 26 - props.width * ratio / 2, 13 - props.height * ratio / 2, props.width * ratio, props.height * ratio);
      x = 48;
    } catch (error) { console.warn("Logo não aplicada ao PDF:", error); }
  }
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(title, x, 13);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("Planning Pro · Programação de atividades de campo", x, 19.5);

  // Linha de informações
  const top = 32;
  const colW = [34, 62, 52, 38];
  doc.setFillColor(244, 246, 249);
  doc.roundedRect(10, top, 190, 15, 2, 2, "F");
  let cx = 14;
  meta.forEach(([label, value], i) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(...hexToRgb(s.primary));
    doc.text(label, cx, top + 5.5);
    doc.setFontSize(9.5);
    doc.setTextColor(15, 27, 45);
    if (value === null) {
      doc.setDrawColor(150, 160, 175);
      doc.line(cx, top + 11.5, cx + colW[i] - 8, top + 11.5);
    } else {
      const max = Math.floor((colW[i] - 4) / 1.85);
      const text = String(value);
      doc.text(text.length > max ? `${text.slice(0, max - 1)}…` : text, cx, top + 11.2);
    }
    cx += colW[i];
  });
  return top + 23;
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

function exportSummaryPDF(title, meta, programs, filename) {
  const jsPDF = window.jspdf?.jsPDF;
  if (!jsPDF) return toast("A biblioteca de PDF não carregou.", "error");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let y = pdfHeader(doc, title, meta);
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
  exportSummaryPDF("Previsto x realizado", reportMeta({ week }), state.programs.filter(p => p.week === week), `dashboard_${week}.pdf`);
}

function exportReportPDF() {
  const f = reportFilters();
  const activity = activityById(f.activity)?.name;
  const title = activity ? `Relatório · ${activity}` : "Relatório de programação";
  const parts = [f.week || "todas", activity, teamName(f.team)].filter(Boolean);
  exportSummaryPDF(title, reportMeta({ week: f.week, team: reportTeamLabel(f.team) }), reportPrograms(f), `relatorio_${makeKey(parts.join("_")) || "geral"}.pdf`);
}

function exportFieldPDF() {
  const jsPDF = window.jspdf?.jsPDF;
  if (!jsPDF) return toast("A biblioteca de PDF não carregou.", "error");
  const programs = filteredFieldPrograms();
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const week = weekLabel(state.field.weekNum);
  let y = pdfHeader(doc, "Relatório de campo", reportMeta({ week }));
  y = pdfKpis(doc, y, summarize(programs));
  const rows = programs.map(p => {
    const last = executionsOf(p.id).at(-1);
    return [`${programTitle(p)} · ${activityById(p.activityId)?.name || ""}`, isDone(p) ? "EXECUTADA" : "PENDENTE", last ? fmtDateTime(last.executado_em) : "—"];
  });
  pdfTable(doc, y, "Itens programados", ["ITEM", "SITUAÇÃO", "ÚLTIMO REGISTRO"], rows, [116, 30, 40]);
  pdfFooter(doc);
  doc.save(`campo_${week}.pdf`);
}

function loadImage(src) {
  return new Promise(resolve => {
    if (!src) return resolve(null);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// Cabeçalho do JPEG (mesmo padrão do PDF). Retorna a altura ocupada.
async function drawCanvasHeader(ctx, W, title, meta) {
  const settings = state.settings;
  ctx.fillStyle = settings.header;
  ctx.fillRect(0, 0, W, 130);
  ctx.fillStyle = settings.primary;
  ctx.fillRect(0, 130, W, 6);
  let x = 60;
  const logo = await loadImage(settings.logo);
  if (logo) {
    const boxW = 170, boxH = 84, ratio = Math.min((boxW - 20) / logo.width, (boxH - 20) / logo.height);
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(50, 23, boxW, boxH, 10) : ctx.rect(50, 23, boxW, boxH);
    ctx.fill();
    ctx.drawImage(logo, 50 + (boxW - logo.width * ratio) / 2, 23 + (boxH - logo.height * ratio) / 2, logo.width * ratio, logo.height * ratio);
    x = 250;
  }
  ctx.fillStyle = "#fff";
  ctx.font = "700 40px Inter, Arial";
  ctx.fillText(title, x, 70);
  ctx.font = "20px Inter, Arial";
  ctx.globalAlpha = .8;
  ctx.fillText("Planning Pro · Programação de atividades de campo", x, 104);
  ctx.globalAlpha = 1;

  const top = 160, colW = [260, 460, 420, 300];
  ctx.fillStyle = "#fff";
  ctx.fillRect(50, top, W - 100, 92);
  let cx = 80;
  meta.forEach(([label, value], i) => {
    ctx.fillStyle = settings.primary;
    ctx.font = "700 16px Inter, Arial";
    ctx.fillText(label, cx, top + 34);
    ctx.fillStyle = "#0f1b2d";
    ctx.font = "700 26px Inter, Arial";
    ctx.fillText(String(value ?? "").slice(0, 32), cx, top + 70);
    cx += colW[i];
  });
  return top + 92;
}

async function exportDashboardJPEG() {
  const week = state.dashboardWeek;
  const programs = state.programs.filter(p => p.week === week);
  const s = summarize(programs);
  const groups = byActivity(programs);
  const teams = byTeam(programs);
  const settings = state.settings;
  const W = 1600;
  const rowH = 54;
  const H = 460 + (groups.length + teams.length) * rowH + 200;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#f4f6f9";
  ctx.fillRect(0, 0, W, H);
  const headerBottom = await drawCanvasHeader(ctx, W, "Previsto x realizado", reportMeta({ week }));

  const kpiTop = headerBottom + 30;
  [["PROGRAMADAS", s.total], ["EXECUTADAS", s.done], ["PENDENTES", s.pending], ["REALIZAÇÃO", `${s.rate}%`]].forEach(([label, value], i) => {
    const x = 50 + i * 380;
    ctx.fillStyle = "#fff";
    ctx.fillRect(x, kpiTop, 350, 120);
    ctx.fillStyle = settings.primary;
    ctx.font = "700 18px Inter, Arial";
    ctx.fillText(label, x + 24, kpiTop + 38);
    ctx.fillStyle = "#0f1b2d";
    ctx.font = "700 48px Inter, Arial";
    ctx.fillText(String(value), x + 24, kpiTop + 98);
  });

  let y = kpiTop + 170;
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
