import { Camera, CheckCircle2, ClipboardCheck, Clock3, Play, XCircle } from 'lucide-react'
import { useState } from 'react'
import { requisicoes } from '../data'
import { Button, Field, Filters, Input, KpiCard, Modal, Select, StatusBadge } from '../components/Common'

export function Execucao() {
  const [selected, setSelected] = useState<(typeof requisicoes)[number] | null>(null)
  const [mode, setMode] = useState<'view'|'conclude'>('view')
  return <>
    <div className="page-header"><div><h1>Execução</h1><p>Consulte e registre atividades diretamente do campo.</p></div><div className="header-actions"><Button onClick={()=>{setSelected(requisicoes[1]);setMode('conclude')}}><ClipboardCheck size={16}/> Registrar execução</Button></div></div>
    <Filters><Field label="Data"><Select><option>Hoje</option><option>01/10/2026</option></Select></Field><Field label="Equipe"><Select><option>Minha equipe</option><option>Todas</option></Select></Field><Field label="Funcionário"><Select><option>Todos</option><option>Ana Souza</option><option>João Pedro</option></Select></Field><Field label="Status"><Select><option>Todos</option><option>Programada</option><option>Em execução</option><option>Executada</option><option>Bloqueada</option></Select></Field><Field label="TAG"><Input placeholder="Buscar por TAG..."/></Field><Button variant="secondary">Pesquisar</Button></Filters>
    <div className="kpi-grid four"><KpiCard label="Programadas" value="32" tone="blue"/><KpiCard label="Em execução" value="5" tone="purple"/><KpiCard label="Executadas" value="21" tone="green"/><KpiCard label="Bloqueadas" value="2" tone="red"/></div>
    <section className="panel table-panel"><div className="table-wrap"><table><thead><tr><th>TAG</th><th>Atividade</th><th>Área</th><th>Responsável</th><th>Programada</th><th>Status</th><th>Ações</th></tr></thead><tbody>{requisicoes.slice(1,7).map(r=><tr key={r.id}><td><strong>{r.tag}</strong><small>{r.id}</small></td><td>{r.activity}</td><td>A{(r.id.charCodeAt(4)%4)+1}</td><td>{r.responsible}</td><td>08:00</td><td><StatusBadge status={r.status}/></td><td><div className="row-actions"><Button variant="ghost" onClick={()=>{setSelected(r);setMode('view')}}>Detalhes</Button>{r.status==='Programada'&&<Button variant="secondary" onClick={()=>{setSelected(r);setMode('conclude')}}><Play size={13}/> Iniciar</Button>}{r.status==='Em execução'&&<Button onClick={()=>{setSelected(r);setMode('conclude')}}><CheckCircle2 size={13}/> Concluir</Button>}</div></td></tr>)}</tbody></table></div></section>
    {selected && <ExecutionModal item={selected} mode={mode} onClose={()=>setSelected(null)}/>} 
  </>
}

function ExecutionModal({item, mode, onClose}:{item:any;mode:'view'|'conclude';onClose:()=>void}) {
  return <Modal title={mode==='conclude'?'Registrar execução':'Detalhes da execução'} onClose={onClose} footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={onClose}>{mode==='conclude'?'Salvar apontamento':'Fechar'}</Button></>}>
    <div className="identity-grid"><div><span>TAG</span><strong>{item.tag}</strong></div><div><span>Atividade</span><strong>{item.activity}</strong></div><div><span>Área</span><strong>Área 2</strong></div><div><span>Sistema</span><strong>Sistema de controle</strong></div></div>
    <div className="form-grid two"><Field label="Equipe"><Select><option>{item.team}</option></Select></Field><Field label="Responsável"><Select><option>{item.responsible}</option><option>Ana Souza</option><option>João Pedro</option></Select></Field><Field label="Início real"><Input type="datetime-local"/></Field><Field label="Fim real"><Input type="datetime-local"/></Field><Field label="Status"><Select><option>{item.status}</option><option>Em execução</option><option>Executada</option><option>Pendente</option><option>Bloqueada</option></Select></Field><Field label="Resultado"><Select><option>Conforme</option><option>Com ressalva</option><option>Não conforme</option></Select></Field></div>
    <Field label="Observações"><textarea placeholder="Descreva o resultado, observações ou ocorrências..."></textarea></Field>
    <div className="photo-box"><div className="section-label"><Camera size={16}/> Fotos da execução</div><div className="photo-actions"><Button variant="secondary"><Camera size={15}/> Tirar foto</Button><Button variant="ghost">Anexar arquivo</Button></div><div className="thumbs"><div className="thumb">Foto 01</div><div className="thumb">Foto 02</div><div className="thumb add">+</div></div></div>
    <div className="occurrence"><div className="section-label"><XCircle size={16}/> Ocorrência</div><Select><option>Nenhuma</option><option>Equipamento indisponível</option><option>Acesso bloqueado</option><option>Material pendente</option></Select><Input placeholder="Descreva a ocorrência..."/></div>
  </Modal>
}
