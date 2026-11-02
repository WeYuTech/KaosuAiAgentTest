import {display,label,type Row,type Change} from './api';
import {Fields,operationName} from './DataView';
import {mesDate} from './presentation';
import {confirmationView} from './confirmation';
import {t} from './i18n';

function auditValue(field:string,value:unknown,timezone:string){
  if(field==='ENABLE_FLAG'&&['Y','N'].includes(String(value)))return t(value==='Y'?'啟用':'停用');
  if(field==='COMPLETED'&&['Y','N'].includes(String(value)))return t(value==='Y'?'已完工':'未完工');
  return display(/TIME|_at$/i.test(field)?mesDate(value,timezone):value);
}
const businessFields=new Set(['OK_QTY','NG_QTY','OPI_CAV','CUR_CAV','SCHEDULE_CUR_CAV','EQP_NO','WO','WO_NO','PART_NO','TOL_NO','MOLD_NO','NG_CODE_NO','NG_CODE_QTY','COMMENT','COMPLETED','COMPLETED_TIME','SCHEDULE_START_TIME','SCHEDULE_END_TIME','CHECK_IN_TIME','CHECK_OUT_TIME','REAL_CHECK_IN_TIME','ZZ_MODLE_UPLOAD_START','ZZ_MODLE_UPLOAD_END','ZZ_MODLE_DOWNLOAD_START','ZZ_MODLE_DOWNLOAD_END','CYCLE_TIME','TARGET_SHOT','TARGET_PCS','PRIORITY','PRODUCTION_STATUS']);
const empty=(value:unknown)=>value==null||value==='';
export function auditBusinessChanges(changes:Change[]){return changes.filter(change=>businessFields.has(change.field)&&!(empty(change.before)&&empty(change.after))&&JSON.stringify(change.before)!==JSON.stringify(change.after));}
const quantityFields=['OK_QTY','NG_QTY','OPI_CAV','CUR_CAV','SCHEDULE_CUR_CAV'];

/** 只呈現稽核端點回傳的已證明異動，不以 proposal 的預計值補足。 */
export function AuditRecords({records,timezone}:{records:Row[];timezone:string}){
  if(!records.length)return <p>{t('目前沒有可查看的操作紀錄。')}</p>;
  return <div className="audit-records">{records.map((record,index)=>{
    const changes=Array.isArray(record.changes)?record.changes as Change[]:[];
    const visible=auditBusinessChanges(changes);
    const equipment=record.equipment??changes.find(change=>change.field==='EQP_NO')?.after;
    return <article className="audit-record" key={String(record.id??index)}>
      <header><strong>{operationName(record.action)}</strong><span>{confirmationView(String(record.status)).label}</span></header>
      <p>{mesDate(record.event_time??record.time,timezone)} · {timezone}</p>
      <p>{t('操作人員')}：{display(record.actor_name??record.actor)} · {t('設備')}：{equipment?display(equipment):t('紀錄未提供')}</p>
      {record.mode==='simulation'&&<p>{t('模擬環境')}</p>}
      {visible.length?<ul className="audit-changes">{visible.sort((a,b)=>Number(!quantityFields.includes(a.field))-Number(!quantityFields.includes(b.field))).map((change,i)=><li key={i}><strong>{label(change.field)}</strong><span>{empty(change.before)?<>{t('新增')}：{auditValue(change.field,change.after,timezone)}</>:empty(change.after)?<>{t('刪除')}：{auditValue(change.field,change.before,timezone)}</>:<>{t('修改')}：{auditValue(change.field,change.before,timezone)} → {auditValue(change.field,change.after,timezone)}</>}</span></li>)}</ul>:<p>{t('尚無可證明的業務欄位異動')}</p>}

      <details><summary>{t('詳細資料')}</summary><Fields value={record}/></details>
    </article>;
  })}</div>;
}
