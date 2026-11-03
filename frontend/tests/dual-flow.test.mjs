import {test,after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
const window=new Window({url:'http://localhost/'});
for(const key of ['window','document','navigator','HTMLElement','HTMLFormElement','HTMLSelectElement','HTMLInputElement','HTMLTextAreaElement','Node','Element','DocumentFragment','MutationObserver','ResizeObserver','NodeFilter','CustomEvent','Event','KeyboardEvent','MouseEvent','PointerEvent','FocusEvent','localStorage','sessionStorage','getComputedStyle','requestAnimationFrame','cancelAnimationFrame'])Object.defineProperty(globalThis,key,{configurable:true,value:['getComputedStyle','requestAnimationFrame','cancelAnimationFrame'].includes(key)?window[key].bind(window):window[key]});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {createElement:h,act,useState,useRef}=await import('react');const {createRoot}=await import('react-dom/client');
const {createServer}=await import('vite');const server=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'});
const {GuidedFlow}=await server.ssrLoadModule('/src/GuidedFlow.tsx');
const {CandidateCombobox}=await server.ssrLoadModule('/src/CandidateCombobox.tsx');
const {RecordChoices}=await server.ssrLoadModule('/src/RecordChoices.tsx');
const {CandidateSelect}=await server.ssrLoadModule('/src/CandidateSelect.tsx');
const {MoldStages,moldStageAvailability}=await server.ssrLoadModule('/src/MoldStages.tsx');
const {ProposalBusinessSummary}=await server.ssrLoadModule('/src/ProposalBusinessSummary.tsx');
const {useOperationMode,readOperationMode,operationModeKey}=await server.ssrLoadModule('/src/operation-mode.ts');
const {ApiError}=await server.ssrLoadModule('/src/api.ts');
const {useEntry}=await server.ssrLoadModule('/src/use-entry.ts');
const {rememberOperationFocus,operationFocusTarget,ownsPanelKeyboard}=await server.ssrLoadModule('/src/operation-focus.ts');
const {budgetCaption,money}=await server.ssrLoadModule('/src/BudgetSummary.tsx');
const {AuditRecords,auditBusinessChanges}=await server.ssrLoadModule('/src/AuditRecords.tsx');
await server.close();after(()=>window.happyDOM.abort());
afterEach(()=>sessionStorage.clear());
const noop=()=>{};
function mount(){const host=document.createElement('div');host.id='mes-ai-chat-root';document.body.append(host);return {host,root:createRoot(host)};}
const tick=()=>new Promise(r=>setTimeout(r,720));
const inputValue=(input,text)=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,text);input.dispatchEvent(new Event('input',{bubbles:true}));};

test('首次及同目標套用保留數量，換執行紀錄才清除；查看明細不套用',async()=>{
 const {host,root}=mount();let guide={version:1,action:'report.add',args:{ok:120,defects:[{code:'NG01',quantity:3}]},step:'details',missing:['execution_id'],ready:false};const calls=[];
 const workspace={records:['2001','2002'].map((id,i)=>({WIP_OPI_WDOEACICO_HIST_SID:id,EQP_NO:'MC37',WO:'WO-'+i,ZZ_MODLE_UPLOAD_END:'2026-11-02'})),catalogs:{defect_reasons:[{NG_CODE_NO:'NG01',NG_CODE_NAME:'刮傷'}]}};
 const request=async(path,body)=>{calls.push({path,body});if(path.includes('/workspace'))return workspace;if(body)guide={...guide,...body,version:guide.version+1,missing:[],ready:true};return structuredClone(guide);};
 const props={apiRequest:request,conversation:{id:'first',messages:[],module:'report'},module:'report',workspace,selected:null,signal:0,proposal:null,status:'',disabled:false,date:null,onReply:noop,onAudit:noop,onHome:noop};
 const click=async text=>act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent===text).click());
 await act(async()=>root.render(h(GuidedFlow,props)));
 await click('選擇／更換對象');await click('明細');assert.equal(calls.filter(c=>c.body).length,0);
 await act(async()=>host.querySelectorAll('input[type=radio]')[0].click());assert.equal(calls.filter(c=>c.body).length,0);
 await click('帶入作業');assert.equal(guide.args.ok,120);assert.deepEqual(guide.args.defects,[{code:'NG01',quantity:3}]);
 const saved=calls.filter(c=>c.body).length;
 await click('選擇／更換對象');await act(async()=>host.querySelectorAll('input[type=radio]')[0].click());await click('帶入作業');assert.equal(calls.filter(c=>c.body).length,saved);assert.equal(host.querySelector('#guide-ok').value,'120');
 await click('選擇／更換對象');await act(async()=>host.querySelectorAll('input[type=radio]')[1].click());await click('帶入作業');assert.equal(guide.args.execution_id,'2002');assert.equal(guide.args.ok,undefined);assert.equal(guide.args.defects,undefined);
 await act(async()=>root.unmount());host.remove();
});

