// 真正 React 畫面：待確認與被拒絕均驗證標籤、返回目的地及零提交。
const {start,fixture,prepare,root}=require('./issue57-fixture.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{const app=await start(),results=[];try{
 for(const status of ['pending','rejected'])for(const scene of ['report-update','report-delete','complete','mold-down','mold-clear']){
  const p=await app.browser.newPage({viewport:{width:1366,height:768}});
  const {calls}=await fixture(p,scene,{status});await p.goto(app.url+'/?embed=1');await p.locator('#entry-input').waitFor();await prepare(p,scene);
  const editable=scene==='report-update',label=editable?'返回修改':'返回選擇';
  await p.locator('.proposal').getByRole('button',{name:label,exact:true}).click();
  if(editable)await p.locator('#guide-ok').waitFor();else await p.locator('.target-picker-dialog').waitFor({state:'attached'});
  assert.equal(calls.filter(c=>c.path.endsWith('/confirm')).length,0);
  results.push({情境:scene,狀態:status,文字:label,目的地:editable?'填寫內容':'選擇對象',結果:'通過'});await p.close();
 }
 fs.writeFileSync(path.join(root,'docs/design/issue57/返回按鈕驗收.json'),JSON.stringify(results,null,2));console.log(results);
}finally{await app.close();}})().catch(e=>{console.error(e);process.exitCode=1});
