// 審查裁定的範例互動：不呼叫正式 MES 或模型。
const {start,root}=require('./issue55-fixture.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{const app=await start(),results=[];try{
 const p=await app.browser.newPage();await p.goto('file:///'+path.join(root,'docs/design/uiux-reference-v2/reference.html').replaceAll('\\','/'));
 await p.locator('#ux-scene').selectOption('home');const send=p.locator('[data-action=send]'),input=p.locator('#ux-composer');
 for(const value of ['', '   ', '查詢 MC37']){await input.fill(value);assert.equal(await send.isDisabled(),!value.trim());assert.equal(await send.evaluate(e=>getComputedStyle(e).opacity),value.trim()?'1':'0.43');results.push({輸入:value||'空白',停用:await send.isDisabled(),結果:'通過'});}
 const scenes=JSON.parse(fs.readFileSync(path.join(root,'docs/design/uiux-reference-v2/scenarios.json'),'utf8'));
 for(const id of ['Q01','Q02']){await p.locator('#ux-scene').selectOption(scenes.find(s=>s.id===id).key);assert.equal(await input.isDisabled(),true);assert.equal(await input.getAttribute('placeholder'),'輸入訊息…');assert.equal(await p.locator('[data-action=stop].ux-send').isDisabled(),false);results.push({情境:id,結果:'通過'});}
 }finally{await app.close();fs.writeFileSync(path.join(root,'docs/design/issue58/範例輸入框互動.json'),JSON.stringify(results,null,2));}})().catch(e=>{console.error(e);process.exitCode=1});
