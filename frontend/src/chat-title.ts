import type {Message} from './api';

/** 沿用聊天清單的標題優先序與 60 字截斷；不以文字相似度猜測聊天歸屬。 */
export function entryPresentation(id:string,messages:readonly Message[],records:readonly {id:string;title:string;is_deleted?:boolean}[]){
 const listed=messages.length?records.find(row=>row.id===id&&!row.is_deleted):undefined;
 const first=messages.find(message=>message.role==='user')?.content??'';
 return {title:listed?.title||Array.from(first).slice(0,60).join(''),selectedId:listed?.id??null};
}
