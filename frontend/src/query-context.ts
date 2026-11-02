/** 分頁及等價預設值不代表篩選條件改變；保留跨頁暫選。 */
export function queryCriteria(filters:Record<string,string|number>){
  return JSON.stringify(Object.entries(filters).filter(([key,value])=>!['page','page_size'].includes(key)&&value!==''&&!(key==='history'&&value==='all')).sort());
}
