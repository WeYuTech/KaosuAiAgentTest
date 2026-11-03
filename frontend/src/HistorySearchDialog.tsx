import {useEffect,useRef,useState} from 'react';
import {CircleHelp,Search,MessageCircle,LoaderCircle,X,ChevronLeft,ChevronRight} from 'lucide-react';
import {Dialog,DialogContent,DialogTitle} from './components/ui/dialog';
import type {ChatEntry,HistoryScope} from './ConversationHistory';
import {t} from './i18n';

interface SearchPage {records:ChatEntry[];total:number;page:number;page_size:number}
/** 搜尋只讀聊天索引，不修改側欄分頁、目前對話或作業草稿。 */
export function HistorySearchDialog({open,actor,scope,request,locked,close,returnFocus,select,restore}:{
  open:boolean;actor?:string;scope:HistoryScope;locked:boolean;close:()=>void;returnFocus:()=>HTMLElement|null;
  request:<T>(path:string,body?:unknown)=>Promise<T>;select:(entry:ChatEntry)=>Promise<void>;
  restore?:(entry:ChatEntry)=>Promise<void>;
}) {
  const [query,setQuery]=useState(''),[page,setPage]=useState(1),[retry,setRetry]=useState(0);
  const [result,setResult]=useState<{key:string;data?:SearchPage;error?:string}|null>(null);
  const [selecting,setSelecting]=useState(false),[selectionError,setSelectionError]=useState('');
  const [composing,setComposing]=useState(false);
  const input=useRef<HTMLInputElement>(null),requestRef=useRef(request),selectionPending=useRef(false);
  requestRef.current=request;
  const key=JSON.stringify([actor,scope,query,page,retry]);
  const settled=result?.key===key;
  const data=settled?result.data:undefined,error=settled?result.error:undefined;
  useEffect(()=>{
    let valid=true;
    if(!open||!actor||composing)return;
    const timer=setTimeout(()=>{
      void requestRef.current<SearchPage>(`/api/conversations?${new URLSearchParams({q:query,scope,page:String(page),page_size:'50'})}`)
        .then(data=>{if(valid){const last=Math.max(1,Math.ceil(data.total/data.page_size));if(page>last){setPage(last);return;}setResult({key,data});}})
        .catch(error=>{if(valid)setResult({key,error:error instanceof Error?error.message:String(error)});});
    },query?180:0);
    return()=>{valid=false;clearTimeout(timer);};
  },[open,key,actor,scope,query,page,retry,composing]);
  useEffect(()=>{if(!open){setQuery('');setPage(1);setResult(null);setSelectionError('');setComposing(false);}},[open]);
  async function choose(entry:ChatEntry){
    if(locked||selectionPending.current||entry.is_deleted)return;
    selectionPending.current=true;setSelecting(true);setSelectionError('');
    try{await select(entry);close();}
    catch(error){setSelectionError(error instanceof Error?error.message:String(error));}
    finally{selectionPending.current=false;setSelecting(false);}
  }
  async function restoreEntry(entry:ChatEntry){
    if(locked||selectionPending.current||!restore)return;
    selectionPending.current=true;setSelecting(true);setSelectionError('');
    try{await restore(entry);setRetry(v=>v+1);}catch(error){setSelectionError(error instanceof Error?error.message:String(error));}
    finally{selectionPending.current=false;setSelecting(false);}
  }
  return <Dialog open={open} onOpenChange={open=>{if(!open&&!composing&&!selecting)close();}}>
    <DialogContent layout="operation" showCloseButton={false} className="history-search-dialog" aria-describedby={undefined}
      onOpenAutoFocus={event=>{event.preventDefault();input.current?.focus();}}
      onCloseAutoFocus={event=>{event.preventDefault();if(document.querySelector('[data-slot="dialog-content"][data-state="open"]'))return;const target=returnFocus();if(target?.isConnected&&!target.closest('[hidden],[inert]'))target.focus({preventScroll:true});}}
      onEscapeKeyDown={event=>{event.stopPropagation();if(event.isComposing||event.keyCode===229||composing||selecting)event.preventDefault();}}>
      <header className="operation-dialog-header"><DialogTitle>{t(scope==='archived'?'封存聊天':scope==='deleted'?'已刪除聊天':'搜尋聊天')}</DialogTitle><button className="icon-button" aria-label={t('關閉搜尋')} disabled={composing||selecting} onClick={close}><X size={18}/></button></header>
      <div className="history-search-header">
        <div className="history-search-field"><Search size={18} aria-hidden="true"/><input data-slot="history-search-input" ref={input} type="search" maxLength={200} value={query} placeholder={t('搜尋聊天')} aria-label={t('搜尋聊天')} disabled={selecting}
          onCompositionStart={()=>setComposing(true)} onCompositionEnd={()=>setComposing(false)}
          onChange={event=>{setQuery(event.target.value);setPage(1);}}/></div>
      </div>
      <div className="history-search-results" aria-busy={!!actor&&!settled}>
        {scope==='deleted'&&<p className="history-scope-note">{t('聊天可還原，MES 業務紀錄不受影響。')}</p>}
        {!actor?<p>{t('尚未登入')}</p>:!settled?<p className="history-search-loading" role="status"><LoaderCircle className="spin" size={18}/>{t('正在搜尋聊天…')}</p>:error?<div role="alert"><div className="history-search-error" title={error}><CircleHelp size={18}/><div><strong>{t('搜尋暫時無法使用')}</strong><p>{t('搜尋文字已保留。')}</p><span className="sr-only">{error}</span></div></div><button className="secondary" onClick={()=>setRetry(v=>v+1)}>{t('重新搜尋')}</button></div>:<>
          {data?.records.map(entry=><div key={entry.id} className="history-search-result"><div><strong>{entry.title}</strong><small title={t('最後更新')}>{new Date(entry.updated_at).toLocaleDateString('en-US',{month:'2-digit',day:'2-digit'})}{scope==='active'?' · ':' '}{t(scope==='archived'?'封存':scope==='deleted'?'刪除':({report:'生產報工',schedule:'生產排程',mold:'模具上下模'})[entry.module])}</small></div><button className="text-button" disabled={locked||selecting} onClick={()=>void(scope==='active'?choose(entry):restoreEntry(entry))}>{t(scope==='active'?'開啟':'還原')}</button></div>)}
          {!data?.records.length&&<div className="history-search-empty"><Search size={25}/><h3>{t('沒有找到聊天')}</h3><p>{t('試試設備名稱、工單或其他關鍵字。')}</p>{query&&<button className="secondary" onClick={()=>{setQuery('');setPage(1);}}>{t('清除搜尋')}</button>}</div>}
          {data&&data.total>data.page_size&&<div className="history-pagination"><button className="icon-button" disabled={page<=1||selecting} aria-label={t('上一頁')} onClick={()=>setPage(v=>v-1)}><ChevronLeft size={18}/></button><span>{data.page} / {Math.ceil(data.total/data.page_size)}</span><button className="icon-button" disabled={page*data.page_size>=data.total||selecting} aria-label={t('下一頁')} onClick={()=>setPage(v=>v+1)}><ChevronRight size={18}/></button></div>}
        </>}
        {locked&&<p role="status">{t('請先完成、取消或查核原操作，再切換聊天。')}</p>}
        {selectionError&&<p role="alert">{selectionError}</p>}
      </div>
      <footer className="operation-dialog-footer"><button className="secondary" disabled={composing||selecting} onClick={close}>{t('關閉')}</button></footer>
    </DialogContent>
  </Dialog>;
}
