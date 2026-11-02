/** 記住邏輯欄位與文字選取，不持有會隨版型重建的 DOM 節點。 */
export interface OperationFocus {id:string;start:number|null;end:number|null;direction:'forward'|'backward'|'none'|null}
export function rememberOperationFocus(target:EventTarget|null):OperationFocus|null{
  if(!(target instanceof HTMLElement)||!target.id||!target.matches('input,textarea,select,button'))return null;
  if(!target.closest('.guided-flow,.composer-area'))return null;
  const text=target instanceof HTMLInputElement||target instanceof HTMLTextAreaElement?target:null;
  return {id:target.id,start:text?.selectionStart??null,end:text?.selectionEnd??null,direction:text?.selectionDirection??null};
}
export function operationFocusTarget(root:HTMLElement|null,memory:OperationFocus|null):HTMLElement|null{
  if(!root)return null;
  const visible=(el:HTMLElement|null)=>!!el&&!el.closest('[hidden],[inert]')&&!('disabled'in el&&el.disabled)&&el.getClientRects().length>0;
  const exact=memory?Array.from(root.querySelectorAll<HTMLElement>('[id]')).find(el=>el.id===memory.id)??null:null;
  // 依邏輯階段挑選；合併 selector 只會依 DOM 順序誤選最前面的「取消」。
  const fallback=['.guide-choosing input','.guide-body input,.guide-body select','.guide-body button','.proposal-actions button','#chat-input']
    .map(selector=>Array.from(root.querySelectorAll<HTMLElement>(selector)).find(visible)).find(Boolean)??null;
  const target=visible(exact)?exact:fallback;
  if(target&&(target instanceof HTMLInputElement||target instanceof HTMLTextAreaElement)&&target===exact&&memory?.start!=null){try{target.setSelectionRange(memory.start,memory.end,memory.direction??'none');}catch{/* 日期與數字欄位不支援文字游標。 */}}
  target?.scrollIntoView({block:'nearest',inline:'nearest'});
  return target;
}