test('未改值返回核對沿用有效 proposal，實改值才保存並重新預覽',async()=>{
 const {host,root}=mount();const calls=[];let card={id:'original',digest:'original-digest',action:'report.add',status:'pending',expires_at:new Date(Date.now()+600000).toISOString(),args:{execution_id:'2001',ok:120,defects:[]}};
 let guide={version:3,action:'report.add',args:card.args,step:'review',missing:[],ready:true,proposal:card};
 const request=async(path,body)=>{calls.push({path,body});if(path.endsWith('/proposals')){card={...card,id:'new',args:body.args};guide={...guide,proposal:card,step:'review'};return {proposal:card};}if(body)guide={...guide,...body,version:guide.version+1,proposal:null};return structuredClone(guide);};
 const props={apiRequest:request,conversation:{id:'revisit',messages:[],module:'report'},module:'report',workspace:{records:[{WIP_OPI_WDOEACICO_HIST_SID:'2001',EQP_NO:'MC37',WO:'WO-A'}],catalogs:{}},selected:null,signal:0,status:'',disabled:false,date:null,onAudit:noop,onHome:noop};
 function Harness(){const [proposal,setProposal]=useState(card);return h(GuidedFlow,{...props,proposal,onReply:r=>{if('proposal'in r)setProposal(r.proposal);}});}
 await act(async()=>root.render(h(Harness)));
 const back=()=>[...host.querySelectorAll('button')].find(b=>b.textContent.includes('修改資料'));
 await act(async()=>back().click());await act(async()=>host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 assert.equal(calls.filter(c=>c.body).length,0);assert.equal(guide.proposal.id,'original');assert.equal(guide.version,3);
 await act(async()=>back().click());await act(async()=>inputValue(host.querySelector('#guide-ok'),'125'));await act(async()=>host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 assert.equal(calls.filter(c=>c.body&&c.path.endsWith('/guide')).length,1);assert.equal(calls.filter(c=>c.path.endsWith('/proposals')).length,1);assert.equal(guide.args.ok,125);
 await act(async()=>root.unmount());host.remove();
});

test('HTTP 缺少 randomUUID 仍可開啟入口，未知結果沿用原識別查核且不重送',async()=>{
 const original=Object.getOwnPropertyDescriptor(globalThis,'crypto');const nativeCrypto=globalThis.crypto;
 Object.defineProperty(globalThis,'crypto',{configurable:true,value:{getRandomValues:nativeCrypto.getRandomValues.bind(nativeCrypto)}});
 const {host,root}=mount();let entry;const calls=[];
 const request=async(path,body)=>{calls.push({path,body});if(body)throw new Error('連線中斷');if(path.includes('/requests/'))return {request_id:calls.find(c=>c.body).body.request_id,status:'unknown'};return {messages:[]};};
 function Harness(){entry=useEntry('HTTP測試','live',request);return h('div',null,entry.entryId);}
 try{
  await act(async()=>root.render(h(Harness)));
  const id=entry.entryId;assert.match(id,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  await act(async()=>assert.rejects(entry.send('查詢設備',{}),/連線中斷/));
  const sent=calls.find(c=>c.body).body;assert.notEqual(sent.request_id,id);assert.equal(entry.blocked,true);
  await act(async()=>entry.send('再送一次',{}));assert.equal(calls.filter(c=>c.body).length,1);
  await act(async()=>root.unmount());const restored=createRoot(host);
  await act(async()=>restored.render(h(Harness)));assert.equal(entry.entryId,id);assert.equal(entry.blocked,true);
  await act(async()=>entry.check());assert.ok(calls.some(c=>c.path.endsWith('/requests/'+sent.request_id)));assert.equal(calls.filter(c=>c.body).length,1);
  await act(async()=>restored.unmount());
 }finally{await act(async()=>{try{root.unmount();}catch{}});host.remove();Object.defineProperty(globalThis,'crypto',original);}
});

test('彈窗搜尋的提交不冒泡為父層作業預覽',async()=>{
 const {host,root}=mount();let outer=0,queries=0;
 const request=async()=>{queries++;return {records:[],page:1,has_more:false,filters:{search:'',part_no:''}};};
 await act(async()=>root.render(h('form',{onSubmit:e=>{e.preventDefault();outer++;}},h(CandidateSelect,{kind:'parts',value:'',title:'品號',id:'part',choose:noop,request}))));
 await act(async()=>host.querySelector('button').click());
 const search=document.querySelector('.candidate-search');assert.ok(search);
 const before=queries;await act(async()=>search.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 assert.equal(queries,before+1);assert.equal(outer,0);
 await act(async()=>root.unmount());host.remove();
});

test('一般偏好依可信身分及環境隔離，忙碌採最後選擇且其他分頁不強制切換',async()=>{
 const {host,root}=mount();let mode;function Harness({actor='甲',env='simulation',busy=false,epoch='a'}){mode=useOperationMode(actor,env,epoch,busy);return h('input',{defaultValue:'原輸入'});}
 await act(async()=>root.render(h(Harness,{})));const input=host.firstChild;assert.equal(mode.mode,'chat-sheet');
 await act(async()=>mode.choose('step-wizard'));assert.equal(mode.mode,'step-wizard');assert.ok(input===host.firstChild);
 await act(async()=>root.render(h(Harness,{busy:true})));await act(async()=>mode.choose('chat-sheet'));assert.equal(mode.deferred,true);assert.equal(mode.mode,'step-wizard');
 await act(async()=>mode.choose('step-wizard'));await act(async()=>mode.choose('chat-sheet'));await act(async()=>root.render(h(Harness,{})));assert.equal(mode.mode,'chat-sheet');
 await act(async()=>mode.choose('step-wizard'));await act(async()=>root.render(h(Harness,{actor:'乙'})));assert.equal(mode.mode,'chat-sheet');
 await act(async()=>root.render(h(Harness,{env:'live'})));assert.equal(mode.mode,'chat-sheet');
 await act(async()=>root.render(h(Harness,{})));assert.equal(mode.mode,'step-wizard');
 window.dispatchEvent(new window.StorageEvent('storage',{key:operationModeKey('甲','simulation'),newValue:'{"version":1,"mode":"chat-sheet"}'}));assert.equal(mode.mode,'step-wizard');
 assert.equal(readOperationMode({getItem:()=>'{broken'},'x'),'chat-sheet');assert.equal(readOperationMode({getItem:()=>{throw Error('blocked')}},'x'),'chat-sheet');
 await act(async()=>root.unmount());host.remove();
});

test('單一 Guide 保留最後字元與無效輸入，模式切換零 mutation，失敗後不採用舊值',async()=>{
 const {host,root}=mount();let serverGuide={version:1,action:'report.add',args:{execution_id:'2001',ok:120,defects:[]},step:'details',missing:[],ready:true};const calls=[];
 const request=async(path,body)=>{calls.push({path,body});if(body){if(typeof body.args.ok==='string')throw new ApiError('數量必須是整數',422);serverGuide={...serverGuide,version:serverGuide.version+1,args:body.args};}return structuredClone(serverGuide);};
 const props={apiRequest:request,conversation:{id:'a',messages:[],module:'report'},module:'report',workspace:{records:[{WIP_OPI_WDOEACICO_HIST_SID:'2001',WO:'WO-A',EQP_NO:'MC37'}],catalogs:{defect_reasons:[]}},selected:null,signal:0,proposal:null,status:'',disabled:false,date:null,onReply:noop,onAudit:noop,onHome:noop};
 await act(async()=>root.render(h(GuidedFlow,{...props,presentation:'chat-sheet'})));const section=host.querySelector('.guided-flow');
 const field=host.querySelector('#guide-ok');await act(async()=>inputValue(field,'125'));
 const before=calls.filter(c=>c.body).length;
 await act(async()=>root.render(h(GuidedFlow,{...props,presentation:'step-wizard'})));assert.ok(section===host.querySelector('.guided-flow'));assert.equal(host.querySelector('#guide-ok').value,'125');assert.equal(calls.filter(c=>c.body).length,before);
 await act(tick);assert.equal(serverGuide.args.ok,125);assert.equal(calls.filter(c=>c.body).length,before+1);
 await act(async()=>inputValue(host.querySelector('#guide-ok'),'1.'));await act(async()=>root.render(h(GuidedFlow,{...props,presentation:'chat-sheet'})));assert.equal(host.querySelector('#guide-ok').value,'1.');await act(tick);assert.ok(host.textContent.includes('數量必須是整數'));
 await act(async()=>root.render(h(GuidedFlow,{...props,presentation:'step-wizard'})));assert.equal(host.querySelector('#guide-ok').value,'1.');assert.equal(serverGuide.args.ok,125);
 await act(async()=>root.unmount());host.remove();
});

test('pending 返回修改只是呈現，切換模式不重新準備確認卡',async()=>{
 const {host,root}=mount();const calls=[];const proposal={id:'p',digest:'same',status:'pending',args:{execution_id:'2001',ok:120,defects:[]}};
 const request=async(path,body)=>{calls.push({path,body});return {version:2,action:'report.add',args:proposal.args,step:'review',missing:[],ready:true,proposal};};
 const props={apiRequest:request,conversation:{id:'a',messages:[],module:'report'},module:'report',workspace:{records:[],catalogs:{}},selected:null,signal:0,proposal,status:'',disabled:false,date:null,onReply:noop,onAudit:noop,onHome:noop};
 await act(async()=>root.render(h(GuidedFlow,{...props,presentation:'chat-sheet'})));
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent.includes('修改資料')).click());assert.equal(host.querySelector('#guide-ok').value,'120');
 await act(async()=>root.render(h(GuidedFlow,{...props,presentation:'step-wizard'})));await act(tick);assert.equal(calls.filter(c=>c.body).length,0);assert.equal(host.querySelector('#guide-ok').value,'120');
 await act(async()=>root.unmount());host.remove();
});

test('已選執行紀錄的修改動作立即顯示單次報工，不藏在空白編輯表單',async()=>{
 const {host,root}=mount();let guide={version:0,action:'',args:{},step:'action',missing:[],ready:false};
 const record={WIP_OPI_WDOEACICO_HIST_SID:'2001',EQP_NO:'MC37',WO:'WO-A',REPORTS:[{WIP_OPI_WDOEACICOOUTPUT_HIST_SID:'3001',CREATE_TIME:'2026-10-30 09:00',OK_QTY:125,NG_QTY:2}]};
 const request=async(path,body)=>{if(body)guide={...guide,...body,version:guide.version+1};return structuredClone(guide);};
 const props={apiRequest:request,conversation:{id:'second',messages:[],module:'report'},module:'report',workspace:{records:[record],catalogs:{}},selected:record,signal:0,proposal:null,status:'',disabled:false,date:null,onReply:noop,onAudit:noop,onHome:noop};
 await act(async()=>root.render(h(GuidedFlow,{...props,presentation:'chat-sheet'})));
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent.includes('修改報工')).click());
 assert.ok(host.querySelector('.report-record-picker'));assert.ok(host.querySelector('.report-record-picker').textContent.includes('125'));assert.equal(host.querySelector('#guide-ok'),null);
 await act(async()=>root.render(h(GuidedFlow,{...props,presentation:'step-wizard'})));assert.ok(host.querySelector('.report-record-picker'));
 await act(async()=>root.unmount());host.remove();
});


