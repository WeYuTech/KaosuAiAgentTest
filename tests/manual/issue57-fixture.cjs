// 第三段公開 HTTP 視覺 fixture；所有示意資料僅存在測試程式。
const {start,fixture:base,root,records:chats}=require('./issue55-fixture.cjs');
const fs=require('node:fs'),path=require('node:path');
const target={WIP_OPI_WDOEACICO_HIST_SID:'e1',ZZ_KAOSU_PROD_SCHEDULE_SID:'s1',EQP_NO:'MC37',WO:'WO-261102-0382',PART_NO:'P-102',PART_SPEC:'外殼',TOL_NO:'M-102',OPI_CAV:2,COMPLETED:'N',PRODUCTION_STATUS:'RUN',REPORTS:[]};
const workspace={records:[target],catalogs:{defect_reasons:[{NG_CODE_NO:'NG01',NG_CODE_NAME:'刮傷'},{NG_CODE_NO:'NG02',NG_CODE_NAME:'毛邊'},{NG_CODE_NO:'NG03',NG_CODE_NAME:'缺料'}]},total:1,page:1,page_size:4};
async function fixture(page,scene,options={}){
 await base(page);await page.addInitScript(mode=>localStorage.setItem('mes-operation-view:v1:simulation:fixture-operator',JSON.stringify({version:1,mode})),scene.startsWith('wizard')?'step-wizard':'chat-sheet');
 const module=scene.startsWith('schedule')?'schedule':scene.startsWith('mold')?'mold':'report';
 const review=scene.endsWith('review')||['report-update','report-delete','complete','schedule-edit','mold-down','mold-clear'].includes(scene);
 const action=({'report-update':'report.update','report-delete':'report.delete',complete:'report.complete',cavities:'report.cavities','schedule-add':'schedule.save','schedule-edit':'schedule.save','mold-phases':'','mold-down':'mold.unmount_finish','mold-clear':'mold.clear'})[scene]??'report.add';
 const empty=scene.endsWith('empty')||scene.endsWith('select');
 const record={...target,REPORTS:[{WIP_OPI_WDOEACICOOUTPUT_HIST_SID:'r1',REPORT_NO:'RPT-0382-01',CREATE_TIME:'2026-11-02 09:10',OK_QTY:120,NG_QTY:3,DEFECTS:[{NG_CODE:'NG01',NG_CODE_QTY:3}]}],EXECUTIONS:[{...target}],NEXT_ACTION:'mold.mount_start'};
 let args=empty?{}:{execution_id:'e1',ok:125,defects:[{code:'NG01',quantity:3}]};
 if(scene==='report-multiple')args.defects.push({code:'NG02',quantity:2});
 if(action==='report.update'||action==='report.delete')args={...args,report_id:'r1'};
 if(action==='report.cavities')args={execution_id:'e1',cavities:4};
 if(module==='schedule')args={...(scene==='schedule-edit'?{schedule_id:'s1'}:{}),equipment:'MC37',mold_no:'M-102',part_no:'P-102',start_time:'2026-11-02T08:00',cycle_seconds:30,target_shots:500,status:'DO',priority:0,comment:'',details:[{mold_detail_id:'d1',part_no:'P-102',wo:record.WO,cavities:2},{mold_detail_id:'d2',part_no:'P-104',wo:'',cavities:0}]};
 if(module==='mold'||action==='report.complete')args={schedule_id:'s1'};
 const change=(field,before,after)=>({table:'fixture_only',key:'fixture',field,before,after});
 const changes=action==='report.update'?[change('OK_QTY',120,125),change('NG_QTY',3,3)]:action==='report.complete'?[change('COMPLETED','N','Y')]:action==='schedule.save'?[change('SCHEDULE_START_TIME','2026-11-02 07:30','2026-11-02 08:00'),change('SCHEDULE_END_TIME',null,'2026-11-02 12:10'),change('SCHEDULE_CYCLE_TIME',28,30)]:action==='mold.clear'?['ZZ_MODLE_UPLOAD_START','ZZ_MODLE_UPLOAD_END','ZZ_MODLE_REMOVE_START','ZZ_MODLE_REMOVE_END','CHECK_IN_TIME','CHECK_OUT_TIME','COMPLETED_TIME'].map((f,i)=>change(f,'2026-11-02 '+['07:50','08:10','09:40','09:45','07:50','09:45','09:45'][i],null)).concat(change('COMPLETED','Y','N')):action==='mold.unmount_finish'?[change('ZZ_MODLE_REMOVE_END',null,'2026-11-02 09:45'),change('CHECK_OUT_TIME',null,'2026-11-02 09:45'),change('COMPLETED_TIME',null,'2026-11-02 09:45'),change('COMPLETED','N','Y')]:[];
 const proposal={id:'fixture-proposal',digest:'fixture-digest',summary:'待你確認 · 尚未寫入',action,args,changes,expires_at:'2026-11-02T10:00:00+07:00',status:options.status??'pending',writes_enabled:true,business_timezone:'UTC+07:00',independent_confirmation:['report.delete','report.complete','mold.clear'].includes(action),target:{equipment:record.EQP_NO,work_order:record.WO,part_no:record.PART_NO,part_spec:record.PART_SPEC,report_before:record.REPORTS[0],affected_orders:[record.WO,action==='report.complete'?'0383':'WO-261102-0383'],next_schedule:undefined,...(scene==='schedule-edit'?{schedule_details:args.details.map((d,i)=>({...d,previous:{cavities:i?0:1}}))}:{})}};
 // 固定時鐘只用於截圖期限，正式程式不注入任何日期或資料。
 await page.clock.setFixedTime(new Date('2026-11-02T09:50:00+07:00'));
 const work={...workspace,records:[record],catalogs:{...workspace.catalogs,equipment:[{EQP_NO:'MC37'}],parts:[{PART_NO:'P-102',PART_SPEC:'外殼'}],molds:[{TOL_NO:'M-102',DETAILS:[{TOL_DETALS_SID:'d1',TOL_DETALS_NO:'D1',PART_NO:'P-102'},{TOL_DETALS_SID:'d2',TOL_DETALS_NO:'D2',PART_NO:'P-104'}]}]}};
 let calls=[];let guide={version:1,action,intent:scene==='schedule-add'?'create':'update',args,step:empty?'target':review?'review':action?'details':'action',missing:[],ready:!empty,proposal:review?proposal:null};
 const messages=[{role:'user',content:module==='schedule'?'幫我安排 MC37 的生產排程':module==='mold'?'我要操作 MC37 的模具':'我要報工，MC37 良品 125，不良 3 個刮傷'},{role:'assistant',content:empty?'好，先選擇這次要操作的工單。':review?'內容已整理好。請核對後再送出。':'已帶入 MC37 的工單。數量可以直接在作業單調整。'}];
 await page.route('**/api/**',async route=>{const req=route.request(),p=new URL(req.url()).pathname,body=req.postDataJSON();calls.push({path:p,body});const send=json=>route.fulfill({json});
 if(p.startsWith('/api/proposals/'))return send({proposal});
 if(p==='/api/conversations')return send({records:chats.map(c=>c.id==='fixture-2'?{...c,module}:c),total:chats.length,page:1,page_size:30});
 if(p==='/api/workspace')return send(work);
 if(p.endsWith('/guide')){if(body){if(body.version!==guide.version)return route.fulfill({status:409,json:{detail:'fixture 版本衝突'}});guide={...guide,...body,version:guide.version+1,proposal:null,ready:!!(body.args.execution_id||body.args.report_id||body.args.schedule_id||body.args.equipment)};}return send(guide);}
 if(p.endsWith('/proposals')){await new Promise(r=>setTimeout(r,2100));guide={...guide,step:'review',proposal:{...proposal,args:guide.args,action:guide.action,id:'fixture-preview-'+guide.version,digest:'fixture-digest-'+guide.version}};return send({proposal:guide.proposal});}
 if(p==='/api/conversations/fixture-2')return send({...chats[2],module,messages});
 if(p==='/api/candidates')return send({records:[],has_more:false});
 if(p.endsWith('/query'))return send(work);
 return route.fallback();});return {calls};
}
async function prepare(page,scene){await page.locator('.header-tools button').nth(1).click();if(await page.locator('.conversation-history').isHidden())await page.getByRole('button',{name:'展開側欄',exact:true}).click();if(!await page.locator('.workspace-bar').isVisible())await page.locator('.history-select').filter({hasText:'MC37 今日生產'}).click();await page.locator('.guided-flow').waitFor({state:'attached'});await page.waitForTimeout(800);if(await page.locator('.mobile-work-tabs').isVisible())await page.locator('.mobile-work-tabs button').last().click();}
module.exports={start,fixture,prepare,root};
if(require.main===module)(async()=>{const app=await start();try{const scene=process.env.SCENE||'sheet-edit';const page=await app.browser.newPage({viewport:{width:1366,height:768},colorScheme:'dark'});await fixture(page,scene);await page.goto(app.url+'/?embed=1');await page.locator('#entry-input').waitFor();await prepare(page,scene);await page.screenshot({path:root+'/.local/issue57-product.png'});console.log((await page.locator('body').innerText()).slice(-3500));const ref=await app.browser.newPage({viewport:{width:1366,height:768},colorScheme:'dark'});await ref.goto('file:///'+path.join(root,'docs/design/uiux-reference-v2/reference.html').replaceAll('\\','/'));await ref.locator('#ux-scene').selectOption('sheet-edit');await ref.getByRole('button',{name:'新增原因',exact:true}).click();await ref.getByRole('checkbox',{name:'沒有不良品',exact:true}).check();console.log('範例新增原因與沒有不良品操作完成');}finally{await app.close();}})().catch(e=>{console.error(e);process.exitCode=1});
