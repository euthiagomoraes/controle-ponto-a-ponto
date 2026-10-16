/* Planning Pro · core/config.js
 * Constantes do sistema, estrutura padrão das atividades e estado da aplicação.
 */
"use strict";

/* =========================================================
   CONSTANTES
   ========================================================= */

const SUPABASE_URL = window.PPA_SUPABASE_CONFIG?.url || "";
const SUPABASE_KEY = window.PPA_SUPABASE_CONFIG?.anonKey || "";

// Referência de numeração das semanas: segunda-feira 07/09/2026 = W132.
const WEEK_ANCHOR = new Date(2026, 8, 7);
const WEEK_ANCHOR_NUMBER = 132;

const PAGE_SIZE = 50;
const DB_PAGE = 1000;   // limite padrão de linhas do PostgREST
const IN_CHUNK = 150;   // ids por filtro .in() para não estourar a URL

const MODE_APPEND = "INCLUIR_NA_PROGRAMACAO";
const MODE_REPLACE = "NOVA_PROGRAMACAO";

const DISCIPLINE_LABELS = {
  ELETRICA: "Elétrica", INSTRUMENTACAO: "Instrumentação", TUBULACAO: "Tubulação",
  MECANICA: "Mecânica", AUTOMACAO: "Automação", CIVIL: "Civil"
};

const COLUMN_TYPES = { text: "Texto", number: "Número", date: "Data", select: "Lista", boolean: "Sim/Não" };

// Colunas padrão de toda programação. O restante do template é exatamente
// a lista de colunas criada na atividade, na mesma ordem.
const FIXED_COLUMNS = [
  { key: "week", label: "SEMANA", aliases: ["semana", "week", "sem"] },
  { key: "team", label: "EQUIPE", aliases: ["equipe", "team"] }
];

// Chaves de colunas antigas que duplicam as colunas padrão ou são derivadas da execução.
const RESERVED_COLUMN_KEYS = new Set(["week", "semana", "team", "equipe", "logs"]);

// Estrutura inicial, criada no banco apenas se não houver nenhuma atividade.
const DEFAULT_ACTIVITIES = [
  {
    name: "Ponto a Ponto", description: "Verificação ponto a ponto de equipamentos em campo.",
    columns: [["tag", "TAG", "text", true], ["forn", "FORN.", "text"], ["sys", "SYS", "text"], ["subsys", "SUBSYS", "text"],
      ["loop", "LOOP", "text"], ["service", "SERVICE", "text"], ["tipe", "TIPE", "text"], ["descricao", "DESCRIÇÃO", "text"]]
  },
  {
    name: "Loop Teste", description: "Testes de loop e registro do resultado.",
    columns: [["tag", "TAG", "text", true], ["loop", "LOOP", "text", true], ["sys", "SYS", "text"], ["subsys", "SUBSYS", "text"],
      ["teste", "TESTE", "text"], ["resultado", "RESULTADO", "select", false, true, ["APROVADO", "REPROVADO", "PENDENTE"]]]
  },
  {
    name: "Preservação", description: "Preservação de equipamentos e acompanhamento de status.",
    columns: [["tag", "TAG", "text", true], ["equipamento", "EQUIPAMENTO", "text"], ["sys", "SYS", "text"], ["metodo", "MÉTODO", "text"],
      ["status_preservacao", "STATUS", "select", false, true, ["ATIVO", "PRESERVADO", "BLOQUEADO", "LIBERADO"]]]
  }
];

const DEFAULT_SETTINGS = { primary: "#1f5eff", header: "#0f1b2d", chartPlanned: "#1f5eff", chartDone: "#12895a", logo: "" };

const ADMIN_SCREENS = ["dashboard", "programacao", "backlog", "importacoes", "relatorios", "atividades", "equipes", "configuracoes", "perfil"];
const FIELD_SCREENS = ["campo", "historico", "perfil"];

/* =========================================================
   ESTADO
   ========================================================= */

const state = {
  sb: null,
  user: null,                // { id, nome, cracha, perfil, role: "admin"|"technician", equipeId, disciplina, email, authUserId }
  activities: [],            // [{ id, name, description, columns: [...] }]
  teams: [],
  people: [],
  programs: [],              // admin: toda a programação
  executions: new Map(),     // programacao_id -> [execuções]
  equipment: new Map(),      // id -> equipamento
  settings: { ...DEFAULT_SETTINGS },
  loadError: "",

  dashboardWeek: null,
  program: { activityId: null, week: "", team: "", status: "", search: "", page: 0, selected: new Set() },
  backlog: { activity: "", team: "", week: "", search: "", selected: new Set() },
  editingProgramId: null,
  reprogramIds: [],
  activityId: null,
  editingActivityId: null,
  editingColumnId: null,
  editingPersonId: null,
  pendingImport: null,

  field: { weekNum: null, programs: [], status: "", activity: "", search: "", selected: new Set(), activeId: null }
};
