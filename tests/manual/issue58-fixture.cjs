// 狀態全部透過 HTTP 回應與實際操作觸發；不向產品注入畫面狀態。
const {start,root,fixture:base,prepare:basePrepare}=require('./issue57-fixture.cjs');
async function fixture(page,scene){
 const review=['expired','submitting','success','rejected','unknown','write-disabled'].includes(scene);
 const context={scene,baseScene:review?'sheet-review':'sheet-edit',release:null,fail:true,calls:[],changes:[{table:'fixture_only',key:'fixture-report',field:'OK_QTY',before:null,after:125},{table:'fixture_only',key:'fixture-report',field:'NG_QTY',before:null,after:3}]};
 let status='pending';
 const baseFixture=await base(page,context.baseScene,{args:['saving','save-error','conflict'].includes(scene)?{ok:124}:undefined,proposal:{writes_enabled:scene!=='write-disabled'},request:async({route,p,body,proposal,guide,work,setGuide})=>{
  context.calls.push({path:p,method:route.request().method(),body});
  const send=(json,status=200)=>route.fulfill({json,status});
  if(scene==='connecting'&&(p==='/api/health'||p==='/api/session')){await new Promise(resolve=>context.release=resolve);return true;}
  if(['session','permission'].includes(scene)){
   if(p==='/api/health'){await send({mode:'live',status:'ok',model_configured:true,business_timezone:'UTC+07:00'});return true;}
   if(p==='/api/session'){await send({detail:'fixture 登入狀態'},scene==='permission'?403:401);return true;}
  }
  if(p.endsWith('/guide')&&body){
   if(scene==='saving'&&context.fail){await new Promise(resolve=>context.release=resolve);await send({...guide,...body,version:guide.version+1});return true;}
   if(scene==='save-error'&&context.fail){await send({detail:'fixture 儲存暫時失敗'},503);return true;}
   if(scene==='conflict'&&context.fail){setGuide({...guide,version:guide.version+1,args:{...guide.args,ok:120}});await send({detail:'fixture 版本已變更'},409);return true;}
  }
  if(p.endsWith('/confirm')){
   if(scene==='submitting')await new Promise(resolve=>context.release=resolve);
   if(scene==='unknown'){status='unknown';await route.abort('failed');return true;}
   if(scene==='rejected'){await send({detail:'工單狀態已變更，請更新資料後重試。'},409);return true;}
   status=body.approved?'succeeded':'cancelled';await send({status,proposal:{...proposal,status},changes:context.changes,message:'fixture 已完成'});return true;
  }
  if(p.startsWith('/api/proposals/')){await send({status,proposal:{...proposal,status},...(status==='succeeded'?{changes:context.changes}:{})});return true;}
  return false;
 }});
 context.allCalls=baseFixture.calls;
 if(scene==='panel-error')await page.route('**/assets/ManagementPanel-*.js',route=>route.abort('failed'));
 return context;
}
async function prepare(page,context){
 const {scene}=context;
 if(['connecting','session','permission'].includes(scene)){await page.locator('.connection-state').waitFor();await page.locator('.header-tools button').nth(1).click();return;}
 await basePrepare(page,context.baseScene);
 if(['saving','save-error','conflict'].includes(scene)){await page.locator('#guide-ok').fill('125');await page.waitForTimeout(900);}
 if(scene==='validation'){await page.locator('#guide-ok').fill('');await page.getByRole('button',{name:'核對內容',exact:true}).click();}
 if(scene==='expired'){await page.clock.setFixedTime(new Date('2026-11-02T10:01:00+07:00'));await page.waitForTimeout(1100);}
 if(['submitting','success','rejected','unknown'].includes(scene)){await page.getByRole('button',{name:'確認送出',exact:true}).click();await page.waitForTimeout(450);}
 if(scene==='panel-error'){await page.locator('.header-tools button').nth(2).click();await page.getByRole('menuitem',{name:'API 設定',exact:true}).click();await page.getByRole('dialog',{name:'載入功能',exact:true}).waitFor();}
 if(scene==='recover-operation')await page.evaluate(()=>{const key=Object.keys(localStorage).find(k=>k.startsWith('kaosu-assistant:conversation:')&&!k.includes(':submission'));if(!key)throw Error('缺少原作業記憶');localStorage.setItem(key+':submission:fixture-other',JSON.stringify({conversation:'fixture-original',proposal:'fixture-original-proposal'}));window.dispatchEvent(new Event('focus'));});
 await page.waitForTimeout(300);
}
module.exports={start,root,fixture,prepare};
