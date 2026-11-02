import {mesDate,productionStatus} from './presentation';
import { t } from './i18n';
import { ChevronDown, Database } from 'lucide-react';
import { display, label, labels, type Row } from './api';
const operationNames:Record<string,string>={'schedule.save':'儲存排程','report.add':'新增報工','report.update':'修改報工','report.delete':'刪除報工','report.cavities':'修改模穴','report.complete':'整張排程完工','mold.clear':'清除換模紀錄','mold.mount_start':'開始上模','mold.mount_finish':'完成上模','mold.unmount_start':'開始下模','mold.unmount_finish':'完成下模'};

/** 只用已存在的業務欄位做第一層摘要，完整原值仍留在明細。 */
function recordTitle(value:unknown,fallback:string){if(!value||typeof value!=='object')return fallback;const row=value as Row;const values=[row.EQP_NO,row.WO??row.WO_NO,row.action?t(operationNames[String(row.action)]??String(row.action)):null,row.actor_name??row.operator,(row.CREATE_TIME??row.created_at??row.date)?mesDate(row.CREATE_TIME??row.created_at??row.date):null,row.status];return values.filter(v=>v!=null&&v!=='').map(display).join(' · ')||fallback;}
export function DataView({ data, title = t("查詢結果") }: { data: unknown; title?: string }) {
  if (data === null || data === undefined) return null;
  const rows = Array.isArray(data) ? data : typeof data === 'object' && Array.isArray((data as Row).records) ? (data as Row).records as unknown[] : null;
  return <section className="data-card"><div className="card-heading"><Database size={17}/><strong>{title}</strong>{rows && <span className="count">{rows.length}{t("筆")}</span>}</div>
    {rows ? rows.length ? rows.map((row, i) => <details className="record-detail" key={i} open={rows.length === 1}><summary><span>{recordTitle(row,`${t("第")}${i+1}${t("筆")}`)}</span><ChevronDown size={16}/></summary><Fields value={row}/></details>) : <p className="muted">{t("目前沒有符合條件的資料。")}</p> : <Fields value={data}/>}
  </section>;
}

export function Fields({ value }: { value: unknown }) {
  if (typeof value !== 'object' || value === null) return <p className="preserve">{display(value)}</p>;
  if (Object.hasOwn(value, 'MANUAL_OK') && Object.hasOwn(value, 'IOT_INFERRED_OK')) return <ReportExecutionFields record={value as Row}/>;
  const entries = Object.entries(value);
  const technical = ([key]: [string, unknown]) => /(^id$|_id$|_SID$|^_)/i.test(key) || !Object.hasOwn(labels, key);
  const normal = entries.filter(entry => !technical(entry));
  const extra = entries.filter(technical);
  return <>{normal.length > 0 && <FieldRows entries={normal}/>} {extra.length > 0 && <details className="record-detail technical-details"><summary>{t('詳細資料')}</summary><FieldRows entries={extra}/></details>}</>;
}

function businessValue(key:string,value:unknown) {
  if(value==null)return display(value);
  if(key==='PRODUCTION_STATUS')return productionStatus(value);
  if(key==='COMPLETED'&&['Y','N'].includes(String(value)))return t(value==='Y'?'已完工':'未完工');
  if(key==='action')return t(operationNames[String(value)]??String(value));
  if(/TIME|_at$|^start_time$|^date$/i.test(key))return mesDate(value);
  return display(value);
}

function FieldRows({ entries }: { entries: [string, unknown][] }) {
  return <dl className="fields">{entries.map(([key, item]) => <div key={key}><dt>{label(key)}</dt><dd>{Array.isArray(item) ? item.length ? item.map((row, index) => <details key={index}><summary>{recordTitle(row,t('項目 {0}', {0: index + 1}))}</summary><Fields value={row}/></details>) : '—' : typeof item === 'object' && item !== null ? <details><summary>{t('資料明細')}</summary><Fields value={item}/></details> : businessValue(key,item)}</dd></div>)}</dl>;
}

function ReportExecutionFields({ record }: { record: Row }) {
  const summaryKeys = ['MANUAL_OK', 'MANUAL_NG', 'IOT_QUANTITY', 'IOT_INFERRED_OK'];
  const contextKeys = ['EQP_NO', 'WO', 'PART_NO', 'TOL_NO', 'OPI_CAV'];
  const hidden = new Set([...summaryKeys, ...contextKeys, 'OK_QTY', 'IOT_PCS', 'NG_QTY', 'REPORTS']);
  const context = Object.fromEntries(contextKeys.filter(key => Object.hasOwn(record, key)).map(key => [key, record[key]]));
  const details = Object.fromEntries(Object.entries(record).filter(([key]) => !hidden.has(key)));
  return <>
    <dl className="fields">{summaryKeys.map(key => <div key={key}><dt>{label(key)}</dt><dd>{key.startsWith('IOT_') && record[key] == null ? t("未知") : display(record[key])}</dd></div>)}</dl>
    {Object.keys(context).length > 0 && <Fields value={context}/>}
    {Array.isArray(record.REPORTS) && <details className="record-detail"><summary>{t('人工報工歷史（{0} 筆）', {0: record.REPORTS.length})}</summary><DataView data={record.REPORTS} title={t("人工報工明細")}/></details>}
    {Object.keys(details).length > 0 && <details className="record-detail"><summary>{t("詳細資料")}</summary><FieldRows entries={Object.entries(details)}/></details>}
  </>;
}
