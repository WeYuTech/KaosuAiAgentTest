// 以無頭 Chromium 逐一切換 80 個情境，擷取產品外框（#ux-app）。用法：node capture-v2.cjs [寬度] [輸出資料夾] [情境ID...]
const fs=require('fs'),path=require('path');
const {chromium}=require(process.env.PLAYWRIGHT_CORE_PATH||'playwright-core');
const dir=__dirname,width=Number(process.argv[2]||1366),out=path.join(dir,process.argv[3]||'shots-'+width);
const only=process.argv.slice(4);
const scenes=require('./scenarios.json').filter(s=>!only.length||only.includes(s.id));
(async()=>{
  fs.mkdirSync(out,{recursive:true});
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true});
  const page=await browser.newPage({viewport:{width:width+32,height:900},deviceScaleFactor:1,colorScheme:'dark'});
  await page.goto('file:///'+path.join(dir,'reference.html').replace(/\\/g,'/'));
  const values=await page.$$eval('#ux-scene option',o=>o.map(x=>x.value));
  const problems=[];
  for(const s of scenes){
    const value=values.find(v=>v===s.key||v===s.id)??s.key;
    await page.selectOption('#ux-scene',value);
    await page.waitForTimeout(900);
    const app=await page.$('#ux-app');
    const check=await page.evaluate(()=>{const a=document.querySelector('#ux-app'),r=a.getBoundingClientRect();
      const over=[...a.querySelectorAll('*')].filter(e=>{const b=e.getBoundingClientRect();return b.width&&b.right>r.right+1&&getComputedStyle(e).position!=='fixed'}).length;
      return {w:Math.round(r.width),h:Math.round(r.height),overflowX:over,hasAppbar:!!a.querySelector('.ux-appbar'),hasCopy:!!a.querySelector('.ux-copyright'),hasUsage:!!a.querySelector('.ux-usage')};});
    if(check.overflowX||!check.hasAppbar||!check.hasCopy)problems.push({id:s.id,...check});
    await app.screenshot({path:path.join(out,`${s.id}-${s.key}.png`)});
  }
  await browser.close();
  console.log(JSON.stringify({width,count:scenes.length,problems}));
})();
