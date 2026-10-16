/* Planning Pro · core/perfil.js
 * Tela de perfil do usuário conectado.
 */
"use strict";

/* =========================================================
   PERFIL
   ========================================================= */

function renderProfile() {
  const u = state.user;
  if (!u) return;
  setText("profileAvatar", initials(u.nome));
  setText("profileName", u.nome);
  setText("profileRole", u.role === "admin" ? "Administrador · Planejamento" : "Equipe de campo");
  const rows = [
    ["E-mail", u.email],
    ["Código de acesso", u.role === "technician" ? u.cracha : ""],
    ["Equipe", teamName(u.equipeId)],
    ["Disciplina", DISCIPLINE_LABELS[u.disciplina] || u.disciplina],
    ["Semana atual", weekLabel(currentWeekNumber())]
  ].filter(([, v]) => v);
  $("profileInfo").innerHTML = rows.map(([k, v]) => `<div><dt>${escapeHTML(k)}</dt><dd>${escapeHTML(v)}</dd></div>`).join("");
}