test('R01 新增排程 pending 返回目標未改值再核對不發 mutation 或 prepare',async()=>{
 const {host,root}=mount();const calls=[];const args={equipment:'MC37',part_no:'EPS-A',mold_no:'MOLD-A',details:[{mold_detail_id:'m1',part_no:'EPS-A',wo:'WO-A',cavities:1}],start_time:'2026-11-02T08:00',cycle_seconds:30,target_shots:100,status:'DO',priority:0};
 const proposal={id:'schedule-original',digest:'digest',action:'schedule.save',status:'pending',expires_at:new Date(Date.now()+600000).toISOString(),args};
 const guide={version:7,action:'schedule.save',intent:'create',args,step:'review',missing:[],ready:true,proposal};
 const props={apiRequest:async(path,body)=>{calls.push({path,body});return structuredClone(guide);},conversation:{id:'schedule',messages:[],module:'schedule'},module:'schedule',workspace:{records:[],catalogs:{molds:[{TOL_NO:'MOLD-A',DETAILS:[{TOL_DETALS_SID:'m1',PART_NO:'EPS-A'}]}]}},selected:null,signal:0,proposal,status:'',disabled:false,date:null,onReply:noop,onAudit:noop,onHome:noop,presentation:'step-wizard'};
 await act(async()=>root.render(h(GuidedFlow,props)));
 const click=async text=>act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent===text).click());
 await click('上一步：修改資料');await click('上一步');await click('下一步');
 await act(async()=>host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 assert.equal(calls.filter(c=>c.body).length,0);assert.ok(host.textContent.includes('上一步：修改資料'));assert.equal(proposal.id,'schedule-original');
 await act(async()=>root.unmount());host.remove();
});

