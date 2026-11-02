import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
const server=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'});
const {restoreQueryWorkspace}=await server.ssrLoadModule('/src/query-context.ts');
const {ApiError}=await server.ssrLoadModule('/src/api.ts');
await server.close();

test('首次正式查詢先帶宿主範圍，不先 GET 全廠清單',async()=>{
 const calls=[];const result={records:[{EQP_NO:'MC37'}],catalogs:{},query_context:{version:1,filters:{equipment:'MC37'}}};
 const request=async(path,body)=>{calls.push({path,body});if(!body)throw new Error('scope_too_large');return result;};
 assert.equal(await restoreQueryWorkspace(request,{id:'new'},{equipment:'MC37',date:'2026-11-02'}),result);
 assert.equal(calls.length,1);assert.deepEqual(calls[0].body,{version:0,filters:{equipment:'MC37',date:'2026-11-02'}});
});
test('恢復已有條件不以目前宿主覆蓋；另一分頁搶先初始化只讀回',async()=>{
 const calls=[];const result={records:[],catalogs:{},query_context:{version:3,filters:{equipment:'MC38'}}};
 const request=async(path,body)=>{calls.push({path,body});if(body)throw new ApiError('已更新',409);return result;};
 assert.equal(await restoreQueryWorkspace(request,{id:'saved',query_context:{version:3,filters:{equipment:'MC38'}}},{equipment:'MC37'}),result);
 assert.equal(calls.length,1);assert.equal(calls[0].body,undefined);
 assert.equal(await restoreQueryWorkspace(request,{id:'race'},{equipment:'MC37'}),result);
 assert.equal(calls.length,3);assert.equal(calls[2].body,undefined);
});
