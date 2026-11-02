import {RefreshCw} from 'lucide-react';
import {useEffect,useRef,useState} from 'react';
import {type api,type Row} from './api';
import {useLocale} from './i18n';
import {OperationDialog} from './OperationDialog';
import {RecordChoices} from './RecordChoices';

interface Page {records:Row[];page:number;has_more:boolean;page_size?:number;total?:number|null;filters:{search:string;part_no:string}}
/** 後端有界搜尋；目前選取不隨搜尋、換頁消失。 */
export function CandidateSelect({kind,value,part='',title,id,choose,request,onBusy}:{kind:'equipment'|'parts'|'work_orders'|'molds';value:string;part?:string;title:string;id:string;choose:(row:Row)=>void;request:typeof api;onBusy?:(busy:boolean)=>void}){
  const {locale}=useLocale();const L=(zh:string,en:string,th:string)=>locale==='en'?en:locale==='th'?th:zh;
  const [open,setOpen]=useState(false),[search,setSearch]=useState(''),[page,setPage]=useState(1),[data,setData]=useState<Page|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const generation=useRef(0),trigger=useRef<HTMLButtonElement>(null);
  const [notice,setNotice]=useState('');
  const [tentative,setTentative]=useState<Row|null>(null);
  const criteria=useRef('');
  const key={equipment:'EQP_NO',parts:'PART_NO',work_orders:'WO',molds:'TOL_NO'}[kind];
  async function load(next=1){
    const version=++generation.current;setBusy(true);onBusy?.(true);setError('');
    try{const result=await request<Page>(`/api/candidates?${new URLSearchParams({kind,search,part_no:part,page:String(next),page_size:'20'})}`);if(version===generation.current){const signature=JSON.stringify(result.filters);if(criteria.current!==signature){if(tentative)setNotice(L('查詢條件已更新，請重新選取。','Search changed. Select again.','เปลี่ยนเงื่อนไขแล้ว โปรดเลือกใหม่'));setTentative(null);}criteria.current=signature;setData(result);setPage(next);}}
    catch(e){if(version===generation.current)setError(e instanceof Error?e.message:String(e));}
    finally{if(version===generation.current){setBusy(false);onBusy?.(false);}}
  }
  useEffect(()=>{if(open)void load();return()=>{generation.current++;onBusy?.(false);};},[open,kind,part]);
  return <div className="guide-field"><span>{title}</span><button ref={trigger} aria-label={`${title}：${value||L('尚未選擇','Not selected','ยังไม่ได้เลือก')}`} id={id} type="button" className="secondary candidate-trigger" disabled={!!(['molds','work_orders'].includes(kind)&&!part)} aria-haspopup="dialog" onClick={()=>{setTentative(null);setOpen(true);}}>{value||L('搜尋並選擇','Search and select','ค้นหาและเลือก')}</button>
    {open&&<OperationDialog title={title} close={()=>setOpen(false)} returnFocus={()=>trigger.current} className="candidate-dialog">
      <form className="candidate-search" onSubmit={e=>{e.preventDefault();e.stopPropagation();void load();}}><input aria-label={L('搜尋編號或名稱','Search number or name','ค้นหารหัสหรือชื่อ')} value={search} onChange={e=>{generation.current++;setBusy(false);onBusy?.(false);setSearch(e.target.value);setData(null);if(tentative)setNotice(L('查詢條件已更新，請重新選取。','Search changed. Select again.','เปลี่ยนเงื่อนไขแล้ว โปรดเลือกใหม่'));setTentative(null);}} onKeyDown={e=>{if(e.key==='Enter'&&(e.nativeEvent.isComposing||e.keyCode===229))e.preventDefault();}}/><button type="submit" className="primary" disabled={busy}>{L('搜尋','Search','ค้นหา')}</button></form>
      {value&&<p>{L('目前選取：','Selected: ','เลือกแล้ว: ')}{value}</p>}
      {notice&&<p role="status">{notice}</p>}{busy&&<p role="status"><RefreshCw className="spin" size={18}/>{L('查詢中…','Searching…','กำลังค้นหา…')}</p>}{error&&<p role="alert">{error}</p>}
      {data&&!busy&&!error&&<><p>{data.records.length?(page-1)*(data.page_size??20)+1:0}–{data.records.length?(page-1)*(data.page_size??20)+data.records.length:0} · {data.total==null?L('總筆數未提供','Total not provided','ไม่ระบุจำนวนทั้งหมด'):data.total} · {data.has_more?L('仍有下一頁','More pages','ยังมีหน้าถัดไป'):L('已到最後一頁','Last page','หน้าสุดท้าย')}</p><RecordChoices columns={[L('編號／名稱','Number / name','รหัส / ชื่อ'),L('品號','Part','ชิ้นงาน')]} records={data.records} value={tentative} onSelect={row=>{setTentative(row);setNotice('');}} disabled={busy} identify={row=>String(row[key])} describe={row=>({primary:String(row[key]),secondary:String(row.PART_SPEC??row.EQP_NAME??row.TOL_NAME??''),context:String(row.PART_NO??'')})}/>{!data.records.length&&<p>{L('沒有符合資料，請調整搜尋條件。','No matches. Change the search.','ไม่พบข้อมูล โปรดเปลี่ยนเงื่อนไข')}</p>}<div className="guide-navigation"><button type="button" disabled={busy||page===1} onClick={()=>void load(page-1)}>{L('上一頁','Previous','ก่อนหน้า')}</button><span>{page}</span><button type="button" disabled={busy||!data.has_more} onClick={()=>void load(page+1)}>{L('下一頁','Next','ถัดไป')}</button></div></>}
      <div className="candidate-apply"><button type="button" className="secondary" onClick={()=>setOpen(false)}>{L('取消選取','Cancel selection','ยกเลิกการเลือก')}</button><span>{tentative?String(tentative[key]):''}</span><button type="button" className="primary" disabled={busy||!!error||!tentative||!data} onClick={()=>{if(tentative){if(String(tentative[key])!==value)choose(tentative);setOpen(false);}}}>{L('帶入作業單','Use in operation sheet','ใช้ในใบงาน')}</button></div>
    </OperationDialog>}
  </div>;
}
