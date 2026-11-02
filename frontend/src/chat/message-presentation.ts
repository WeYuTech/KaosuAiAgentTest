import type {Message} from '../api';
export type PresentedMessage=Message&{uiId?:string;enter?:boolean;delivery?:'pending'|'rejected'|'unknown'|'not_sent'};
export type Attempt={id:string;conversation:string;index:number;text:string;delivery:'pending'|'rejected'|'unknown'|'not_sent';accepted?:number};
export type Presentation={conversation:string;attempt?:Attempt;ids:Record<number,string>;fresh:Record<number,boolean>};
export function beginAttempt(previous:Presentation|null,conversation:string,index:number,text:string,id:string):Presentation {
 const current=previous?.conversation===conversation?previous:{conversation,ids:{},fresh:{}};
 return {...current,attempt:{id,conversation,index,text,delivery:'pending'}};
}
export function acceptAttempt(state:Presentation,reply:readonly Message[]):Presentation {
 // messages API 在同一處理 token 下，以 user／assistant 一對結尾；用回覆序號調和，不比對文字。
 const index=reply.length-2;
 if(!state.attempt||index<state.attempt.index||reply[index]?.role!=='user'||reply[index+1]?.role!=='assistant')return {...state,attempt:undefined};
 const fresh={...state.fresh};for(let i=state.attempt.index;i<reply.length;i++)fresh[i]=true;
 return {...state,attempt:{...state.attempt,accepted:index},ids:{...state.ids,[index]:state.attempt.id},fresh};
}
export function projectMessages(messages:readonly Message[],conversation:string|null,state:Presentation|null):PresentedMessage[]{
 if(!state||state.conversation!==conversation)return [...messages];
 const result:PresentedMessage[]=messages.map((message,index)=>({...message,uiId:state.ids[index],enter:state.fresh[index]}));
 if(state.attempt&&state.attempt.accepted===undefined)result.push({role:'user',content:state.attempt.text,uiId:state.attempt.id,enter:true,delivery:state.attempt.delivery});
 return result;
}
