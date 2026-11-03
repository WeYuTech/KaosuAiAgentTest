/** 返回目的地與文案共用同一判斷，不改變操作或後端卡控。 */
export function hasEditableFields(action:string){
  return ['schedule.save','report.add','report.update','report.cavities'].includes(action);
}
export function operationBackLabel(action:string){
  return hasEditableFields(action)?'返回修改':'返回選擇';
}
