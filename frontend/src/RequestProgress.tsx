import {LoaderCircle} from 'lucide-react';
import {useEffect,useState} from 'react';
import {t,useLocale} from './i18n';

/** 停止等待不宣稱取消伺服器請求；停止動作仍交由原請求識別處理。 */
export function RequestProgress({stopped=false,equipment,onStop}:{stopped?:boolean;equipment?:string;onStop?:()=>void}) {
  const {locale}=useLocale();const L=(zh:string,en:string,th:string)=>locale==='en'?en:locale==='th'?th:zh;
  const [slow,setSlow]=useState(false);
  useEffect(()=>{const timer=setTimeout(()=>setSlow(true),8000);return()=>clearTimeout(timer);},[]);
  return <div className="request-progress" role="status" aria-live="polite">
    {stopped ? <p>{t('已停止等待。原請求仍在處理，完成後會顯示結果；目前不會重送。')}</p> : <>
      <p><LoaderCircle className="spin" size={18}/><span>{slow?L('查詢時間較長，仍在處理…','This is taking longer; still processing…','ใช้เวลานานกว่าปกติ กำลังดำเนินการ…'):equipment?L(`正在查詢 ${equipment} 的工單…`,`Looking up orders for ${equipment}…`,`กำลังค้นหาใบสั่งผลิตของ ${equipment}…`):t('正在查詢與整理資料…')}</span></p>
      <div className="request-skeleton" aria-hidden="true"><span/><span/><span/></div>
      {slow&&onStop&&<button type="button" className="query-small" onClick={onStop}>{L('停止查詢','Stop query','หยุดค้นหา')}</button>}
    </>}
  </div>;
}
