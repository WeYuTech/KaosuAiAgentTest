/** 分段輪詢經完整緩衝代理；只記錄時序、步驟與費用，不保存憑證。 */
const fs=require('node:fs/promises'),path=require('node:path'),{spawn}=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_CORE_PATH||'C:/Users/rdpuser/Documents/ChatGPT/KaosuKssKpiDemo/web/node_modules/playwright-core');
const root=process.cwd(),real=process.env.ISSUE47_REAL==='1',mode=real?'real':process.env.ISSUE47_MARKDOWN==='1'?'fixture-markdown':'fixture';
const dir=path.join(root,'.local/issue47-'+mode+(real?'':(process.env.FIXTURE_RUN||''))),out=path.join(root,'docs/design/issue47'),base='http://127.0.0.1:8071';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 await fs.mkdir(dir,{recursive:true});await fs.mkdir(out,{recursive:true});
 // 一次性鎖：真實模型禁止為了重拍而重新發問；模擬也要求新資料庫。
 const marker=await fs.open(path.join(dir,'started.lock'),'wx');await marker.close();
 const python=path.join(root,'.venv/Scripts/python.exe');
 const server=spawn(python,['tests/manual/issue47_server.py'],{env:{...process.env,ISSUE47_DB:path.join(dir,'business.db')},stdio:'pipe',windowsHide:true});
 const proxy=spawn(python,['tests/manual/issue47_buffer_proxy.py'],{stdio:'pipe',windowsHide:true});
 let browser,page,log='';server.stderr.on('data',b=>log+=b);proxy.stderr.on('data',b=>log+=b);
 try{
  let ready=false;for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok){ready=true;break;}}catch{}await pause(100);}if(!ready)throw Error('服務未就緒');
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'C:/Users/rdpuser/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe',headless:true});
  const c=await browser.newContext({viewport:{width:1366,height:768},colorScheme:'dark',recordVideo:{dir,size:{width:1366,height:768}}});
  await c.addInitScript(()=>{
   localStorage.setItem('kaosu-assistant:theme','dark');localStorage.setItem('kaosu-assistant:locale','zh-TW');
   window.observation={posts:0,batches:[],terminal:null,started:0,start_ms:null};const original=window.fetch.bind(window);
   window.fetch=async(input,options)=>{
    const url=String(input);if(url.endsWith('/messages/start')){window.observation={posts:window.observation.posts+1,batches:[],terminal:null,started:performance.now(),start_ms:null};}
    const r=await original(input,options);
    if(url.endsWith('/messages/start'))window.observation.start_ms=performance.now()-window.observation.started;
    if(url.includes('/events?')){const value=await r.clone().json();if(Array.isArray(value.events)){
     const safe=value.events.map(e=>({seq:e.seq,event:e.event,...(e.event==='step'?{id:e.data.id,label:e.data.label,status:e.data.status}:{}),...(e.event==='delta'?{text:e.data.text}:{})}));
     window.observation.batches.push({at_ms:performance.now()-window.observation.started,after:Number(new URL(url).searchParams.get('after')),events:safe,terminal:value.terminal});
     if(value.terminal)window.observation.terminal=value.events.at(-1)?.event;
    }}return r;
   };
  });
  const p=await c.newPage();page=p;p.setDefaultTimeout(20000);
  await c.request.post(base+'/api/session/demo',{data:{identity:'supervisor'}});
  await p.goto(base);await p.locator('button.launcher').click();await p.getByRole('button',{name:'放大聊天室',exact:true}).click();
  await p.locator('#entry-input').fill('唯讀查詢 MC37 的工單與人工報工數量，僅查詢，不新增或修改資料。');await p.locator('#entry-input').press('Enter');
  await p.locator('.processing-steps li').first().waitFor();await p.screenshot({path:path.join(out,mode+'-01-處理中.png')});
  await p.locator('.stream-reply').waitFor({timeout:180000});if(process.env.ISSUE47_MARKDOWN==='1')await p.locator('.stream-reply td').filter({hasText:'120'}).waitFor();await p.screenshot({path:path.join(out,mode+'-02-分段文字.png')});
  await p.waitForFunction(()=>window.observation.terminal,null,{timeout:180000});await p.waitForTimeout(700);
  await p.locator('#chat-input').waitFor();const toggles=p.locator('.steps-toggle');if(await toggles.last().getAttribute('aria-expanded')==='false')await toggles.last().click();
  await p.screenshot({path:path.join(out,mode+'-03-完成展開.png')});
  const result=await p.evaluate(()=>window.observation);if(real)result.evidence=await (await c.request.get(base+'/test-evidence')).json();
  await fs.writeFile(path.join(out,mode+'-到達時序.json'),JSON.stringify(result,null,2));
  if(!real&&process.env.ISSUE47_MARKDOWN!=='1'){
   // 第二則測試唯讀停止，僅模擬資料，正常速度等待真實伺服器片段。
   await p.locator('#chat-input').fill('唯讀查詢 MC37');await p.locator('#chat-input').press('Enter');await p.locator('.stream-reply').waitFor();
   await p.getByRole('button',{name:'停止等待',exact:true}).click();await p.waitForFunction(()=>window.observation.terminal==='stopped');await p.waitForTimeout(500);
   await p.screenshot({path:path.join(out,'fixture-04-唯讀停止.png')});await fs.writeFile(path.join(out,'fixture-停止時序.json'),JSON.stringify(await p.evaluate(()=>window.observation),null,2));
  }
  await p.waitForTimeout(700);const video=await p.video().path();await c.close();await fs.writeFile(path.join(dir,'video.txt'),video);
  const deltaBatches=result.batches.filter(b=>b.events.some(e=>e.event==='delta'));
  console.log(JSON.stringify({mode,terminal:result.terminal,start_ms:result.start_ms,batches:result.batches.length,delta_batches:deltaBatches.length,span_ms:deltaBatches.at(-1)?.at_ms-deltaBatches[0]?.at_ms,evidence:result.evidence}));
 }catch(error){if(page){await page.screenshot({path:path.join(dir,'失敗畫面.png')});await fs.writeFile(path.join(dir,'失敗內容.txt'),await page.locator('body').innerText());await fs.writeFile(path.join(dir,'失敗時序.json'),JSON.stringify(await page.evaluate(()=>window.observation),null,2));}throw error;}finally{if(browser)await browser.close();server.kill();proxy.kill();await fs.writeFile(path.join(dir,'server.log'),log);}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
