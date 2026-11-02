import {useEffect,useState} from 'react';
export type OperationMode='chat-sheet'|'step-wizard';
export const operationModeKey=(actor:string,environment:string)=>`mes-operation-view:v1:${encodeURIComponent(environment)}:${encodeURIComponent(actor)}`;
export function readOperationMode(storage:Pick<Storage,'getItem'>,key:string):OperationMode {
  try{const saved=JSON.parse(storage.getItem(key)||'null');return saved?.version===1&&saved.mode==='step-wizard'?'step-wizard':'chat-sheet';}catch{return 'chat-sheet';}
}
export function saveOperationMode(storage:Pick<Storage,'setItem'>,key:string,mode:OperationMode){try{storage.setItem(key,JSON.stringify({version:1,mode}));}catch{/* 儲存不可用時僅套用本分頁，不影響 recovery 儲存規則。 */}}
function loadMode(key:string):OperationMode {try{return readOperationMode(localStorage,key);}catch{return 'chat-sheet';}}
/** 模式是呈現偏好；此 hook 不持有任何業務 API 或 Guide callback。 */
export function useOperationMode(actor:string|undefined,environment:string|null,epoch:string,busy:boolean){
  const key=actor&&environment?operationModeKey(actor,environment):'';
  const context=JSON.stringify([key,epoch]);
  const [state,setState]=useState<{key?:string;context:string;chosen:OperationMode;applied:OperationMode}>({context:'',chosen:'chat-sheet',applied:'chat-sheet'});
  useEffect(()=>{setState(old=>old.context===context?old:{key,context,chosen:old.key===key?old.chosen:key?loadMode(key):'chat-sheet',applied:old.key===key?old.chosen:key?loadMode(key):'chat-sheet'});},[context,key]);
  useEffect(()=>{if(!busy)setState(old=>old.context===context&&old.chosen!==old.applied?{...old,applied:old.chosen}:old);},[busy,context,state.chosen]);
  function choose(mode:OperationMode){if(!key)return;try{saveOperationMode(localStorage,key,mode);}catch{/* 無法取得 storage 仍可切換。 */}setState(old=>({key,context,chosen:mode,applied:busy&&old.context===context?old.applied:mode}));}
  return {mode:state.context===context?state.applied:'chat-sheet',chosen:state.context===context?state.chosen:'chat-sheet',deferred:state.context===context&&state.chosen!==state.applied,choose};
}