test('報工子選取返回與取消保留最新草稿；暫選和查看都不套用',async()=>{
 const {host,root}=mount();const calls=[];let guide={version:3,action:'report.update',args:{report_id:'3001',ok:125,defects:[]},step:'details',missing:[],ready:true};
 const record={WIP_OPI_WDOEACICO_HIST_SID:'2001',WO:'WO-A',EQP_NO:'MC37',REPORTS:[{WIP_OPI_WDOEACICOOUTPUT_HIST_SID:'3001',CREATE_TIME:'09:00',OK_QTY:120},{WIP_OPI_WDOEACICOOUTPUT_HIST_SID:'3002',CREATE_TIME:'10:00',OK_QTY:90}]};
 const request=async(path,body)=>{calls.push({path,body});if(path.includes('/workspace'))return {records:[record],catalogs:{}};if(body)guide={...guide,...body,version:guide.version+1};return structuredClone(guide);};
 const props={apiRequest:request,conversation:{id:'child',messages:[],module:'report'},module:'report',workspace:{records:[record],catalogs:{}},selected:null,signal:0,proposal:null,status:'',disabled:false,date:null,onReply:noop,onAudit:noop,onHome:noop};
 await act(async()=>root.render(h(GuidedFlow,props)));
 const click=async text=>act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent===text).click());
 await click('選擇／更換對象');await act(async()=>host.querySelector('input[type=radio]').click());await click('選擇報工紀錄');
 await act(async()=>host.querySelectorAll('.report-record-picker input[type=radio]')[1].click());await click('明細');
 assert.equal(calls.filter(c=>c.body).length,0);await click('返回工單');await click('選擇報工紀錄');await click('取消選取');assert.equal(host.querySelector('#guide-ok').value,'125');assert.equal(guide.args.report_id,'3001');
 await act(async()=>root.unmount());host.remove();
});

test('主檔暫選跨頁保留，改查詢需重選，確認帶入才更新值',async()=>{
 const {host,root}=mount();const chosen=[];
 const request=async path=>{const q=new URL(path,'http://localhost').searchParams;return {records:[{PART_NO:q.get('page')==='2'?'B':'A',PART_SPEC:'測試'}],page:Number(q.get('page')),has_more:q.get('page')==='1',filters:{search:q.get('search'),part_no:''}};};
 await act(async()=>root.render(h(CandidateSelect,{kind:'parts',value:'',title:'品號',id:'part',choose:r=>chosen.push(r),request})));
 await act(async()=>host.querySelector('button').click());
 const dialog=()=>document.querySelector('.candidate-dialog');const click=async text=>act(async()=>[...dialog().querySelectorAll('button')].find(b=>b.textContent===text).click());
 await click('查看');await act(async()=>dialog().querySelector('input[type=radio]').click());assert.equal(chosen.length,0);await click('下一頁');assert.ok(dialog().querySelector('.candidate-apply').textContent.includes('A'));
 await act(async()=>inputValue(dialog().querySelector('.candidate-search input'),'B'));await click('搜尋');assert.equal(dialog().querySelector('.candidate-apply .primary').disabled,true);
 await act(async()=>dialog().querySelector('input[type=radio]').click());await click('帶入作業單');assert.equal(chosen.length,1);
 await act(async()=>root.unmount());host.remove();
});

test('邏輯焦點恢復重建欄位與游標，隱藏欄位改落搜尋入口',()=>{
 const host=document.createElement('section');host.innerHTML='<div class="guided-flow"><input id="guide-ok" value="125"></div>';document.body.append(host);
 const input=host.querySelector('input');input.setSelectionRange(1,2);const memory=rememberOperationFocus(input);
 input.remove();host.querySelector('div').innerHTML='<input id="guide-ok" value="125"><div class="guide-choosing"><fieldset class="guide-body"><button>取消選取</button><input id="guide-search-equipment"></fieldset></div>';
 for(const field of host.querySelectorAll('input,button')){field.getClientRects=()=>[{}];field.scrollIntoView=()=>{};}
 assert.equal(operationFocusTarget(host,memory).id,'guide-ok');assert.equal(host.querySelector('#guide-ok').selectionStart,1);assert.equal(host.querySelector('#guide-ok').selectionEnd,2);
 host.querySelector('#guide-ok').hidden=true;assert.equal(operationFocusTarget(host,memory).id,'guide-search-equipment');host.remove();
});

test('已驗證查詢更新選取條件但不改業務草稿，換模式保留頁碼',async()=>{
 const {host,root}=mount();const mutations=[];const guide={version:2,action:'report.add',args:{ok:125,defects:[]},step:'details',missing:['execution_id'],ready:false};
 const props={apiRequest:async(path,body)=>{if(body)mutations.push(body);return structuredClone(guide);},conversation:{id:'query',messages:[],module:'report'},module:'report',selected:null,signal:0,proposal:null,status:'',disabled:false,date:null,onReply:noop,onAudit:noop,onHome:noop};
 const workspace={records:[{WIP_OPI_WDOEACICO_HIST_SID:'2001',EQP_NO:'MC37',WO:'WO-A',ZZ_MODLE_UPLOAD_END:'now'}],catalogs:{},total:40,page:2,query_context:{version:2,filters:{equipment:'MC37',date:'2026-11-02',page:2,page_size:20}}};
 await act(async()=>root.render(h(GuidedFlow,{...props,workspace})));
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='選擇／更換對象').click());assert.equal(host.querySelector('#guide-search-equipment').value,'MC37');
 await act(async()=>host.querySelector('input[type=radio]').click());assert.ok(host.textContent.includes('帶入作業'));
 await act(async()=>root.render(h(GuidedFlow,{...props,workspace,presentation:'step-wizard'})));assert.equal(host.querySelector('input[type=radio]').checked,true);assert.equal(host.querySelector('.picker-pagination').textContent.includes('2／2'),true);
 await act(async()=>root.render(h(GuidedFlow,{...props,presentation:'step-wizard',workspace:{...workspace,records:[],page:1,total:0,query_context:{version:3,filters:{equipment:'MC38',page:1,page_size:20}}}})));
 assert.equal(host.querySelector('#guide-search-equipment').value,'MC38');assert.equal(host.querySelector('.candidate-apply'),null);assert.ok(document.querySelector('.target-picker-dialog').textContent.includes('請重新選取'));assert.equal(mutations.length,0);
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='取消選取').click());assert.equal(host.querySelector('#guide-ok').value,'125');
 await act(async()=>root.unmount());host.remove();
});

