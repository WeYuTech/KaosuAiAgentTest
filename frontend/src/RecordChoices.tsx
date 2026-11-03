import {Fragment,useId,useState} from 'react';
import {type Row} from './api';
import {Fields} from './DataView';
import {RecordDetails} from './record-details';
import {mesDate} from './presentation';
import {useLocale} from './i18n';

/** 查看及暫選不套用業務目標；套用由外層唯一操作處理。 */
export function RecordChoices({records,value,onSelect,identify,describe,disabled=false,eligible=()=>true,columns,compact=false}:{records:Row[];value:Row|null;onSelect:(row:Row)=>void;identify:(row:Row)=>string;describe:(row:Row)=>{primary:string;secondary:string;context:string};disabled?:boolean;eligible?:(row:Row)=>boolean;columns?:[string,string];compact?:boolean}){
  const {locale}=useLocale();const L=(zh:string,en:string,th:string)=>locale==='en'?en:locale==='th'?th:zh;
  const [expanded,setExpanded]=useState<string[]>([]);
  const group=useId();
  const hasStatus=records.some(row=>'COMPLETED' in row || 'ENABLE_FLAG' in row);
  const status=(row:Row)=>row.COMPLETED==='Y'?L('已完工','Completed','เสร็จแล้ว'):row.COMPLETED==='N'?L('未完工','Not completed','ยังไม่เสร็จ'):row.ENABLE_FLAG==='Y'?L('有效','Active','ใช้งาน'):row.ENABLE_FLAG==='N'?L('已停用','Disabled','ปิดใช้งาน'):L('未提供','Not provided','ไม่ระบุ');
  return <div className={`record-choice-scroll ${compact?'reference-pick-table':''}`}><table className="record-choices"><thead><tr><th><span className={compact?'sr-only':undefined}>{L('選取','Select','เลือก')}</span></th><th>{columns?.[0]??L('工單／品名','Order / product','ใบสั่งผลิต / ชิ้นงาน')}</th><th>{columns?.[1]??(compact?L('設備','Machine','เครื่องจักร'):L('設備／執行時間','Machine / time','เครื่องจักร / เวลา'))}</th>{hasStatus&&<th>{L('狀態','Status','สถานะ')}</th>}<th><span className={compact?'sr-only':undefined}>{L('明細','Details','รายละเอียด')}</span></th></tr></thead><tbody>{records.map(row=>{
    const id=identify(row),text=describe(row),open=expanded.includes(id);
    return <Fragment key={id}><tr className={value&&identify(value)===id?'is-selected':''} tabIndex={disabled||!eligible(row)?-1:0} aria-selected={!!value&&identify(value)===id} onClick={e=>{if(!(e.target as HTMLElement).closest('button,input')&&!disabled&&eligible(row))onSelect(row);}} onKeyDown={e=>{if(e.target!==e.currentTarget)return;if(e.key===' '&&!disabled&&eligible(row)){e.preventDefault();onSelect(row);}if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();const list=Array.from(e.currentTarget.closest('tbody')!.querySelectorAll<HTMLTableRowElement>('tr[tabindex="0"]'));list[(list.indexOf(e.currentTarget)+(e.key==='ArrowDown'?1:-1)+list.length)%list.length]?.focus();}}}><td><input type="radio" name={group} aria-label={`${L('選取','Select','เลือก')} ${text.primary} · ${text.context}`} checked={!!value&&identify(value)===id} disabled={disabled||!eligible(row)} onChange={()=>onSelect(row)}/></td><td><strong>{mesDate(text.primary)}</strong><small>{text.secondary}</small></td><td><strong className="record-time">{text.context}</strong></td>{hasStatus&&<td className="record-state">{status(row)}</td>}<td><button type="button" className="text-button" aria-expanded={open} onClick={()=>setExpanded(items=>open?items.filter(key=>key!==id):[...items,id])}>{compact?L('明細','Details','รายละเอียด'):L('查看','View','ดู')}</button></td></tr>{open&&<tr className="record-choice-detail"><td colSpan={hasStatus?5:4}>{compact?<RecordDetails record={row}/>:<Fields value={row}/>}</td></tr>}</Fragment>;
  })}</tbody></table></div>;
}
