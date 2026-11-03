// 第二段公開 HTTP fixture；僅測試程式使用，資料不進正式應用。
const {start,fixture:base,root,records:chats}=require('./issue55-fixture.cjs');
const records=Array.from({length:24},(_,i)=>({WIP_OPI_WDOEACICO_HIST_SID:'e'+i,WO:'WO-261102-'+String(382+i).padStart(4,'0'),EQP_NO:i<8?'MC37':i<16?'MC38':'MC39',PART_NO:['P-102','P-104','P-108'][i%3],PART_SPEC:['外殼','底座','上蓋'][i%3],TOL_NO:'M-102',COMPLETED:i%7===6?'Y':'N',PRODUCTION_STATUS:i%7===6?'DONE':'RUN',MANUAL_OK:[120,86,230,48,64,180][i%6],MANUAL_NG:i%4===0?3:0,SHIFT_DAY:'2026-11-02',REPORTS:Array.from({length:24},(_,n)=>({WIP_OPI_WDOEACICOOUTPUT_HIST_SID:`r${i}-${n}`,REPORT_NO:`RPT-0382-0${n+1}`,CREATE_TIME:`2026-11-02 ${String(9+Math.floor((10+n*10)/60)).padStart(2,'0')}:${String((10+n*10)%60).padStart(2,'0')}:00`,OK_QTY:[120,86,230,48][n%4],NG_QTY:n===0?3:0}))}));
async function fixture(page,scene){
 await base(page);
 let guide={version:1,action:'',args:{},step:'action',missing:[],ready:false};
 let calls=[],sent=null,stopped=false;let pollSeq=0;
 const workspace={records:records.slice(0,4),catalogs:{equipment:['MC37','MC38','MC39'].map(EQP_NO=>({EQP_NO}))},total:8,page:1,page_size:4,query_context:{version:1,filters:{equipment:'MC37',date:'2026-11-02',page:1,page_size:4}}};
 const result={...workspace,records:records.slice(0,8),total:8,page_size:8,query_context:{version:1,filters:{equipment:'MC37',date:'2026-11-02'}}};
 const pairs={empty:['查 MC37 今天的工單','這個範圍沒有找到工單。\n\n可以換日期，或查看其他設備。'],'query-error':['查 MC37 今天的工單','目前連不上資料來源。\n\n查詢條件已保留。'],partial:['查全部工單','資料範圍太大，目前不能顯示完整結果。\n\n請先指定設備或日期。'],cancelled:['查 MC37 今天的工單','已停止這次查詢。\n\n你可以修改條件後再查一次。']};
 const pair=pairs[scene]||['查 MC37 今天的工單','找到 8 筆工單。你可以查看明細，或選一筆繼續作業。'];
 const data=scene==='empty'?{...result,records:[],total:0}:scene==='partial'?{...result,records:[],total:undefined}:result;
 const messages=scene.startsWith('picker')||scene==='report-picker'?[{role:'user',content:'我要報工，MC37 良品 125，不良 3 個刮傷'},{role:'assistant',content:'好，先選擇這次要操作的工單。'}]:['loading','slow'].includes(scene)?[]:[{role:'user',content:pair[0]},{role:'assistant',content:pair[1],...(!['query-error','cancelled'].includes(scene)?{data}:{}),...(scene==='cancelled'?{stopped:true}:{}),...(scene==='query-error'?{processing_failed:true}:{})}];
 await page.route('**/api/**',async route=>{
  const req=route.request(),url=new URL(req.url()),p=url.pathname,body=req.postDataJSON();calls.push({path:p,method:req.method(),body});
  const send=data=>route.fulfill({json:data});
  if(p.endsWith('/messages/start')){sent=body;return send({request_id:body.request_id??'fixture-request',token:'fixture-only'});}
  if(p.startsWith('/api/streams/')&&p.endsWith('/stop')){stopped=true;return send({status:'stopping'});}
  if(p.startsWith('/api/streams/')){await new Promise(r=>setTimeout(r,700));if(stopped){messages.push({role:'user',content:sent.text},{role:'assistant',content:'已停止這次查詢。\n\n你可以修改條件後再查一次。',stopped:true});return send({events:[{seq:++pollSeq,event:'stopped',data:{}}],terminal:true});}if(!pollSeq)return send({events:[{seq:++pollSeq,event:'intent',data:{readonly:true,request_id:'fixture-request',token:'fixture-only'}}],terminal:false});return send({events:[],terminal:false});}
  if(p==='/api/workspace')return send(scene.startsWith('picker')||scene==='report-picker'?workspace:result);
  if(p.endsWith('/guide')){if(body)guide={...guide,...body,version:guide.version+1,missing:['ok'],ready:false};return send(guide);}
  if(p==='/api/conversations/fixture-2')return send({...chats[2],messages,...(!scene.startsWith('picker')&&scene!=='report-picker'?{query_context:result.query_context}:{})});
  if(p.endsWith('/query')){
   if(req.method()==='GET')return send(scene.startsWith('picker')||scene==='report-picker'?workspace:result);
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
 if(['loading','slow'].includes(scene)){await page.locator('#chat-input').fill('查 MC37 今天的工單');await page.locator('#chat-input').press('Enter');await page.locator('.request-progress').waitFor();await page.waitForTimeout(900);if(scene==='slow')await page.getByRole('button',{name:'停止查詢',exact:true}).waitFor();return;}
 if(scene.startsWith('picker')||scene==='report-picker'){
  if(scene==='report-picker'){await page.getByRole('button',{name:'新增報工',exact:true}).click({trial:true});await page.waitForTimeout(300);await page.locator('.guide-body summary').focus();await page.locator('.guide-body summary').press('Enter');await page.locator('.guide-body button').filter({hasText:'修改報工'}).click();}
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
