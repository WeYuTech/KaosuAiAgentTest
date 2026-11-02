import {useEffect,useId,useRef,useState} from 'react';
import {type api,type Row} from './api';
import {useLocale} from './i18n';
/** 僅伺服器候選可套用；輸入文字不是已核實的主檔值。 */
export function CandidateCombobox({kind,value,part='',title,id,choose,request,onBusy}:{kind:'equipment'|'parts'|'work_orders'|'molds';value:string;part?:string;title:string;id:string;choose:(row:Row)=>void;request:typeof api;onBusy?:(busy:boolean)=>void}) {
 const {locale}=useLocale();const L=(zh:string,en:string,th:string)=>locale==='en'?en:locale==='th'?th:zh;
 const [text,setText]=useState(value),[open,setOpen]=useState(false),[records,setRecords]=useState<Row[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[index,setIndex]=useState(-1),[page,setPage]=useState(1),[more,setMore]=useState(false);
 const requestRef=useRef(request);requestRef.current=request;
 const generation=useRef(0),input=useRef<HTMLInputElement>(null),list=useId();
 const key={equipment:'EQP_NO',parts:'PART_NO',molds:'TOL_NO',work_orders:'WO'}[kind];
 const disabled=['molds','work_orders'].includes(kind)&&!part;
 useEffect(()=>{setText(value);setOpen(false);generation.current++;},[value,part]);
 useEffect(()=>{if(!open)return;const token=++generation.current;setBusy(true);onBusy?.(true);setError('');setIndex(-1);
 const timer=setTimeout(()=>{void requestRef.current<{records:Row[];has_more:boolean}>(`/api/candidates?${new URLSearchParams({kind,search:text,part_no:part,page:String(page),page_size:'20'})}`).then(result=>{if(token===generation.current){setRecords(result.records);setMore(result.has_more);}}).catch(e=>{if(token===generation.current){setError(e instanceof Error?e.message:String(e));setRecords([]);}}).finally(()=>{if(token===generation.current){setBusy(false);onBusy?.(false);}});},250);
 return()=>{clearTimeout(timer);generation.current++;onBusy?.(false);};},[open,text,part,page,kind]);
 function apply(row:Row){choose(row);setText(String(row[key]));setOpen(false);input.current?.focus();}
 return <div className="guide-field inline-candidate" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node)){setOpen(false);setText(value);}}}><label htmlFor={id}>{title}</label><input ref={input} id={id} role="combobox" aria-expanded={open} aria-controls={list} aria-autocomplete="list" aria-activedescendant={index>=0?`${list}-${index}`:undefined} disabled={disabled} value={text} onFocus={()=>{setPage(1);setOpen(true);}} onChange={e=>{generation.current++;setText(e.target.value);setPage(1);setOpen(true);}} onKeyDown={e=>{if(e.nativeEvent.isComposing||e.keyCode===229)return;if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setOpen(false);setText(value);}if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();setOpen(true);setIndex(i=>Math.max(0,Math.min(records.length-1,i+(e.key==='ArrowDown'?1:-1))));}if(e.key==='Enter'){e.preventDefault();if(open&&!busy&&index>=0&&records[index])apply(records[index]);}}}/>
 {open&&<div className="candidate-suggestions"><div role="status">{busy?L('查詢中…','Searching…','กำลังค้นหา…'):error||(!records.length?L('沒有符合資料','No matches','ไม่พบข้อมูล'):'')}</div><ul role="listbox" id={list} aria-label={title}>{!busy&&!error&&records.map((row,i)=><li key={String(row[key])} id={`${list}-${i}`} role="option" aria-selected={index===i} onMouseDown={e=>e.preventDefault()} onClick={()=>apply(row)}><strong>{String(row[key])}</strong><small>{String(row.PART_SPEC??row.EQP_NAME??row.TOL_NAME??row.PART_NO??'')}</small></li>)}</ul><div className="candidate-pages">{page>1&&<button type="button" disabled={busy} onClick={()=>setPage(p=>p-1)}>{L('上一頁','Previous','ก่อนหน้า')}</button>}{more&&<button type="button" disabled={busy} onClick={()=>setPage(p=>p+1)}>{L('下一頁','Next','ถัดไป')}</button>}{kind==='work_orders'&&<button type="button" onClick={()=>apply({WO:''})}>{L('清除工單','Clear order','ล้างใบสั่งผลิต')}</button>}</div></div>}
 </div>;
}
