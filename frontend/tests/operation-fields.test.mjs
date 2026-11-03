import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import textComparison from '../../tests/manual/visible-text.cjs';
test('可見文字比對不放過返回鍵、數值或標籤差異，只容許空白換行',()=>{
 assert.equal(textComparison.compareText(['返回修改'],['返回選擇']).consistent,false);
 assert.equal(textComparison.compareText(['人工良品','120 件'],['人工良品','125 件']).consistent,false);
 assert.equal(textComparison.compareText(['不良原因'],['不良數量']).consistent,false);
 assert.equal(textComparison.compareText(['合計 3 件'],['合計','3','件']).consistent,true);
});
test('核對與拒絕後返回文字依同一欄位判斷，不把無欄位動作標成修改',async()=>{
 const server=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'});
 try{
  const {hasEditableFields,operationBackLabel}=await server.ssrLoadModule('/src/operation-fields.ts');
  for(const action of ['report.add','report.update','report.cavities','schedule.save']){
   assert.equal(hasEditableFields(action),true,action);assert.equal(operationBackLabel(action),'返回修改',action);
  }
  for(const action of ['report.delete','report.complete','mold.mount_start','mold.mount_finish','mold.unmount_start','mold.unmount_finish','mold.clear']){
   assert.equal(hasEditableFields(action),false,action);assert.equal(operationBackLabel(action),'返回選擇',action);
  }
 }finally{await server.close();}
});
