import { Check, ChevronDown, Download, Filter, Plus, Search, Upload, X } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Status } from '../types'

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return <div className="page-header"><div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div><div className="header-actions">{actions}</div></div>
}

export function Button({ children, variant='primary', onClick, type='button', disabled=false }: { children: ReactNode; variant?: 'primary'|'secondary'|'ghost'|'danger'; onClick?: () => void; type?: 'button'|'submit'; disabled?: boolean }) {
  return <button type={type} disabled={disabled} className={`btn btn-${variant}`} onClick={onClick}>{children}</button>
}

export function IconButton({ label, children, onClick }: { label: string; children: ReactNode; onClick?: () => void }) {
  return <button className="icon-button table-icon" onClick={onClick} title={label} aria-label={label}>{children}</button>
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>
}

export function Select({ value, onChange, children }: { value?: string; onChange?: (value: string)=>void; children: ReactNode }) {
  return <div className="select-wrap"><select value={value} onChange={e => onChange?.(e.target.value)}>{children}</select><ChevronDown size={14}/></div>
}

export function Input({ placeholder, value, onChange, type='text' }: { placeholder?: string; value?: string; onChange?: (value:string)=>void; type?: string }) {
  return <div className="input-wrap"><input type={type} placeholder={placeholder} value={value} onChange={e => onChange?.(e.target.value)} /></div>
}

export function Filters({ children }: { children: ReactNode }) { return <div className="filters">{children}</div> }
export function FilterButton({ onClick }: { onClick?:()=>void }) { return <Button variant="secondary" onClick={onClick}><Filter size={15}/> Filtrar</Button> }
export function SearchButton({ onClick }: { onClick?:()=>void }) { return <Button variant="primary" onClick={onClick}><Search size={15}/> Pesquisar</Button> }
export function ImportButton({ onClick }: { onClick?:()=>void }) { return <Button variant="secondary" onClick={onClick}><Upload size={15}/> Importar Excel</Button> }
export function ExportButton({ onClick }: { onClick?:()=>void }) { return <Button variant="secondary" onClick={onClick}><Download size={15}/> Exportar</Button> }
export function AddButton({ label, onClick }: { label:string; onClick?:()=>void }) { return <Button onClick={onClick}><Plus size={16}/> {label}</Button> }

export function StatusBadge({ status }: { status: Status }) {
  const cls = status.toLowerCase().replace(' ','-').replace('ã','a').replace('ç','c')
  return <span className={`status status-${cls}`}><span className="status-dot"/>{status}</span>
}

export function Pill({ children, tone='neutral' }: { children: ReactNode; tone?: 'neutral'|'green'|'orange'|'red'|'blue'|'purple' }) { return <span className={`pill pill-${tone}`}>{children}</span> }
export function EmptyRow({ cols, children='Nenhum registro encontrado.' }: { cols:number; children?:ReactNode }) { return <tr><td colSpan={cols} className="empty-row">{children}</td></tr> }
export function Modal({ title, children, onClose, footer }: { title:string; children:ReactNode; onClose:()=>void; footer?:ReactNode }) {
  return <div className="modal-backdrop"><div className="modal"><div className="modal-head"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={18}/></button></div><div className="modal-body">{children}</div>{footer && <div className="modal-foot">{footer}</div>}</div></div>
}

export function KpiCard({ label, value, note, tone='blue' }: { label:string; value:string|number; note?:string; tone?: 'blue'|'green'|'orange'|'red'|'purple' }) {
  return <div className={`kpi-card tone-${tone}`}><div className="kpi-label">{label}</div><div className="kpi-value">{value}</div>{note && <div className="kpi-note">{note}</div>}</div>
}

export function ProgressBar({ value }: { value:number }) { return <div className="progress"><div style={{ width: `${Math.max(0,Math.min(100,value))}%` }}/></div> }
export function CheckRow({ children }: { children: ReactNode }) { return <div className="check-row"><span className="check"><Check size={12}/></span><span>{children}</span></div> }
