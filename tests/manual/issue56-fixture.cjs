// 第二段公開 HTTP fixture；僅測試程式使用，資料不進正式應用。
const {start,fixture:base,root,records:chats}=require('./issue55-fixture.cjs');
const records=Array.from({length:24},(_,i)=>({WIP_OPI_WDOEACICO_HIST_SID:'e'+i,WO:'WO-261102-'+String(382+i).padStart(4,'0'),EQP_NO:i<8?'MC37':i<16?'MC38':'MC39',PART_NO:['P-102','P-104','P-108'][i%3],PART_SPEC:['外殼','底座','上蓋'][i%3],TOL_NO:'M-102',COMPLETED:i%7===6?'Y':'N',MANUAL_OK:[120,86,230,48,64,180][i%6],MANUAL_NG:i%4===0?3:0,SHIFT_DAY:'2026-11-02',REPORTS:Array.from({length:4},(_,n)=>({WIP_OPI_WDOEACICOOUTPUT_HIST_SID:`r${i}-${n}`,CREATE_TIME:`2026-11-02 09:${10+n*10}:00`,OK_QTY:[120,86,230,48][n],NG_QTY:n===0?3:0}))}));
async function fixture(page,scene){
 await base(page);
 let guide={version:1,action:'',args:{},step:'action',missing:[],ready:false};
 let calls=[];
 const workspace={records:records.slice(0,4),catalogs:{equipment:['MC37','MC38','MC39'].map(EQP_NO=>({EQP_NO}))},total:24,page:1,page_size:4,query_context:{version:1,filters:{date:'2026-11-02',page:1,page_size:4}}};
 const result={...workspace,records:records.slice(0,8),total:8,page_size:8,query_context:{version:1,filters:{equipment:'MC37',date:'2026-11-02'}}};
 const pair=['查 MC37 今天的工單','找到 8 筆工單。你可以查看明細，或選一筆繼續作業。'];
 await page.route('**/api/**',async route=>{
  const req=route.request(),url=new URL(req.url()),p=url.pathname,body=req.postDataJSON();calls.push({path:p,method:req.method(),body});
  const send=data=>route.fulfill({json:data});
  if(p==='/api/workspace')return send(workspace);
  if(p.endsWith('/guide')){if(body)guide={...guide,...body,version:guide.version+1,missing:['ok'],ready:false};return send(guide);}
  if(p==='/api/conversations/fixture-2')return send({...chats[2],messages:scene.startsWith('picker')||scene==='report-picker'?[]:[{role:'user',content:pair[0]},{role:'assistant',content:pair[1],data:result}]});
  if(p.endsWith('/query')){
   if(scene==='picker-loading')await new Promise(r=>setTimeout(r,10000));
   if(scene==='picker-error')return route.fulfill({status:503,json:{detail:'設備與日期條件已保留。'}});
   const filters=body?.filters??body??{};const pageNumber=Number(filters.page??1);const filtered=records.filter(row=>(!filters.equipment||row.EQP_NO===filters.equipment)&&(!filters.search||(row.WO+' '+row.PART_NO).includes(filters.search)));
   return send({...workspace,records:scene==='picker-empty'?[]:filtered.slice((pageNumber-1)*4,pageNumber*4),total:scene==='picker-empty'?0:filtered.length,page:pageNumber,query_context:{version:2,filters}});
  }
  return route.fallback();
 });
 return {calls};
}
async function prepare(page,scene){
 await page.locator('.header-tools button').nth(1).click();
 if(await page.locator('.conversation-history').isHidden())await page.getByRole('button',{name:'展開側欄',exact:true}).click();
 await page.locator('.history-select').filter({hasText:'MC37 今日生產'}).click();
 await page.locator('.workspace-bar').waitFor();
 if(scene.startsWith('picker')||scene==='report-picker'){
  if(scene==='report-picker'){await page.locator('.guide-body summary').click();await page.getByRole('button',{name:'修改報工',exact:true}).click();}
  else await page.getByRole('button',{name:'新增報工',exact:true}).click();
  await page.locator('.target-picker-dialog').waitFor();
  if(!['picker-loading','picker-error','picker-empty'].includes(scene))await page.locator('.record-choices tbody tr').first().waitFor();
  if(scene==='picker-detail')await page.locator('.record-choices button').first().click();
  if(['picker-selected','report-picker'].includes(scene))await page.locator('.record-choices input[type=radio]').first().check();
  if(scene==='report-picker')await page.getByRole('button',{name:'選擇報工紀錄',exact:true}).click();
  if(scene==='picker-ai')await page.locator('#guide-selection-ai').click();
 }else if(scene==='result-detail')await page.locator('.query-result-table button').first().click();
}
module.exports={start,root,records,fixture,prepare};
if(require.main===module)(async()=>{const app=await start();try{const page=await app.browser.newPage({viewport:{width:1366,height:768}});await fixture(page,process.env.SCENE||'results');await page.goto(app.url+'/?embed=1');await page.locator('#entry-input').waitFor();await prepare(page,process.env.SCENE||'results');await page.screenshot({path:root+'/.local/issue56-smoke.png'});console.log((await page.locator('body').innerText()).slice(-5000));}finally{await app.close();}})().catch(e=>{console.error(e);process.exitCode=1});

