// 公開 HTTP fixture 與真實 React 操作；所有提交都是模擬，不接正式 MES。
const {start,fixture,prepare,root}=require('./issue58-fixture.cjs');
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
(async()=>{const app=await start(),rows=[];try{
 for(const scene of ['validation','saving','save-error','conflict','expired','submitting','success','rejected','unknown','write-disabled','session','permission','connecting','panel-error','recover-operation']){
 const page=await app.browser.newPage({viewport:{width:1366,height:768},colorScheme:'dark'});const c=await fixture(page,scene);let error;
 const confirms=()=>c.calls.filter(x=>x.path.endsWith('/confirm'));const mutations=()=>c.calls.filter(x=>x.body&&(/guide|proposals|confirm/.test(x.path)));
 try{await page.goto(app.url+'/?embed=1');await prepare(page,c);
 if(['submitting','unknown'].includes(scene)){
  assert.equal(await page.locator('#chat-input').getAttribute('placeholder'),'請先完成或查核目前操作');
  assert.equal(await page.locator('#chat-input').isDisabled(),true);
  const send=page.locator('.composer-area .aui-composer-send');
  assert.equal(await send.isDisabled(),true);
  assert.deepEqual(await send.evaluate(e=>[getComputedStyle(e).opacity,getComputedStyle(e).cursor]),['0.43','not-allowed']);
  const before=c.calls.length;await send.evaluate(e=>{e.click();e.click();});await page.keyboard.press('Enter');
  assert.equal(c.calls.slice(before).filter(x=>/messages|confirm/.test(x.path)&&x.body).length,0);
 }
 if(['validation','saving','save-error','conflict'].includes(scene)){
 assert.equal(confirms().length,0);assert.doesNotMatch(await page.locator('.operation-primary').innerText(),/作業已完成|報工已完成/);
 if(scene==='saving'){assert.equal(await page.locator('.guide-navigation>.primary').isDisabled(),true);assert.ok(c.release);assert.equal(await page.locator('#guide-ok').inputValue(),'125');c.release();await page.waitForTimeout(400);}
 if(scene==='save-error'){assert.equal(await page.locator('#guide-ok').inputValue(),'125');c.fail=false;await page.getByRole('button',{name:'重試儲存',exact:true}).click();await page.waitForTimeout(800);assert.equal(await page.locator('#guide-ok').inputValue(),'125');}
 if(scene==='conflict'){await page.getByRole('button',{name:'查看最新資料',exact:true}).click();await page.locator('.draft-comparison').waitFor();assert.equal(await page.locator('#guide-ok').inputValue(),'125');assert.equal(confirms().length,0);}
 }
 if(['expired','write-disabled'].includes(scene)){assert.equal(confirms().length,0);if(scene==='write-disabled'){const b=page.getByRole('button',{name:'確認送出',exact:true});assert.equal(await b.isDisabled(),true);await b.evaluate(e=>e.click());assert.equal(confirms().length,0);}else assert.equal(await page.getByRole('button',{name:'重新核對',exact:true}).count(),1);}
 if(scene==='submitting'){
 assert.equal(confirms().length,1);assert.doesNotMatch(await page.locator('.operation-primary').innerText(),/作業已完成|報工已完成/);
 await page.emulateMedia({reducedMotion:'no-preference'});const spin=page.locator('.operation-status-live .spin');assert.deepEqual(await spin.evaluate(e=>[getComputedStyle(e).animationDuration,getComputedStyle(e).animationTimingFunction]),['0.85s','linear']);await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await spin.evaluate(e=>getComputedStyle(e).animationName),'none');assert.match(await page.locator('.operation-status-live').innerText(),/正在送出/);await page.emulateMedia({reducedMotion:'no-preference'});
 const b=page.getByRole('button',{name:'送出中…',exact:true});assert.equal(await b.isDisabled(),true);await b.evaluate(e=>{e.click();e.click();});await page.keyboard.press('Enter');assert.equal(confirms().length,1);
 c.release();await page.locator('.operation-receipt').waitFor();assert.equal(confirms().length,1);
 }
 if(scene==='success'){
 assert.equal(confirms().length,1);await page.locator('.operation-receipt summary').click();const text=await page.locator('.operation-receipt').innerText();assert.match(text,/OK_QTY/);assert.match(text,/125/);assert.match(text,/NG_QTY/);assert.match(text,/3/);assert.equal(c.changes.length,2);
 }
 if(scene==='rejected'){assert.equal(confirms().length,1);assert.equal(await page.getByRole('button',{name:'確認送出',exact:true}).isDisabled(),true);assert.equal(await page.getByRole('button',{name:'查核執行結果',exact:true}).count(),0);await page.getByRole('button',{name:'返回修改',exact:true}).click();await page.locator('#guide-ok').waitFor();assert.equal(confirms().length,1);}
 if(scene==='unknown'){
 assert.equal(confirms().length,1);assert.equal(await page.getByRole('button',{name:'確認送出',exact:true}).count(),0);assert.equal(await page.locator('#guide-ok:visible').count(),0);assert.equal(await page.getByRole('button',{name:'返回修改',exact:true}).count(),0);
 await page.getByRole('button',{name:'查核執行結果',exact:true}).click();await page.waitForTimeout(450);assert.equal(confirms().length,1);assert.ok(c.calls.some(x=>x.path.endsWith('/reconcile')));assert.equal(await page.locator('#guide-ok:visible').count(),0);assert.match(await page.locator('.operation-receipt').innerText(),/執行結果待確認/);
 }
 if(['session','permission','connecting'].includes(scene)){assert.equal(await page.locator('.history-select').count(),0);assert.equal(await page.locator('#entry-input').count(),0);assert.equal(confirms().length,0);}
 if(scene==='panel-error'){await page.getByRole('dialog',{name:'載入功能',exact:true}).getByRole('button',{name:'關閉',exact:true}).last().click();assert.equal(await page.locator('#guide-ok').inputValue(),'125');assert.equal(confirms().length,0);}
 if(scene==='recover-operation'){await page.getByRole('button',{name:'先留在這裡',exact:true}).click();await page.getByRole('dialog',{name:'有一筆作業尚待確認',exact:true}).waitFor({state:'hidden'});assert.equal(confirms().length,0);assert.ok(await page.evaluate(()=>Object.keys(localStorage).some(k=>k.includes(':submission:'))));await page.getByRole('button',{name:'返回原作業',exact:true}).click();await page.getByRole('dialog',{name:'有一筆作業尚待確認',exact:true}).getByRole('button',{name:'返回原作業',exact:true}).click();await page.locator('.operation-receipt').waitFor();assert.match(await page.locator('.operation-receipt').innerText(),/執行結果待確認/);assert.ok(c.calls.some(x=>x.path==='/api/conversations/fixture-original'));assert.equal(confirms().length,0);}
 }catch(e){error=String(e.stack||e);}
 rows.push({情境:scene,結果:error?'失敗':'通過',錯誤:error,送出請求次數:confirms().length,查核請求次數:c.calls.filter(x=>x.path.endsWith('/reconcile')).length,寫入路徑:mutations().map(x=>({路徑:x.path,版本:x.body?.version})),操作識別:[...new Set(confirms().map(x=>x.path))]});console.log(scene,error||'通過');await page.close();
 }
 }finally{await app.close();fs.writeFileSync(path.join(root,'docs/design/issue58/安全操作驗收.json'),JSON.stringify(rows,null,2));}assert.equal(rows.filter(r=>r.結果==='失敗').length,0);
})().catch(e=>{console.error(e);process.exitCode=1});
