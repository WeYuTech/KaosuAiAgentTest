import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
const server=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'});
const {draftStorageKey,readTextDraft,saveTextDraft,clearTextDrafts}=await server.ssrLoadModule('/src/draft-recovery.ts');
await server.close();
function storage(){const values=new Map();return {get length(){return values.size;},key:i=>[...values.keys()][i]??null,getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};}
for(const delivery of ['unsent','rejected','unknown'])test(`刷新只恢復原句與送達狀態，不建立重試：${delivery}`,()=>{
  const port=storage(),key=draftStorageKey('甲','report','聊天一');
  saveTextDraft(port,key,'良品 120\n缺料 2',delivery);
  const restored=readTextDraft(port,key);assert.equal(restored.text,'良品 120\n缺料 2');assert.equal(restored.delivery,delivery);
  assert.deepEqual(Object.keys(restored).sort(),['delivery','text','updated','version']);
  assert.equal(readTextDraft(port,draftStorageKey('乙','report','聊天一')),null);
  assert.equal(readTextDraft(port,draftStorageKey('甲','report','聊天二')),null);
  assert.equal(readTextDraft(port,draftStorageKey('甲','mold','聊天一')),null);
});
test('登出清除指定帳號；消耗入口原句不清除原聊天',()=>{
  const port=storage(),entry=draftStorageKey('甲','report',null),chat=draftStorageKey('甲','report','聊天一'),other=draftStorageKey('乙','report',null);
  for(const key of [entry,chat,other])saveTextDraft(port,key,'保留','unsent');
  port.setItem('其他功能','不變');saveTextDraft(port,entry,'','unsent');assert.equal(readTextDraft(port,entry),null);assert.equal(readTextDraft(port,chat).text,'保留');
  port.setItem('kaosu-assistant:text-draft:損壞範圍','無法解析');
  clearTextDrafts(port,'甲');assert.equal(readTextDraft(port,chat),null);assert.equal(readTextDraft(port,other).text,'保留');
  clearTextDrafts(port);assert.equal(port.length,1);assert.equal(port.getItem('其他功能'),'不變');
});
test('過期、損壞、超長或不可用儲存不恢復內容',()=>{
  const port=storage(),key=draftStorageKey('甲','report',null);
  for(const value of ['{',JSON.stringify({version:1,text:'x',delivery:'succeeded',updated:Date.now()}),JSON.stringify({version:1,text:'x',delivery:'unknown',updated:0})]){port.setItem(key,value);assert.equal(readTextDraft(port,key),null);}
  const denied={get length(){throw Error('denied');},getItem(){throw Error('denied');},setItem(){throw Error('denied');},removeItem(){throw Error('denied');}};
  assert.equal(readTextDraft(denied,key),null);assert.doesNotThrow(()=>saveTextDraft(denied,key,'x','unknown'));assert.doesNotThrow(()=>clearTextDrafts(denied));
});
