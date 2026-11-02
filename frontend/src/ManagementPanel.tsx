import {useEffect,useRef,useState} from 'react';
import {LoaderCircle,ArrowRight} from 'lucide-react';
import {BudgetSummary,money} from './BudgetSummary';
import {Input} from './components/ui/input';
import {Button} from './components/ui/button';
import {SettingSelect} from './SettingSelect';
import {OperationDialog,OperationActions} from './OperationDialog';
import {ReportSchedulesPanel} from './ReportSchedulesPanel';
import {t} from './i18n';
import {label,type Row} from './api';
export type ManagementSection='api'|'agent'|'budget'|'reports';
type Settings={version:number;model:string;reasoning_effort:string;max_tool_rounds:number};
type Budget={version:number;limit_usd:number;warning_percent:number};
type Config={settings:Settings;budget_config:Budget;budget:Row;hard_limit_usd:number;write_allowed:boolean;api_key_configured:boolean;models:string[];provider:string;agent:string};
export type ManagementProps={businessTimezone?:string;open?:boolean;returnFocus?:()=>HTMLElement|null;section:ManagementSection;request:<T>(path:string,body?:unknown)=>Promise<T>;close:()=>void;roles:string[];locked:boolean};
const names={api:'API 設定',agent:'Agent 設定',budget:'用量額度',reports:'定時報告'};
const human=(key:string,value:unknown)=>key==='limit_usd'?money(value):key==='reasoning_effort'?t(({low:'低',medium:'中',high:'高'} as Record<string,string>)[String(value)]??String(value)):String(value)+(key==='max_tool_rounds'?` ${t('次')}`:key==='warning_percent'?'%':'');
export function ManagementPanel(props:ManagementProps){return props.section==='reports'?<ReportSchedulesPanel {...props}/>:<SettingsPanel {...props}/>;}
function SettingsPanel({section,request,close,locked,open=true,returnFocus}:ManagementProps){
 const [config,setConfig]=useState<Config|null>(null),[draft,setDraft]=useState<Row>({}),[state,setState]=useState<'loading'|'ready'|'error'>('loading');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[review,setReview]=useState(false),[nonce,setNonce]=useState(0);
 const alive=useRef(true),working=useRef(false),requestRef=useRef(request),trigger=useRef<HTMLButtonElement>(null),heading=useRef<HTMLDivElement>(null);requestRef.current=request;
 function adopt(value:Config){setConfig(value);const original=section==='budget'?value.budget_config:value.settings;setDraft({...original});setState('ready');}
 useEffect(()=>{alive.current=open;let valid=true;if(open){setState('loading');setError('');void requestRef.current<Config>('/api/management').then(v=>{if(valid)adopt(v);}).catch(e=>{if(valid){setState('error');setError(e.message);}});}return()=>{valid=false;alive.current=false;};},[open,nonce,section]);
 useEffect(()=>{if(review){const title=heading.current?.closest('[role=dialog]')?.querySelector<HTMLElement>('h2');if(title){title.tabIndex=-1;title.focus();}}},[review]);
 const original=(section==='budget'?config?.budget_config:config?.settings) as unknown as Row|undefined;
 const keys=section==='budget'?['limit_usd','warning_percent']:section==='agent'?['max_tool_rounds']:['model','reasoning_effort'];
 const value=(key:string)=>['model','reasoning_effort'].includes(key)?draft[key]:Number(draft[key]);
 const changed=keys.filter(key=>original?.[key]!==value(key));
 const valid=keys.every(key=>draft[key]!==''&&draft[key]!=null)&& (section==='agent'?Number.isInteger(value('max_tool_rounds'))&&Number(value('max_tool_rounds'))>=1&&Number(value('max_tool_rounds'))<=5:section==='budget'?Number(value('limit_usd'))>=0&&Number(value('limit_usd'))<=Math.min(20,config?.hard_limit_usd??0)&&Number.isInteger(value('warning_percent'))&&Number(value('warning_percent'))>=1&&Number(value('warning_percent'))<=100:true);
 const disabled=busy||locked||!open,readonly=!config?.write_allowed;
 function edit(){setReview(false);setError('');requestAnimationFrame(()=>trigger.current?.focus());}
 async function save(){if(disabled||working.current||readonly||!valid||!changed.length)return;working.current=true;setBusy(true);setError('');setNotice('');try{const body={...original,...Object.fromEntries(keys.map(key=>[key,value(key)]))};const result=await requestRef.current<Config>('/api/management/'+(section==='budget'?'budget':'settings'),body);if(alive.current){adopt(result);setReview(false);setNotice(t('設定已保存。'));requestAnimationFrame(()=>trigger.current?.focus());}}catch(e){if(alive.current)setError(e instanceof Error?e.message:String(e));}finally{working.current=false;if(alive.current)setBusy(false);}}
 const editField=(key:string,title:string,min:number,max:number,step=1)=><label className="management-field">{t(title)}<Input type="number" required min={min} max={max} step={step} value={String(draft[key]??'')} disabled={disabled} onChange={e=>setDraft({...draft,[key]:e.target.value})}/></label>;
 return <OperationDialog open={open} returnFocus={returnFocus} title={t(review?'核對設定變更':names[section])} close={close} locked={busy} onEscape={review?edit:undefined} className="management-dialog settings-dialog" footer={state==='ready'&&!readonly?<OperationActions>{review?<><Button variant="outline" disabled={busy} onClick={edit}>{t('返回修改')}</Button><Button disabled={disabled||!valid||!changed.length} onClick={()=>void save()}>{t('儲存')}</Button></>:<><Button variant="outline" onClick={close}>{t('關閉')}</Button><Button ref={trigger} data-review-trigger disabled={disabled||!valid||!changed.length} onClick={()=>{setReview(true);setError('');}}>{t('核對變更')}</Button></>}</OperationActions>:undefined}>
 <section ref={heading} className="management-panel">
 {state==='loading'&&<p role="status"><LoaderCircle className="spin" size={18}/>{t('正在讀取資料…')}</p>}
 {error&&<div role="alert" className="management-error"><p>{error}</p>{state==='error'&&<Button variant="outline" onClick={()=>setNonce(n=>n+1)}>{t('重試')}</Button>}</div>}
 {busy&&<p role="status"><LoaderCircle className="spin" size={18}/>{t('正在儲存設定…')}</p>}{notice&&<p role="status">{notice}</p>}
 {locked&&<p>{t('請先完成、取消或查核原操作，再修改管理設定。')}</p>}
 {state==='ready'&&config&&(review?<dl className="management-summary">{changed.map(key=><div key={key}><dt>{label(key)}</dt><dd className="setting-diff"><del>{human(key,original?.[key])}</del><ArrowRight size={16}/><strong>{human(key,value(key))}</strong></dd></div>)}</dl>:<>
 <p className="muted">{t(readonly?'僅供查看；設定由既有主管權限調整。':section==='budget'?'額度調整立即生效，不會重設既有用量。':'設定於新聊天生效；既有作業不變。')}</p>
 {section==='api'&&<><div className="provider-summary"><span><strong>{t('API 來源')}</strong><br/>{config.provider}</span><span className="status-chip">{t(config.api_key_configured?'金鑰已設定':'金鑰尚未設定')}</span></div><p className="muted">{t('金鑰來源：伺服器私密設定；不提供金鑰內容或更新時間。')}</p></>}
 {section==='agent'&&<p>{t('可查詢與準備草稿；寫入仍需人工確認。')}</p>}
 {section==='budget'&&<><BudgetSummary value={config.budget}/><p>{t('上限不可超過 US$20 與部署限制；已使用及未知用量不會清零。')}</p></>}
 {readonly?<dl className="management-summary">{keys.map(key=><div key={key}><dt>{label(key)}</dt><dd>{human(key,original?.[key])}</dd></div>)}</dl>:<>
 {section==='api'&&<><label className="management-field">{t('模型')}<SettingSelect label={t('模型')} value={String(draft.model)} disabled={disabled} onChange={model=>setDraft({...draft,model})} options={config.models.map(model=>({value:model,label:model}))}/></label><label className="management-field">{t('推理強度')}<SettingSelect label={t('推理強度')} value={String(draft.reasoning_effort)} disabled={disabled} onChange={reasoning_effort=>setDraft({...draft,reasoning_effort})} options={['low','medium','high'].map(v=>({value:v,label:human('reasoning_effort',v)}))}/></label></>}
 {section==='agent'&&editField('max_tool_rounds','每輪呼叫上限（次）',1,5)}
 {section==='budget'&&<>{editField('limit_usd','累計費用上限（美元）',0,Math.min(20,config.hard_limit_usd),0.01)}{editField('warning_percent','用量提醒比例（%）',1,100)}</>}
 </>}
 </>)}
 </section></OperationDialog>;
}
