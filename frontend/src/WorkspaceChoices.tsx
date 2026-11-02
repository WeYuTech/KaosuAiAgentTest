import {useEffect,useState} from 'react';
import {type Row,type Workspace} from './api';
import {RecordChoices} from './RecordChoices';
import {useLocale} from './i18n';

/** 暫選、明細與套用共用於聊天查詢和資料頁；套用才交給既有 Guide。 */
export function WorkspaceChoices({workspace,disabled,apply}:{workspace:Workspace;disabled:boolean;apply:(row:Row)=>void}){
  const {locale}=useLocale();const L=(zh:string,en:string,th:string)=>locale==='en'?en:locale==='th'?th:zh;
  const [choice,setChoice]=useState<Row|null>(null);
  const signature=JSON.stringify(Object.entries(workspace.query_context?.filters??{}).filter(([k])=>!['page','page_size'].includes(k)).sort());
  useEffect(()=>setChoice(null),[signature]);
  return <><RecordChoices records={workspace.records} value={choice} onSelect={setChoice} disabled={disabled} identify={r=>String(r.WIP_OPI_WDOEACICO_HIST_SID??r.ZZ_KAOSU_PROD_SCHEDULE_SID??r.EQP_NO)} describe={r=>({primary:String(r.WO??r.WO_NO??r.EQP_NO??''),secondary:[r.PART_NO,r.PART_SPEC,r.TOL_NO].filter(Boolean).join(' · '),context:[r.EQP_NO,r.REAL_CHECK_IN_TIME??r.SCHEDULE_START_TIME??r.SHIFT_DAY].filter(Boolean).join(' · ')})}/>
    {choice&&<div className="candidate-apply"><span>{String(choice.WO??choice.EQP_NO)}</span><button className="primary" disabled={disabled} onClick={()=>apply(choice)}>{L('帶入目前作業','Use in current operation','ใช้ในงานปัจจุบัน')}</button></div>}
  </>;
}
