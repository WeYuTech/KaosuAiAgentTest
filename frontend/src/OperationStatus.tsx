import {CircleAlert,Info,CircleHelp,CircleCheck,LoaderCircle,LogIn,LockKeyhole,RefreshCw} from 'lucide-react';
import type {ReactNode} from 'react';
import {t} from './i18n';
import type {Change} from './api';

/** 只投影現有狀態；不執行 API、不判定權限或變更提交規則。 */
export function StatusNotice({title,description,tone='warn',children}:{title:string;description?:string;tone?:'warn'|'error';children?:ReactNode}){
 return <div className={`operation-status-notice ${tone}`} role={tone==='error'?'alert':'status'}>{tone==='error'?<CircleAlert size={18}/>:<Info size={18}/>}<div>{title}{description&&<small>{description}</small>}{children}</div></div>;
}
export function SubmittingNotice(){return <div className="operation-status-live" role="status"><LoaderCircle className="spin" size={18}/>{t('正在送出，請稍候…')}</div>;}
export function OperationReceipt({unknown,id,changes,simulation,onCheck,onAudit,onNext,busy}:{unknown:boolean;id:string;changes:Change[];simulation:boolean;onCheck:()=>void;onAudit:()=>void;onNext:()=>void;busy:boolean}){
 return <div className="operation-receipt">{unknown?<CircleHelp size={18}/>:<CircleCheck size={18}/>}<h3>{t(unknown?'執行結果待確認':'作業已完成')}</h3><p>{t(unknown?'暫時沒收到結果，請先查核，避免重複送出。':'已查核執行成功並記錄異動。')}</p>
 {unknown?<button className="primary" disabled={busy} onClick={onCheck}><RefreshCw size={18}/>{t('查核執行結果')}</button>:<>{simulation&&<small>{t('模擬環境：此結果未寫入正式 MES。')}</small>}<div className="receipt-actions"><button onClick={onAudit}>{t('查看紀錄')}</button><button onClick={onNext}>{t('下一筆作業')}</button></div></>}
 <details><summary>{t('操作資訊')}</summary><p>{t('操作識別碼：')}{id}</p>{!unknown&&<><p>{t('已證明的欄位異動')}：{changes.length}</p>{changes.map((c,i)=><p key={i}>{c.field}：{String(c.before??'—')} → {String(c.after??'—')}</p>)}</>}</details></div>;
}
export function ConnectionState({state,onRetry,onBack}:{state:'connecting'|'session'|'permission';onRetry:()=>void;onBack:()=>void}){
 return <section className="connection-state" role="status">{state==='connecting'?<LoaderCircle className="spin" size={30}/>:state==='session'?<LogIn size={30}/>:<LockKeyhole size={30}/>}<h2>{t(state==='connecting'?'正在連線…':state==='session'?'登入已逾時':'目前無法執行這項操作')}</h2><p>{t(state==='connecting'?'正在取得工作區與登入狀態。':state==='session'?'請重新登入，再繼續原本的作業。':'你的帳號沒有這項操作權限。')}</p>{state==='session'?<button className="primary" onClick={onRetry}>{t('重新登入')}</button>:state==='permission'?<button onClick={onBack}>{t('返回聊天')}</button>:null}</section>;
}
