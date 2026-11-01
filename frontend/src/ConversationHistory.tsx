import { useEffect, useRef, useState } from 'react';
import { Archive, ArrowLeft, ChevronLeft, ChevronRight, MessageSquare, MoreHorizontal, Pin, Plus, Search, Trash2, X } from 'lucide-react';
import { ApiError, type Conversation, type Module } from './api';
import { t } from './i18n';

export interface ChatEntry {
  id: string; module: Module; title: string; is_pinned: boolean; is_archived: boolean; is_deleted: boolean;
  metadata_version: number; created_at: string; updated_at: string; message_count: number;
}
interface Page { records: ChatEntry[]; total: number; page: number; page_size: number }
export function ConversationHistory({ actor, current, overlay, locked, busy, refresh, request, close, select, create, beforeChange, changed, usage, onWorkChange }: {
  actor?: string; current: Conversation | null; overlay: boolean; locked: boolean; busy: boolean; refresh: number;
  request: <T>(path: string, body?: unknown) => Promise<T>; close: () => void; select: (entry: ChatEntry) => Promise<void>;
  create: () => Promise<void>; beforeChange: (id: string) => Promise<void>; changed: (entry: ChatEntry) => void; usage: () => void;
  onWorkChange: (value:boolean)=>void;
}) {
  const [scope, setScope] = useState('active'), [search, setSearch] = useState(''), [page, setPage] = useState(1);
  const [data, setData] = useState<Page>({records:[],total:0,page:1,page_size:30});
  const [loading, setLoading] = useState(false), [error, setError] = useState(''), [saving, setSaving] = useState(false);
  const [nonce,setNonce] = useState(0), [dialog,setDialog] = useState<{kind:'rename'|'delete';entry:ChatEntry}|null>(null);
  const [title,setTitle]=useState(''), [dialogError,setDialogError]=useState('');
  const searchRef=useRef<HTMLInputElement>(null), dialogRef=useRef<HTMLDivElement>(null), trigger=useRef<HTMLElement|null>(null);
  const requestRef=useRef(request); requestRef.current=request;
  const composing=useRef(false), restoreFocus=useRef(false);
  useEffect(()=>{if(!loading&&restoreFocus.current){restoreFocus.current=false;searchRef.current?.focus();}},[loading]);
  useEffect(()=>{onWorkChange(saving);return()=>onWorkChange(false);},[saving,onWorkChange]);
  useEffect(()=>setError(''),[actor,search,scope,page]);
  useEffect(()=>{let valid=true;setData({records:[],total:0,page:1,page_size:30});
    if(!actor)return;
    setLoading(true);
    const timer=setTimeout(()=>void requestRef.current<Page>(`/api/conversations?${new URLSearchParams({q:search,scope,page:String(page)})}`)
      .then(value=>{if(valid)setData(value);}).catch(e=>{if(valid)setError(e.message);}).finally(()=>{if(valid)setLoading(false);}),180);
    return()=>{valid=false;clearTimeout(timer);};
  },[actor,search,scope,page,nonce,refresh]);
  useEffect(()=>{if(overlay)searchRef.current?.focus();},[overlay]);
  useEffect(()=>{if(dialog){dialogRef.current?.querySelector<HTMLInputElement>('input')?.focus();if(dialog.kind==='delete')dialogRef.current?.focus();}},[dialog?.kind]);
  const closeDialog=()=>{setDialog(null);requestAnimationFrame(()=>trigger.current?.isConnected?trigger.current.focus():searchRef.current?.focus());};
  async function mutate(entry:ChatEntry,patch:Record<string,unknown>) {
    if(saving||busy)return;
    setSaving(true);setError('');setDialogError('');
    try {await beforeChange(entry.id); const result=await requestRef.current<ChatEntry>(`/api/conversations/${entry.id}/metadata`,{version:entry.metadata_version,...patch}); restoreFocus.current=true;changed(result);setNonce(v=>v+1);if(dialog)closeDialog();}
    catch(e){const message=t(e instanceof Error?e.message:String(e));if(dialog)setDialogError(message);else setError(message);if(e instanceof ApiError&&e.status===409)setNonce(v=>v+1);}
    finally{setSaving(false);}
  }
  function openDialog(kind:'rename'|'delete',entry:ChatEntry,event:React.MouseEvent){trigger.current=event.currentTarget as HTMLElement;setDialog({kind,entry});setTitle(entry.title);setDialogError('');}
  const moduleLabel=(module:Module)=>t({report:'生產報工',schedule:'生產排程',mold:'模具上下模'}[module]);
  return <aside className={`conversation-history ${overlay?'history-overlay':''}`} aria-label={t('聊天紀錄')}>
    <div className="history-top"><button className="text-button" disabled={locked||busy||saving} onClick={()=>void create()}><Plus size={18}/>{t('新聊天')}</button><button className="icon-button history-close" onClick={close} aria-label={t('返回聊天')}><X size={18}/></button></div>
    <label className="history-search"><Search size={16}/><input ref={searchRef} value={search} maxLength={200} placeholder={t('搜尋聊天')} aria-label={t('搜尋聊天')} onChange={e=>{setSearch(e.target.value);setPage(1);}}/></label>
    <div className="history-navigation"><button className="text-button" onClick={()=>{setScope(scope==='archived'?'active':'archived');setPage(1);}}>{scope==='archived'?<ArrowLeft size={16}/>:<Archive size={16}/>} {t(scope==='archived'?'返回聊天':'封存聊天室')}</button><button className="text-button" onClick={()=>{setScope(scope==='deleted'?'active':'deleted');setPage(1);}}><Trash2 size={16}/>{t(scope==='deleted'?'返回聊天':'已刪除聊天')}</button></div>
    <div className="history-list" aria-busy={loading}>
      {!actor?<p>{t('請先選擇作業身分。')}</p>:loading?<p role="status">{t('正在讀取資料…')}</p>:<>
        <p className="sidebar-caption">{t(scope==='archived'?'封存聊天室':scope==='deleted'?'已刪除聊天':'聊天紀錄')} · {data.total}</p>
        {!data.records.length&&<p className="muted">{t(search?'找不到符合的聊天':'還沒有歷史聊天')}</p>}
        {data.records.map(entry=><div key={entry.id} className={`history-row ${current?.id===entry.id?'selected':''}`}>
          <button className="history-select" disabled={locked||busy||saving||entry.is_deleted} aria-current={current?.id===entry.id?'page':undefined} onClick={()=>void select(entry)} title={entry.title}>
            {entry.is_pinned?<Pin size={16}/>:<MessageSquare size={16}/>}<span><strong>{entry.title}</strong><small>{moduleLabel(entry.module)} · {new Date(entry.updated_at).toLocaleDateString('en-CA',{timeZone:'Asia/Bangkok'})}</small></span>
          </button>
          <details className="history-actions"><summary aria-label={t('聊天室選單：{0}',{0:entry.title})}><MoreHorizontal size={17}/></summary><div className="history-menu">
            {entry.is_deleted?<button disabled={saving||busy} onClick={()=>void mutate(entry,{is_deleted:false})}>{t('還原聊天')}</button>:<>
              <button disabled={saving||busy} onClick={e=>openDialog('rename',entry,e)}>{t('重新命名')}</button>
              <button disabled={saving||busy} onClick={()=>void mutate(entry,{is_pinned:!entry.is_pinned})}>{t(entry.is_pinned?'取消釘選':'釘選')}</button>
              <button disabled={saving||busy} onClick={()=>void mutate(entry,{is_archived:!entry.is_archived})}>{t(entry.is_archived?'取消封存':'封存')}</button>
              <button disabled={saving||busy} onClick={e=>openDialog('delete',entry,e)}>{t('刪除聊天室')}</button>
            </>}
          </div></details>
        </div>)}
      </>}
      {error&&<p role="alert">{error}</p>}
      <div className="history-pagination"><button className="icon-button" disabled={page<=1||loading} onClick={()=>setPage(v=>v-1)} aria-label={t('上一頁')}><ChevronLeft size={16}/></button><span>{page} / {Math.max(1,Math.ceil(data.total/30))}</span><button className="icon-button" disabled={page*30>=data.total||loading} onClick={()=>setPage(v=>v+1)} aria-label={t('下一頁')}><ChevronRight size={16}/></button><button className="text-button" disabled={loading} onClick={()=>setNonce(v=>v+1)}>{t('重新讀取')}</button></div>
    </div>
    <div className="history-footer"><button className="text-button" onClick={usage}>{t('用量與使用統計')}</button>{locked&&<p role="status">{t('請先完成、取消或查核原操作，再切換聊天。')}</p>}</div>
    {dialog&&<div className="history-dialog-backdrop"><div ref={dialogRef} role="dialog" aria-modal="true" aria-label={t(dialog.kind==='rename'?'重新命名聊天室':'刪除聊天室？')} className="history-dialog" tabIndex={-1} onKeyDown={e=>{
      e.stopPropagation();if(e.key==='Escape'&&!saving)closeDialog();
      if(e.key==='Tab'){const nodes=Array.from(e.currentTarget.querySelectorAll<HTMLElement>('input:not(:disabled),button:not(:disabled)'));const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&(document.activeElement===first||document.activeElement===dialogRef.current)){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
    }}>
      <h2>{t(dialog.kind==='rename'?'重新命名聊天室':'刪除聊天室？')}</h2><p>{t(dialog.kind==='rename'?'修改名稱，聊天內容保持不變。':'只移出聊天清單，保留 MES 業務與稽核紀錄。可從已刪除聊天還原。')}</p>
      <form onSubmit={e=>{e.preventDefault();if(!saving&&!composing.current)void mutate(dialog.entry,dialog.kind==='rename'?{title:title.trim()}:{is_deleted:true});}}>
        {dialog.kind==='rename'?<label>{t('聊天室名稱')}<input maxLength={100} value={title} disabled={saving} onChange={e=>setTitle(e.target.value)} onCompositionStart={()=>{composing.current=true;}} onCompositionEnd={()=>{composing.current=false;}} onKeyDown={e=>{if(e.key==='Enter'&&(e.nativeEvent.isComposing||e.nativeEvent.keyCode===229||composing.current))e.preventDefault();}}/></label>:<strong>{dialog.entry.title}</strong>}
        {dialogError&&<p role="alert">{dialogError}</p>}
        <div className="history-dialog-actions">{dialogError&&<button type="button" onClick={()=>{const latest=data.records.find(v=>v.id===dialog.entry.id);if(latest){setDialog({...dialog,entry:latest});setDialogError('');}else closeDialog();}}>{t('重新讀取')}</button>}<button type="button" disabled={saving} onClick={closeDialog}>{t('取消')}</button><button className="primary" disabled={saving||!!dialogError||dialog.kind==='rename'&&!title.trim()}>{t(dialog.kind==='rename'?'儲存名稱':'刪除聊天室')}</button></div>
      </form>
    </div></div>}
  </aside>;
  // 函式元件內的 ref 不影響輸入值或 Guide 版本。
}
