// 防止量測工具把不可達的裁切內容算進畫面，也不能漏掉下方可捲到的文字。
const {start}=require('./issue55-fixture.cjs');
const {visibleText}=require('./visible-text.cjs');
const assert=require('node:assert/strict');
(async()=>{const app=await start();try{const p=await app.browser.newPage();await p.setContent('<div style="position:relative;padding-top:100px"><div id="panel" style="height:80px;overflow:auto"><p style="position:absolute;top:0">上方不可達裁切</p><p>目前可見</p><div style="height:120px"></div><p>下方可捲到</p><div hidden><p>隱藏內容</p></div></div></div>');assert.deepEqual(await visibleText(p,'#panel'),['目前可見','下方可捲到']);await p.locator('#panel').evaluate(e=>e.scrollTop=e.scrollHeight);assert.ok((await visibleText(p,'#panel')).includes('下方可捲到'));console.log('可見文字：裁切／隱藏／下方捲動三項通過');}finally{await app.close();}})().catch(e=>{console.error(e);process.exitCode=1});
