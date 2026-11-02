import {useEffect,useRef,useState} from 'react';
import {ArrowLeft,LoaderCircle,Plus,Clock3} from 'lucide-react';
import {OperationDialog,OperationActions} from './OperationDialog';
import {Button} from './components/ui/button';
import {Input} from './components/ui/input';
import {t} from './i18n';
import {DataView} from './DataView';
import {mesDate} from './presentation';
import type {Module,Row} from './api';
import type {ManagementProps} from './ManagementPanel';
type Spec={title:string;module:Module;equipment:string;frequency:'daily'|'weekdays';hour:number;minute:number};
type Job=Spec&{id:string;version:number;status:string;next_run_at:string};
type Run={id:string;due_at:string;status:string;message?:string;report?:{title:string;date:string;records:Row[];record_count:number}};
const modules={report:'生產報工',schedule:'生產排程',mold:'模具上下模'};
const states:Record<string,string>={active:'啟用中',paused:'已暫停',deleted:'已刪除',completed:'已完成',running:'執行中',failed:'查詢未完成',missed:'錯過原訂時間',interrupted:'執行中斷'};
const frequency=(value:string)=>t(value==='daily'?'每天':'週一至週五');
const hhmm=(job:Spec)=>`${String(job.hour).padStart(2,'0')}:${String(job.minute).padStart(2,'0')}`;
const zone=(value:string)=>value.replace(/^(UTC[+-]\d{2})(\d{2})$/,'$1:$2');
export function ReportSchedulesPanel({request,close,roles,locked,open=true,returnFocus,businessTimezone}:ManagementProps){
 const [jobs,setJobs]=useState<Job[]>([]),[timezone,setTimezone]=useState(businessTimezone??''),[loadState,setLoadState]=useState<'loading'|'ready'|'error'>('loading');
 const [view,setView]=useState<'list'|'create'|'runs'>('list'),[runs,setRuns]=useState<Run[]>([]),[runsJob,setRunsJob]=useState<Job|null>(null),[selected,setSelected]=useState<Run|null>(null);
 const [form,setForm]=useState<Spec>({title:'',module:(['report','schedule','mold'].find(x=>roles.includes(x))||'report') as Module,equipment:'',frequency:'daily',hour:8,minute:0}),[timeText,setTimeText]=useState('08:00'),[text,setText]=useState('');
 const [busy,setBusy]=useState(false),[phase,setPhase]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[highlight,setHighlight]=useState('');
 const [confirm,setConfirm]=useState<{label:string;path:string;body:unknown;summary:Record<string,string>}|null>(null);
 const active=useRef(true),working=useRef(false),requestRef=useRef(request),newButton=useRef<HTMLButtonElement>(null),root=useRef<HTMLElement>(null),reviewButton=useRef<HTMLButtonElement>(null);requestRef.current=request;
 useEffect(()=>{active.current=open;if(open)void perform(loadJobs,'正在載入報告…');return()=>{active.current=false;};},[open]);
 useEffect(()=>{if(highlight){const timer=setTimeout(()=>setHighlight(''),1800);return()=>clearTimeout(timer);}},[highlight]);
 useEffect(()=>{if(confirm){const title=root.current?.closest('[role=dialog]')?.querySelector<HTMLElement>('h2');if(title){title.tabIndex=-1;title.focus();}}},[confirm]);
 async function perform(action:()=>Promise<void>,message:string){if(working.current||!active.current)return;working.current=true;setBusy(true);setPhase(message);setError('');setNotice('');try{await action();}catch(e){if(active.current)setError(e instanceof Error?e.message:String(e));}finally{working.current=false;if(active.current){setBusy(false);setPhase('');}}}
 async function loadJobs(){setLoadState('loading');try{const data=await requestRef.current<{records:Job[];timezone:string}>('/api/report-schedules');if(active.current){setJobs(data.records);setTimezone(businessTimezone||zone(data.timezone??''));setLoadState('ready');}}catch(e){if(active.current)setLoadState('error');throw e;}}
 function list(){setView('list');setConfirm(null);setError('');setSelected(null);requestAnimationFrame(()=>newButton.current?.focus());}
 function newReport(){setForm({title:'',module:(['report','schedule','mold'].find(x=>roles.includes(x))||'report') as Module,equipment:'',frequency:'daily',hour:8,minute:0});setTimeText('08:00');setText('');setView('create');setError('');setNotice('');}
 const disabled=busy||locked||!open;
 const specSummary=(spec:Spec)=>({[t('報告名稱')]:spec.title,[t('作業模組')]:t(modules[spec.module]),[t('設備')]:spec.equipment||t('全部設備'),[t('頻率')]:frequency(spec.frequency),[t('執行時間')]:`${hhmm(spec)} (${timezone})`,[t('資料範圍')]:t('前一排程日快照')});
 async function preview(){if(disabled||!timezone)return;await perform(async()=>{
   const [hour,minute]=timeText.split(':').map(Number);const spec={...form,title:form.title.trim(),equipment:form.equipment.trim(),hour,minute};
   const parsed=await requestRef.current<Spec>('/api/report-schedules/preview',{text:`${spec.frequency==='daily'?'每天':'週一至週五'} ${hhmm(spec)} ${modules[spec.module]} ${spec.equipment}`});
   if(['module','equipment','frequency','hour','minute'].some(key=>String(parsed[key as keyof Spec])!==String(spec[key as keyof Spec])))throw new Error(t('既有快速解析不支援此設備條件，請使用 MC 編號或留空。'));
   if(!active.current)return;
   setForm(spec);const client_id=Array.from(crypto.getRandomValues(new Uint32Array(4)),x=>x.toString(16).padStart(8,'0')).join('');
   setConfirm({label:'建立定時報告',path:'/api/report-schedules',body:{...spec,client_id},summary:specSummary(spec)});
 },'正在核對報告條件…');}
 async function approve(){if(!confirm||disabled)return;await perform(async()=>{const result=await requestRef.current<Job>(confirm.path,confirm.body);if(!active.current)return;const creation=confirm.label==='建立定時報告';setConfirm(null);setView('list');if(creation)setHighlight(result.id);await loadJobs();if(active.current){setNotice(t('已完成'));requestAnimationFrame(()=>newButton.current?.focus());}},'正在儲存設定…');}
 function statusChange(job:Job,status:string){setError('');setConfirm({label:status==='deleted'?'刪除定時報告':status==='paused'?'暫停定時報告':'恢復定時報告',path:`/api/report-schedules/${job.id}`,body:{version:job.version,status},summary:{[t('報告名稱')]:job.title,[t('狀態')]:t(states[job.status])+' → '+t(states[status])}});}
 function editAgain(){setConfirm(null);setError('');requestAnimationFrame(()=>reviewButton.current?.focus());}
 const verb=confirm?.label==='建立定時報告'?'建立':confirm?.label==='刪除定時報告'?'刪除':confirm?.label==='暫停定時報告'?'暫停':'恢復';
 const footer=confirm?<OperationActions><Button variant="outline" disabled={busy} onClick={editAgain}>{t('返回修改')}</Button><Button variant={verb==='刪除'?'destructive':'default'} disabled={disabled} onClick={()=>void approve()}>{t(verb)}</Button></OperationActions>:view==='create'?<OperationActions><Button variant="outline" disabled={busy} onClick={list}>{t('取消')}</Button><Button ref={reviewButton} type="submit" form="report-create-form" disabled={disabled||!form.title.trim()||!timezone}>{t('核對並建立')}</Button></OperationActions>:undefined;
 return <OperationDialog open={open} returnFocus={returnFocus} title={t(confirm?confirm.label+'？':view==='create'?'建立定時報告':view==='runs'?'執行歷史':'定時報告')} close={view==='create'?list:close} onEscape={confirm?editAgain:view==='create'?list:undefined} locked={busy} className="management-dialog report-dialog" footer={footer}><section ref={root} className="management-panel">
 {busy&&<p role="status"><LoaderCircle size={18} className="spin"/>{t(phase)}</p>}{error&&<div className="management-error" role="alert"><p>{error}</p>{view==='list'&&<Button variant="outline" disabled={busy} onClick={()=>void perform(loadJobs,'正在載入報告…')}>{t('重試')}</Button>}</div>}{notice&&<p role="status">{notice}</p>}
 {locked&&<p>{t('請先完成、取消或查核原操作，再修改管理設定。')}</p>}
 {confirm?<div className="management-confirm"><dl className="management-summary">{Object.entries(confirm.summary).map(([key,value])=><div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>{confirm.label==='刪除定時報告'&&<p>{t('刪除後不再執行，既有執行歷史仍保留；此清單將移除報告。已開始的查詢可完成。')}</p>}{confirm.label==='暫停定時報告'&&<p>{t('停止後續執行；已開始的查詢可完成。')}</p>}</div>:view==='create'?<>
 <p>{t('產生前一排程日的唯讀報告，不自動報工。')}</p>
 <details><summary>{t('用一句話快速填寫（選用）')}</summary><label className="management-field">{t('描述定時報告')}<textarea value={text} disabled={disabled} onChange={e=>setText(e.target.value)} placeholder={t('例如：每天 08:00 產生 MC37 的報工報告')}/></label><Button variant="outline" disabled={disabled||!text.trim()} onClick={()=>void perform(async()=>{const spec=await requestRef.current<Spec>('/api/report-schedules/preview',{text});if(active.current){setForm(spec);setTimeText(hhmm(spec));setNotice(t('已填入，請核對'));}},'正在解析條件…')}>{t('解析並填入')}</Button></details>
 <form id="report-create-form" onSubmit={e=>{e.preventDefault();void preview();}}>
 <label className="management-field">{t('報告名稱')}<Input required maxLength={100} value={form.title} disabled={disabled} onChange={e=>setForm({...form,title:e.target.value})}/></label>
 <div className="management-grid"><label className="management-field">{t('作業模組')}<select value={form.module} disabled={disabled} onChange={e=>setForm({...form,module:e.target.value as Module})}>{Object.entries(modules).filter(([key])=>roles.includes(key)).map(([key,name])=><option key={key} value={key}>{t(name)}</option>)}</select></label><label className="management-field">{t('設備（留空為全部）')}<Input maxLength={60} value={form.equipment} disabled={disabled} onChange={e=>setForm({...form,equipment:e.target.value})}/></label></div>
 <div className="management-grid"><label className="management-field">{t('頻率')}<select disabled={disabled} value={form.frequency} onChange={e=>setForm({...form,frequency:e.target.value as Spec['frequency']})}><option value="daily">{t('每天')}</option><option value="weekdays">{t('週一至週五')}</option></select></label><label className="management-field">{t('執行時間（24 小時制）')}<Input required inputMode="numeric" pattern="([01][0-9]|2[0-3]):[0-5][0-9]" placeholder="HH:mm" value={timeText} disabled={disabled} onChange={e=>setTimeText(e.target.value)}/></label></div><p className="muted">{t('MES 業務時區')}：{timezone||t('尚未取得時區')} · {t('依頻率於 MES 時間執行，不使用模型費用。')}</p>
 </form></>:view==='runs'?<><Button variant="ghost" onClick={list}><ArrowLeft size={16}/>{t('返回定時報告')}</Button><h3>{runsJob?.title}</h3>{!busy&&!runs.length&&<p>{t('尚未產生報告')}</p>}{runs.map(run=><Button variant="outline" className="management-run" key={run.id} onClick={()=>setSelected(run)}><span>{mesDate(run.due_at,timezone)}</span><span className="status-chip">{t(states[run.status]??'無法辨識的執行狀態')}</span></Button>)}{selected&&<section className="report-content"><h3>{selected.status==='completed'?selected.report?.title:t('報告狀態')}</h3><p>{mesDate(selected.due_at,timezone)} · {t(states[selected.status]??'無法辨識的執行狀態')}</p>{selected.status==='completed'&&selected.report?<><p>{t('資料日期')}：{selected.report.date}</p>{selected.report.records.length?<DataView data={selected.report.records}/>:<p>{t('這個資料範圍沒有快照紀錄，不代表零產出。')}</p>}</>:<><p>{selected.message?t(selected.message):t('尚未取得完整報告，不代表零產出。')}</p><p>{t('沒有可確認的完整報告，不代表零產出。')}</p></>}</section>}</>:<>
 <div className="management-list-heading"><h3><Clock3 size={18}/>{t('我的定時報告')}</h3><Button ref={newButton} disabled={disabled||loadState!=='ready'} onClick={newReport}><Plus size={16}/>{t('新增')}</Button></div>
 {loadState==='ready'&&!jobs.length&&<div className="management-empty"><p>{t('尚未建立定時報告')}</p><p>{t('新增一份唯讀報告，依指定時間整理前一排程日資料。')}</p></div>}
 {loadState==='ready'&&jobs.map(job=><article className={`management-job ${highlight===job.id?'new-report-highlight':''}`} key={job.id}><div className="management-job-title"><strong>{job.title}</strong><span className="status-chip">{t(states[job.status]??'無法辨識的執行狀態')}</span></div><p>{t(modules[job.module])} · {job.equipment||t('全部設備')}</p><p>{frequency(job.frequency)} {hhmm(job)} ({timezone}) · {t('前一排程日快照')}</p>{job.status==='active'&&<p>{t('下次執行')}：{mesDate(job.next_run_at,timezone)}</p>}<div className="management-actions"><Button variant="outline" disabled={busy} onClick={()=>void perform(async()=>{const v=await requestRef.current<{records:Run[]}>(`/api/report-schedules/${job.id}/runs`);if(active.current){setRuns(v.records);setRunsJob(job);setSelected(null);setView('runs');}},'正在載入報告…')}>{t('執行歷史')}</Button><Button variant="outline" disabled={disabled} onClick={()=>statusChange(job,job.status==='active'?'paused':'active')}>{t(job.status==='active'?'暫停':'恢復')}</Button><Button className="danger-action" variant="outline" disabled={disabled} onClick={()=>statusChange(job,'deleted')}>{t('刪除')}</Button></div></article>)}
 </>}
 </section></OperationDialog>;
}
