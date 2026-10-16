/* Planning Pro · core/utils.js
 * Utilitários: texto, datas, semanas (W137) e normalização de valores do Excel.
 */
"use strict";

/* =========================================================
   UTILITÁRIOS
   ========================================================= */

const $ = id => document.getElementById(id);
const setText = (id, value) => { const el = $(id); if (el) el.textContent = String(value ?? ""); };

const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[c]);
const dash = value => (value === null || value === undefined || String(value).trim() === "") ? "—" : String(value);

const normalizeText = value => String(value ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

function makeKey(label) {
  return normalizeText(label).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
}

const chunk = (list, size) => {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
};

const pad2 = n => String(n).padStart(2, "0");
const toISODate = date => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

function fmtDate(value) {
  if (!value) return "—";
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(value);
}

function fmtDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

// localStorage/sessionStorage podem lançar exceção (modo privado, bloqueio de rastreamento do Edge).
function storageGet(store, key) { try { return store.getItem(key) || ""; } catch { return ""; } }
function storageSet(store, key, value) { try { store.setItem(key, value); return true; } catch { return false; } }
function storageRemove(store, key) { try { store.removeItem(key); } catch { /* indisponível */ } }

const nowStamp = () => fmtDateTime(new Date().toISOString());
const pct = (part, total) => total ? Math.round(part / total * 100) : 0;
const initials = name => String(name || "?").trim().split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase() || "?";
const sortByName = (a, b) => String(a.nome || a.name || "").localeCompare(String(b.nome || b.name || ""), "pt-BR", { numeric: true, sensitivity: "base" });

/* ---------- semanas ---------- */

function currentWeekNumber() {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return WEEK_ANCHOR_NUMBER + Math.floor(Math.round((start - WEEK_ANCHOR) / 86400000) / 7);
}

// Aceita W137, w137, W 137, W-137, Semana 137, 137 e o número 137 do Excel. Tudo vira 137 (exibido como W137).
function weekToNumber(value) {
  if (typeof value === "number") return Number.isInteger(value) && value > 0 ? value : null;
  const s = normalizeText(value).toUpperCase()
    .replace(/^(SEMANA|SEM|WEEK|WK)\.?/, "W")
    .replace(/[\s_-]+/g, "")
    .replace(/[.,]0+$/, "");
  const m = s.match(/^W?(\d{1,4})$/);
  return m && Number(m[1]) > 0 ? Number(m[1]) : null;
}

const weekLabel = n => `W${n}`;
const sortWeeks = list => [...new Set(list.filter(Boolean))].sort((a, b) => weekToNumber(a) - weekToNumber(b));

/* ---------- valores das células ---------- */

const isDateObject = value => Object.prototype.toString.call(value) === "[object Date]";

function normalizeDateValue(value) {
  // +12h absorve o deslocamento de fuso que o SheetJS pode aplicar em datas sem hora.
  if (isDateObject(value)) return Number.isNaN(value.getTime()) ? null : toISODate(new Date(value.getTime() + 43200000));
  if (typeof value === "number" && window.XLSX?.SSF) {
    const p = XLSX.SSF.parse_date_code(value);
    if (p) return `${p.y}-${pad2(p.m)}-${pad2(p.d)}`;
  }
  const s = String(value ?? "").trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const br = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (br) {
    const year = br[3].length === 2 ? `20${br[3]}` : br[3];
    return `${year}-${pad2(br[2])}-${pad2(br[1])}`;
  }
  return null; // inválida
}

function normalizeBoolean(value) {
  const s = normalizeText(value);
  if (!s) return "";
  if (["sim", "s", "yes", "y", "true", "1", "x", "ok"].includes(s)) return "SIM";
  if (["nao", "n", "no", "false", "0"].includes(s)) return "NÃO";
  return null;
}

function cellText(value) {
  if (isDateObject(value)) return normalizeDateValue(value) || "";
  return String(value ?? "").trim();
}

function formatColumnValue(column, value) {
  if (value === null || value === undefined || value === "") return "—";
  if (column?.type === "date") return fmtDate(value);
  return String(value);
}
