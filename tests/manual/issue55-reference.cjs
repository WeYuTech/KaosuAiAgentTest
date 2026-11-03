// #55：以真正點按取得範例狀態與量測；不連線 MES。
const {chromium}=require('C:/Users/rdpuser/Documents/ChatGPT/KaosuKssKpiDemo/web/node_modules/playwright-core');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
const output=path.join(root,'.local/issue55-reference');fs.mkdirSync(output,{recursive:true});
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Users/rdpuser/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1398,height:900},colorScheme:'dark'});
  await page.goto('file:///'+path.join(root,'docs/design/uiux-reference-v2/reference.html').replaceAll('\\','/'));
  await page.locator('#ux-app textarea').fill('你能幫我做什麼？');
  await page.locator('#ux-app textarea').press('Enter');
  await page.getByRole('button',{name:'搜尋聊天',exact:true}).click();
  await page.getByRole('dialog').waitFor();
  await page.keyboard.press('Escape');
  const scenes=JSON.parse(fs.readFileSync(path.join(root,'docs/design/uiux-reference-v2/scenarios.json'),'utf8')).filter(s=>/^[HNC]/.test(s.id));
  const all={};
  for(const width of [1366,390]){
   await page.setViewportSize({width:width+32,height:900});
   for(const scene of scenes){
    await page.locator('#ux-scene').selectOption(scene.key);await page.waitForTimeout(250);
    all[width+'-'+scene.id]=await page.locator('#ux-app').evaluate(app=>{const base=app.getBoundingClientRect();return {size:{width:base.width,height:base.height},elements:[...app.querySelectorAll('.ux-appbar,.ux-appbrand,.ux-side,.ux-side-top,.ux-side-list,.ux-top,.ux-home,.ux-compose,.ux-quick,.ux-copyright,.ux-dialog,.ux-message,.ux-composer-wrap')].map(el=>{const r=el.getBoundingClientRect(),c=getComputedStyle(el);return {class:el.className,x:r.x-base.x,y:r.y-base.y,w:r.width,h:r.height,font:c.fontFamily,size:c.fontSize,text:el.textContent.slice(0,160)}})}});
    await page.locator('#ux-app').screenshot({path:path.join(output,width+'-'+scene.id+'.png')});
   }
  }
  fs.writeFileSync(path.join(output,'geometry.json'),JSON.stringify(all,null,2));console.log('範例點按及 34 張量測完成');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
