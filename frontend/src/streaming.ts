import {ApiError,api} from './api';
import {getLocale,t} from './i18n';
export interface ProcessingStep {id:number;label:string;status:'running'|'done'|'failed'|'stopped'}
export interface ProcessingSummary {steps:ProcessingStep[];elapsed_seconds:number;request_id:string}
export interface StreamEvent {event:string;data:Record<string,any>}
interface PollEvent extends StreamEvent {seq:number}
interface PollBatch {events:PollEvent[];terminal:boolean}
const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
/** 只顯示後端事件；網路恢復只接續 GET，絕不重送開始請求。 */
export async function streamRequest<T>(path:string,body:unknown,onEvent:(event:StreamEvent)=>void):Promise<T>{
  let accepted=false;
  try{
    const handle=await api<{request_id:string;token:string}>(path+'/start',body);
    if(!handle.request_id||!handle.token)throw new Error('invalid handle');
    accepted=true;
    onEvent({event:'accepted',data:handle});
    let after=0;
    while(true){
      let batch:PollBatch|undefined;
      for(let attempt=0;attempt<4;attempt++){
        const controller=new AbortController();
        const timeout=setTimeout(()=>controller.abort(),10000);
        try{
          const url=new URL(`api/streams/${encodeURIComponent(handle.request_id)}/events?after=${after}`,new URL('./',location.href));
          const response=await fetch(url,{credentials:'same-origin',method:'GET',cache:'no-store',signal:controller.signal,
            headers:{Accept:'application/json','X-Stream-Token':handle.token,'X-AI-Locale':getLocale(),'Accept-Language':getLocale()}});
          if(response.status===401||response.status===403)throw new ApiError(t('處理未完成，請查核原對話'),response.status);
          if(!response.ok)throw new Error('poll unavailable');
          batch=await response.json();
          if(!batch||!Array.isArray(batch.events)||typeof batch.terminal!=='boolean')throw new Error('invalid events');
          break;
        }catch(error){
          if(error instanceof ApiError||attempt===3)throw error;
          await delay(200*2**attempt);
        }finally{clearTimeout(timeout);}
      }
      for(const event of batch!.events){
        if(event.seq<=after)continue;
        if(event.seq!==after+1)throw new Error('event gap');
        after=event.seq;
        onEvent(event);
        if(event.event==='done')return event.data as T;
        if(event.event==='stopped'){
          const target=path.startsWith('/api/entry/')?`/api/entry/requests/${(body as {request_id:string}).request_id}`:path.replace(/\/messages$/,'');
          return api<T>(target);
        }
        if(event.event==='error')throw new ApiError(event.data.status===429?t('本次模型測試預算不足，已停止呼叫；不會重設累計費用'):t('處理未完成，請查核原對話'),event.data.status??502,'stream_error');
      }
      if(batch!.terminal)throw new Error('missing terminal event');
      // 此等待只節流 HTTP，文字不拆分、不製造打字效果。
      await delay(100);
    }
  }catch(error){
    if(error instanceof ApiError&&error.status!==0){if(accepted)onEvent({event:'failed',data:{}});throw error;}
    onEvent({event:'unknown',data:{}});
    throw new ApiError(t('結果未知，請查核原訊息；不會自動重送。'),0,'stream_unknown');
  }
}
