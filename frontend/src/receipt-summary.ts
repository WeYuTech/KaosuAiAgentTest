import type {Change} from './api';
/** 只彙整單筆已證明的人工報工異動；多主鍵或缺欄位時不猜測數量。 */
export function reportReceiptQuantities(action:string,changes:Change[]):{good:number;defects:number}|null{
 if(!['report.add','report.update'].includes(action))return null;
 const good=changes.filter(c=>c.field==='OK_QTY'),defects=changes.filter(c=>c.field==='NG_QTY');
 if(good.length!==1||defects.length!==1)return null;
 const a=good[0],b=defects[0];
 if(a.table!==b.table||JSON.stringify(a.key)!==JSON.stringify(b.key))return null;
 if(typeof a.after!=='number'||typeof b.after!=='number'||!Number.isSafeInteger(a.after)||!Number.isSafeInteger(b.after)||a.after<0||b.after<0)return null;
 return {good:a.after,defects:b.after};
}
