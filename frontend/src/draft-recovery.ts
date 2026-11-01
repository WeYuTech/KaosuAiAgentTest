/** 僅保存本分頁、可信帳號及聊天的原句；不是 API 重試佇列。 */
export type DraftDelivery = 'unsent' | 'rejected' | 'unknown';
export interface TextDraft {version:1;text:string;delivery:DraftDelivery;updated:number}
type StoragePort = Pick<Storage,'getItem'|'setItem'|'removeItem'|'key'|'length'>;
const prefix='kaosu-assistant:text-draft:';
export function draftStorageKey(actor:string,context:string,chat:string|null) {
  return prefix+JSON.stringify([actor,context,chat??'entry']);
}
export function readTextDraft(storage:StoragePort,key:string,now=Date.now()):TextDraft|null {
  try {
    const value=JSON.parse(storage.getItem(key)||'null');
    if(value?.version!==1||typeof value.text!=='string'||value.text.length>4000||!['unsent','rejected','unknown'].includes(value.delivery)||!Number.isFinite(value.updated)||now-value.updated>86400000)return null;
    return {version:1,text:value.text,delivery:value.delivery,updated:value.updated};
  }catch{return null;}
}
export function saveTextDraft(storage:StoragePort,key:string,text:string,delivery:DraftDelivery) {
  try {if(!text)storage.removeItem(key);else storage.setItem(key,JSON.stringify({version:1,text:text.slice(0,4000),delivery,updated:Date.now()}));}catch{/* 儲存不可用不阻擋現有操作。 */}
}
export function clearTextDrafts(storage:StoragePort,actor?:string) {
  try {
    for(let index=storage.length-1;index>=0;index--){
      const key=storage.key(index);if(!key?.startsWith(prefix))continue;
      try {const scope=JSON.parse(key.slice(prefix.length));if(!actor||scope[0]===actor)storage.removeItem(key);}
      catch {storage.removeItem(key);}
    }
  }catch{/* 儲存不可用時不阻擋登出；此處沒有身分憑證。 */}
}
