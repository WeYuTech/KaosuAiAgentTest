const {visibleText,compareText}=require('./visible-text.cjs');
const {start,root,fixture,prepare}=require('./issue58-fixture.cjs');
const {compare}=require('./issue55-capture.cjs');
const fs=require('node:fs'),path=require('node:path');
const scenes=JSON.parse(fs.readFileSync(path.join(root,'docs/design/uiux-reference-v2/scenarios.json'),'utf8')).filter(s=>/^[WX]/.test(s.id));
const pairs=[['作業標題','.ux-sheet-head h2,.ux-wizard-inner>h2','.guide-phase h2,.awaiting-review .proposal-heading h2'],['目標摘要','.ux-target','.sheet-target'],['目標名稱','.ux-target strong','.sheet-target strong'],['目標品號','.ux-target small','.sheet-target small'],['良品標籤','.ux-form>.ux-field:has([data-input=good])','.report-entry-fields>.guide-field'],['良品輸入','[data-input=good]','#guide-ok'],['單位','.ux-input-unit>span','.guide-input-unit>span'],['不良標題','.ux-form>div>.ux-between:first-child','.defect-heading'],['不良列','.ux-defect-row','.guide-defect'],['原因欄位','[data-defect-reason]','.guide-defect select'],['數量欄位','[data-defect-quantity]','.guide-defect input'],['移除原因','[data-action=remove-defect]','.defect-remove'],['新增原因','[data-action=add-defect]','.defect-tools>button'],['沒有不良','.ux-check:has([data-none])','.no-defects'],['底部固定列','.ux-sheet-foot','.guide-navigation,.awaiting-review .proposal-actions,.result-footer'],['底部狀態','.ux-sheet-foot>small','.operation-sheet-status'],['主要按鈕','.ux-sheet-foot>.ux-button.primary','.guide-navigation>.primary'],['步驟列','.ux-steps','.operation-steps'],['步驟','.ux-step','.operation-steps>button']];
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
 ['模具階段按鈕','.ux-phase-item button','.mold-stages button',true],
 ['清除入口','.ux-mold-clear>button','.mold-clear-action>button',true],
 ['清除停用原因','.ux-mold-clear>small','.mold-clear-action>small'],
 ['查詢歷史入口','.ux-mold-clear>div>button','.mold-history-action>button',true],
 ['分配列','.ux-schedule-row','.schedule-allocation'],
 ['分配明細','.ux-schedule-row>.ux-field:first-child>select','.schedule-allocation>.guide-field:first-of-type>select'],
 ['分配工單','.ux-schedule-row>.ux-field:nth-child(2)>select','.schedule-allocation input[role=combobox]'],
 ['分配模穴','.ux-schedule-row>.ux-field:nth-child(3)>input','.schedule-allocation input[id$=cavities]'],
 ['分配移除','[data-action=schedule-remove-row]','.schedule-allocation>button'],
 ['新增分配','[data-action=schedule-row]','.schedule-allocations>button'],
 ['空白選取','.ux-empty','.picker-underlay,.operation-receipt'],['空白圖示','.ux-empty>svg','.picker-underlay>svg,.operation-receipt>svg'],
 ['作業對話輸入','.ux-work-chat textarea','.chat-sheet:not(.chat-only) #chat-input']
);
for(const [ref,product] of [['scheduleEquipment','guide-equipment'],['scheduleMold','guide-mold_no'],['schedulePart','guide-part_no'],['scheduleStart','guide-start_time'],['scheduleCycle','guide-cycle_seconds'],['scheduleShots','guide-target_shots'],['scheduleStatus','guide-status']])pairs.push(['排程欄位 '+ref,`[data-input=${ref}]`,`#${product}`]);
pairs.push(['狀態提示','.ux-notice','.operation-status-notice'],['提示標題','.ux-notice>div','.operation-status-notice>div'],['提示說明','.ux-notice small','.operation-status-notice small'],['儲存重試／版本入口','[data-action=retry-save],.ux-sheet-scroll [data-action=refresh-preview]','.draft-recovery>button'],['欄位驗證','.ux-error-text','.field-error'],['送出狀態列','.ux-live','.operation-status-live'],['結果標題','.ux-empty h3','.operation-receipt h3'],['結果說明','.ux-empty p','.operation-receipt>p'],['結果動作','.ux-empty button','.operation-receipt button'],['操作資訊','.ux-empty summary','.operation-receipt summary'],['結果附註','.ux-empty>small','.operation-receipt>small'],['連線狀態','.ux-session','.connection-state'],['系統標題','.ux-session h2','.connection-state h2'],['系統說明','.ux-session p','.connection-state p'],['系統按鈕','.ux-session button','.connection-state button'],['狀態彈窗','.ux-dialog','.status-dialog'],['彈窗標題','.ux-dialog h2','.status-dialog h2'],['彈窗內容','.ux-dialog-body','.status-dialog .operation-dialog-body'],['彈窗動作','.ux-dialog-foot button','.status-dialog .operation-dialog-footer button']);
pairs.push(['提示圖示','.ux-notice>svg','.operation-status-notice>svg'],['送出轉圈','.ux-live svg','.operation-status-live svg'],['彈窗關閉','.ux-dialog-head>button','.status-dialog .operation-dialog-header>button',true],['結果按鈕停用','.ux-empty button','.operation-receipt button',true],['核對按鈕停用','.ux-sheet-foot button','.proposal-actions button,.guide-navigation button',true]);
const props=['font-family','font-size','font-weight','line-height','letter-spacing','color','opacity','cursor'];
pairs.push(['作業名稱','.ux-top-title>span:first-of-type','.workspace-bar h1'],['品牌名稱','.ux-appbrand span','.assistant-header h2'],['側欄項目','.ux-history-row>button:first-child','.history-select']);
pairs.push(['用量標籤','.ux-usage-row>span:first-child','.sidebar-budget>span>strong'],['用量數字','.ux-usage-row>span:last-child','.sidebar-budget>span:first-child>span']);
async function measure(page,selector,interaction=false,scroll=false){return page.locator(selector).evaluateAll((els,{props,interaction,scroll})=>els.filter(el=>el.getBoundingClientRect().width&&el.getBoundingClientRect().height).map(el=>{
 const ancestors=[];for(let p=el.parentElement;p;p=p.parentElement)if(p.scrollHeight>p.clientHeight&&['auto','scroll'].includes(getComputedStyle(p).overflowY))ancestors.push(p);
 if(scroll){for(const p of ancestors)p.scrollTop=0;el.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});}
 return {disabled:interaction&&el.matches('button')?el.disabled:null,rect:el.getBoundingClientRect().toJSON(),scroll:ancestors.map(p=>({selector:p.className,top:p.scrollTop,height:p.clientHeight})),style:Object.fromEntries(props.filter(p=>interaction||!['opacity','cursor'].includes(p)).map(p=>[p,getComputedStyle(el).getPropertyValue(p)]))};}),{props,interaction,scroll});}
