/* Planning Pro · core/ui.js
 * Componentes de interface: toast, modais, confirmação, selects e download.
 */
"use strict";

/* =========================================================
   UI HELPERS
   ========================================================= */

function toast(message, type = "") {
  const el = $("toast");
  if (!el) return;
  el.textContent = message;
  el.className = `toast show ${type}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), type === "error" ? 5000 : 2800);
}

function setMessage(id, text, ok = false) {
  const el = $(id);
  if (!el) return;
  el.textContent = text || "";
  el.classList.toggle("ok", ok);
}

async function withButton(button, task) {
  if (!button) return task();
  button.disabled = true;
  button.classList.add("loading");
  try { return await task(); }
  finally { button.disabled = false; button.classList.remove("loading"); }
}

function openModal(id) {
  const modal = $(id);
  if (!modal) return;
  modal.classList.remove("hidden");
  setTimeout(() => modal.querySelector("input:not([type=hidden]):not([disabled]), select, textarea, button.primary")?.focus(), 30);
}

function closeModal(id) {
  $(id)?.classList.add("hidden");
  if (id === "importModal") state.pendingImport = null;
  if (id === "confirmModal" && confirmDialog.resolve) { confirmDialog.resolve(false); confirmDialog.resolve = null; }
}

function confirmDialog({ title = "Confirmar", text = "", okLabel = "Confirmar", danger = false } = {}) {
  setText("confirmTitle", title);
  setText("confirmText", text);
  const ok = $("confirmOk");
  ok.textContent = okLabel;
  ok.classList.toggle("danger", danger);
  openModal("confirmModal");
  return new Promise(resolve => { confirmDialog.resolve = resolve; });
}

function resolveConfirm(value) {
  const resolve = confirmDialog.resolve;
  confirmDialog.resolve = null;
  $("confirmModal")?.classList.add("hidden");
  resolve?.(value);
}

function fillSelect(select, options, { value, placeholder } = {}) {
  if (!select) return;
  const previous = value ?? select.value;
  select.innerHTML = (placeholder !== undefined ? `<option value="">${escapeHTML(placeholder)}</option>` : "")
    + options.map(o => `<option value="${escapeHTML(o.value)}">${escapeHTML(o.label)}</option>`).join("");
  if (options.some(o => String(o.value) === String(previous))) select.value = previous;
  else if (placeholder === undefined && options[0]) select.value = options[0].value;
  else select.value = "";
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
