import { ArrowRight, FileSpreadsheet, ListChecks, Plus, RefreshCw, Users } from 'lucide-react'
import { auditEntries, requisicoes } from '../data'
import { AddButton, Button, Field, Filters, KpiCard, Pill, Select, StatusBadge } from '../components/Common'

export function Dashboard({ onNavigate }: { onNavigate: (p:any)=>void }) {
  const executed = requisicoes.filter(r=>r.status==='Executada').length
  const running = requisicoes.filter(r=>r.status==='Em execução').length
  const pending = requisicoes.filter(r=>r.status==='Pendente').length
  const late = requisicoes.filter(r=>r.status==='Atrasada').length
  const reprogrammed = requisicoes.filter(r=>r.status==='Reprogramada').length
  const total = 128
  const bars = [42, 55, 48, 66, 72, 58, 80]
  return <>
    <div className="page-header"><div><h1>Dashboard</h1><p>Visão consolidada do planejamento, execução e produtividade.</p></div><div className="header-actions"><AddButton label="Nova requisição" onClick={()=>onNavigate('programacao')}/></div></div>
    <Filters>
      <Field label="Semana"><Select value="21/09 a 27/09"><option>21/09 a 27/09</option><option>28/09 a 04/10</option></Select></Field>
      <Field label="Equipe"><Select><option>Todas</option><option>Montagem A</option><option>Testes A</option></Select></Field>
      <Field label="Disciplina"><Select><option>Todas</option><option>Elétrica</option><option>Instrumentação</option></Select></Field>
      <Field label="Atividade"><Select><option>Todas</option><option>Ponto a Ponto</option><option>Loop Teste</option></Select></Field>
      <Field label="Status"><Select><option>Todos</option><option>Programada</option><option>Executada</option></Select></Field>
      <Button variant="secondary">Aplicar filtros</Button><Button variant="ghost">Limpar</Button>
    </Filters>

    <div className="kpi-grid six"><KpiCard label="Programadas" value={total} note="no período" tone="blue"/><KpiCard label="Executadas" value={92+executed} note="cumprimento 82,7%" tone="green"/><KpiCard label="Em execução" value={32+running} note="agora" tone="purple"/><KpiCard label="Pendentes" value={18+pending} tone="orange"/><KpiCard label="Atrasadas" value={12+late} tone="red"/><KpiCard label="Reprogramadas" value={6+reprogrammed} tone="purple"/></div>

    <div className="dashboard-grid">
      <section className="panel chart-panel"><div className="panel-title"><div><h3>Programação x Execução</h3><span>Últimos 7 dias</span></div><Pill tone="blue">82,7%</Pill></div><div className="bar-chart">{bars.map((v,i)=><div className="bar-col" key={i}><div className="bar planned" style={{height:`${v}%`}}/><div className="bar executed" style={{height:`${Math.max(18,v-16)}%`}}/><span>{['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'][i]}</span></div>)}</div><div className="legend"><span><i className="legend-square planned"/> Programadas</span><span><i className="legend-square executed"/> Executadas</span></div></section>
      <section className="panel"><div className="panel-title"><div><h3>Desempenho por equipe</h3><span>Cumprimento</span></div><span className="muted">Semana atual</span></div><div className="donut-wrap"><div className="donut"><strong>82%</strong><span>geral</span></div><div className="donut-legend"><div><b>Montagem A</b><span>92%</span></div><div><b>Testes A</b><span>85%</span></div><div><b>Automação B</b><span>78%</span></div><div><b>Equipe C</b><span>70%</span></div></div></div></section>
      <section className="panel"><div className="panel-title"><div><h3>Atividades por tipo</h3><span>Distribuição no período</span></div></div><div className="hbars"><div><span>Ponto a Ponto</span><div><i style={{width:'72%'}}/></div><b>72</b></div><div><span>Loop Teste</span><div><i style={{width:'55%'}}/></div><b>55</b></div><div><span>Preservação</span><div><i style={{width:'38%'}}/></div><b>38</b></div><div><span>Inspeção</span><div><i style={{width:'29%'}}/></div><b>29</b></div></div></section>
    </div>

    <div className="two-col">
      <section className="panel table-panel"><div className="panel-title"><div><h3>Atividades da semana</h3><span>Atualizadas em tempo real</span></div><Button variant="ghost" onClick={()=>onNavigate('programacao')}>Ver todas <ArrowRight size={14}/></Button></div><div className="table-wrap"><table><thead><tr><th>Data</th><th>Equipe</th><th>Disc.</th><th>TAG</th><th>Atividade</th><th>Status</th><th>Responsável</th></tr></thead><tbody>{requisicoes.slice(0,5).map(r=><tr key={r.id}><td>{r.date}</td><td>{r.team.replace('Equipe ','')}</td><td>{r.discipline.slice(0,4)}</td><td><strong>{r.tag}</strong></td><td>{r.activity}</td><td><StatusBadge status={r.status}/></td><td>{r.responsible}</td></tr>)}</tbody></table></div></section>
      <aside className="stack">
        <section className="panel quick-panel"><div className="panel-title"><div><h3>Ações rápidas</h3><span>Atalhos para o dia a dia</span></div></div><button onClick={()=>onNavigate('programacao')}><FileSpreadsheet size={16}/><span>Importar Excel</span><ArrowRight size={14}/></button><button onClick={()=>onNavigate('atividades')}><Plus size={16}/><span>Cadastrar atividade</span><ArrowRight size={14}/></button><button onClick={()=>onNavigate('equipes')}><Users size={16}/><span>Cadastrar equipe</span><ArrowRight size={14}/></button><button onClick={()=>onNavigate('funcionarios')}><Users size={16}/><span>Cadastrar funcionário</span><ArrowRight size={14}/></button></section>
        <section className="panel compact-panel"><div className="panel-title"><div><h3>Últimas atualizações</h3></div><RefreshCw size={15}/></div>{auditEntries.map(a=><div className="timeline" key={a.date}><div className="timeline-dot"/><div><strong>{a.action}</strong><p>{a.detail}</p><small>{a.date} • {a.user}</small></div></div>)}</section>
      </aside>
    </div>
  </>
}