test('翻頁沿用後端每頁筆數及隱含品號條件，預設 all 不清除暫選',async()=>{
 const {host,root}=mount();const queries=[];const guide={version:1,action:'',args:{},step:'target',missing:[],ready:false};
 const props={presentation:'step-wizard',apiRequest:async()=>guide,conversation:{id:'paging',module:'report',messages:[]},module:'report',selected:null,signal:0,proposal:null,status:'',disabled:false,date:null,onReply:noop,onAudit:noop,onHome:noop};
 function Harness(){const [workspace,setWorkspace]=useState({records:[{WIP_OPI_WDOEACICO_HIST_SID:'2001',WO:'WO-A',EQP_NO:'MC37'}],catalogs:{},page:1,page_size:1,total:2,query_context:{version:1,filters:{equipment:'MC37',part_no:'EPS-A',page:1,page_size:1}}});return h(GuidedFlow,{...props,workspace,onQuery:async filters=>{queries.push(filters);const result={...workspace,records:[{WIP_OPI_WDOEACICO_HIST_SID:'2002',WO:'WO-B',EQP_NO:'MC37'}],page:2,query_context:{version:2,filters}};setWorkspace(result);return result;}});}
 await act(async()=>root.render(h(Harness)));await act(async()=>host.querySelector('input[type=radio]').click());
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')==='下一頁').click());assert.equal(queries[0].page_size,'1');assert.equal(queries[0].page,'2');assert.equal(queries[0].part_no,'EPS-A');assert.ok(host.querySelector('.picker-selection').textContent.includes('WO-A'));assert.ok(host.textContent.includes('查看結果'));
 await act(async()=>root.unmount());host.remove();
});


test('核對底列返回沿用原 Guide，未知結果仍禁止返回修改',async()=>{
 const {host,root}=mount();const calls=[];const handle={current:null};
 const proposal={id:'original',digest:'same',action:'report.add',status:'pending',args:{execution_id:'2001',ok:125,defects:[]}};
 const props={ref:handle,reviewActionsExternal:true,presentation:'step-wizard',apiRequest:async(path,body)=>{calls.push({path,body});return {version:2,action:'report.add',args:proposal.args,step:'review',missing:[],ready:true,proposal};},conversation:{id:'back',messages:[],module:'report'},module:'report',workspace:{records:[],catalogs:{}},selected:null,signal:0,proposal,status:'unknown',disabled:false,date:null,onReply:noop,onAudit:noop,onHome:noop};
 await act(async()=>root.render(h(GuidedFlow,props)));await act(async()=>handle.current.backToEdit());
 assert.equal(host.querySelector('#guide-ok'),null);
 await act(async()=>root.render(h(GuidedFlow,{...props,status:''})));
 assert.ok(![...host.querySelectorAll('button')].some(b=>b.textContent.includes('修改資料')));
 await act(async()=>handle.current.backToEdit());assert.equal(host.querySelector('#guide-ok').value,'125');
 await act(tick);assert.equal(calls.filter(c=>c.body).length,0);assert.equal(proposal.id,'original');
 await act(async()=>root.unmount());host.remove();
});


test('模具四階段只開放後端下一步，無歷程與已完成均有停用原因',async()=>{
 const fields=['ZZ_MODLE_UPLOAD_START','ZZ_MODLE_UPLOAD_END','ZZ_MODLE_REMOVE_START','ZZ_MODLE_REMOVE_END'];
 const actions=['mold.mount_start','mold.mount_finish','mold.unmount_start','mold.unmount_finish'];
 const {host,root}=mount();
 for(let next=0;next<4;next++){
  const member=Object.fromEntries(fields.map((key,i)=>[key,i<next?'2026-11-02 08:00:00':null]));
  const record={EQP_NO:'MC37',TOL_NO:'MOLD-A',NEXT_ACTION:actions[next],EXECUTIONS:[member]};
  await act(async()=>root.render(h(MoldStages,{record,disabled:false,choose:noop,select:noop})));
  const buttons=[...host.querySelectorAll('.mold-stages button')];
  assert.deepEqual(buttons.map(b=>!b.disabled),actions.map((_,i)=>i===next));
  assert.ok(host.textContent.includes('伺服器預覽'));assert.ok(!host.textContent.includes('數量可以'));
  assert.equal(moldStageAvailability(record,'mold.clear').allowed,next>0);
 }
 assert.equal(moldStageAvailability({EXECUTIONS:[],NEXT_ACTION:'mold.mount_start'},'mold.mount_start').allowed,false);
 assert.equal(moldStageAvailability({EXECUTIONS:[{}],NEXT_ACTION:null},'mold.mount_start').allowed,false);
 await act(async()=>root.unmount());host.remove();
});

test('排程新增保留零穴且不捏造原值，修改只標記實際變更',async()=>{
 const {host,root}=mount();const args={equipment:'MC37',mold_no:'MOLD-A',cycle_seconds:30,target_shots:100,status:'DO',priority:0};
 const proposal={action:'schedule.save',args,changes:[{field:'SCHEDULE_START_TIME',before:null,after:'2026-11-02 08:00:00'}],target:{schedule_details:[{wo:'WO-A',mold_detail_name:'左模穴',cavities:2},{wo:'WO-B',mold_detail_name:'右模穴',cavities:0}]}};
 await act(async()=>root.render(h(ProposalBusinessSummary,{proposal,workspace:{records:[],catalogs:{}}})));
 assert.equal(host.querySelectorAll('.business-before').length,0);assert.ok(host.textContent.includes('WO-B'));assert.ok(host.textContent.includes('0穴'));
 const changed={...proposal,changes:[{field:'TARGET_SHOT',before:80,after:100},{field:'SCHEDULE_CYCLE_TIME',before:30,after:30}]};
 await act(async()=>root.render(h(ProposalBusinessSummary,{proposal:changed,workspace:{records:[],catalogs:{}}})));
 assert.deepEqual([...host.querySelectorAll('.business-before')].map(x=>x.textContent),['80']);
 await act(async()=>root.unmount());host.remove();
});

