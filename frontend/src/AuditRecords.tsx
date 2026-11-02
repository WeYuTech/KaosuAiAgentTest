import {display,label,type Row,type Change} from './api';
import {Fields} from './DataView';
import {mesDate} from './presentation';
import {confirmationView} from './confirmation';
import {t} from './i18n';

/** 只呈現稽核端點回傳的已證明異動，不以 proposal 的預計值補足。 */
export function AuditRecords({records,timezone}:{records:Row[];timezone:string}){
  if(!records.length)return <p>{t('目前沒有可查看的操作紀錄。')}</p>;
  return <div className="audit-records">{records.map((record,index)=>{
    const changes=Array.isArray(record.changes)?record.changes as Change[]:[];
    const equipment=record.equipment??changes.find(change=>change.field==='EQP_NO')?.after;
    return <article className="audit-record" key={String(record.id??index)}>
      <header><strong>{label(String(record.action??''))}</strong><span>{confirmationView(String(record.status)).label}</span></header>
      <p>{mesDate(record.event_time??record.time)} · {timezone}</p>
      <p>{t('操作人員')}：{display(record.actor)} · {t('設備')}：{equipment?display(equipment):t('紀錄未提供')}</p>
      {record.mode==='simulation'&&<p>{t('模擬環境')}</p>}
      {changes.length?<ul className="audit-changes">{changes.map((change,i)=><li key={i}><strong>{label(change.field)}</strong>{JSON.stringify(change.before)===JSON.stringify(change.after)?<span>{display(change.after)} · {t('未變更')}</span>:<span>{display(change.before)} → {display(change.after)}</span>}</li>)}</ul>:<p>{t('尚無可證明的欄位異動')}</p>}
      <details><summary>{t('詳細資料')}</summary><Fields value={record}/></details>
    </article>;
  })}</div>;
}
