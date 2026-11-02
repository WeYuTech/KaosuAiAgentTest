import {mesDate} from './presentation';
import type {Row} from './api';
import {t} from './i18n';

const stages=[['mold.mount_start','開始上模','ZZ_MODLE_UPLOAD_START'],['mold.mount_finish','完成上模','ZZ_MODLE_UPLOAD_END'],['mold.unmount_start','開始下模','ZZ_MODLE_REMOVE_START'],['mold.unmount_finish','完成下模','ZZ_MODLE_REMOVE_END']] as const;
/** NEXT_ACTION 由後端依全排程歷程計算；前端只呈現，不另判定可執行階段。 */
export function moldStageAvailability(record:Row|null,action:string){
 if(!record)return {allowed:false,reason:'請先選擇設備與排程'};
 const members=Array.isArray(record.EXECUTIONS)?record.EXECUTIONS as Row[]:[];
 if(action==='mold.clear')return {allowed:members.some(row=>Boolean(row.ZZ_MODLE_UPLOAD_START)),reason:'沒有上模紀錄可清除'};
 if(!members.length)return {allowed:false,reason:'排程沒有執行紀錄，請重新查詢'};
 if(record.NEXT_ACTION===action)return {allowed:true,reason:'目前可執行'};
 const stage=stages.find(row=>row[0]===action);
 if(stage&&members.every(row=>Boolean(row[stage[2]])))return {allowed:false,reason:'此階段已完成'};
 if(!record.NEXT_ACTION)return {allowed:false,reason:'階段不一致或已完成，請核對歷程'};
 return {allowed:false,reason:'尚未完成前一階段'};
}
export function MoldStages({record,disabled,choose,select}:{record:Row|null;disabled:boolean;choose:(action:string)=>void;select:()=>void}){
 return <div className="mold-stage-panel"><div className="sheet-target"><div><strong>{record?[record.EQP_NO,record.TOL_NO].filter(Boolean).join(' · '):t('尚未選擇設備與排程')}</strong><p>{mesDate(record?.SCHEDULE_START_TIME)}</p></div><button type="button" disabled={disabled} onClick={select}>{t('選擇／更換對象')}</button></div>
 <ol className="mold-stages">{stages.map(([action,title,field],index)=>{const state=moldStageAvailability(record,action);return <li key={action} className={state.allowed?'stage-current':state.reason==='此階段已完成'?'stage-completed':'stage-future'}><b>{state.reason==='此階段已完成'?'✓':index+1}</b><div><strong>{t(title)}</strong><small>{record?.[field]?`${mesDate(record[field])} · ${t(state.reason)}`:t(state.reason)}</small></div><button type="button" disabled={disabled||!state.allowed} onClick={()=>choose(action)}>{state.allowed?t('執行：{0}',{0:t(title)}):t(title)}</button></li>;})}</ol>
 <p className="business-note">{t('時間由伺服器預覽產生，核對後才執行；不需填寫數量。')}</p>
 <div className="mold-clear-action"><button type="button" disabled={disabled||!moldStageAvailability(record,'mold.clear').allowed} onClick={()=>choose('mold.clear')}>{t('清除換模紀錄')}</button>{!moldStageAvailability(record,'mold.clear').allowed&&<small>{t(moldStageAvailability(record,'mold.clear').reason)}</small>}</div></div>;
}
