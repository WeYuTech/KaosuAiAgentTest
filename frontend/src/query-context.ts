import {ApiError,type Conversation,type Workspace} from './api';

/** 首次先套用宿主範圍，避免在正式庫先查全廠；已保存條件以伺服器為準。 */
export async function restoreQueryWorkspace(request:<T>(path:string,body?:unknown)=>Promise<T>,chat:Conversation,initial:Record<string,string|number>):Promise<Workspace>{
  const path=`/api/conversations/${chat.id}/query`;
  if(chat.query_context?.version||!Object.values(initial).some(Boolean))return request<Workspace>(path);
  try{return await request<Workspace>(path,{version:0,filters:initial});}
  catch(error){if(error instanceof ApiError&&error.status===409)return request<Workspace>(path);throw error;}
}

/** 分頁及等價預設值不代表篩選條件改變；保留跨頁暫選。 */
export function queryCriteria(filters:Record<string,string|number>){
  return JSON.stringify(Object.entries(filters).filter(([key,value])=>!['page','page_size'].includes(key)&&value!==''&&!(key==='history'&&value==='all')).sort());
}