test('候選慢查詢、空結果與失敗互斥，不以舊資料帶入',async()=>{
 const {host,root}=mount();let resolve,reject;const request=()=>new Promise((r,j)=>{resolve=r;reject=j;});
 await act(async()=>root.render(h(CandidateSelect,{kind:'parts',value:'',title:'品號',id:'part',choose:noop,request})));
 await act(async()=>host.querySelector('button').click());
 assert.ok(host.textContent.includes('查詢中'));assert.ok(!host.textContent.includes('沒有符合資料'));
 await act(async()=>resolve({records:[],page:1,has_more:false,filters:{search:'',part_no:''}}));
 assert.ok(!host.textContent.includes('查詢中'));assert.ok(host.textContent.includes('沒有符合資料'));
 await act(async()=>host.querySelector('.candidate-search button').click());
 await act(async()=>reject(new Error('候選連線失敗')));
 assert.equal(host.querySelector('[role=alert]').textContent,'候選連線失敗');assert.ok(!host.textContent.includes('沒有符合資料'));assert.ok(!host.textContent.includes('查詢中'));
 await act(async()=>root.unmount());host.remove();
});


test('審查：主選取讀取與失敗不宣稱完整結果，重試後才呈現零筆',async()=>{
 const {host,root}=mount();let resolve,reject;
 const guide={version:1,action:'',args:{},step:'target',missing:[],ready:false};
 const props={apiRequest:async()=>guide,onQuery:()=>new Promise((r,j)=>{resolve=r;reject=j;}),conversation:{id:'states',module:'mold',messages:[]},module:'mold',workspace:{records:[],catalogs:{},total:0},selected:null,signal:0,proposal:null,status:'',disabled:false,date:null,onReply:noop,onAudit:noop,onHome:noop};
 await act(async()=>root.render(h(GuidedFlow,props)));
 const dialog=()=>document.querySelector('.target-picker-dialog');
 assert.ok(!dialog().textContent.includes('請重新選取'));
 await act(async()=>dialog().querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 assert.ok(dialog().textContent.includes('正在查詢工單'));assert.equal(dialog().querySelector('.picker-pagination'),null);
 await act(async()=>reject(new Error('隔離查詢失敗')));
 assert.ok(dialog().textContent.includes('隔離查詢失敗'));assert.equal(dialog().querySelector('.picker-pagination'),null);assert.ok(!dialog().textContent.includes('沒有符合的資料'));
 await act(async()=>[...dialog().querySelectorAll('button')].find(b=>b.textContent==='重新查詢').click());
 await act(async()=>resolve({records:[],catalogs:{},total:0}));
 assert.ok(dialog().textContent.includes('沒有符合的資料'));assert.equal(dialog().querySelector('.picker-pagination'),null);assert.ok(!dialog().textContent.includes('請重新選取'));
 await act(async()=>dialog().querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 await act(async()=>reject(new Error('隔離查詢失敗')));
 assert.equal(host.querySelector('.error-banner'),null);
 await act(async()=>[...dialog().querySelectorAll('button')].find(b=>b.textContent==='取消選取').click());
 assert.equal(dialog(),null);assert.ok(!host.textContent.includes('隔離查詢失敗'));assert.ok(!host.textContent.includes('請重新選取'));

 await act(async()=>root.unmount());host.remove();
});

test('審查：開啟選取預帶設備日期但不修改 Guide，子層有工單脈絡',async()=>{
 const {host,root}=mount();const queries=[],writes=[];
 const record={WIP_OPI_WDOEACICO_HIST_SID:'2001',EQP_NO:'MC37',WO:'WO-A',REAL_CHECK_IN_TIME:'2026-11-02 08:00:00',REPORTS:[{WIP_OPI_WDOEACICOOUTPUT_HIST_SID:'3001',OK_QTY:10}]};
 const guide={version:1,action:'report.update',args:{report_id:'3001',ok:125,defects:[]},step:'details',missing:[],ready:true};
 const workspace={records:[record],catalogs:{},total:1};
 await act(async()=>root.render(h(GuidedFlow,{apiRequest:async(path,body)=>{if(body)writes.push(body);return guide;},onQuery:async f=>{queries.push(f);return workspace;},conversation:{id:'context',module:'report',messages:[]},module:'report',workspace,selected:record,signal:0,proposal:null,status:'',disabled:false,date:null,onReply:noop,onAudit:noop,onHome:noop})));
 const click=async text=>act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent===text).click());
 await click('選擇／更換對象');assert.equal(queries[0].equipment,'MC37');assert.equal(queries[0].date,'2026-11-02');
 assert.equal(document.querySelector('#guide-search-equipment').value,'MC37');assert.equal(writes.length,0);
 await act(async()=>document.querySelector('.target-picker-dialog input[type=radio]').click());await click('選擇報工紀錄');
 assert.ok(document.querySelector('.report-picker-context').textContent.includes('MC37 · WO-A'));assert.equal(document.querySelectorAll('.report-record-picker legend').length,0);
 assert.ok(document.querySelector('.target-picker-dialog').textContent.includes('帶入這筆報工'));assert.equal(writes.length,0);
 await click('取消選取');assert.equal(host.querySelector('#guide-ok').value,'125');
 await act(async()=>root.unmount());host.remove();
});

test('審查：排程只有一列開始時間，模具完工狀態採業務文字及三語',async()=>{
 const {host,root}=mount();const workspace={records:[],catalogs:{}};
 await act(async()=>root.render(h(ProposalBusinessSummary,{workspace,proposal:{action:'schedule.save',args:{start_time:'2026-11-02T13:00'},changes:[{field:'SCHEDULE_START_TIME',before:'2026-11-02 08:00:00',after:'2026-11-02 13:00:00'}]}})));
 assert.equal(host.textContent.split('預計開始').length-1,1);assert.ok(!host.textContent.includes('T13:00'));
 await act(async()=>root.render(h(ProposalBusinessSummary,{workspace,proposal:{action:'mold.unmount_finish',args:{},changes:[{field:'COMPLETED',before:'N',after:'Y'}]}})));
 assert.ok(host.textContent.includes('未完工'));assert.ok(host.textContent.includes('已完工'));
 const {translations}=await import('../src/translations.ts');const t=(key,_,language)=>translations[key]?.[language==='en'?0:1]??key;
 for(const language of ['en','th'])for(const key of ['尚未選擇設備與排程','新增排程','修改排程','目前可執行','尚未完成前一階段','清除換模紀錄','核對時間與連動影響','補充條件，或詢問這些資料…','補充模具或階段需求，修改後請重新核對'])assert.notEqual(t(key,{},language),key);
 await act(async()=>root.unmount());host.remove();
});


