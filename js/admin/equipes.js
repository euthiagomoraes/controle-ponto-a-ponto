/* Planning Pro · admin/equipes.js
 * Cadastro de equipes e pessoas (códigos de acesso).
 */
"use strict";

/* =========================================================
   EQUIPES, PESSOAS E SEMANAS
   ========================================================= */

function renderEquipes() {
  const q = normalizeText($("peopleSearch").value);
  const people = [...state.people].sort(sortByName).filter(p => !q || normalizeText(`${p.nome} ${p.cracha} ${teamName(p.equipe_id)}`).includes(q));
  setText("peopleMeta", `${state.people.filter(p => p.ativo).length} ativo(s) de ${state.people.length}`);
  $("peopleBody").innerHTML = people.map(p => `<tr>
    <td><strong>${escapeHTML(p.nome)}</strong></td>
    <td class="mono">${escapeHTML(dash(p.cracha))}</td>
    <td>${escapeHTML(dash(teamName(p.equipe_id)))}</td>
    <td>${p.perfil === "ADMINISTRADOR" ? `<span class="chip primary">Administrador</span>` : `<span class="chip">Campo</span>`}</td>
    <td><span class="status ${p.ativo ? "done" : "inactive"}">${p.ativo ? "Ativo" : "Inativo"}</span></td>
    <td class="actions-cell"><button class="icon-btn sm" type="button" data-edit-person="${escapeHTML(p.id)}" title="Editar"><svg class="icon"><use href="#i-edit"/></svg></button></td>
  </tr>`).join("");
  $("peopleEmpty").classList.toggle("hidden", people.length > 0);

  setText("teamCount", state.teams.length);
  $("teamList").innerHTML = state.teams.map(t => {
    const members = state.people.filter(p => p.equipe_id === t.id && p.ativo).length;
    return `<div class="row-item ${t.ativo ? "" : "inactive"}">
      <div class="grow"><strong>${escapeHTML(t.nome)}</strong><small>${escapeHTML(DISCIPLINE_LABELS[t.disciplina] || t.disciplina || "—")} · ${members} pessoa(s)</small></div>
      <button class="btn ghost sm" type="button" data-toggle-team="${escapeHTML(t.id)}">${t.ativo ? "Desativar" : "Reativar"}</button>
    </div>`;
  }).join("");
}

async function saveTeam(event) {
  event.preventDefault();
  const name = $("teamName").value.trim().replace(/\s+/g, " ");
  const discipline = $("teamDiscipline").value;
  if (!name || !discipline) return setMessage("teamMessage", "Informe nome e disciplina.");
  if (state.teams.some(t => normalizeText(t.nome) === normalizeText(name))) return setMessage("teamMessage", `A equipe “${name}” já existe.`);
  await withButton(event.submitter, async () => {
    try {
      await withBusy(async () => {
        const { data, error } = await requireDb().from("tb_equipes").insert({ nome: name, disciplina: discipline, ativo: true }).select("id,nome,disciplina,ativo").single();
        if (error) throw error;
        state.teams = [...state.teams, { ...data, ativo: data.ativo !== false }].sort(sortByName);
      });
      $("teamForm").reset();
      setMessage("teamMessage", `Equipe “${name}” cadastrada.`, true);
      renderEquipes();
    } catch (error) {
      setMessage("teamMessage", dbErrorMessage(error));
    }
  });
}

async function toggleTeam(id) {
  const team = teamById(id);
  if (!team) return;
  try {
    await withBusy(async () => {
      const { error } = await requireDb().from("tb_equipes").update({ ativo: !team.ativo }).eq("id", id);
      if (error) throw error;
    });
    team.ativo = !team.ativo;
    renderEquipes();
  } catch (error) {
    toast(dbErrorMessage(error), "error");
  }
}


function randomAccessCode() {
  const used = new Set(state.people.map(p => String(p.cracha)));
  let code;
  do { code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 900000 + 100000); } while (used.has(code));
  return code;
}

function openPersonModal(id = null) {
  const person = id ? personById(id) : null;
  state.editingPersonId = person?.id || null;
  setText("personModalTitle", person ? "Editar pessoa" : "Nova pessoa");
  $("psName").value = person?.nome || "";
  $("psCode").value = person?.cracha || randomAccessCode();
  fillSelect($("psTeam"), state.teams.filter(t => t.ativo || t.id === person?.equipe_id).map(t => ({ value: t.id, label: t.nome })), { value: person?.equipe_id || "", placeholder: "Sem equipe" });
  $("psRole").value = person?.perfil === "ADMINISTRADOR" ? "ADMINISTRADOR" : "EXECUTANTE";
  $("psStatus").value = person && !person.ativo ? "0" : "1";
  setMessage("personFormMessage", "");
  openModal("personModal");
}

async function savePerson(event) {
  event.preventDefault();
  const nome = $("psName").value.trim().replace(/\s+/g, " ");
  const cracha = $("psCode").value.trim();
  const team = teamById($("psTeam").value);
  if (!nome || !cracha) return setMessage("personFormMessage", "Nome e código são obrigatórios.");
  if (cracha.length < 4) return setMessage("personFormMessage", "Use um código com pelo menos 4 dígitos (recomendado: 6).");
  if (state.people.some(p => String(p.cracha) === cracha && p.id !== state.editingPersonId)) return setMessage("personFormMessage", "Este código já pertence a outra pessoa.");
  const payload = {
    nome, cracha, perfil: $("psRole").value, ativo: $("psStatus").value === "1",
    equipe_id: team?.id || null, disciplina: team?.disciplina || null, updated_at: new Date().toISOString()
  };
  if (state.editingPersonId === state.user.id && (!payload.ativo || payload.perfil !== "ADMINISTRADOR")) {
    return setMessage("personFormMessage", "Você não pode remover o seu próprio acesso de administrador.");
  }
  await withButton(event.submitter, async () => {
    try {
      await withBusy(async () => {
        const sb = requireDb();
        const query = state.editingPersonId
          ? sb.from("tb_pessoas").update(payload).eq("id", state.editingPersonId)
          : sb.from("tb_pessoas").insert(payload);
        const { error } = await query;
        if (error) throw error;
        await loadPeople();
      });
      closeModal("personModal");
      renderEquipes();
      toast("Pessoa salva.");
    } catch (error) {
      setMessage("personFormMessage", dbErrorMessage(error));
    }
  });
}
