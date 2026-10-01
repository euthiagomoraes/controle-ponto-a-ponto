import { useState } from 'react'
import { Layout } from './components/Layout'
import { Dashboard } from './pages/Dashboard'
import { Programacao } from './pages/Programacao'
import { Execucao } from './pages/Execucao'
import { Atividades, Disciplinas, Equipes, Funcionarios } from './pages/Cadastros'
import { Auditoria, Configuracoes, Relatorios, Usuarios } from './pages/Administracao'
import type { PageKey } from './types'

export default function App() {
  const [page, setPage] = useState<PageKey>('dashboard')
  const [mobileOpen, setMobileOpen] = useState(false)

  const content = {
    dashboard: <Dashboard onNavigate={setPage} />,
    programacao: <Programacao />,
    execucao: <Execucao />,
    atividades: <Atividades />,
    disciplinas: <Disciplinas />,
    equipes: <Equipes />,
    funcionarios: <Funcionarios />,
    usuarios: <Usuarios />,
    relatorios: <Relatorios />,
    auditoria: <Auditoria />,
    configuracoes: <Configuracoes />,
  }[page]

  return <Layout currentPage={page} onNavigate={setPage} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen}>{content}</Layout>
}