test('候選整列與方向鍵、空白鍵只暫選，查看明細不誤選',async()=>{
 const {host,root}=mount();const selected=[];const records=[{id:'a',WO:'甲',COMPLETED:'N'},{id:'b',WO:'乙',COMPLETED:'Y'}];
 await act(async()=>root.render(h(RecordChoices,{records,value:null,onSelect:r=>selected.push(r.id),identify:r=>r.id,describe:r=>({primary:r.WO,secondary:'',context:'MC37'})})));
 const rows=host.querySelectorAll('tr[tabindex]');
 await act(async()=>rows[0].click());assert.deepEqual(selected,['a']);
 rows[0].focus();rows[0].dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));assert.equal(document.activeElement,rows[1]);
 await act(async()=>rows[1].dispatchEvent(new KeyboardEvent('keydown',{key:' ',bubbles:true,cancelable:true})));assert.deepEqual(selected,['a','b']);
 await act(async()=>rows[1].querySelector('button').click());assert.deepEqual(selected,['a','b']);assert.ok(host.textContent.includes('已完工'));
 await act(async()=>root.unmount());host.remove();
});

test('行內候選只套用伺服器結果，任意輸入與 IME Enter 不修改主檔值',async()=>{
 const {host,root}=mount();const selected=[],calls=[];
 await act(async()=>root.render(h(CandidateCombobox,{id:'inline',kind:'molds',part:'EPS-A',title:'模具',value:'',choose:r=>selected.push(r),request:async path=>{calls.push(path);return {records:[{TOL_NO:'MOLD-A'}],has_more:false};}})));
 await act(async()=>host.querySelector('input').focus());await act(async()=>new Promise(r=>setTimeout(r,300)));
 assert.ok(calls[0].includes('part_no=EPS-A'));assert.equal(selected.length,0);
 await act(async()=>host.querySelector('input').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true})));
 await act(async()=>host.querySelector('input').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true})));assert.equal(selected.length,0);
 await act(async()=>host.querySelector('input').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})));assert.equal(selected[0].TOL_NO,'MOLD-A');
 await act(async()=>root.unmount());host.remove();
});


for(const presentation of ['chat-sheet','step-wizard'])for(const action of ['report.delete','report.complete'])test(`${presentation} ${action} 選取後直接核對，沒有空白填寫步驟`,async()=>{
 const {host,root}=mount();let guide={version:1,action,args:{},step:'target',missing:['target'],ready:false};const replies=[];
 const report={WIP_OPI_WDOEACICOOUTPUT_HIST_SID:'r',CREATE_TIME:'2026-11-02 10:00',OK_QTY:100,NG_QTY:2};
 const record={WIP_OPI_WDOEACICO_HIST_SID:'e',ZZ_KAOSU_PROD_SCHEDULE_SID:'s',WO:'WO-A',EQP_NO:'MC37',COMPLETED:'N',REPORTS:[report]};
 const request=async(path,body)=>{if(path.endsWith('/proposals'))return {proposal:{id:'p',action,args:body.args,status:'pending',changes:[]}};if(body)guide={...guide,...body,version:guide.version+1,missing:[],ready:true};return structuredClone(guide);};
 await act(async()=>root.render(h(GuidedFlow,{presentation,apiRequest:request,onQuery:async()=>({records:[record],catalogs:{}}),conversation:{id:action+presentation,module:'report',messages:[]},module:'report',workspace:{records:[record],catalogs:{}},selected:null,signal:0,proposal:null,status:'',disabled:false,date:null,onReply:r=>replies.push(r),onAudit:noop,onHome:noop})));
 const dialog=()=>document.querySelector('.target-picker-dialog');const click=async text=>act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent===text).click());
 await act(async()=>dialog().querySelector('input[type=radio]').click());
 if(action==='report.delete'){await click('選擇報工紀錄');await act(async()=>dialog().querySelector('.report-record-picker input[type=radio]').click());await click('帶入這筆報工');}else await click('帶入作業');
 assert.ok(replies.length,host.textContent);assert.equal(replies.at(-1).proposal.action,action);assert.equal(dialog(),null);assert.equal(host.querySelector('.guide-operation-note'),null);assert.ok(!host.textContent.includes('填寫內容'));
 await act(async()=>root.unmount());host.remove();
});


test('W01 空值就地提示並聚焦，修正後保留其他欄位且清除錯誤',async()=>{
 const {host,root}=mount();let guide={version:1,action:'report.add',args:{execution_id:'2001',defects:[]},step:'details',missing:['ok'],ready:false};const writes=[];
 const request=async(path,body)=>{if(body){writes.push(body);guide={...guide,...body,version:guide.version+1};}return structuredClone(guide);};
 const props={apiRequest:request,conversation:{id:'w01',actor_id:'operator',module:'report'},module:'report',workspace:{records:[],catalogs:{}},selected:null,signal:0,proposal:null,status:'',disabled:false,date:null,onReply:noop,onAudit:noop,onHome:noop};
 await act(async()=>root.render(h(GuidedFlow,props)));
 await act(async()=>host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 assert.equal(document.activeElement.id,'guide-ok');assert.equal(host.querySelector('#guide-ok').getAttribute('aria-invalid'),'true');assert.equal(writes.length,0);
 await act(async()=>inputValue(host.querySelector('#guide-ok'),'0'));assert.equal(host.querySelector('#guide-ok').getAttribute('aria-invalid'),'false');assert.equal(host.querySelector('.field-error'),null);
 await act(async()=>root.unmount());host.remove();
});

test('W04 比較本機與最新版本，只重套改過欄位且使用最新版本保存',async()=>{
 const {host,root}=mount();let guide={version:1,action:'report.add',args:{execution_id:'2001',ok:100,defects:[],comment:'原備註'},step:'details',missing:[],ready:true};const writes=[];let conflict=true;
 const request=async(path,body)=>{if(body){writes.push(body);if(conflict){guide={...guide,version:2,args:{...guide.args,comment:'同事新備註'}};throw new ApiError('版本已更新',409);}assert.equal(body.version,2);guide={...guide,...body,version:3};}return structuredClone(guide);};
 const props={apiRequest:request,conversation:{id:'w04',actor_id:'operator',module:'report'},module:'report',workspace:{records:[],catalogs:{}},selected:null,signal:0,proposal:null,status:'',disabled:false,date:null,onReply:noop,onAudit:noop,onHome:noop};
 await act(async()=>root.render(h(GuidedFlow,props)));await act(async()=>inputValue(host.querySelector('#guide-ok'),'120'));await act(tick);
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='讀取伺服器版本核對').click());assert.equal(host.querySelectorAll('.draft-comparison section').length,2);assert.match(host.textContent,/同事新備註/);conflict=false;
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='在最新內容重套我的修改，再核對').click());await act(tick);
 assert.equal(guide.args.ok,120);assert.equal(guide.args.comment,'同事新備註');assert.equal(writes.length,2);
 await act(async()=>root.unmount());host.remove();
});

