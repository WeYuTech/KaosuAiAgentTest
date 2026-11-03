// 第三段公開 HTTP 視覺 fixture；所有示意資料僅存在測試程式。
const {start,fixture:base,root,records:chats}=require('./issue55-fixture.cjs');
const fs=require('node:fs'),path=require('node:path');
const target={WIP_OPI_WDOEACICO_HIST_SID:'e1',ZZ_KAOSU_PROD_SCHEDULE_SID:'s1',EQP_NO:'MC37',WO:'WO-261102-0382',PART_NO:'P-102',PART_SPEC:'外殼',TOL_NO:'M-102',OPI_CAV:2,COMPLETED:'N',PRODUCTION_STATUS:'RUN',REPORTS:[]};
const workspace={records:[target],catalogs:{defect_reasons:[{NG_CODE_NO:'NG01',NG_CODE_NAME:'刮傷'},{NG_CODE_NO:'NG02',NG_CODE_NAME:'毛邊'},{NG_CODE_NO:'NG03',NG_CODE_NAME:'缺料'}]},total:1,page:1,page_size:4};
async function fixture(page,scene){
 await base(page);await page.addInitScript(mode=>localStorage.setItem('mes-operation-view:v1:simulation:fixture-operator',JSON.stringify({version:1,mode})),scene.startsWith('wizard')?'step-wizard':'chat-sheet');
 let calls=[];let guide={version:1,action:'report.add',args:scene.endsWith('empty')||scene.endsWith('select')?{}:{execution_id:'e1',ok:125,defects:[{code:'NG01',quantity:3}]},step:scene.endsWith('empty')||scene.endsWith('select')?'target':'details',missing:[],ready:true};
 const messages=[{role:'user',content:'我要報工，MC37 良品 125，不良 3 個刮傷'},{role:'assistant',content:scene.endsWith('empty')||scene.endsWith('select')?'好，先選擇這次要操作的工單。':'已帶入 MC37 的工單。數量可以直接在作業單調整。'}];
 await page.route('**/api/**',async route=>{const req=route.request(),p=new URL(req.url()).pathname,body=req.postDataJSON();calls.push({path:p,body});const send=json=>route.fulfill({json});
 if(p==='/api/workspace')return send(workspace);
 if(p.endsWith('/guide')){if(body)guide={...guide,...body,version:guide.version+1};return send(guide);}
 if(p==='/api/conversations/fixture-2')return send({...chats[2],messages});
 if(p.endsWith('/query'))return send(workspace);
 return route.fallback();});return {calls};
}
async function prepare(page,scene){await page.locator('.header-tools button').nth(1).click();if(await page.locator('.conversation-history').isHidden())await page.getByRole('button',{name:'展開側欄',exact:true}).click();await page.locator('.history-select').filter({hasText:'MC37 今日生產'}).click();await page.locator('.guided-flow').waitFor();await page.waitForTimeout(400);}
module.exports={start,fixture,prepare,root};
if(require.main===module)(async()=>{const app=await start();try{const scene=process.env.SCENE||'sheet-edit';const page=await app.browser.newPage({viewport:{width:1366,height:768},colorScheme:'dark'});await fixture(page,scene);await page.goto(app.url+'/?embed=1');await page.locator('#entry-input').waitFor();await prepare(page,scene);await page.screenshot({path:root+'/.local/issue57-product.png'});console.log((await page.locator('body').innerText()).slice(-3500));const ref=await app.browser.newPage({viewport:{width:1366,height:768},colorScheme:'dark'});await ref.goto('file:///'+path.join(root,'docs/design/uiux-reference-v2/reference.html').replaceAll('\\','/'));await ref.locator('#ux-scene').selectOption('sheet-edit');await ref.getByRole('button',{name:'新增原因',exact:true}).click();await ref.getByRole('checkbox',{name:'沒有不良品',exact:true}).check();console.log('範例新增原因與沒有不良品操作完成');}finally{await app.close();}})().catch(e=>{console.error(e);process.exitCode=1});