import type {Row} from './api';

const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
/** 僅重套使用者實際改動的欄位；未動欄位採最新值，陣列整組核對。 */
export function reapplyDraft(base:Row, local:Row, latest:Row):Row {
  const merged={...latest};
  for(const key of new Set([...Object.keys(base),...Object.keys(local)])) {
    if(equal(base[key],local[key]))continue;
    if(key in local)merged[key]=local[key];else delete merged[key];
  }
  return merged;
}
export function sameDraftTarget(action:string,latestAction:string,local:Row,latest:Row){
  return action===latestAction&&['execution_id','report_id','schedule_id'].every(key=>String(local[key]??'')===String(latest[key]??''));
}
