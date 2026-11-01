import {ThreadListNew,ThreadListSearch,ThreadListSkeleton,historyGroup} from './components/assistant-ui/elements/thread-list.aui';
import type {HistoryProjection} from './chat/assistant-runtime';
import {OperationDialog,OperationActions} from './OperationDialog';
import {DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuItem,DropdownMenuRadioGroup,DropdownMenuRadioItem,DropdownMenuSeparator} from './components/ui/dropdown-menu';
import {ThreadListPrimitive,ThreadListItemPrimitive} from '@assistant-ui/react';
import { Fragment, useEffect, useRef, useState } from 'react';
import { Archive, ArrowLeft, ChevronLeft, ChevronRight, MoreHorizontal, Pin, Trash2, X, Search, PanelLeftClose, ChevronDown } from 'lucide-react';
import { ApiError, type Conversation, type Module, type Row } from './api';
import { t } from './i18n';

export interface ChatEntry {
  id: string; module: Module; title: string; is_pinned: boolean; is_archived: boolean; is_deleted: boolean;
  metadata_version: number; created_at: string; updated_at: string; message_count: number;
}
interface Page { records: ChatEntry[]; total: number; page: number; page_size: number }
const emptyPage:Page={records:[],total:0,page:1,page_size:30};
export function ConversationHistory({ actor, current, overlay, locked, busy, refresh, request, close, select, create, beforeChange, changed, usage, onWorkChange, budget, onProjection, visible=true, resize }: {
  resize?:{narrow:()=>void;widen:()=>void;reset:()=>void};visible?:boolean;onProjection:(value:HistoryProjection)=>void;budget: Row | null; actor?: string; current: Conversation | null; overlay: boolean; locked: boolean; busy: boolean; refresh: number;
  request: <T>(path: string, body?: unknown) => Promise<T>; close: () => void; select: (entry: ChatEntry) => Promise<void>;
  create: () => Promise<void>; beforeChange: (id: string) => Promise<void>; changed: (entry: ChatEntry) => void; usage: () => void;
  onWorkChange: (value:boolean)=>void;
}) {
  const [scope, setScope] = useState('active'), [search, setSearch] = useState(''), [page, setPage] = useState(1);
  const [failure,setFailure]=useState<{key:string;message:string}|null>(null), [saving,setSaving]=useState(false);
  const [nonce,setNonce] = useState(0), [dialog,setDialog] = useState<{kind:'rename'|'delete';entry:ChatEntry}|null>(null);
  const requestKey=JSON.stringify([actor,scope,search,page,nonce,refresh]);
  function setError(message:string){setFailure(message?{key:requestKey,message}:null);}
  const error=failure?.key===requestKey?failure.message:'';
  const [searchOpen,setSearchOpen]=useState(false);const searchButton=useRef<HTMLButtonElement>(null);
  const [searchComposing,setSearchComposing]=useState(false);
  const [dialogOpen,setDialogOpen]=useState(false);
  const [response,setResponse]=useState<{key:string;data:Page}|null>(null);
  // 查詢條件改變的同一次 render 即隱藏舊列，不能等到 effect 才撤下舊操作。
  const settled=response?.key===requestKey;
  const loading=Boolean(actor&&!settled&&!error);
  const data=settled?response.data:emptyPage;
  const previousQuery=useRef<{actor?:string;scope:string;search:string;page:number;nonce:number;refresh:number}|null>(null);
  const [title,setTitle]=useState(''), [dialogError,setDialogError]=useState('');
  const searchRef=useRef<HTMLInputElement>(null), dialogRef=useRef<HTMLDivElement>(null), trigger=useRef<HTMLElement|null>(null);
  const requestRef=useRef(request); requestRef.current=request;
  const composing=useRef(false), restoreFocus=useRef(false);
  useEffect(()=>{if(!loading&&restoreFocus.current){restoreFocus.current=false;(searchOpen?searchRef.current:searchButton.current)?.focus();}},[loading]);
  useEffect(()=>{onWorkChange(saving);return()=>onWorkChange(false);},[saving,onWorkChange]);
  useEffect(()=>{let valid=true;
    const previous=previousQuery.current;
    previousQuery.current={actor,scope,search,page,nonce,refresh};
    if(!actor)return;
    const searchOnly=previous&&previous.actor===actor&&previous.scope===scope&&previous.nonce===nonce&&previous.refresh===refresh&&previous.search!==search;
    const load=()=>void requestRef.current<Page>(`/api/conversations?${new URLSearchParams({q:search,scope,page:String(page)})}`)
      .then(value=>{if(valid){setResponse({key:requestKey,data:value});setFailure(null);}})
      .catch(e=>{if(valid)setFailure({key:requestKey,message:e.message});});
    const timer=searchOnly?setTimeout(load,180):undefined;
    if(!searchOnly)load();
    return()=>{valid=false;if(timer!==undefined)clearTimeout(timer);};
  },[actor,search,scope,page,nonce,refresh,requestKey]);
  useEffect(()=>{if(searchOpen)searchRef.current?.focus();},[searchOpen]);
  function closeSearch(){if(searchComposing)return;setSearch('');setPage(1);setSearchOpen(false);searchButton.current?.focus();}
  useEffect(()=>{if(dialog){dialogRef.current?.querySelector<HTMLInputElement>('input')?.focus();if(dialog.kind==='delete')dialogRef.current?.focus();}},[dialog?.kind]);
  const closeDialog=()=>setDialogOpen(false);
  async function mutate(entry:ChatEntry,patch:Record<string,unknown>) {
    if(saving||busy)return;
    setSaving(true);setError('');setDialogError('');
    try {await beforeChange(entry.id); const result=await requestRef.current<ChatEntry>(`/api/conversations/${entry.id}/metadata`,{version:entry.metadata_version,...patch}); restoreFocus.current=true;changed(result);setNonce(v=>v+1);if(dialog)closeDialog();}
    catch(e){const message=t(e instanceof Error?e.message:String(e));if(dialog)setDialogError(message);else setError(message);if(e instanceof ApiError&&e.status===409)setNonce(v=>v+1);}
    finally{setSaving(false);}
  }
  const handlers=useRef({select,create,locked,busy,saving,data});handlers.current={select,create,locked,busy,saving,data};
  useEffect(()=>{onProjection({actor,records:data.records,loading,select:async id=>{const h=handlers.current;const entry=h.data.records.find(v=>v.id===id);if(entry&&!h.locked&&!h.busy&&!h.saving&&!entry.is_deleted)await h.select(entry);},create:async()=>{const h=handlers.current;if(!h.locked&&!h.busy&&!h.saving)await h.create();}});},[actor,data,loading,onProjection]);
  const moduleLabel=(module:Module)=>t({report:'生產報工',schedule:'生產排程',mold:'模具上下模'}[module]);
  return <aside id="chat-history" hidden={!visible} inert={!visible?true:undefined} aria-hidden={!visible?true:undefined} className={`conversation-history ${overlay?'history-overlay':''}`} aria-label={t('聊天紀錄')}>
    <div className="history-top"><strong className="history-brand" aria-label={t('威友科技')}>WeYu</strong><button ref={searchButton} className="icon-button" aria-label={t('搜尋聊天')} aria-expanded={searchOpen} onClick={()=>{setSearchOpen(true);searchRef.current?.focus();}}><Search size={18}/></button><button className="icon-button history-close" onClick={close} aria-label={t('收合側欄')}><PanelLeftClose size={18}/></button></div>
    <div className="history-create"><ThreadListNew disabled={locked||busy||saving}/></div>
    <nav className="history-navigation" aria-label={t('聊天範圍')}>
      <DropdownMenu modal={false}><DropdownMenuTrigger asChild><button className="text-button history-scope" disabled={!actor} aria-label={t('聊天範圍')}><span>{t(scope==='active'?'聊天':scope==='archived'?'封存':'已刪除')}</span><ChevronDown size={16}/></button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuRadioGroup value={scope} onValueChange={value=>{setScope(value);setPage(1);}}>{[['active','聊天'],['archived','封存聊天'],['deleted','已刪除聊天']].map(([value,label])=><DropdownMenuRadioItem value={value} key={value}>{t(label)}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup>{resize&&<><DropdownMenuSeparator/><DropdownMenuItem onSelect={resize.narrow}>{t('縮窄側欄')}</DropdownMenuItem><DropdownMenuItem onSelect={resize.widen}>{t('加寬側欄')}</DropdownMenuItem><DropdownMenuItem onSelect={resize.reset}>{t('重設寬度')}</DropdownMenuItem></>}</DropdownMenuContent></DropdownMenu>
    </nav>
    <div className="history-search-slot" hidden={!searchOpen} onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();if(!event.nativeEvent.isComposing&&!searchComposing){event.preventDefault();closeSearch();}}}}>
      <ThreadListSearch ref={searchRef} value={search} maxLength={200} placeholder={t('搜尋聊天')} aria-label={t('搜尋聊天')}
        onCompositionStart={()=>setSearchComposing(true)} onCompositionEnd={()=>setSearchComposing(false)} onChange={e=>{setSearch(e.target.value);setPage(1);}}/>
      {search&&<button className="text-button" onClick={()=>{setSearch('');setPage(1);searchRef.current?.focus();}}>{t('清除搜尋')}</button>}
      <button className="icon-button" aria-label={t('關閉搜尋')} disabled={searchComposing} onClick={closeSearch}><X size={16}/></button>
    </div>
    <ThreadListPrimitive.Root className="history-list" aria-busy={loading}>
      {!actor?<p className="muted history-empty">{t('還沒有歷史聊天')}</p>:loading?<ThreadListSkeleton/>:error?null:<>
        {!data.records.length&&<p className="muted history-empty">{t(search?'找不到符合的聊天':scope==='archived'?'尚無封存聊天':scope==='deleted'?'目前沒有已刪除的聊天':'還沒有歷史聊天')}</p>}
        {<ThreadListPrimitive.Items>{({threadListItem})=>{const projected=threadListItem.custom?.mesConversation as ChatEntry|undefined;const entry=data.records.find(item=>item.id===projected?.id);if(!entry)return null;const group=historyGroup(entry);const first=data.records.find(v=>historyGroup(v)===group)?.id===entry.id;return <Fragment key={entry.id}>{first&&<div data-slot="aui_thread-list-group-label" className="text-muted-foreground px-2.5 pt-3 pb-1 text-xs font-medium">{t(group)}</div>}<ThreadListItemPrimitive.Root data-slot="aui_thread-list-item" className={`history-row ${current?.id===entry.id?'selected':''}`}>
          <ThreadListItemPrimitive.Trigger asChild><button className="history-select" disabled={locked||busy||saving||entry.is_deleted} aria-current={current?.id===entry.id?'page':undefined} title={entry.title}>
            {entry.is_pinned&&<Pin size={16}/>}<span title={`${moduleLabel(entry.module)} · ${new Date(entry.updated_at).toLocaleDateString('en-CA',{timeZone:'Asia/Bangkok'})}`}><strong>{entry.title}</strong></span>
          </button></ThreadListItemPrimitive.Trigger>
          <DropdownMenu modal={false}><DropdownMenuTrigger asChild><button className="icon-button" onFocus={event=>{trigger.current=event.currentTarget;}} aria-label={t('聊天室選單：{0}',{0:entry.title})}><MoreHorizontal size={17}/></button></DropdownMenuTrigger><DropdownMenuContent align="end">
            {entry.is_deleted?<DropdownMenuItem disabled={saving||busy} onSelect={()=>void mutate(entry,{is_deleted:false})}>{t('還原聊天')}</DropdownMenuItem>:<>
              <DropdownMenuItem disabled={saving||busy} onSelect={()=>{setDialog({kind:'rename',entry});setDialogOpen(true);setTitle(entry.title);setDialogError('');}}>{t('重新命名')}</DropdownMenuItem>
              <DropdownMenuItem disabled={saving||busy} onSelect={()=>void mutate(entry,{is_pinned:!entry.is_pinned})}>{t(entry.is_pinned?'取消釘選':'釘選')}</DropdownMenuItem>
              <DropdownMenuItem disabled={saving||busy} onSelect={()=>void mutate(entry,{is_archived:!entry.is_archived})}>{t(entry.is_archived?'取消封存':'封存')}</DropdownMenuItem>
              <DropdownMenuItem disabled={saving||busy} onSelect={()=>{setDialog({kind:'delete',entry});setDialogOpen(true);setDialogError('');}}>{t('刪除聊天')}</DropdownMenuItem>
            </>}
          </DropdownMenuContent></DropdownMenu>
        </ThreadListItemPrimitive.Root></Fragment>;}}</ThreadListPrimitive.Items>}
      </>}
      {error&&<p role="alert">{error}</p>}
      {actor&&(error||settled&&data.total>data.page_size)&&<div className="history-pagination">
        {settled&&data.total>data.page_size&&<><button className="icon-button" disabled={page<=1||loading} onClick={()=>setPage(v=>v-1)} aria-label={t('上一頁')}><ChevronLeft size={16}/></button><span>{data.page} / {Math.ceil(data.total/data.page_size)}</span><button className="icon-button" disabled={page*data.page_size>=data.total||loading} onClick={()=>setPage(v=>v+1)} aria-label={t('下一頁')}><ChevronRight size={16}/></button></>}
        {error&&<button className="text-button" disabled={loading} onClick={()=>setNonce(v=>v+1)}>{t('重試')}</button>}
      </div>}
    </ThreadListPrimitive.Root>
    <div className="history-footer"><button className="sidebar-budget" onClick={usage} disabled={!actor} aria-label={t('用量與使用統計')}><span><strong>{t('用量額度')}</strong><span>{!actor ? t('尚未登入') : budget ? `US$${Number(budget.spent_usd||0).toFixed(2)} / ${Number(budget.limit_usd).toFixed(2)}` : t('尚未取得用量')}</span></span><span className="budget-track"><span style={{width:budget?`${Math.min(100,Math.max(0,Number(budget.limit_usd)>0?(Number(budget.spent_usd||0)+Number(budget.reserved_usd||0))/Number(budget.limit_usd)*100:100))}%`:'0%'}}/></span></button>{locked&&<p role="status">{t('請先完成、取消或查核原操作，再切換聊天。')}</p>}</div>
    {dialog&&<OperationDialog open={dialogOpen} returnFocus={()=>trigger.current?.isConnected?trigger.current:(searchOpen?searchRef.current:searchButton.current)} title={t(dialog.kind==='rename'?'重新命名':'刪除聊天？')} close={closeDialog} locked={saving} className="history-dialog"><div ref={dialogRef}>
      {dialog.kind==='delete'&&<p>{t('可在「已刪除」還原；MES 業務與稽核紀錄保留。')}</p>}
      <form onSubmit={e=>{e.preventDefault();if(!saving&&!composing.current)void mutate(dialog.entry,dialog.kind==='rename'?{title:title.trim()}:{is_deleted:true});}}>
        {dialog.kind==='rename'?<label>{t('名稱')}<input maxLength={100} value={title} disabled={saving} onChange={e=>setTitle(e.target.value)} onCompositionStart={()=>{composing.current=true;}} onCompositionEnd={()=>{composing.current=false;}} onKeyDown={e=>{if(e.key==='Enter'&&(e.nativeEvent.isComposing||e.nativeEvent.keyCode===229||composing.current))e.preventDefault();}}/></label>:<strong>{dialog.entry.title}</strong>}
        {dialogError&&<p role="alert">{dialogError} {t('請取消後重新開啟此操作。')}</p>}
        <OperationActions><button type="button" disabled={saving} onClick={closeDialog}>{t('取消')}</button><button className="primary" disabled={saving||!!dialogError||dialog.kind==='rename'&&!title.trim()}>{t(dialog.kind==='rename'?'儲存':'刪除')}</button></OperationActions>
      </form>
    </div></OperationDialog>}
  </aside>;
  // 函式元件內的 ref 不影響輸入值或 Guide 版本。
}
