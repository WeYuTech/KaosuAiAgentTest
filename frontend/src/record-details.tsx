import {display,type Row} from './api';
import {useLocale} from './i18n';

/** 候選明細只投影來源欄位；缺少 IoT 資料不推算成零。 */
export function RecordDetails({record}:{record:Row}) {
  const {locale}=useLocale();
  const L=(zh:string,en:string,th:string)=>locale==='en'?en:locale==='th'?th:zh;
  return <><strong>{[record.PART_NO,record.PART_SPEC].filter(Boolean).join(' ')}</strong><br/>
    {L('模具','Mold','แม่พิมพ์')} {display(record.TOL_NO)} · {L('人工報工','Manual report','รายงานด้วยตนเอง')} {display(record.MANUAL_OK??record.OK_QTY)} {L('良品','good','ชิ้นงานดี')}／{display(record.MANUAL_NG??record.NG_QTY)} {L('不良','defects','ของเสีย')}<br/>
    {L('IoT 產量','IoT output','ผลผลิต IoT')}：{record.IOT_QUANTITY==null?L('尚無資料','No data yet','ยังไม่มีข้อมูล'):display(record.IOT_QUANTITY)}</>;
}
