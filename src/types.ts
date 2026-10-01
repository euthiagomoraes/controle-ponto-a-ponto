export type Status = 'Programada' | 'Em execução' | 'Executada' | 'Pendente' | 'Atrasada' | 'Bloqueada' | 'Reprogramada' | 'Cancelada'
export type PageKey = 'dashboard' | 'programacao' | 'execucao' | 'atividades' | 'disciplinas' | 'equipes' | 'funcionarios' | 'usuarios' | 'relatorios' | 'auditoria' | 'configuracoes'

export interface Requisicao {
  id: string
  date: string
  tag: string
  activity: string
  discipline: string
  team: string
  responsible: string
  status: Status
  updatedAt: string
}

export interface Activity {
  code: string
  name: string
  type: string
  discipline: string
  tag: string
  area: string
  system: string
  description: string
  active: boolean
}

export interface Discipline {
  code: string
  name: string
  description: string
  teams: number
  active: boolean
}

export interface Team {
  code: string
  name: string
  discipline: string
  responsible: string
  people: number
  active: boolean
}

export interface Employee {
  id: string
  name: string
  team: string
  discipline: string
  access: string
  active: boolean
}

export interface SystemUser {
  name: string
  email: string
  profile: string
  scope: string
  active: boolean
}

export interface AuditEntry {
  date: string
  user: string
  action: string
  record: string
  module: string
  detail: string
}
