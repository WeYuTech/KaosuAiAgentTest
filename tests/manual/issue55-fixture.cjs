// 只供視覺驗收的 HTTP fixture；不寫入 MES，也不呼叫付費模型。
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('C:/Users/rdpuser/Documents/ChatGPT/KaosuKssKpiDemo/web/node_modules/playwright-core');
const root=path.resolve(__dirname,'../..');
const titles=['每日生產追蹤','本週排程調整','MC37 今日生產','新增人工報工','模具上下模','查詢昨日產量','排程工單確認','生產異常追蹤','本週工單進度','修改報工數量','MC38 生產資料','模穴數調整'];
const records=titles.map((title,i)=>({id:'fixture-'+i,title,module:'report',is_pinned:i<2,is_archived:false,is_deleted:false,metadata_version:1,created_at:'2026-11-02T08:00:00+07:00',updated_at:'2026-11-02T08:00:00+07:00',message_count:2}));
const messages={capabilities:['你能幫我做什麼？','我可以查詢生產資料，也能陪你完成排程、報工和模具作業。\n\n例如「查 MC37 今天的工單」，或直接說「我要報工」。'],clarify:['幫我處理 MC37','你想查 MC37 的生產狀況，還是進行一項作業？\n\n我會沿用這台設備，不用再選一次。'],unsupported:['測試','你好，我在。你可以直接問生產問題。\n\n例如「MC37 今天做了多少？」']};
// 三種搜尋狀態的範例背景只有查詢原句；不假造生產查詢結果。
for(const key of ['history-empty','history-loading','history-error'])messages[key]=['查 MC37 今天的工單',''];
async function start(){
 const dist=path.join(root,'frontend/dist');
 const server=http.createServer((req,res)=>{const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const file=path.join(dist,relative==='/'?'index.html':relative);if(!file.startsWith(dist+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,executablePath:'C:/Users/rdpuser/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe'});
 return {browser,url:`http://127.0.0.1:${server.address().port}`,close:async()=>{await browser.close();await new Promise(r=>server.close(r));}};
}
async function fixture(page,scene='home'){
 let chats=structuredClone(records);
 let sent=null;
 await page.addInitScript(()=>localStorage.setItem('kaosu-assistant:theme','dark'));
 await page.route('**/api/**',async route=>{
  const url=new URL(route.request().url()),p=url.pathname,body=route.request().postDataJSON();
  const send=(data,status=200)=>route.fulfill({status,json:data});
  if(p==='/api/health')return send({status:'ok',mode:'simulation',model_configured:scene!=='unconfigured',business_timezone:'UTC+07:00',business_date:'2026-11-02'});
  if(p==='/api/session')return send({actor:{id:'fixture-operator',name:'現場人員',roles:['schedule','report','mold']},mode:'simulation'});
  if(p==='/api/budget')return send({spent_usd:2.21,limit_usd:20,reserved_usd:0});
  if(p==='/api/entry/messages/start'){
   sent=body;
   if(scene==='message-unknown')return route.abort('failed');
   return send({request_id:body.request_id,token:'fixture-only'});
  }
  if(p.startsWith('/api/streams/')){
   await new Promise(r=>setTimeout(r,2100));
   const pair=messages[scene]||messages.capabilities;
   const content=scene==='long-reply'?'以下是 MC37 的生產資料整理。\n\n'+['目前生產','工單進度','人工報工','不良品紀錄','待完成工單','模具狀態','下一步'].map((title,i)=>`### ${i+1}. ${title}\n\n工單 WO-261102-${String(382+i).padStart(4,'0')} · ${['P-102 外殼','P-104 底座','P-108 上蓋'][i%3]}\n\n人工報工與設備資料分別顯示。尚無設備資料時，會標示未取得，不會當作產量為零。`).join('\n\n'):pair[1];
   return send({events:[{seq:1,event:'done',data:{status:scene==='clarify'?'clarify':scene==='unsupported'||scene.startsWith('history-')?'unsupported':'answered',request_id:sent.request_id,messages:[{role:'user',content:sent.text},{role:'assistant',content}]}}],terminal:true});
  }
  if(p==='/api/conversations'){
   let list=scene==='sidebar-empty'?[]:chats;
   const scope=url.searchParams.get('scope'),q=url.searchParams.get('q');
   if(q&&scene==='history-loading'){await new Promise(r=>setTimeout(r,2500));}
   if(q&&scene==='history-error')return send({detail:'搜尋暫時無法使用'},503);
   if(q)list=list.filter(x=>x.title.includes(q));
   if(!q&&(scope!=='active'||url.searchParams.has('page_size')))list=['MC37 今日生產','每日生產追蹤','本週排程調整'].map(title=>chats.find(c=>c.title===title)).filter(Boolean).map(x=>({...x,is_archived:scope==='archived',is_deleted:scope==='deleted',updated_at:scope==='active'?x.updated_at:'2026-11-01T08:00:00+07:00'}));
   return send({records:list,total:list.length,page:1,page_size:30});
  }
  if(p.endsWith('/metadata')){const i=chats.findIndex(c=>p.includes(c.id));chats[i]={...chats[i],...body,metadata_version:chats[i].metadata_version+1};return send(chats[i]);}
  if(p.startsWith('/api/entry/requests/'))return send({status:'unknown',request_id:sent?.request_id});
  if(p.startsWith('/api/entry/')&&route.request().method()==='GET')return send({messages:scene==='unconfigured'?[{role:'user',content:'查 MC37 今天的工單'},{role:'assistant',content:'AI 尚未設定'}]:[]});
  if(p==='/api/audit')return send({records:[]});
  return send({detail:'fixture 未定義此介面：'+p},404);
 });
}
module.exports={start,fixture,root,records,messages};
if(require.main===module)(async()=>{const app=await start();try{const page=await app.browser.newPage({viewport:{width:1366,height:744},colorScheme:'dark'});await fixture(page);await page.goto(app.url+'/?embed=1');await page.locator('.history-select').first().waitFor();await page.waitForTimeout(300);fs.mkdirSync(path.join(root,'.local/issue55-product'),{recursive:true});await page.screenshot({path:path.join(root,'.local/issue55-product/home.png')});console.log(await page.locator('.assistant-panel').evaluate(el=>({text:el.innerText.slice(0,600),rect:el.getBoundingClientRect().toJSON()})));}finally{await app.close();}})().catch(e=>{console.error(e);process.exitCode=1});
