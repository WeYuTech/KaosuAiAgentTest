import {Fragment,useState} from 'react';
import {type Row} from './api';
import {Fields} from './DataView';
import {useLocale} from './i18n';

/** 查看及暫選不套用業務目標；套用由外層唯一操作處理。 */
export function RecordChoices({records,value,onSelect,identify,describe,disabled=false,eligible=()=>true}:{records:Row[];value:Row|null;onSelect:(row:Row)=>void;identify:(row:Row)=>string;describe:(row:Row)=>{primary:string;secondary:string;context:string};disabled?:boolean;eligible?:(row:Row)=>boolean}){
  const {locale}=useLocale();const L=(zh:string,en:string,th:string)=>locale==='en'?en:locale==='th'?th:zh;
  const [expanded,setExpanded]=useState<string[]>([]);
  return <div className="record-choice-scroll"><table className="record-choices"><thead><tr><th>{L('選取','Select','เลือก')}</th><th>{L('工單／品號','Order / part','ใบสั่งผลิต / ชิ้นงาน')}</th><th>{L('設備／執行時間','Machine / time','เครื่องจักร / เวลา')}</th><th>{L('明細','Details','รายละเอียด')}</th></tr></thead><tbody>{records.map(row=>{
    const id=identify(row),text=describe(row),open=expanded.includes(id);
    return <Fragment key={id}><tr><td><input type="radio" name="operation-target" aria-label={`${L('選取','Select','เลือก')} ${text.primary} · ${text.context}`} checked={!!value&&identify(value)===id} disabled={disabled||!eligible(row)} onChange={()=>onSelect(row)}/></td><td><strong>{text.primary}</strong><small>{text.secondary}</small></td><td>{text.context}</td><td><button type="button" className="text-button" aria-expanded={open} onClick={()=>setExpanded(items=>open?items.filter(key=>key!==id):[...items,id])}>{L('查看','View','ดู')}</button></td></tr>{open&&<tr className="record-choice-detail"><td colSpan={4}><Fields value={row}/></td></tr>}</Fragment>;
  })}</tbody></table></div>;
}
