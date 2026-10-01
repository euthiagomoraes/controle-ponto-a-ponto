import { useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { FileCheck2, History, Upload } from 'lucide-react'
import { requisicoes } from '../data'
import { AddButton, Button, ExportButton, Field, Filters, ImportButton, Input, KpiCard, Modal, SearchButton, Select, StatusBadge } from '../components/Common'

export function Programacao() {
  const [openImport, setOpenImport] = useState(false)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('Todos')
  const filtered = useMemo(()=>requisicoes.filter(r => (query ? `${r.id} ${r.tag} ${r.activity}`.toLowerCase().includes(query.toLowerCase()) : true) && (status==='Todos'||r.status===status)),[query,status])
  return <>
    <div className="page-header"><div><h1>Programação</h1><p>Gerencie as requisições e atividades planejadas.</p></div><div className="header-actions"><ImportButton onClick={()=>setOpenImport(true)}/><AddButton label="Nova programação"/></div></div>
    <div className="toolbar"><div className="toolbar-left"><Button variant="secondary"><History size={15}/> Histórico de importações</Button><ExportButton/></div><div className="toolbar-right"><span className="muted">Fonte do layout: Excel → Supabase</span></div></div>
    <Filters><Field label="Data inicial"><Input placeholder="30/09/2026"/></Field><Field label="Data final"><Input placeholder="06/10/2026"/></Field><Field label="Equipe"><Select><option>Todas</option><option>Montagem A</option><option>Testes A</option></Select></Field><Field label="Disciplina"><Select><option>Todas</option><option>Elétrica</option><option>Instrumentação</option></Select></Field><Field label="Status"><Select value={status} onChange={setStatus}><option>Todos</option><option>Programada</option><option>Em execução</option><option>Executada</option><option>Atrasada</option><option>Reprogramada</option></Select></Field><Field label="TAG / Requisição"><Input placeholder="Buscar..." value={query} onChange={setQuery}/></Field><SearchButton/></Filters>
    <div className="kpi-grid five"><KpiCard label="Total" value="128" tone="blue"/><KpiCard label="Novas" value="15" tone="green"/><KpiCard label="Alteradas" value="8" tone="purple"/><KpiCard label="Duplicadas" value="3" tone="orange"/><KpiCard label="Com erros" value="2" tone="red"/></div>
    <section className="panel table-panel"><div className="bulk-bar"><span>☐</span><span>Selecionados: <strong>0</strong></span><Button variant="ghost">Reprogramar em lote</Button><Button variant="ghost">Exportar selecionados</Button></div><div className="table-wrap"><table><thead><tr><th>□</th><th>ID</th><th>Data programada</th><th>TAG</th><th>Atividade</th><th>Equipe</th><th>Disciplina</th><th>Status</th><th>Atualizado</th><th>Ações</th></tr></thead><tbody>{filtered.map(r=><tr key={r.id}><td>□</td><td><strong>{r.id}</strong></td><td>{r.date}</td><td>{r.tag}</td><td>{r.activity}</td><td>{r.team}</td><td>{r.discipline}</td><td><StatusBadge status={r.status}/></td><td>{r.updatedAt}</td><td><div className="row-actions"><Button variant="ghost">Ver</Button><Button variant="ghost">Editar</Button><Button variant="ghost">Mais</Button></div></td></tr>)}</tbody></table></div><div className="table-foot"><span>Mostrando {filtered.length} de 128 registros</span><div className="pagination"><Button variant="ghost">‹</Button><span>1</span><Button variant="ghost">2</Button><Button variant="ghost">3</Button><Button variant="ghost">›</Button></div></div></section>

    {openImport && <ImportModal onClose={()=>setOpenImport(false)}/>} 
  </>
}

function ImportModal({onClose}:{onClose:()=>void}) {
  const [file, setFile] = useState<File | null>(null)
  const [checked, setChecked] = useState(false)
  const [previewCount, setPreviewCount] = useState<number | null>(null)
  const [previewError, setPreviewError] = useState('')
  const openFile = async (f: File | undefined) => {
    if (!f) return
    setFile(f)
    setChecked(false)
    setPreviewError('')
    try {
      const buffer = await f.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: 'array' })
      const sheetName = workbook.SheetNames[0]
      const rows = sheetName ? XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' }) : []
      setPreviewCount(rows.length)
    } catch {
      setPreviewCount(null)
      setPreviewError('Não foi possível ler esta planilha. Verifique se o arquivo está íntegro.')
    }
  }
  return <Modal title="Importar programação" onClose={onClose} footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="secondary" disabled={!file}>Visualizar inconsistências</Button><Button onClick={onClose} disabled={!file || !checked}>Confirmar importação</Button></>}>
    <div className="upload-box"><Upload size={28}/><strong>{file ? file.name : 'Arraste o arquivo Excel aqui'}</strong><span>ou</span><label className="btn btn-secondary file-btn">Selecionar arquivo<input type="file" accept=".xlsx,.xls" onChange={e=>openFile(e.target.files?.[0])}/></label><small>Formatos aceitos: XLSX e XLS</small></div>
    <div className="form-grid two"><Field label="Planilha"><Select><option>Programação</option></Select></Field><Field label="Identificador"><Select><option>TAG + projeto + atividade</option></Select></Field></div>
    <div className="radio-line"><label><input type="radio" defaultChecked name="mode"/> Cumulativo</label><label><input type="radio" name="mode"/> Somente validar</label></div>
    <div className="validation"><div><FileCheck2 size={16}/><strong>Validação</strong></div><ul><li>Colunas obrigatórias</li><li>Datas e formatos</li><li>Equipes e disciplinas</li><li>Identificação de duplicidades</li></ul></div>
    <div className="import-summary"><span>Linhas lidas <b>{previewCount ?? '—'}</b></span><span>Novos <b>15</b></span><span>Alterados <b>8</b></span><span>Duplicados <b>3</b></span><span>Erros <b>2</b></span></div>{previewError && <div className="error-box">{previewError}</div>}
    <label className="confirm-check"><input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)}/> Li o resumo e desejo aplicar a importação cumulativa.</label>
  </Modal>
}
