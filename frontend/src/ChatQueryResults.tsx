import {Fragment,useState} from 'react';
import {type Workspace,type Row,display} from './api';
import {useLocale} from './i18n';

/** 展開明細僅改呈現；帶入由既有 Guide 驗證，不建立第二份草稿。 */
export function ChatQueryResults({workspace,onAll,onApply}:{workspace:Workspace;onAll:(equipment?:string)=>void;onApply?:(row:Row)=>void}) {
  const {locale}=useLocale();
  const L=(zh:string,en:string,th:string)=>locale==='en'?en:locale==='th'?th:zh;
  const [expanded,setExpanded]=useState<Row|null>(null);
  const visible=workspace.records.slice(0,4);
  const start=visible.length?((workspace.page??1)-1)*(workspace.page_size??workspace.records.length)+1:0;
  const filters=workspace.query_context?.filters;
  const date=String(filters?.date??'');
  const day=/^\d{4}-\d{2}-\d{2}$/.test(date)?new Intl.DateTimeFormat(locale,{month:'long',day:'numeric',timeZone:'UTC'}).format(new Date(date+'T00:00:00Z')).replace(/(\d+)月(\d+)日/,'$1 月 $2 日'):date;
  const firstEquipment=Array.isArray(workspace.catalogs.equipment)?String((workspace.catalogs.equipment[0] as Row)?.EQP_NO??''):'';
  if(!visible.length)return <div className="query-outcome-actions">{workspace.total===undefined&&firstEquipment&&<button type="button" className="query-small" onClick={()=>onAll(firstEquipment)}>{L(`只查 ${firstEquipment}`,`Only ${firstEquipment}`,`ค้นหาเฉพาะ ${firstEquipment}`)}</button>}<button type="button" className={`query-small ${workspace.total===undefined?'ghost':''}`} onClick={()=>onAll()}>{workspace.total===0?L('修改條件','Change filters','แก้ไขเงื่อนไข'):L('設定查詢範圍','Set query scope','กำหนดขอบเขตค้นหา')}</button>{workspace.total===0&&<button type="button" className="query-small ghost" onClick={()=>onAll()}>{L('查看全部設備','View all machines','ดูเครื่องจักรทั้งหมด')}</button>}</div>;
  return <section className="chat-query-results" aria-label={L('工單查詢結果','Order query results','ผลการค้นหาใบสั่งผลิต')}>
    <div className="query-result-top"><span>{[filters?.equipment,day].filter(Boolean).join(' · ')}</span><small>{workspace.total===undefined?L('總筆數未提供','Total unavailable','ไม่ระบุจำนวนทั้งหมด'):`${workspace.total} ${L('筆工單','orders','ใบสั่งผลิต')}`}</small></div>
    <table className="query-result-table"><thead><tr><th>{L('工單／品名','Order / product','ใบสั่งผลิต / ชิ้นงาน')}</th><th className="number">{L('良品','Good','ชิ้นงานดี')}</th><th className="number desktop">{L('不良','Defects','ของเสีย')}</th><th><span className="sr-only">{L('操作','Actions','การดำเนินการ')}</span></th></tr></thead>
      <tbody>{visible.map((row,index)=><Fragment key={String(row.WIP_OPI_WDOEACICO_HIST_SID??row.WO??index)}><tr><td>{display(row.WO??row.WO_NO)}<small>{[row.PART_NO,row.PART_SPEC].filter(Boolean).join(' ')}</small></td><td className="number">{display(row.MANUAL_OK)}</td><td className="number desktop">{display(row.MANUAL_NG)}</td><td><button type="button" className="query-small ghost" aria-expanded={expanded===row} onClick={()=>setExpanded(expanded===row?null:row)}>{L('明細','Details','รายละเอียด')}</button></td></tr>{expanded===row&&<tr><td colSpan={4}><div className="query-detail"><div className="query-detail-heading"><span>{[row.COMPLETED==='Y'?L('已完工','Completed','เสร็จแล้ว'):row.COMPLETED==='N'?L('未完工','Not completed','ยังไม่เสร็จ'):null,row.TOL_NO?`${L('模具','Mold','แม่พิมพ์')} ${row.TOL_NO}`:null].filter(Boolean).join(' · ')}</span>{onApply&&<button type="button" className="query-small" onClick={()=>onApply(row)}>{L('帶入報工','Use for reporting','ใช้รายงานผลผลิต')}</button>}</div><small>{L('人工報工','Manual report','รายงานด้วยตนเอง')}：{display(row.MANUAL_OK)} {L('良品','good','ชิ้นงานดี')}／{display(row.MANUAL_NG)} {L('不良','defects','ของเสีย')}<br/>{L('IoT 產量','IoT output','ผลผลิต IoT')}：{row.IOT_QUANTITY==null?L('尚無資料','No data yet','ยังไม่มีข้อมูล'):display(row.IOT_QUANTITY)}</small></div></td></tr>}</Fragment>)}</tbody>
    </table>
    <div className="query-pagination"><span>{start}–{visible.length?start+visible.length-1:0}／{workspace.total??'—'} {L('筆','records','รายการ')}</span><div className="query-pagination-actions"><button type="button" className="query-small ghost" onClick={()=>onAll()}>{L('查看全部','View all','ดูทั้งหมด')}</button></div></div>
  </section>;
}