test('X01 未保存草稿在重新載入後先比較，不自動覆寫伺服器',async()=>{
 const {host,root}=mount();const guide={version:2,action:'report.add',args:{execution_id:'2001',ok:100,defects:[]},step:'details',missing:[],ready:true};const writes=[];
 sessionStorage.setItem('kaosu-guide-input:operator:resume',JSON.stringify({action:'report.add',args:{...guide.args,ok:'125'},base:guide.args,version:2,at:Date.now()}));
 const props={apiRequest:async(path,body)=>{if(body)writes.push(body);return structuredClone(guide);},conversation:{id:'resume',actor_id:'operator',module:'report'},module:'report',workspace:{records:[],catalogs:{}},selected:null,signal:0,proposal:null,status:'',disabled:false,date:null,onReply:noop,onAudit:noop,onHome:noop};
 await act(async()=>root.render(h(GuidedFlow,props)));await act(tick);assert.equal(host.querySelector('#guide-ok').value,'125');assert.ok(host.querySelector('.draft-comparison'));assert.equal(writes.length,0);
 await act(async()=>root.unmount());host.remove();
});


test('A01 稽核使用實際差異、業務名稱與 MES 年份時間，不捏造未知結果',async()=>{
 const {host,root}=mount();const records=[{id:'proof',time:'2026-11-03T01:00:00+00:00',actor_name:'現場人員',equipment:'MC37',action:'report.update',status:'succeeded',changes:[{field:'OK_QTY',before:100,after:125},{field:'ENABLE_FLAG',before:'Y',after:'Y'},{field:'INTERNAL_KEY',before:null,after:'technical-only'}]},{id:'unresolved',time:'2026-11-03T01:01:00+00:00',actor:'現場人員',action:'report.add',status:'unknown',changes:[]}];
 await act(async()=>root.render(h(AuditRecords,{records,timezone:'UTC+07:00'})));
 assert.match(host.textContent,/修改報工/);assert.match(host.textContent,/2026-11-03 08:00:00/);assert.match(host.querySelector('.audit-changes').textContent,/100 → 125/);assert.doesNotMatch(host.querySelector('.audit-changes').textContent,/啟用/);assert.doesNotMatch(host.querySelector('.audit-changes').textContent,/INTERNAL_KEY/);assert.match(host.querySelectorAll('.audit-record')[1].textContent,/結果待核對/);assert.match(host.querySelectorAll('.audit-record')[1].textContent,/尚無可證明/);
 await act(async()=>root.unmount());host.remove();
});


test('審查 A01 業務異動區分新增修改刪除，省略系統欄位與空白備註',async()=>{
 const {host,root}=mount();const changes=[{field:'NG_QTY',before:null,after:0},{field:'OK_QTY',before:100,after:125},{field:'COMMENT',before:'舊備註',after:null},{field:'COMMENT',before:null,after:''},{field:'CREATE_TIME',before:null,after:'2026-11-03'},{field:'EDIT_TIME',before:'a',after:'b'},{field:'OPI_CAV',before:2,after:2}];
 assert.equal(auditBusinessChanges(changes).length,3);
 await act(async()=>root.render(h(AuditRecords,{records:[{id:'business',action:'report.update',status:'succeeded',changes}],timezone:'UTC+07:00'})));
 const text=host.querySelector('.audit-changes').textContent;assert.match(text,/新增：0/);assert.match(text,/修改：100 → 125/);assert.match(text,/刪除：舊備註/);assert.doesNotMatch(text,/建立時間|更新時間|— →|模穴/);
 await act(async()=>root.unmount());host.remove();
});

test('審查 A02 側欄與費用明細共用未知值規則，不把 null 轉成零',()=>{
 for(const value of [null,undefined,NaN,'0']){assert.equal(money(value),'尚未取得用量');assert.equal(budgetCaption({spent_usd:value,limit_usd:20}),'尚未取得用量');}
 assert.equal(budgetCaption({spent_usd:0,limit_usd:20}),'US$0.00 / US$20.00');
});

test('外層聊天室不攔截 Portal 與巢狀彈窗的 Tab／Esc',()=>{
 const panel=document.createElement('div');panel.setAttribute('role','dialog');const input=document.createElement('input');panel.append(input);document.body.append(panel);
 const modal=document.createElement('div');modal.setAttribute('role','dialog');const nested=document.createElement('input');modal.append(nested);document.body.append(modal);
 assert.equal(ownsPanelKeyboard(panel,input),true);assert.equal(ownsPanelKeyboard(panel,nested),false);
 panel.append(modal);assert.equal(ownsPanelKeyboard(panel,nested),false);
 const menu=document.createElement('div');menu.setAttribute('role','menu');menu.append(nested);panel.append(menu);assert.equal(ownsPanelKeyboard(panel,nested),false);
 panel.remove();
});


