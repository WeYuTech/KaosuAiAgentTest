const {start,root,fixture,prepare}=require('./issue56-fixture.cjs');
const {compare}=require('./issue55-capture.cjs');
const fs=require('node:fs'),path=require('node:path');
const scenes=JSON.parse(fs.readFileSync(path.join(root,'docs/design/uiux-reference-v2/scenarios.json'),'utf8')).filter(s=>/^[QP]/.test(s.id));
const pairs=[['標題','.ux-top-title>span','.workspace-bar h1'],['訊息','.ux-message.assistant>p','[data-slot=aui_assistant-message-root] .aui-md p'],['結果表格','.ux-result','.chat-query-results'],['結果表頭','.ux-result th','.query-result-table th'],['結果列','.ux-result tbody>tr','.query-result-table tbody>tr'],['結果儲存格','.ux-result td','.query-result-table td'],['彈窗','.ux-dialog','.target-picker-dialog'],['彈窗標題','.ux-dialog-head h2','.target-picker-dialog .operation-dialog-header h2'],['搜尋列','.ux-filterbar','.reference-picker-filters'],['篩選標籤','.ux-filterbar label','.reference-picker-filters>label'],['篩選輸入','.ux-filterbar input','.reference-picker-filters>label input'],['候選列','.ux-pick-table tbody>tr','.reference-pick-table tbody>tr'],['候選儲存格','.ux-pick-table td','.reference-pick-table td'],['分頁','.ux-pick-table .ux-pagination','.picker-pagination'],['暫選','.ux-selection-status','.picker-selection'],['底部按鈕','.ux-dialog-foot>.ux-button','.picker-actions>button']];
const props=['font-family','font-size','font-weight','line-height','letter-spacing','color'];
async function measure(page,selector){return page.locator(selector).evaluateAll((els,props)=>els.filter(el=>el.getBoundingClientRect().width&&el.getBoundingClientRect().height).map(el=>({rect:el.getBoundingClientRect().toJSON(),style:Object.fromEntries(props.map(p=>[p,getComputedStyle(el).getPropertyValue(p)]))})),props);}
(async()=>{const app=await start(),rows=[];const out=path.join(root,'docs/design/issue56');fs.mkdirSync(out,{recursive:true});try{
 for(const width of process.env.WIDTH?[Number(process.env.WIDTH)]:[1366,390]){
 const height=width===1366?768:810;
 const ref=await app.browser.newPage({viewport:{width,height},colorScheme:'dark'});
 await ref.goto('file:///'+path.join(root,'docs/design/uiux-reference-v2/reference.html').replaceAll('\\','/'));
 await ref.addStyleTag({content:'body{padding:0!important;margin:0!important}.ux-gallery{display:none!important}#ux-app{height:100vh!important;min-height:0!important}'});
 for(const scene of scenes){if(process.env.SCENE&&scene.id!==process.env.SCENE)continue;
 await ref.locator('#ux-scene').selectOption(scene.key,{force:true});await ref.waitForTimeout(300);
 const page=await app.browser.newPage({viewport:{width,height},colorScheme:'dark'});await fixture(page,scene.key);await page.goto(app.url+'/?embed=1');await page.locator('#entry-input').waitFor();await prepare(page,scene.key);await page.waitForTimeout(400);await page.locator('.conversation-scroll').evaluate(el=>el.scrollTop=0);await page.mouse.move(0,0);await page.evaluate(()=>document.fonts.ready);
 const a=await ref.locator('#ux-app').screenshot(),b=await page.screenshot();const diff=await compare(page,a,b,width,height);fs.writeFileSync(path.join(out,`${width}-${scene.id}.png`),Buffer.from(diff.png,'base64'));
 const metrics=[];for(const [name,r,p] of pairs){const [rs,ps]=await Promise.all([measure(ref,r),measure(page,p)]);for(let i=0;i<Math.max(rs.length,ps.length);i++){if(!rs[i]||!ps[i]){metrics.push({name,index:i,missing:!rs[i]?'reference':'product'});continue;}metrics.push({name,index:i,reference:rs[i],product:ps[i],delta:Object.fromEntries(['x','y','width','height'].map(k=>[k,Math.abs(rs[i].rect[k]-ps[i].rect[k])])),differences:props.filter(k=>rs[i].style[k]!==ps[i].style[k])});}}
 rows.push({id:scene.id,width,height,ratio:diff.ratio,metrics});console.log(scene.id,width,diff.ratio.toFixed(2),metrics.filter(m=>m.missing||m.differences.length||Object.values(m.delta).some(d=>d>4)).map(m=>({name:m.name,index:m.index,delta:m.delta,differences:m.differences,missing:m.missing})));await page.close();
 }await ref.close();}
 fs.writeFileSync(path.join(out,process.env.SCENE?`量測-${process.env.SCENE}-${process.env.WIDTH||'all'}.json`:'量測.json'),JSON.stringify(rows,null,2));
 }finally{await app.close();}})().catch(e=>{console.error(e);process.exitCode=1});

