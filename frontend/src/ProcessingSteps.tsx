import {useEffect,useState} from 'react';
import {LoaderCircle,ChevronDown,ChevronRight,Check,TriangleAlert} from 'lucide-react';
import {t} from './i18n';
import type {ProcessingSummary} from './streaming';
export function ProcessingSteps({summary,phase='done',text=''}:{summary:ProcessingSummary;phase?:string;text?:string}){
 const running=phase==='running';const [open,setOpen]=useState(running);
 useEffect(()=>setOpen(running),[running]);
 const title=phase==='unknown'?t('結果未知，請查核原訊息；不會自動重送。'):phase==='stopped'?t('已停止'):phase==='failed'?t('處理未完成，請查核原對話'):running?t('處理中'):t('已處理 {0} 秒 · {1} 個步驟',{0:summary.elapsed_seconds,1:summary.steps.length});
 return <section className="processing-steps"><button type="button" className="steps-toggle" aria-expanded={open} onClick={()=>setOpen(!open)}>{open?<ChevronDown size={16}/>:<ChevronRight size={16}/>}<span>{title}</span></button><div className="sr-only" aria-live="polite">{running?summary.steps.at(-1)?.label+' '+t(summary.steps.at(-1)?.status==='done'?'完成':'處理中'):title}</div>{open&&<ol>{summary.steps.map(step=><li key={step.id}>{step.status==='running'?<LoaderCircle className={running?'spin':''} size={16}/>:step.status==='done'?<Check size={16}/>:<TriangleAlert size={16}/>}<span>{step.label}</span><small>{t(step.status==='done'?'完成':step.status==='failed'?'未完成':'處理中')}</small></li>)}</ol>}{text&&phase!=='stopped'&&<p className="stream-reply" aria-live="off">{text}</p>}</section>;
}
