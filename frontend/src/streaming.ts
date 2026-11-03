import {ApiError,api} from './api';
import {getLocale,t} from './i18n';
export interface ProcessingStep {id:number;label:string;status:'running'|'done'|'failed'|'stopped'}
export interface ProcessingSummary {steps:ProcessingStep[];elapsed_seconds:number;request_id:string}
export interface StreamEvent {event:string;data:Record<string,any>}
/** SSE 支援跨 chunk UTF-8、CRLF、多行 data；不以計時器拆字。 */
export function parseEvents(buffer:string):{events:StreamEvent[];rest:string}{
  const normalized=buffer.replace(/\r\n/g,'\n');const parts=normalized.split('\n\n');const rest=parts.pop()??'';
  return {rest,events:parts.flatMap(block=>{let event='message';const data:string[]=[];for(const line of block.split('\n')){if(line.startsWith('event:'))event=line.slice(6).trim();if(line.startsWith('data:'))data.push(line.slice(5).trimStart());}return data.length?[{event,data:JSON.parse(data.join('\n'))}]:[];})};
}
export async function streamRequest<T>(path:string,body:unknown,onEvent:(event:StreamEvent)=>void):Promise<T>{
  let accepted=false;
  let reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
  try{
    const url=new URL((path+'/stream').replace(/^\/+/,''),new URL('./',location.href));
    const response=await fetch(url,{method:'POST',credentials:'same-origin',headers:{Accept:'text/event-stream','Content-Type':'application/json','X-AI-Locale':getLocale(),'Accept-Language':getLocale()},body:JSON.stringify(body)});
    // 只有明確未受理的舊服務路由才允許降級，串流中途沒有重送分支。
    if([404,405].includes(response.status))return api<T>(path,body);
    if(!response.ok){const error=await response.json();throw new ApiError(typeof error.detail==='string'?t(error.detail):t('請求未完成（{0}）',{0:response.status}),response.status);}
    accepted=true;
    if(!response.body)throw new Error('missing stream');
    reader=response.body.getReader();const decoder=new TextDecoder();let buffer='';
    while(true){
      const chunk=await reader.read();buffer+=decoder.decode(chunk.value,{stream:!chunk.done});
      const parsed=parseEvents(buffer);buffer=parsed.rest;
      for(const event of parsed.events){
        onEvent(event);
        if(event.event==='done')return event.data as T;
        if(event.event==='stopped'){
          const target=path.startsWith('/api/entry/')?`/api/entry/requests/${(body as {request_id:string}).request_id}`:path.replace(/\/messages$/,'');
          return api<T>(target);
        }
        if(event.event==='error')throw new ApiError(event.data.status===429?t('本次模型測試預算不足，已停止呼叫；不會重設累計費用'):t('處理未完成，請查核原對話'),event.data.status??502,'stream_error');
      }
      if(chunk.done)throw new Error('incomplete stream');
    }
  }catch(error){
    if(error instanceof ApiError){if(accepted)onEvent({event:'failed',data:{}});throw error;}
    onEvent({event:'unknown',data:{}});
    throw new ApiError(t('結果未知，請查核原訊息；不會自動重送。'),0,'stream_unknown');
  }finally{void reader?.cancel().catch(()=>{});}
}
