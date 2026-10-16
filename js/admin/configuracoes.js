/* Planning Pro · admin/configuracoes.js
 * Identidade visual (logo e cores) compartilhada pelo banco e tema claro/escuro.
 */
"use strict";

/* =========================================================
   CONFIGURAÇÕES / TEMA
   A identidade visual fica em tb_configuracoes (migration 012) e vale para todos os
   usuários, inclusive a tela de login. O localStorage guarda só uma cópia para a
   primeira pintura da página, antes da resposta do banco.
   ========================================================= */

const SETTINGS_KEY = "identidade";

const pickSettings = obj => ({ ...DEFAULT_SETTINGS, ...Object.fromEntries(Object.entries(obj || {}).filter(([k]) => k in DEFAULT_SETTINGS)) });

function loadSettings() {
  try { state.settings = pickSettings(JSON.parse(storageGet(localStorage, "ppaSettings") || "null")); }
  catch { state.settings = { ...DEFAULT_SETTINGS }; }
  applySettings();
}

function cacheSettings() {
  storageSet(localStorage, "ppaSettings", JSON.stringify(state.settings));
}

// Origem da identidade: "db" (lida do banco), "empty" (tabela existe, sem registro) ou "unavailable" (sem a 012).
let settingsSource = "unavailable";
const SETTINGS_TABLE_MISSING = "A identidade visual ainda não está no banco: execute 012_identidade_e_dashboard_campo.sql no SQL Editor do Supabase. Até lá, a logo aparece só neste navegador (não aparece no celular nem na tela de login de outros aparelhos).";

// Lê a identidade do banco (disponível também antes do login).
async function loadSystemSettings() {
  const sb = db();
  if (!sb) return;
  const { data, error } = await sb.from("tb_configuracoes").select("valor").eq("chave", SETTINGS_KEY).maybeSingle();
  if (error) { settingsSource = "unavailable"; console.warn("Identidade visual do banco indisponível:", error.message); return; }
  if (!data?.valor) { settingsSource = "empty"; return; }
  settingsSource = "db";
  state.settings = pickSettings(data.valor);
  cacheSettings();
  applySettings();
}

// Ao entrar como admin: se o banco ainda não tem a identidade, publica a deste navegador
// (logo/cores salvas antes da 012), para que o login de todos os aparelhos passe a mostrá-la.
async function publishSettingsIfNeeded() {
  if (state.user?.role !== "admin" || settingsSource !== "empty") return;
  if (JSON.stringify(state.settings) === JSON.stringify(DEFAULT_SETTINGS)) return;
  try {
    await saveSettings();
    settingsSource = "db";
    toast("Identidade visual publicada: a logo agora aparece no login de todos os aparelhos.");
  } catch (error) {
    console.warn("Não foi possível publicar a identidade visual:", error.message);
  }
}

async function saveSettings() {
  const { error } = await requireDb().from("tb_configuracoes")
    .upsert({ chave: SETTINGS_KEY, valor: state.settings, updated_at: new Date().toISOString() }, { onConflict: "chave" });
  if (error) {
    throw new Error(/relation .*tb_configuracoes|does not exist|schema cache/i.test(error.message)
      ? "A tabela de configurações não existe. Execute 012_identidade_e_dashboard_campo.sql no SQL Editor do Supabase."
      : dbErrorMessage(error));
  }
  settingsSource = "db";
  cacheSettings();
  applySettings();
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
  // Na tela de login a logo aparece inteira (sem recorte quadrado).
  const loginLogo = $("loginLogo");
  if (loginLogo) {
    loginLogo.classList.toggle("hidden", !state.settings.logo);
    if (state.settings.logo) loginLogo.src = state.settings.logo;
    $("loginBrandMark")?.classList.toggle("hidden", Boolean(state.settings.logo));
  }
}

function renderSettings() {
  const s = state.settings;
  const warn = $("settingsDbWarn");
  warn.classList.toggle("hidden", settingsSource !== "unavailable");
  warn.textContent = settingsSource === "unavailable" ? SETTINGS_TABLE_MISSING : "";
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