function metric(name,index,a,b,phase){if(!a||!b)return {name,index,phase,missing:!a?'reference':'product'};return {name,index,phase,reference:a,product:b,delta:Object.fromEntries(['x','y','width','height','bottom'].map(k=>[k,Math.abs(a.rect[k]-b.rect[k])])),differences:[...props.filter(k=>a.style[k]!==b.style[k]),...(a.disabled!==null&&b.disabled!==null&&a.disabled!==b.disabled?['disabled']:[])]};}

(async()=>{const app=await start(),rows=[];const out=path.join(root,'docs/design/issue58');fs.mkdirSync(out,{recursive:true});try{
 for(const width of process.env.WIDTH?[Number(process.env.WIDTH)]:[1366,390]){
 const height=width===1366?768:810;
 const ref=await app.browser.newPage({viewport:{width,height},colorScheme:'dark'});
 await ref.goto('file:///'+path.join(root,'docs/design/uiux-reference-v2/reference.html').replaceAll('\\','/'));
 await ref.addStyleTag({content:'body{padding:0!important;margin:0!important}.ux-gallery{display:none!important}#ux-app{height:100vh!important;min-height:0!important}'});
 for(const scene of scenes){if(process.env.SCENE&&scene.id!==process.env.SCENE)continue;
 await ref.locator('#ux-scene').selectOption(scene.key,{force:true});await ref.waitForTimeout(300);
 const page=await app.browser.newPage({viewport:{width,height},colorScheme:'dark'});const context=await fixture(page,scene.key);await page.goto(app.url+'/?embed=1');await prepare(page,context);await page.waitForTimeout(800);await page.locator('.conversation-scroll').evaluateAll(es=>es.forEach(el=>el.scrollTop=0));await page.mouse.move(0,0);await page.locator('input').evaluateAll(es=>es.forEach(e=>e.blur()));await page.evaluate(()=>document.fonts.ready);
 const a=await ref.locator('#ux-app').screenshot(),b=await page.screenshot();const diff=await compare(page,a,b,width,height);fs.writeFileSync(path.join(out,`${width}-${scene.id}.png`),Buffer.from(diff.png,'base64'));
 const metrics=[];for(const phase of ['初始','捲動可見'])for(const [name,r,p,interaction] of pairs){const [rs,ps]=await Promise.all([measure(ref,r,interaction,phase==='捲動可見'),measure(page,p,interaction,phase==='捲動可見')]);for(let i=0;i<Math.max(rs.length,ps.length);i++)metrics.push(metric(name,i,rs[i],ps[i],phase));}

 const groups=[['標題','.ux-sheet-head h2,.ux-wizard-inner>h2','.guide-phase h2,.awaiting-review .proposal-heading h2'],['狀態','.ux-sheet-head .ux-tag','.awaiting-review .proposal-heading small'],['內容','.ux-sheet-scroll,.ux-wizard-inner','.operation-primary'],['步驟','.ux-steps','.operation-steps'],['動作','.ux-sheet-foot','.guide-navigation,.awaiting-review .proposal-actions,.result-footer'],['系統','.ux-session','.connection-state'],['彈窗','.ux-dialog','.status-dialog']]; const text={groups:await Promise.all(groups.map(async([name,r,p])=>({name,...compareText(await visibleText(ref,r,name==='內容'?'h2':''),await visibleText(page,p,name==='內容'?'.guide-phase,.proposal-heading,.operation-steps,.guide-navigation,.proposal-actions':''))})))}; text.consistent=text.groups.every(g=>g.consistent); rows.push({id:scene.id,width,height,ratio:diff.ratio,metrics,text,requests:context.calls.filter(c=>/confirm|reconcile|guide/.test(c.path))}); if(!text.consistent)console.log('文字差異',scene.id,JSON.stringify(text));console.log(scene.id,width,diff.ratio.toFixed(2),metrics.filter(m=>m.missing||m.differences.length||Object.values(m.delta).some(d=>d>4)).map(m=>({name:m.name,index:m.index,delta:m.delta,differences:m.differences,missing:m.missing})));await page.close();
 }await ref.close();}
 fs.writeFileSync(path.join(out,process.env.SCENE?`量測-${process.env.SCENE}-${process.env.WIDTH||'all'}.json`:'量測.json'),JSON.stringify(rows,null,2));
 }finally{await app.close();}})().catch(e=>{console.error(e);process.exitCode=1});
