/** 第 40 項：真實前端與隔離 API；故障／延遲／分類均為 fixture。 */
const path=require('node:path'),fs=require('node:fs/promises'),{spawn}=require('node:child_process');
process.env.PLAYWRIGHT_BROWSERS_PATH=path.join(process.cwd(),'.local/playwright-browsers');
const {chromium}=require(process.env.PLAYWRIGHT_CORE_PATH||'C:/Users/rdpuser/Documents/ChatGPT/KaosuKssKpiDemo/web/node_modules/playwright-core');
const root=process.cwd(),tag=process.argv[2]||'A',phone=tag==='390',dir=path.join(root,'.local/issue40-capture',tag+'-'+Date.now()),out=path.join(root,'docs/design/issue40/product');
(async()=>{
 await fs.mkdir(dir,{recursive:true});await fs.mkdir(out,{recursive:true});const port=Number(process.env.CAPTURE_PORT||8045),base=`http://127.0.0.1:${port}`;
 const server=spawn(path.join(root,'.venv/Scripts/python.exe'),['tests/manual/issue40_ui_server.py'],{cwd:root,env:{...process.env,ISSUE40_FIXTURE_DB:path.join(dir,'fixture.db'),ISSUE40_PORT:String(port)},windowsHide:true,stdio:'pipe'});let errors='';server.stderr.on('data',d=>errors+=d);
 let browser,context,p;try{
  for(let i=0;i<100;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,200));}
  try{browser=await chromium.launch({channel:'msedge',headless:true});}catch{browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'C:/Users/rdpuser/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe',headless:true});}
  context=await browser.newContext({viewport:phone?{width:390,height:844}:{width:1366,height:768},locale:'zh-TW',colorScheme:'dark',...(phone?{}:{recordVideo:{dir,size:{width:1366,height:768}}})});p=await context.newPage();p.setDefaultTimeout(12000);const recordStart=Date.now();
  p.on('pageerror',e=>console.error('頁面錯誤',e.message));
  const pause=(ms=950)=>p.waitForTimeout(ms),button=(name,scope=p)=>scope.getByRole('button',{name,exact:true}),click=async(name,scope=p)=>{await button(name,scope).focus();await button(name,scope).press('Enter');await pause();};
  const shot=async id=>{await pause();if(/fixture/i.test(await p.locator('body').innerText()))throw Error('畫面洩漏測試標記：'+id);await p.screenshot({path:path.join(out,`${phone?'390-':''}${id}.png`)});console.log('畫面 '+id);};
  const api=async(url,data)=>{const r=data?await context.request.post(base+url,{data}):await context.request.get(base+url);if(!r.ok())throw new Error(`${url}: ${r.status()} ${await r.text()}`);return r.json();};
  await api('/api/session/demo',{identity:'supervisor'});
  const menu=async name=>{await click('更多功能');await p.getByRole('menu').getByText(name,{exact:true}).click();await pause();};
  await p.goto(base);await p.locator('button.launcher').click();if(!phone)await click('放大聊天室');await menu('黑暗模式');
  const trimStart=(Date.now()-recordStart)/1000;
  let cid,pid; p.on('response',async response=>{try{const url=response.url();if(/\/api\/conversations$/.test(url)&&response.request().method()==='POST')cid=(await response.json()).id;if(/\/proposals$/.test(url)&&response.request().method()==='POST')pid=(await response.json()).proposal.id;}catch{}});
  const begin=async()=>{await p.locator('button.entry-card').filter({hasText:'生產報工'}).click();await p.locator('.guided-flow').waitFor();await pause();};
  const nextChat=async()=>{await click('新聊天');await begin();};
  const target=async()=>{await click('新增報工');if(!await p.locator('.target-picker-dialog').count())await click('選擇／更換對象');const d=p.locator('.target-picker-dialog');await d.getByRole('radio').first().waitFor();await d.locator('tr').filter({hasText:'WO-A'}).first().getByRole('radio').check();await click('帶入作業單',d);};
  const good=async n=>{await p.locator('#guide-ok').fill(String(n));await click('沒有不良品');await pause();};
  const review=async()=>{await click('下一步：核對內容');await p.locator('.proposal').waitFor();await pause();};
  const recovery=async()=>{
   const currentId=cid,currentGuide=await api(`/api/conversations/${cid}/guide`);
   const other=await api('/api/conversations',{module:'report'});const initial=await api(`/api/conversations/${other.id}/guide`);
   const guide=await api(`/api/conversations/${other.id}/guide`,{version:initial.version,action:'report.add',args:{execution_id:currentGuide.args.execution_id,ok:7,defects:[]},step:'details'});
   const card=(await api(`/api/conversations/${other.id}/proposals`,{version:guide.version,action:guide.action,args:guide.args})).proposal;
   const key=await p.evaluate(id=>Object.keys(localStorage).find(k=>k.startsWith('kaosu-assistant:conversation:')&&localStorage.getItem(k)===id),currentId);
   if(!key)throw Error('找不到原作業儲存範圍');
   const secondary=await context.newPage();await secondary.goto(base);await secondary.evaluate(({key,cid,pid})=>localStorage.setItem(key+':submission:fixture-other-tab',JSON.stringify({conversation:cid,proposal:pid})),{key,cid:other.id,pid:card.id});await secondary.close();await p.bringToFront();await pause();await shot('X05');await click('先留在這裡');await click('返回原作業');await pause(1500);
   if(await button('同意並寫入').count())throw Error('返回原作業未維持查核鎖定');
   await api('/fixture/control',{kind:'proposal',id:card.id,patch:{status:'cancelled'}});await click('查核執行結果');await click('返回先前作業');cid=currentId;await pause();
  };
  await begin();
  if(tag==='A'||phone){
   await target();await click('下一步：核對內容');await shot('W01');await click('沒有不良品');
   let release;const gate=new Promise(resolve=>release=resolve);await p.route('**/guide',async route=>{if(route.request().method()==='POST'){await gate;}await route.continue();});
   await p.locator('#guide-ok').fill('125');await pause(900);if(await p.locator('.field-error').count())throw Error('儲存中殘留驗證錯誤');await shot('W02');release();await pause(1800);await p.unroute('**/guide');await pause();await click('沒有不良品');
   let fail=true;await p.route('**/guide',async route=>{if(route.request().method()==='POST'&&fail){fail=false;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({detail:'儲存連線暫時中斷，輸入仍保留。'})});}else await route.continue();});
   await p.locator('#guide-ok').fill('126');await pause(1600);await shot('W03');await p.unroute('**/guide');
   const latest=await api(`/api/conversations/${cid}/guide`);await api(`/api/conversations/${cid}/guide`,{version:latest.version,action:latest.action,args:{...latest.args,ok:130,comment:'同事已補充：第二班'},step:'details'});
   await click('重試儲存');await p.locator('.draft-recovery').scrollIntoViewIfNeeded();await shot('W04');await click('在最新內容重套我的修改，再核對');await pause(1500);
   const merged=await api(`/api/conversations/${cid}/guide`);if(merged.args.ok!==126||merged.args.comment!=='同事已補充：第二班')throw Error('衝突重套未保留最新未改欄位');
   await p.route('**/proposals',async route=>{const r=await route.fetch();const data=await r.json();await api('/fixture/control',{kind:'proposal',id:data.proposal.id,patch:{expires_at:'2020-01-01T00:00:00+00:00'}});data.proposal.expires_at='2020-01-01T00:00:00+00:00';await route.fulfill({response:r,json:data});});await review();await p.unroute('**/proposals');await shot('W05');await click('重新核對');
   let finish;const wait=new Promise(resolve=>finish=resolve);let confirms=0;await p.route('**/confirm',async route=>{confirms++;await wait;await route.continue();});
   await button('同意並寫入').click();await pause(500);if(await button('正在送出，請勿重複操作').isEnabled())throw Error('送出期間仍能點擊');await button('正在送出，請勿重複操作').dispatchEvent('click');if(await p.getByText('正在核對資料與處理作業…',{exact:true}).isVisible())throw Error('重複送出中狀態');await shot('W06');finish();await p.locator('.proposal-state').filter({hasText:'已完成'}).waitFor();await p.unroute('**/confirm');if(confirms!==1)throw Error('重複提交：'+confirms);await shot('W07');
   await nextChat();await target();await good(128);await review();await p.route('**/confirm',route=>route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({detail:'設備資料已變更，請返回修改並重新核對。'})}));await click('同意並寫入');await shot('W08');await p.unroute('**/confirm');await click('返回修改');await p.locator('#guide-ok').fill('129');await pause(1200);await review();
   await p.route('**/confirm',route=>route.abort('failed'));await click('同意並寫入');await p.getByText('結果待核對',{exact:true}).first().waitFor();await shot('W09');if(await button('新聊天').isEnabled())throw Error('未知仍可新聊天');if(await button('同意並寫入').count())throw Error('未知仍有提交按鈕');await click('查核執行結果');await p.unroute('**/confirm');
   if(phone){await shot('W09');}
   await api('/fixture/control',{kind:'proposal',id:pid,patch:{status:'cancelled'}});await click('查核執行結果');await nextChat();await target();await good(130);
   await p.route('**/proposals',async route=>{const r=await route.fetch();const data=await r.json();data.proposal.writes_enabled=false;await route.fulfill({response:r,json:data});});await review();await shot('W10');if(await button('同意並寫入').count())throw Error('關閉寫入仍有提交按鈕');await p.unroute('**/proposals');if(phone){await click('取消草稿');await nextChat();await target();await good(140);await recovery();}
  }else{
   await p.route('**/messages',route=>route.abort('failed'));await p.locator('#chat-input').fill('請查詢 MC37 的生產進度');await p.locator('#chat-input').press('Enter');await pause(1300);await shot('C01');await click('查核原訊息');await p.unroute('**/messages');
   await nextChat();await p.route('**/messages',async route=>{const r=await route.fetch();const data=await r.json();data.messages[data.messages.length-1].content='生產紀錄說明\n\n'+Array.from({length:24},(_,i)=>`### 第 ${i+1} 項核對\n請先核對工單及設備。人工報工與 IoT 推算數量分開呈現，確認後才會寫入。`).join('\n\n');await api('/fixture/control',{kind:'messages',id:cid,messages:data.messages});await pause(2300);await route.fulfill({response:r,json:data});});await p.locator('#chat-input').fill('說明報工資料如何核對');await p.locator('#chat-input').press('Enter');await pause(4200);await p.unroute('**/messages');await p.locator('.conversation-scroll').hover();await p.mouse.wheel(0,-900);await pause();await shot('C02');await click('查看最新內容');
   await target();await good(145);await p.locator('#chat-input').fill('下一班需要接續此工單');await p.route('**/api/audit',route=>route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({detail:'登入已逾時'})}));await click('紀錄');await shot('X01');await p.unroute('**/api/audit');await p.getByRole('button',{name:/現場主管/}).click();await pause(2500);if(await p.locator('#chat-input').inputValue()!=='下一班需要接續此工單')throw Error('重新登入遺失未送文字');await p.locator('#chat-input').fill('');
   await p.route('**/api/audit',route=>route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({detail:'缺少操作紀錄查閱權限'})}));await click('紀錄');await shot('X02');await p.unroute('**/api/audit');await p.getByRole('button',{name:/現場主管/}).click();await pause(1800);
   let connected;const connection=new Promise(resolve=>connected=resolve);await p.route('**/api/health',async route=>{await connection;await route.continue();});await p.route('**/api/session',async route=>{await connection;await route.continue();});await p.reload();if(await p.locator('button.launcher').isVisible())await p.locator('button.launcher').click();if(await button('放大聊天室').isVisible())await click('放大聊天室');if(await p.locator('#entry-input').count())throw Error('連線中仍顯示輸入');await p.getByRole('heading',{name:'正在連線至作業服務'}).waitFor();await shot('X03');connected();await pause(1800);await p.unroute('**/api/health');await p.unroute('**/api/session');await begin();
   await p.route('**/api/audit',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({detail:'操作紀錄暫時無法載入，原作業仍保留。'})}));await click('紀錄');await shot('X04');await p.unroute('**/api/audit');await click('重試',p.locator('.operation-pane'));await click('收起附屬面板');
   await recovery();await review();await click('同意並寫入');await p.locator('.proposal-state').filter({hasText:'已完成'}).waitFor();await click('查看紀錄');await shot('A01');await click('收起附屬面板');await p.route('**/api/budget',async route=>{const response=await route.fetch();const data=await response.json();await route.fulfill({response,json:{...data,spent_usd:null,reserved_usd:null,remaining_usd:null}});});await menu('使用統計');if(!await p.locator('.sidebar-budget').innerText().then(text=>text.includes('尚未取得用量')))throw Error('側欄費用與統計矛盾');await shot('A02');await p.unroute('**/api/budget');await click('關閉',p.getByRole('dialog').last());
  }
  await pause();const videoPath=phone?'':await p.video().path();await context.close();context=null;await browser.close();browser=null;await fs.writeFile(path.join(root,`.local/issue40-video-${tag}.txt`),dir+'\n'+trimStart+'\n'+videoPath);console.log('完成 '+dir);
 }catch(e){console.error(e.stack);console.error(errors);if(p){console.error(await p.locator('body').innerText());await p.screenshot({path:path.join(dir,'失敗.png')}).catch(()=>{});}process.exitCode=1;}finally{if(context)await context.close();if(browser)await browser.close();server.kill();}
})();
