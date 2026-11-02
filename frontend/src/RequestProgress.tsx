import {LoaderCircle} from 'lucide-react';

/** 停止等待只停止顯示活動狀態，不宣稱取消伺服器請求或 MES 作業。 */
export function RequestProgress({stopped=false}:{stopped?:boolean}) {
  return <div className="request-progress" role="status" aria-live="polite">
    {stopped ? <p>已停止等待。原請求仍在處理，完成後會顯示結果；目前不會重送。</p> : <>
      <p><LoaderCircle className="spin" size={18}/>正在查詢與整理資料…</p>
      <div className="request-skeleton" aria-hidden="true"><span/><span/><span/></div>
    </>}
  </div>;
}
