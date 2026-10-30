import { ChevronDown, Database } from 'lucide-react';
import { display, label, type Row } from './api';

export function DataView({ data, title = '查詢結果' }: { data: unknown; title?: string }) {
  if (data === null || data === undefined) return null;
  const rows = Array.isArray(data) ? data : typeof data === 'object' && Array.isArray((data as Row).records) ? (data as Row).records as unknown[] : null;
  return <section className="data-card"><div className="card-heading"><Database size={17}/><strong>{title}</strong>{rows && <span className="count">{rows.length} 筆</span>}</div>
    {rows ? rows.length ? rows.map((row, i) => <details className="record-detail" key={i} open={rows.length === 1}><summary><span>第 {i + 1} 筆{typeof row === 'object' && row !== null && ('WO' in row || 'EQP_NO' in row) ? ` · ${display((row as Row).WO ?? (row as Row).EQP_NO)}` : ''}</span><ChevronDown size={16}/></summary><Fields value={row}/></details>) : <p className="muted">目前沒有符合條件的資料。</p> : <Fields value={data}/>}
  </section>;
}

export function Fields({ value }: { value: unknown }) {
  if (typeof value !== 'object' || value === null) return <p className="preserve">{display(value)}</p>;
  if (Object.hasOwn(value, 'MANUAL_OK') && Object.hasOwn(value, 'IOT_INFERRED_OK')) return <ReportExecutionFields record={value as Row}/>;
  return <dl className="fields">{Object.entries(value).map(([key, item]) => <div key={key}><dt>{label(key)}</dt><dd>{typeof item === 'object' && item !== null ? <details><summary>展開內容</summary><pre>{display(item)}</pre></details> : display(item)}</dd></div>)}</dl>;
}

function ReportExecutionFields({ record }: { record: Row }) {
  const summaryKeys = ['MANUAL_OK', 'MANUAL_NG', 'IOT_QUANTITY', 'IOT_INFERRED_OK'];
  const contextKeys = ['EQP_NO', 'WO', 'PART_NO', 'TOL_NO', 'OPI_CAV'];
  const hidden = new Set([...summaryKeys, ...contextKeys, 'OK_QTY', 'IOT_PCS', 'NG_QTY', 'REPORTS']);
  const context = Object.fromEntries(contextKeys.filter(key => Object.hasOwn(record, key)).map(key => [key, record[key]]));
  const details = Object.fromEntries(Object.entries(record).filter(([key]) => !hidden.has(key)));
  return <>
    <dl className="fields">{summaryKeys.map(key => <div key={key}><dt>{label(key)}</dt><dd>{key.startsWith('IOT_') && record[key] == null ? '未知' : display(record[key])}</dd></div>)}</dl>
    {Object.keys(context).length > 0 && <Fields value={context}/>}
    {Array.isArray(record.REPORTS) && <details className="record-detail"><summary>人工報工歷史（{record.REPORTS.length} 筆）</summary><DataView data={record.REPORTS} title="人工報工明細"/></details>}
    {Object.keys(details).length > 0 && <details className="record-detail"><summary>詳細資料</summary><Fields value={details}/></details>}
  </>;
}
