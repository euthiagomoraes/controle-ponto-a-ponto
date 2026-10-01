import { Bell, ChevronDown, CircleHelp, ClipboardList, Gauge, Layers3, ListChecks, Menu, Settings, ShieldCheck, Users, Wrench, X } from 'lucide-react'
import type { PageKey } from '../types'

interface LayoutProps {
  currentPage: PageKey
  onNavigate: (page: PageKey) => void
  children: React.ReactNode
  mobileOpen: boolean
  setMobileOpen: (open: boolean) => void
}

const groups: { label: string; items: { key: PageKey; label: string; icon: typeof Gauge }[] }[] = [
  { label: 'GESTÃO', items: [{ key: 'dashboard', label: 'Dashboard', icon: Gauge }, { key: 'programacao', label: 'Programação', icon: ClipboardList }, { key: 'execucao', label: 'Execução', icon: ListChecks }] },
  { label: 'CADASTROS', items: [{ key: 'atividades', label: 'Atividades', icon: Wrench }, { key: 'disciplinas', label: 'Disciplinas', icon: Layers3 }, { key: 'equipes', label: 'Equipes', icon: Users }, { key: 'funcionarios', label: 'Funcionários', icon: Users }] },
  { label: 'ADMINISTRAÇÃO', items: [{ key: 'usuarios', label: 'Usuários e Permissões', icon: ShieldCheck }, { key: 'relatorios', label: 'Relatórios', icon: ClipboardList }, { key: 'auditoria', label: 'Auditoria', icon: ShieldCheck }, { key: 'configuracoes', label: 'Configurações', icon: Settings }] },
]

export function Layout({ currentPage, onNavigate, children, mobileOpen, setMobileOpen }: LayoutProps) {
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-head">
          <div className="brand-mark">BR</div>
          <div>
            <div className="brand-name">Book de Requisições</div>
            <div className="brand-sub">Planejamento & execução</div>
          </div>
          <button className="icon-button mobile-close" onClick={() => setMobileOpen(false)} aria-label="Fechar menu"><X size={18}/></button>
        </div>
        <nav className="side-nav">
          {groups.map(group => (
            <div key={group.label} className="nav-group">
              <div className="nav-group-title">{group.label}</div>
              {group.items.map(item => {
                const Icon = item.icon
                const active = currentPage === item.key
                return <button key={item.key} className={`nav-item ${active ? 'active' : ''}`} onClick={() => { onNavigate(item.key); setMobileOpen(false) }}>
                  <Icon size={16} /> <span>{item.label}</span>
                </button>
              })}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="mini-card"><CircleHelp size={16}/><span>Central de ajuda</span></div>
          <div className="version">v0.1 • ambiente de protótipo</div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-button mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Abrir menu"><Menu size={20}/></button>
            <div className="crumb">Planejamento <span>/</span> {pageLabel(currentPage)}</div>
          </div>
          <div className="topbar-actions">
            <div className="search-mini">⌕ <input aria-label="Busca global" placeholder="Buscar TAG, requisição..." /></div>
            <button className="icon-button notif" aria-label="Notificações"><Bell size={18}/><span className="dot"/></button>
            <div className="user-menu"><div className="avatar">AS</div><div className="user-info"><strong>Ana Silva</strong><span>Administrador</span></div><ChevronDown size={15}/></div>
          </div>
        </header>
        <section className="content">{children}</section>
      </main>
      {mobileOpen && <div className="mobile-scrim" onClick={() => setMobileOpen(false)} />}
    </div>
  )
}

export function pageLabel(page: PageKey) {
  const labels: Record<PageKey, string> = {
    dashboard: 'Dashboard', programacao: 'Programação', execucao: 'Execução', atividades: 'Atividades', disciplinas: 'Disciplinas', equipes: 'Equipes', funcionarios: 'Funcionários', usuarios: 'Usuários e Permissões', relatorios: 'Relatórios', auditoria: 'Auditoria', configuracoes: 'Configurações'
  }
  return labels[page]
}
