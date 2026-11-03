import {budgetCaption} from './BudgetSummary';
import {TooltipProvider,Tooltip,TooltipTrigger,TooltipContent} from './components/ui/tooltip';
import {ThreadListNew,ThreadListSkeleton} from './components/assistant-ui/elements/thread-list.aui';
import {HistorySearchDialog} from './HistorySearchDialog';
import type {HistoryProjection} from './chat/assistant-runtime';
import {OperationDialog,OperationActions} from './OperationDialog';
import {DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuItem} from './components/ui/dropdown-menu';
import {ThreadListPrimitive,ThreadListItemPrimitive} from '@assistant-ui/react';
import { useEffect, useLayoutEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, MoreHorizontal, Search, PanelLeftClose } from 'lucide-react';
import { ApiError, type Conversation, type Module, type Row } from './api';
import { t } from './i18n';

export interface ChatEntry {
  id: string; module: Module; title: string; is_pinned: boolean; is_archived: boolean; is_deleted: boolean;
  metadata_version: number; created_at: string; updated_at: string; message_count: number;
}
interface Page { records: ChatEntry[]; total: number; page: number; page_size: number }
const emptyPage:Page={records:[],total:0,page:1,page_size:30};
export type HistoryScope = 'active' | 'archived' | 'deleted';
export interface HistoryController { showScope: (scope: HistoryScope) => void }
export function ConversationHistory({ actor, current, overlay, locked, busy, refresh, request, close, select, create, beforeChange, changed, usage, onWorkChange, budget, onProjection, visible=true, ref }: {
  ref?:Ref<HistoryController>;visible?:boolean;onProjection:(value:HistoryProjection)=>void;budget: Row | null; actor?: string; current: Conversation | null; overlay: boolean; locked: boolean; busy: boolean; refresh: number;
  request: <T>(path: string, body?: unknown) => Promise<T>; close: () => void; select: (entry: ChatEntry) => Promise<void>;
  create: () => Promise<void>; beforeChange: (id: string) => Promise<void>; changed: (entry: ChatEntry) => void; usage: () => void;
  onWorkChange: (value:boolean)=>void;
}) {
  const [scope]=useState<HistoryScope>('active');const [searchScope,setSearchScope]=useState<HistoryScope>('active'),[page,setPage]=useState(1);
  const [failure,setFailure]=useState<{key:string;message:string}|null>(null), [saving,setSaving]=useState(false);
  const [nonce,setNonce] = useState(0), [dialog,setDialog] = useState<{kind:'rename'|'delete';entry:ChatEntry}|null>(null);
  const listKey=JSON.stringify([actor,scope,page]);
  const list=useRef<HTMLDivElement>(null),scrollPosition=useRef<number|null>(null);
  const requestKey=JSON.stringify([actor,scope,page,nonce,refresh]);
  function setError(message:string){setFailure(message?{key:requestKey,message}:null);}
  const error=failure?.key===requestKey?failure.message:'';
  const [searchOpen,setSearchOpen]=useState(false);const searchButton=useRef<HTMLButtonElement>(null);
  const [dialogOpen,setDialogOpen]=useState(false);
  const [response,setResponse]=useState<{key:string;listKey:string;data:Page}|null>(null);
  // 查詢條件改變的同一次 render 即隱藏舊列，不能等到 effect 才撤下舊操作。
  const settled=response?.key===requestKey&&response.listKey===listKey;
  const loading=Boolean(actor&&!settled&&!error);
  const data=response?.listKey===listKey?response.data:emptyPage;
  const [title,setTitle]=useState(''), [dialogError,setDialogError]=useState('');
  const dialogRef=useRef<HTMLDivElement>(null), trigger=useRef<HTMLElement|null>(null);
  const requestRef=useRef(request); requestRef.current=request;
  const composing=useRef(false), restoreFocus=useRef(false);
  function showScope(next:HistoryScope){
    setSearchScope(next);setSearchOpen(true);
    if(overlay)close();
  }
  useImperativeHandle(ref,()=>({showScope}),[]);
  useEffect(()=>{if(dialogOpen&&overlay)close();},[dialogOpen,overlay,close]);
  useEffect(()=>{if(!loading&&restoreFocus.current){restoreFocus.current=false;searchButton.current?.focus();}},[loading]);
  useEffect(()=>{onWorkChange(saving);return()=>onWorkChange(false);},[saving,onWorkChange]);
  useEffect(()=>{let valid=true;
    if(!actor)return;
    const load=()=>void requestRef.current<Page>(`/api/conversations?${new URLSearchParams({q:'',scope,page:String(page)})}`)
      .then(value=>{if(valid){
        const lastPage=Math.max(1,Math.ceil(value.total/value.page_size));
        if(page>lastPage){setPage(lastPage);return;}
        setResponse({key:requestKey,listKey,data:value});setFailure(null);
      }})
      .catch(e=>{if(valid)setFailure({key:requestKey,message:e.message});});
    load();
    return()=>{valid=false;};
  },[actor,scope,page,nonce,refresh,requestKey]);
  useEffect(()=>{if(dialogOpen&&dialog){dialogRef.current?.querySelector<HTMLInputElement>('input')?.focus();if(dialog.kind==='delete')dialogRef.current?.focus();}},[dialogOpen,dialog?.kind]);
  useLayoutEffect(()=>{if(settled&&scrollPosition.current!==null&&list.current){list.current.scrollTop=scrollPosition.current;scrollPosition.current=null;}},[settled,data]);
  const closeDialog=()=>setDialogOpen(false);
  async function mutate(entry:ChatEntry,patch:Record<string,unknown>) {
    if(saving||busy)return;
    scrollPosition.current=list.current?.scrollTop??0;setSaving(true);setError('');setDialogError('');
    try {if(patch.is_archived||patch.is_deleted)await beforeChange(entry.id); const result=await requestRef.current<ChatEntry>(`/api/conversations/${entry.id}/metadata`,{version:entry.metadata_version,...patch}); restoreFocus.current=patch.is_pinned===undefined;setResponse(old=>old?{...old,data:{...old.data,records:old.data.records.map(row=>row.id===result.id?result:row)}}:old);changed(result);setNonce(v=>v+1);if(dialogOpen)closeDialog();}
    catch(e){const message=t(e instanceof Error?e.message:String(e));if(dialogOpen)setDialogError(message);else setError(message);if(e instanceof ApiError&&e.status===409)setNonce(v=>v+1);}
    finally{setSaving(false);}
  }
  const handlers=useRef({select,create,locked,busy,saving,data});handlers.current={select,create,locked,busy,saving,data};
  useEffect(()=>{onProjection({actor,records:data.records,loading,select:async id=>{const h=handlers.current;const entry=h.data.records.find(v=>v.id===id);if(entry&&!h.locked&&!h.busy&&!h.saving&&!entry.is_deleted)await h.select(entry);},create:async()=>{const h=handlers.current;if(!h.locked&&!h.busy&&!h.saving)await h.create();}});},[actor,data,loading,onProjection]);
  return <TooltipProvider><aside id="chat-history" hidden={!visible} inert={!visible?true:undefined} aria-hidden={!visible?true:undefined} className={`conversation-history ${overlay?'history-overlay':''}`} aria-label={t('聊天紀錄')}>
    <div className="history-top"><div className="history-create"><ThreadListNew disabled={locked||busy||saving}/></div><button ref={searchButton} className="icon-button history-search-trigger" aria-label={t('搜尋聊天')} aria-haspopup="dialog" aria-expanded={searchOpen} onClick={()=>showScope('active')}><Search size={18}/></button><button className="icon-button history-close" onClick={close} aria-label={t('收合側欄')}><PanelLeftClose size={18}/></button></div>
    <ThreadListPrimitive.Root ref={list} className="history-list" aria-busy={loading}>
      {(scope==='active'?['pinned','recent']:['management']).map(group=><section key={group} className="history-group" aria-label={t(group==='pinned'?'已釘選':group==='recent'?'最近聊天':scope==='archived'?'封存聊天':'已刪除聊天')}>
        {scope==='active'&&<h3>{t(group==='pinned'?'已釘選':'最近聊天')}</h3>}
        {actor&&data.records.length>0&&!error&&<div className="history-rows"><ThreadListPrimitive.Items>{({threadListItem})=>{
          const projected=threadListItem.custom?.mesConversation as ChatEntry|undefined;
          const entry=data.records.find(item=>item.id===projected?.id);
          if(!entry||group==='pinned'&&!entry.is_pinned||group==='recent'&&entry.is_pinned)return null;
          return <ThreadListItemPrimitive.Root data-slot="aui_thread-list-item" className={`history-row ${current?.id===entry.id?'selected':''}`}>
          <Tooltip><TooltipTrigger asChild><ThreadListItemPrimitive.Trigger asChild><button className="history-select" disabled={locked||busy||saving||entry.is_deleted} aria-current={current?.id===entry.id?'page':undefined} title={entry.title}>
            <span><strong>{entry.title}</strong></span>
          </button></ThreadListItemPrimitive.Trigger></TooltipTrigger><TooltipContent>{entry.title}</TooltipContent></Tooltip>
          <DropdownMenu modal={false}><DropdownMenuTrigger asChild><button className="icon-button" onFocus={event=>{trigger.current=event.currentTarget;}} aria-label={t('聊天室選單：{0}',{0:entry.title})}><MoreHorizontal size={17}/></button></DropdownMenuTrigger><DropdownMenuContent align="end">
            {entry.is_deleted?<DropdownMenuItem disabled={saving||busy} onSelect={()=>void mutate(entry,{is_deleted:false})}>{t('還原聊天')}</DropdownMenuItem>:<>
              <DropdownMenuItem disabled={saving||busy} onSelect={()=>{setDialog({kind:'rename',entry});setDialogOpen(true);setTitle(entry.title);setDialogError('');}}>{t('重新命名')}</DropdownMenuItem>
              <DropdownMenuItem disabled={saving||busy} onSelect={()=>void mutate(entry,{is_pinned:!entry.is_pinned})}>{t(entry.is_pinned?'取消釘選':'釘選')}</DropdownMenuItem>
              <DropdownMenuItem disabled={saving||busy} onSelect={()=>void mutate(entry,{is_archived:!entry.is_archived})}>{t(entry.is_archived?'取消封存':'封存')}</DropdownMenuItem>
              <DropdownMenuItem variant="destructive" disabled={saving||busy} onSelect={()=>{setDialog({kind:'delete',entry});setDialogOpen(true);setDialogError('');}}>{t('刪除聊天')}</DropdownMenuItem>
            </>}
          </DropdownMenuContent></DropdownMenu>
        </ThreadListItemPrimitive.Root>;
        }}</ThreadListPrimitive.Items></div>}
      </section>)}
      {!actor?<p className="muted history-empty">{t('尚未登入')}</p>:loading&&!data.records.length?<ThreadListSkeleton/>:settled&&!error&&!data.records.length?<div className="history-empty"><p>{t(scope==='active'?'尚無聊天':scope==='archived'?'尚無封存聊天':'尚無已刪除聊天')}</p>{scope==='active'&&<button className="secondary" disabled={locked||busy||saving} onClick={()=>void create()}>{t('新聊天')}</button>}</div>:null}
      {error&&<p role="alert">{error}</p>}
      {actor&&(error||settled&&data.total>data.page_size)&&<div className="history-pagination">
        {settled&&data.total>data.page_size&&<><button className="icon-button" disabled={page<=1||loading} onClick={()=>setPage(v=>v-1)} aria-label={t('上一頁')}><ChevronLeft size={16}/></button><span>{data.page} / {Math.ceil(data.total/data.page_size)}</span><button className="icon-button" disabled={page*data.page_size>=data.total||loading} onClick={()=>setPage(v=>v+1)} aria-label={t('下一頁')}><ChevronRight size={16}/></button></>}
        {error&&<button className="secondary" disabled={loading} onClick={()=>setNonce(v=>v+1)}>{t('重試')}</button>}
      </div>}
    </ThreadListPrimitive.Root>
    <div className="history-footer"><button className="sidebar-budget" onClick={usage} disabled={!actor} aria-label={t('用量與使用統計')}><span><strong>{t('用量')}</strong><span>{!actor ? t('尚未登入') : budgetCaption(budget)}</span></span><span className="budget-track" hidden={!budget||typeof budget.spent_usd!=='number'||!Number.isFinite(budget.spent_usd)}><span style={{width:budget?`${Math.min(100,Math.max(0,Number(budget.limit_usd)>0?(Number(budget.spent_usd||0)+Number(budget.reserved_usd||0))/Number(budget.limit_usd)*100:100))}%`:'0%'}}/></span></button>{locked&&<p role="status">{t('請先完成、取消或查核原操作，再切換聊天。')}</p>}</div>
    <HistorySearchDialog open={searchOpen} key={`${actor}:${searchScope}`} actor={actor} scope={searchScope} request={request} locked={locked||busy||saving} close={()=>setSearchOpen(false)} returnFocus={()=>searchButton.current} select={select} restore={async entry=>{await beforeChange(entry.id);const result=await request<ChatEntry>(`/api/conversations/${entry.id}/metadata`,{version:entry.metadata_version,...(entry.is_deleted?{is_deleted:false}:{is_archived:false})});changed(result);setNonce(v=>v+1);}}/>
    {dialog&&<OperationDialog open={dialogOpen} returnFocus={()=>trigger.current?.isConnected?trigger.current:searchButton.current} title={t(dialog.kind==='rename'?'重新命名':'刪除這個聊天？')} close={closeDialog} locked={saving} className="history-dialog"><div ref={dialogRef}>
      {dialog.kind==='delete'&&<p>{t('可在「已刪除聊天」還原。')}</p>}
      <form onSubmit={e=>{e.preventDefault();if(!saving&&!composing.current&&(dialog.kind!=='rename'||title.trim()))void mutate(dialog.entry,dialog.kind==='rename'?{title:title.trim()}:{is_deleted:true});}}>
        {dialog.kind==='rename'?<label>{t('聊天名稱')}<input maxLength={100} value={title} disabled={saving} onChange={e=>{setTitle(e.target.value);setDialogError('');}} onCompositionStart={()=>{composing.current=true;}} onCompositionEnd={()=>{composing.current=false;}} onKeyDown={e=>{if(e.key==='Enter'&&(e.nativeEvent.isComposing||e.nativeEvent.keyCode===229||composing.current))e.preventDefault();}}/></label>:<strong>{dialog.entry.title}</strong>}
        {dialogError&&<p role="alert">{dialogError}</p>}
        <OperationActions><button type="button" disabled={saving} onClick={closeDialog}>{t('取消')}</button><button className={dialog.kind==='delete'?'danger-action':'primary'} disabled={saving||dialog.kind==='rename'&&!title.trim()}>{t(dialog.kind==='rename'?'儲存':'刪除聊天')}</button></OperationActions>
      </form>
    </div></OperationDialog>}
  </aside></TooltipProvider>;
  // 函式元件內的 ref 不影響輸入值或 Guide 版本。
}
