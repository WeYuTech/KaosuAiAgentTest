const {start,root,fixture,prepare}=require('./issue57-fixture.cjs');
const {compare}=require('./issue55-capture.cjs');
const fs=require('node:fs'),path=require('node:path');
const scenes=JSON.parse(fs.readFileSync(path.join(root,'docs/design/uiux-reference-v2/scenarios.json'),'utf8')).filter(s=>/^[FB]/.test(s.id));
const pairs=[['作業標題','.ux-sheet-head h2,.ux-wizard-inner>h2','.guide-phase h2,.awaiting-review .proposal-heading h2'],['目標摘要','.ux-target','.sheet-target'],['目標名稱','.ux-target strong','.sheet-target strong'],['目標品號','.ux-target small','.sheet-target small'],['良品標籤','.ux-form>.ux-field:has([data-input=good])','.report-entry-fields>.guide-field'],['良品輸入','[data-input=good]','#guide-ok'],['單位','.ux-input-unit>span','.guide-input-unit>span'],['不良標題','.ux-form>div>.ux-between:first-child','.defect-heading'],['不良列','.ux-defect-row','.guide-defect'],['原因欄位','[data-defect-reason]','.guide-defect select'],['數量欄位','[data-defect-quantity]','.guide-defect input'],['移除原因','[data-action=remove-defect]','.defect-remove'],['新增原因','[data-action=add-defect]','.defect-tools>button'],['沒有不良','.ux-check:has([data-none])','.no-defects'],['底部固定列','.ux-sheet-foot','.guide-navigation,.awaiting-review .proposal-actions'],['底部狀態','.ux-sheet-foot>small','.operation-sheet-status'],['主要按鈕','.ux-sheet-foot>.ux-button.primary','.guide-navigation>.primary'],['步驟列','.ux-steps','.operation-steps'],['步驟','.ux-step','.operation-steps>button']];
pairs.push(['核對列','.ux-review-row','.reference-review-row'],['核對標籤','.ux-review-row>span:first-child','.reference-review-row>span:first-child'],['核對值','.ux-review-value strong','.reference-review-value strong'],['核對原值','.ux-review-value del','.reference-review-value del'],['核對按鈕列','.ux-sheet-foot .ux-button','.guide-navigation button,.awaiting-review .proposal-actions button'],['精靈輸入','.ux-wizard-talk textarea','.step-wizard #chat-input']);
pairs.push(
 ['核對獨立確認','.ux-check:has([data-approval])','.independent-confirm'],
 ['核對明細','.ux-stack>details>summary','.awaiting-review>.proposal-details>summary'],
 ['核對期限','.ux-stack>small','.awaiting-review .expiry'],
 ['備註入口','.ux-form>details>summary','.report-entry-fields>details>summary,.schedule-advanced>summary'],
 ['模穴標籤','.ux-field:has([data-input=cavities])','.cavities-fields>.guide-field'],
 ['模穴輸入','[data-input=cavities]','#guide-cavities'],
 ['模穴原值','.ux-form>small','.cavities-fields>small'],
 ['模具說明','.ux-stack>p.ux-muted','.mold-stage-instruction'],
 ['模具階段','.ux-phase-item','.mold-stages li'],
 ['模具階段編號','.ux-phase-dot','.mold-stages li>b'],
 ['模具階段說明','.ux-phase-item small','.mold-stages small'],
 ['模具階段按鈕','.ux-phase-item button','.mold-stages button'],
 ['分配列','.ux-schedule-row','.schedule-allocation'],
 ['分配明細','.ux-schedule-row>.ux-field:first-child>select','.schedule-allocation>.guide-field:first-of-type>select'],
 ['分配工單','.ux-schedule-row>.ux-field:nth-child(2)>select','.schedule-allocation input[role=combobox]'],
 ['分配模穴','.ux-schedule-row>.ux-field:nth-child(3)>input','.schedule-allocation input[id$=cavities]'],
 ['分配移除','[data-action=schedule-remove-row]','.schedule-allocation>button'],
 ['新增分配','[data-action=schedule-row]','.schedule-allocations>button'],
 ['空白選取','.ux-empty','.picker-underlay'],
 ['作業對話輸入','.ux-work-chat textarea','.chat-sheet:not(.chat-only) #chat-input']
);
for(const [ref,product] of [['scheduleEquipment','guide-equipment'],['scheduleMold','guide-mold_no'],['schedulePart','guide-part_no'],['scheduleStart','guide-start_time'],['scheduleCycle','guide-cycle_seconds'],['scheduleShots','guide-target_shots'],['scheduleStatus','guide-status']])pairs.push(['排程欄位 '+ref,`[data-input=${ref}]`,`#${product}`]);
const props=['font-family','font-size','font-weight','line-height','letter-spacing','color'];
async function measure(page,selector){return page.locator(selector).evaluateAll((els,props)=>els.filter(el=>el.getBoundingClientRect().width&&el.getBoundingClientRect().height).map(el=>({rect:el.getBoundingClientRect().toJSON(),style:Object.fromEntries(props.map(p=>[p,getComputedStyle(el).getPropertyValue(p)]))})),props);}
(async()=>{const app=await start(),rows=[];const out=path.join(root,'docs/design/issue57');fs.mkdirSync(out,{recursive:true});try{
 for(const width of process.env.WIDTH?[Number(process.env.WIDTH)]:[1366,390]){
 const height=width===1366?768:810;
 const ref=await app.browser.newPage({viewport:{width,height},colorScheme:'dark'});
 await ref.goto('file:///'+path.join(root,'docs/design/uiux-reference-v2/reference.html').replaceAll('\\','/'));
 await ref.addStyleTag({content:'body{padding:0!important;margin:0!important}.ux-gallery{display:none!important}#ux-app{height:100vh!important;min-height:0!important}'});
 for(const scene of scenes){if(process.env.SCENE&&scene.id!==process.env.SCENE)continue;
 await ref.locator('#ux-scene').selectOption(scene.key,{force:true});await ref.waitForTimeout(300);
 const page=await app.browser.newPage({viewport:{width,height},colorScheme:'dark'});await fixture(page,scene.key);await page.goto(app.url+'/?embed=1');await page.locator('#entry-input').waitFor();await prepare(page,scene.key);await page.waitForTimeout(800);await page.locator('.conversation-scroll').evaluate(el=>el.scrollTop=0);await page.mouse.move(0,0);await page.locator('input').evaluateAll(es=>es.forEach(e=>e.blur()));await page.evaluate(()=>document.fonts.ready);
 const a=await ref.locator('#ux-app').screenshot(),b=await page.screenshot();const diff=await compare(page,a,b,width,height);fs.writeFileSync(path.join(out,`${width}-${scene.id}.png`),Buffer.from(diff.png,'base64'));
 const metrics=[];for(const [name,r,p] of pairs){const [rs,ps]=await Promise.all([measure(ref,r),measure(page,p)]);for(let i=0;i<Math.max(rs.length,ps.length);i++){if(!rs[i]||!ps[i]){metrics.push({name,index:i,missing:!rs[i]?'reference':'product'});continue;}metrics.push({name,index:i,reference:rs[i],product:ps[i],delta:Object.fromEntries(['x','y','width','height','bottom'].map(k=>[k,Math.abs(rs[i].rect[k]-ps[i].rect[k])])),differences:props.filter(k=>rs[i].style[k]!==ps[i].style[k])});}}
 rows.push({id:scene.id,width,height,ratio:diff.ratio,metrics});console.log(scene.id,width,diff.ratio.toFixed(2),metrics.filter(m=>m.missing||m.differences.length||Object.values(m.delta).some(d=>d>4)).map(m=>({name:m.name,index:m.index,delta:m.delta,differences:m.differences,missing:m.missing})));await page.close();
 }await ref.close();}
 fs.writeFileSync(path.join(out,process.env.SCENE?`量測-${process.env.SCENE}-${process.env.WIDTH||'all'}.json`:'量測.json'),JSON.stringify(rows,null,2));
 }finally{await app.close();}})().catch(e=>{console.error(e);process.exitCode=1});
