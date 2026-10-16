/* Planning Pro · admin/configuracoes.js
 * Configurações visuais (cores, logo) e tema claro/escuro.
 */
"use strict";

/* =========================================================
   CONFIGURAÇÕES / TEMA
   ========================================================= */

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem("ppaSettings") || "null") || {};
    state.settings = { ...DEFAULT_SETTINGS, ...Object.fromEntries(Object.entries(saved).filter(([k]) => k in DEFAULT_SETTINGS)) };
  } catch {
    state.settings = { ...DEFAULT_SETTINGS };
  }
  applySettings();
}

function saveSettings() {
  try { localStorage.setItem("ppaSettings", JSON.stringify(state.settings)); }
  catch { toast("Não foi possível salvar: armazenamento do navegador cheio. Use uma logo menor.", "error"); return false; }
  applySettings();
  return true;
}

function applySettings() {
  const root = document.documentElement.style;
  root.setProperty("--primary", state.settings.primary);
  root.setProperty("--chart-planned", state.settings.chartPlanned);
  root.setProperty("--chart-done", state.settings.chartDone);
  document.querySelectorAll("[data-brand-mark]").forEach(el => {
    el.classList.toggle("has-logo", Boolean(state.settings.logo));
    el.style.backgroundImage = state.settings.logo ? `url("${state.settings.logo}")` : "";
    el.textContent = state.settings.logo ? "" : "PP";
  });
}

function renderSettings() {
  const s = state.settings;
  $("settingsPrimary").value = s.primary;
  $("settingsHeader").value = s.header;
  $("settingsPlanned").value = s.chartPlanned;
  $("settingsDone").value = s.chartDone;
  $("settingsLogoPreview").classList.toggle("hidden", !s.logo);
  $("settingsLogoPlaceholder").classList.toggle("hidden", Boolean(s.logo));
  if (s.logo) $("settingsLogoPreview").src = s.logo;
  const docHead = document.querySelector("#docPreview .doc-head");
  if (docHead) { docHead.style.background = s.header; docHead.style.borderBottomColor = s.primary; }
  const docLogo = $("docPreviewLogo");
  docLogo.style.backgroundImage = s.logo ? `url("${s.logo}")` : "";
  docLogo.textContent = s.logo ? "" : "LOGO";
}

// Converte a logo para PNG reduzido: jsPDF não aceita WebP e o localStorage é limitado.
function readLogo(file) {
  return new Promise((resolve, reject) => {
    if (file.size > 400 * 1024) return reject(new Error("A logo deve ter no máximo 400 KB."));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Formato de imagem não suportado."));
      img.onload = () => {
        const scale = Math.min(1, 480 / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/png"));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function applyTheme() {
  const theme = storageGet(localStorage, "ppaTheme");
  if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
  const dark = theme === "dark" || (!theme && window.matchMedia("(prefers-color-scheme: dark)").matches);
  $("themeToggle")?.querySelector("use")?.setAttribute("href", dark ? "#i-sun" : "#i-moon");
}

function toggleTheme() {
  const dark = document.documentElement.dataset.theme === "dark"
    || (!document.documentElement.dataset.theme && window.matchMedia("(prefers-color-scheme: dark)").matches);
  storageSet(localStorage, "ppaTheme", dark ? "light" : "dark");
  applyTheme();
}
