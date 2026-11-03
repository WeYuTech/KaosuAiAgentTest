/** 真實模型三則煙霧；只保存步驟、時間與費用，不記錄憑證或 SSE intent token。 */
const fs=require('node:fs/promises'),path=require('node:path'),{spawn}=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_CORE_PATH||'C:/Users/rdpuser/Documents/ChatGPT/KaosuKssKpiDemo/web/node_modules/playwright-core');
const root=process.cwd(),dir=path.join(root,'.local/issue44-real'),out=path.join(root,'docs/design/issue44'),base='http://127.0.0.1:8066';
(async()=>{
 await fs.mkdir(dir,{recursive:true});
 // 存在即停止，防止重拍時不小心再花一次錢或超過三則。
 const marker=await fs.open(path.join(dir,'已啟動.lock'),'wx');await marker.close();
 const server=spawn(path.join(root,'.venv/Scripts/python.exe'),['tests/manual/issue44_real_server.py'],{env:{...process.env,ISSUE44_REAL_DB:path.join(dir,'business.db')},stdio:'pipe',windowsHide:true});
 let log='';server.stderr.on('data',b=>log+=b);let browser;const results=[],videos=[];
 const evidence=async()=>{const r=await fetch(base+'/test-evidence');return r.json();};
 try{
  for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,150));}
  const initial=await evidence();console.log('測試前帳本',initial);
  await fs.writeFile(path.join(dir,'測試前.json'),JSON.stringify(initial,null,2));
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'C:/Users/rdpuser/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe',headless:true});
  const messages=['唯讀查詢 MC37 的工單與人工報工數量。','新增人工報工：MC37，2026-10-30 08:10 開始的 WO-A／EPS-A，本次人工良品 100，缺料 2。請準備確認卡，尚不寫入。','唯讀查詢 MC37 的工單、人工報工與 IoT 數量，逐項說明差異。'];
  for(let i=0;i<messages.length;i++){
   const before=await evidence();if(before.budget.spent_usd+before.budget.reserved_usd-initial.budget.spent_usd-initial.budget.reserved_usd>=1)break;
   const c=await browser.newContext({viewport:{width:1366,height:768},colorScheme:'dark',recordVideo:{dir,size:{width:1366,height:768}}});const p=await c.newPage();p.setDefaultTimeout(20000);
   await c.addInitScript(()=>{
    localStorage.setItem('kaosu-assistant:theme','dark');localStorage.setItem('kaosu-assistant:locale','zh-TW');
    window.smoke={events:[],terminal:null,readonly:false,analysisAt:null};const original=window.fetch.bind(window);
    window.fetch=async(input,options)=>{const r=await original(input,options);if(String(input).endsWith('/messages/stream')){
     const start=performance.now();void (async()=>{const reader=r.clone().body.getReader(),decoder=new TextDecoder();let buffer='';
      while(true){const chunk=await reader.read();if(chunk.done)break;buffer+=decoder.decode(chunk.value,{stream:true});const blocks=buffer.split('\n\n');buffer=blocks.pop();
       for(const block of blocks){const kind=block.split('\n').find(l=>l.startsWith('event:'))?.slice(6).trim(),dataLine=block.split('\n').find(l=>l.startsWith('data:'));if(!dataLine)continue;const d=JSON.parse(dataLine.slice(5)),at=performance.now()-start;
        if(kind==='intent')window.smoke.readonly=d.readonly;
        if(kind==='step'){window.smoke.events.push({kind,at,id:d.id,label:d.label,status:d.status});if(d.status==='running'&&d.label==='分析需求')window.smoke.analysisAt=performance.now();}
        if(kind==='delta')window.smoke.events.push({kind,at,text:d.text});
        if(kind==='reset')window.smoke.events.push({kind,at});
        if(['done','stopped','error'].includes(kind)){window.smoke.terminal=kind;window.smoke.events.push({kind,at});}
       }
      }
     })().catch(()=>{window.smoke.readError=true;});
    }return r;};
   });
   await c.request.post(base+'/api/session/demo',{data:{identity:'supervisor'}});await p.goto(base);await p.locator('button.launcher').click();await p.getByRole('button',{name:'放大聊天室',exact:true}).click();
   await p.locator('#entry-input').fill(messages[i]);await p.locator('#entry-input').press('Enter');let note='';
   try{
    if(i===2){await p.waitForFunction(()=>window.smoke.terminal||window.smoke.readonly&&window.smoke.analysisAt&&performance.now()-window.smoke.analysisAt>1500,{},{timeout:180000});
     if(!await p.evaluate(()=>window.smoke.terminal)){await p.getByRole('button',{name:'停止等待',exact:true}).click();note='唯讀模型分析開始 1.5 秒後按停止';}else note='按停止前已終止，未假稱測到停止';}
    await p.waitForFunction(()=>window.smoke.terminal,{},{timeout:180000});await p.waitForTimeout(1800);
   }catch{note+='；等待未達預期，未重送';}
   const record=await p.evaluate(()=>window.smoke);const after=await evidence();
   const deltas=record.events.filter(e=>e.kind==='delta'),steps=Object.values(Object.fromEntries(record.events.filter(e=>e.kind==='step').map(e=>[e.id,e])));
   const result={number:i+1,message:messages[i],note,terminal:record.terminal,delta_count:deltas.length,delta_span_ms:deltas.length?deltas.at(-1).at-deltas[0].at:null,steps,before:before.budget,after:after.budget,business_unchanged:after.business_unchanged};
   const toggles=p.locator('.steps-toggle');if(await toggles.count()&&await toggles.last().getAttribute('aria-expanded')==='false')await toggles.last().click();
   await p.mouse.move(0,0);await p.waitForTimeout(300);await p.screenshot({path:path.join(out,`真實模型-${i+1}.png`)});
   result.screen_text=await p.locator('body').innerText();results.push(result);
   await fs.writeFile(path.join(dir,'結果.json'),JSON.stringify(results,null,2));console.log('訊息完成',i+1,record.terminal,'delta',deltas.length,'費用',after.budget);
   videos.push(await p.video().path());await c.close();
   if(!record.terminal||!after.business_unchanged)break;
  }
  await fs.writeFile(path.join(dir,'錄影來源.txt'),videos.join('\n'));
 }finally{if(browser)await browser.close();server.kill();await fs.writeFile(path.join(dir,'server.log'),log);}
})().catch(e=>{console.error('煙霧測試未完成：',e.message);process.exitCode=1;});
