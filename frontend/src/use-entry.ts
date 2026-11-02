import {useEffect,useRef,useState} from 'react';
import {ApiError,type Message,type Module,type Reply,type Row,type api} from './api';
import {getLocale} from './i18n';

interface Receipt {request_id:string;status:string;conversation_id?:string;module?:Module;messages?:Message[];reply?:Reply;error?:string;recovery_conversation_id?:string;recovery_proposal_id?:string}
interface Marker {entry_id:string;request_id?:string;text?:string}
/** 中立入口只保存訊息識別；逾時讀回同一回執，不自動重送。 */
export function useEntry(actor:string|undefined,environment:string|null,request:typeof api){
  const scope=JSON.stringify([actor,environment]);
  const latestScope=useRef(scope);latestScope.current=scope;
  const key=`mes-neutral-entry:v1:${scope}`;
  const marker=useRef<Marker>({entry_id:crypto.randomUUID()});
  const pending=useRef(false);
  const [messages,setMessages]=useState<Message[]>([]);
  const [receipt,setReceipt]=useState<Receipt|null>(null);
  const [busy,setBusy]=useState(false);
  function persist(value:Marker){marker.current=value;try{sessionStorage.setItem(key,JSON.stringify(value));}catch{/* 本分頁識別仍保留，不自動重送。 */}}
  useEffect(()=>{
    pending.current=false;setBusy(false);setReceipt(null);setMessages([]);
    let value:Marker={entry_id:crypto.randomUUID()};
    try{const saved=JSON.parse(sessionStorage.getItem(key)||'null');if(typeof saved?.entry_id==='string')value=saved;}catch{/* 損壞偏好重新開始。 */}
    marker.current=value;
    if(!actor)return;
    const mine=scope;
    if(value.request_id){setReceipt({status:'unknown',request_id:value.request_id});if(value.text)setMessages([{role:'user',content:value.text}]);}
    void request<{messages:Message[]}>(`/api/entry/${encodeURIComponent(value.entry_id)}`).then(result=>{if(latestScope.current===mine)setMessages(result.messages);}).catch(()=>{});
  },[scope]);
  function accept(value:Receipt){
    setReceipt(value);if(value.messages)setMessages(value.messages);
    if(!['processing','unknown'].includes(value.status))persist({entry_id:marker.current.entry_id});
    return value;
  }
  async function send(text:string,context:Row,module_choice?:Module):Promise<Receipt|undefined>{
    if(!actor||pending.current||marker.current.request_id)return;
    const mine=scope;pending.current=true;setBusy(true);
    const record={entry_id:marker.current.entry_id,request_id:crypto.randomUUID(),text};persist(record);
    setMessages(previous=>[...previous,{role:'user',content:text}]);setReceipt({status:'processing',request_id:record.request_id});
    try{const result=await request<Receipt>('/api/entry/messages',{...record,locale:getLocale(),context,module_choice});if(latestScope.current!==mine)return;return accept(result);}
    catch(error){if(latestScope.current!==mine)throw error;setReceipt({status:'unknown',request_id:record.request_id,error:error instanceof Error?error.message:String(error)});throw error;}
    finally{if(latestScope.current===mine){pending.current=false;setBusy(false);}}
  }
  async function check(){
    if(!marker.current.request_id||pending.current)return;
    const mine=scope;pending.current=true;setBusy(true);
    try{const result=await request<Receipt>(`/api/entry/requests/${encodeURIComponent(marker.current.request_id)}`);if(latestScope.current===mine)return accept(result);}
    catch(error){if(latestScope.current===mine&&error instanceof ApiError&&error.status===404){persist({entry_id:marker.current.entry_id});setReceipt(null);}throw error;}
    finally{if(latestScope.current===mine){pending.current=false;setBusy(false);}}
  }
  function reset(){if(marker.current.request_id||pending.current)return;persist({entry_id:crypto.randomUUID()});setMessages([]);setReceipt(null);}
  return {entryId:marker.current.entry_id,messages,receipt,busy,blocked:!!marker.current.request_id,send,check,reset};
}
