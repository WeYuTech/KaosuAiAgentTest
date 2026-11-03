// 同資料、同尺寸的公開 HTTP fixture 驗收。像素差異由瀏覽器 Canvas 計算，未增加套件。
const {start,fixture,root,messages}=require('./issue55-fixture.cjs');
const fs=require('node:fs'),path=require('node:path');
const out=path.join(root,'docs/design/issue55');fs.mkdirSync(out,{recursive:true});
const scenes=JSON.parse(fs.readFileSync(path.join(root,'docs/design/uiux-reference-v2/scenarios.json'),'utf8')).filter(s=>/^[HNC]/.test(s.id));
const selectors=['.assistant-header','.conversation-history','.reference-title-row','[data-slot=aui_composer-shell]','.entry-grid','.assistant-copyright','.history-search-dialog,.history-dialog'];
async function prepare(page,scene){
 if(!['home','sidebar-empty','unconfigured'].includes(scene.key)){
  await page.locator('#entry-input').fill((messages[scene.key]||messages.capabilities)[0]);await page.locator('#entry-input').press('Enter');
  if(scene.key==='message-unknown')await page.getByText('訊息是否送達，尚未確認',{exact:true}).waitFor();
  else await page.locator('.entry-message.assistant').waitFor();
 }
 if(['search','history-empty','history-loading','history-error','rename','delete-chat','archives','deleted'].includes(scene.key)){
  if(await page.locator('.conversation-history').isHidden())await page.getByRole('button',{name:'展開側欄',exact:true}).click();
  if(['archives','deleted'].includes(scene.key)){
   await page.getByRole('button',{name:'更多功能',exact:true}).click();await page.getByRole('menuitem',{name:scene.key==='archives'?'封存聊天':'已刪除聊天',exact:true}).click();
  }else if(['rename','delete-chat'].includes(scene.key)){
   await page.getByRole('button',{name:'聊天室選單：MC37 今日生產',exact:true}).click();await page.getByRole('menuitem',{name:scene.key==='rename'?'重新命名':'刪除聊天',exact:true}).click();
  }else if(scene.key!=='sidebar'){
   await page.getByRole('button',{name:'搜尋聊天',exact:true}).click();
   if(scene.key.startsWith('history-'))await page.locator('input[aria-label="搜尋聊天"]').fill('MC99');
  }
 }
 if(scene.key==='long-reply')await page.locator('.entry-transcript').evaluate(el=>el.scrollTop=0);
 await page.waitForTimeout(scene.key==='history-loading'?250:400);
}
async function compare(page,a,b,width,height){return page.evaluate(async({a,b,width,height})=>{
 const load=async src=>{const img=new Image;img.src=src;await img.decode();return img;};
 const [left,middle]=await Promise.all([load(a),load(b)]);const c=document.createElement('canvas');c.width=width;c.height=height;const ctx=c.getContext('2d');ctx.drawImage(left,0,0);const x=ctx.getImageData(0,0,width,height);ctx.clearRect(0,0,width,height);ctx.drawImage(middle,0,0);const y=ctx.getImageData(0,0,width,height);let changed=0;
 for(let i=0;i<x.data.length;i+=4){const delta=Math.max(...[0,1,2].map(n=>Math.abs(x.data[i+n]-y.data[i+n])));if(delta>16){changed++;y.data[i]=255;y.data[i+1]=55;y.data[i+2]=120;}else{for(let n=0;n<3;n++)y.data[i+n]=Math.round(y.data[i+n]*.55);}}
 ctx.putImageData(y,0,0);const strip=document.createElement('canvas');strip.width=width*3;strip.height=height+30;const g=strip.getContext('2d');g.fillStyle='#101010';g.fillRect(0,0,strip.width,strip.height);g.fillStyle='#fff';g.font='14px sans-serif';['範例 v2','正式 React／HTTP fixture','差異疊圖：紅色超過 16 色階'].forEach((label,i)=>g.fillText(label,i*width+12,20));g.drawImage(left,0,30);g.drawImage(middle,width,30);g.drawImage(c,width*2,30);return {ratio:changed/(width*height)*100,png:strip.toDataURL('image/png').split(',')[1]};
},{a:'data:image/png;base64,'+a.toString('base64'),b:'data:image/png;base64,'+b.toString('base64'),width,height});}
(async()=>{const app=await start();const table=[];try{
 for(const width of [1366,390]){const height=width===1366?768:810;
  const ref=await app.browser.newPage({viewport:{width,height},colorScheme:'dark'});await ref.goto('file:///'+path.join(root,'docs/design/uiux-reference-v2/reference.html').replaceAll('\\','/'));
  // 只移除範例控制列與宿主留白；產品內所有排版保持原樣。
  await ref.addStyleTag({content:'body{padding:0!important;margin:0!important}.ux-gallery{display:none!important}#ux-app{height:100vh!important;min-height:0!important}'});
  for(const scene of scenes){
   if(process.env.SCENE&&scene.id!==process.env.SCENE)continue;
   await ref.locator('#ux-scene').selectOption(scene.key,{force:true});await ref.waitForTimeout(250);
   const page=await app.browser.newPage({viewport:{width,height},colorScheme:'dark'});await fixture(page,scene.key);await page.goto(app.url+'/?embed=1');await page.locator('#entry-input').waitFor();await prepare(page,scene);
   const a=await ref.locator('#ux-app').screenshot(),b=await page.screenshot();const diff=await compare(page,a,b,width,height);
   fs.writeFileSync(path.join(out,`${width}-${scene.id}.png`),Buffer.from(diff.png,'base64'));
   const rects=await page.evaluate(selectors=>selectors.map(selector=>{const el=document.querySelector(selector);const r=el?.getBoundingClientRect();return {selector,rect:r?.toJSON()};}),selectors);
   table.push({width,height,id:scene.id,label:scene.label,ratio:diff.ratio,rects});console.log(width,scene.id,diff.ratio.toFixed(2)+'%');await page.close();
  }await ref.close();
 }
 fs.writeFileSync(path.join(out,'量測.json'),JSON.stringify(table,null,2));
}finally{await app.close();}})().catch(e=>{console.error(e);process.exitCode=1});
