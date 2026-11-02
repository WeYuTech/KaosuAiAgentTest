const fs=require('fs');
const path=require('path');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');
const directory=__dirname, output=path.join(directory,'evidence');
const chrome=process.env.UX_REFERENCE_CHROME||'/workspace/scratch/a81174739f93/visualize-qa/chrome-headless-shell-linux64/chrome-headless-shell';
(async()=>{
  fs.mkdirSync(output,{recursive:true});
  const browser=await chromium.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const page=await browser.newPage({viewport:{width:1366,height:900},deviceScaleFactor:1,colorScheme:'dark'});
  const errors=[],requests=[],snapshots=[];
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url())});
  await page.route(/^https?:/,r=>r.abort());
  await page.goto('file://'+path.join(directory,'reference.html'));
  await page.locator('#ux-app .ux-home').waitFor();
  const scenes=await page.evaluate(()=>weyuUXReference.scenes);
  fs.writeFileSync(path.join(directory,'scenarios.json'),JSON.stringify(scenes,null,2));
  const select=['home','capabilities','loading','results','sheet-edit','sheet-review','wizard-edit','wizard-review','picker-selected','picker-ai','schedule-add','mold-down','unknown','preferences','delete-chat','schedule-report-create'];
  for(const key of select){
    await page.evaluate(key=>weyuUXReference.reset(key),key);
    await page.waitForTimeout(240);
    const name=key+'.png';
    await page.locator('#ux-app').screenshot({path:path.join(output,name)});
    snapshots.push({key,file:'evidence/'+name,viewport:{width:1366,height:900},app:await page.locator('#ux-app').boundingBox(),theme:'dark'});
  }
  await page.locator('#ux-theme').selectOption('light');
  await page.evaluate(()=>weyuUXReference.reset('sheet-edit'));
  await page.waitForTimeout(240);
  await page.locator('#ux-app').screenshot({path:path.join(output,'sheet-edit-light.png')});
  snapshots.push({key:'sheet-edit',file:'evidence/sheet-edit-light.png',viewport:{width:1366,height:900},app:await page.locator('#ux-app').boundingBox(),theme:'light'});
  await page.locator('#ux-theme').selectOption('dark');
  await page.setViewportSize({width:390,height:1000});
  for(const key of ['home','sheet-edit','picker-selected','wizard-review','delete-chat']){
    await page.evaluate(key=>weyuUXReference.reset(key),key);await page.waitForTimeout(220);
    await page.locator('#ux-app').screenshot({path:path.join(output,key+'-390.png')});
    snapshots.push({key,file:'evidence/'+key+'-390.png',viewport:{width:390,height:1000},app:await page.locator('#ux-app').boundingBox(),theme:'dark'});
  }
  const result={kind:'reference-only',scenes:scenes.length,errors,requests,snapshots};
  fs.writeFileSync(path.join(directory,'capture-results.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
  await browser.close();
  if(errors.length||requests.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exit(1)});
