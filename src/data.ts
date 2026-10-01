import type { Activity, AuditEntry, Discipline, Employee, Requisicao, SystemUser, Team } from './types'

export const requisicoes: Requisicao[] = [
  { id: 'BR-0261', date: '30/09/2026', tag: 'PT-EL-204', activity: 'Ponto a Ponto painel MCC-04', discipline: 'Elétrica', team: 'Equipe Elétrica A', responsible: 'Marcos Lima', status: 'Programada', updatedAt: '30/09/2026 07:42' },
  { id: 'BR-0262', date: '30/09/2026', tag: 'LT-INS-018', activity: 'Loop Teste transmissor PT-118', discipline: 'Instrumentação', team: 'Equipe Instrumentação B', responsible: 'Ana Souza', status: 'Em execução', updatedAt: '30/09/2026 08:18' },
  { id: 'BR-0263', date: '29/09/2026', tag: 'PR-MEC-092', activity: 'Preservação conjunto bomba P-203', discipline: 'Mecânica', team: 'Equipe Mecânica A', responsible: 'Carlos Reis', status: 'Executada', updatedAt: '29/09/2026 16:20' },
  { id: 'BR-0264', date: '28/09/2026', tag: 'PT-AUT-031', activity: 'Verificação de sinais CLP-07', discipline: 'Automação', team: 'Equipe Automação A', responsible: 'João Pedro', status: 'Atrasada', updatedAt: '30/09/2026 09:02' },
  { id: 'BR-0265', date: '01/10/2026', tag: 'LT-INS-021', activity: 'Loop Teste válvula FV-221', discipline: 'Instrumentação', team: 'Equipe Instrumentação B', responsible: 'Ana Souza', status: 'Reprogramada', updatedAt: '30/09/2026 11:35' },
  { id: 'BR-0266', date: '01/10/2026', tag: 'PT-EL-208', activity: 'Ponto a Ponto painel MCC-05', discipline: 'Elétrica', team: 'Equipe Elétrica A', responsible: 'Marcos Lima', status: 'Programada', updatedAt: '30/09/2026 12:12' },
  { id: 'BR-0267', date: '01/10/2026', tag: 'PR-MEC-100', activity: 'Preservação compressor C-102', discipline: 'Mecânica', team: 'Equipe Mecânica B', responsible: 'Carlos Reis', status: 'Bloqueada', updatedAt: '30/09/2026 12:40' },
  { id: 'BR-0268', date: '02/10/2026', tag: 'LT-AUT-044', activity: 'Loop Teste I/O remoto RIO-09', discipline: 'Automação', team: 'Equipe Automação A', responsible: 'João Pedro', status: 'Programada', updatedAt: '30/09/2026 13:02' },
]

export const activities: Activity[] = [
  { code: 'AT-001', name: 'Ponto a Ponto', type: 'Teste', discipline: 'Elétrica', tag: 'PT-EL', area: 'Painéis', system: 'Distribuição', description: 'Verificação de continuidade e sinais.', active: true },
  { code: 'AT-002', name: 'Loop Teste', type: 'Teste', discipline: 'Instrumentação', tag: 'LT-INS', area: 'Campo', system: 'Controle', description: 'Teste de malha de instrumentos.', active: true },
  { code: 'AT-003', name: 'Preservação', type: 'Preservação', discipline: 'Mecânica', tag: 'PR-MEC', area: 'Utilidades', system: 'Rotativos', description: 'Rotina de preservação de equipamentos.', active: true },
  { code: 'AT-004', name: 'Inspeção', type: 'Inspeção', discipline: 'Mecânica', tag: 'IN-MEC', area: 'Processo', system: 'Mecânico', description: 'Inspeção visual e dimensional.', active: true },
]

export const disciplines: Discipline[] = [
  { code: 'DISC01', name: 'Elétrica', description: 'Sistemas elétricos', teams: 4, active: true },
  { code: 'DISC02', name: 'Instrumentação', description: 'Instrumentação e testes', teams: 3, active: true },
  { code: 'DISC03', name: 'Automação', description: 'Sistemas de automação', teams: 2, active: true },
  { code: 'DISC04', name: 'Mecânica', description: 'Equipamentos mecânicos', teams: 3, active: true },
]

export const teams: Team[] = [
  { code: 'EQ-001', name: 'Montagem A', discipline: 'Elétrica', responsible: 'João Santos', people: 8, active: true },
  { code: 'EQ-002', name: 'Testes A', discipline: 'Instrumentação', responsible: 'Carlos Lima', people: 6, active: true },
  { code: 'EQ-003', name: 'Automação B', discipline: 'Automação', responsible: 'Ana Costa', people: 5, active: true },
]

export const employees: Employee[] = [
  { id: '00125', name: 'João Santos', team: 'Montagem A', discipline: 'Elétrica', access: 'Ativo', active: true },
  { id: '00126', name: 'Carlos Lima', team: 'Testes A', discipline: 'Instrumentação', access: 'Ativo', active: true },
  { id: '00127', name: 'Pedro Alves', team: 'Equipe B', discipline: 'Mecânica', access: 'Não criado', active: true },
]

export const users: SystemUser[] = [
  { name: 'Ana Silva', email: 'ana@empresa.com', profile: 'Administrador', scope: 'Geral', active: true },
  { name: 'João Santos', email: 'joao@empresa.com', profile: 'Executor', scope: 'Montagem A', active: true },
  { name: 'Carlos Lima', email: 'carlos@empresa.com', profile: 'Supervisor', scope: 'Testes A', active: true },
]

export const auditEntries: AuditEntry[] = [
  { date: '01/10/2026 08:12', user: 'Ana Silva', action: 'Importação', record: 'IMP-001', module: 'Programação', detail: 'Importação concluída — 12 registros' },
  { date: '01/10/2026 09:05', user: 'João Santos', action: 'Conclusão', record: 'EL-001', module: 'Execução', detail: 'Atividade concluída' },
  { date: '01/10/2026 10:30', user: 'Ana Silva', action: 'Alteração', record: 'PT-001', module: 'Atividades', detail: 'Descrição atualizada' },
]
