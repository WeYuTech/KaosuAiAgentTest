import {test,after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
const window=new Window({url:'http://localhost/'});
for(const key of ['window','document','navigator','HTMLElement','HTMLFormElement','HTMLSelectElement','HTMLInputElement','HTMLTextAreaElement','Node','Element','DocumentFragment','MutationObserver','ResizeObserver','NodeFilter','CustomEvent','Event','KeyboardEvent','MouseEvent','PointerEvent','FocusEvent','localStorage','sessionStorage','getComputedStyle','requestAnimationFrame','cancelAnimationFrame'])Object.defineProperty(globalThis,key,{configurable:true,value:['getComputedStyle','requestAnimationFrame','cancelAnimationFrame'].includes(key)?window[key].bind(window):window[key]});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {createElement:h,act,useState,useRef}=await import('react');const {createRoot}=await import('react-dom/client');
const {createServer}=await import('vite');const server=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'});
const {GuidedFlow}=await server.ssrLoadModule('/src/GuidedFlow.tsx');
const {CandidateSelect}=await server.ssrLoadModule('/src/CandidateSelect.tsx');
const {useOperationMode,readOperationMode,operationModeKey}=await server.ssrLoadModule('/src/operation-mode.ts');
const {ApiError}=await server.ssrLoadModule('/src/api.ts');
const {useEntry}=await server.ssrLoadModule('/src/use-entry.ts');
const {rememberOperationFocus,operationFocusTarget}=await server.ssrLoadModule('/src/operation-focus.ts');
await server.close();after(()=>window.happyDOM.abort());
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
 await click('選擇／更換對象');await click('查看');assert.equal(calls.filter(c=>c.body).length,0);
 await act(async()=>host.querySelectorAll('input[type=radio]')[0].click());assert.equal(calls.filter(c=>c.body).length,0);
 await click('帶入作業單');assert.equal(guide.args.ok,120);assert.deepEqual(guide.args.defects,[{code:'NG01',quantity:3}]);
 const saved=calls.filter(c=>c.body).length;
 await click('選擇／更換對象');await act(async()=>host.querySelectorAll('input[type=radio]')[0].click());await click('帶入作業單');assert.equal(calls.filter(c=>c.body).length,saved);assert.equal(host.querySelector('#guide-ok').value,'120');
 await click('選擇／更換對象');await act(async()=>host.querySelectorAll('input[type=radio]')[1].click());await click('帶入作業單');assert.equal(guide.args.execution_id,'2002');assert.equal(guide.args.ok,undefined);assert.equal(guide.args.defects,undefined);
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
 const request=async(path,body)=>{calls.push({path,body});if(body)guide={...guide,...body,version:guide.version+1};return structuredClone(guide);};
 const props={apiRequest:request,conversation:{id:'child',messages:[],module:'report'},module:'report',workspace:{records:[record],catalogs:{}},selected:null,signal:0,proposal:null,status:'',disabled:false,date:null,onReply:noop,onAudit:noop,onHome:noop};
 await act(async()=>root.render(h(GuidedFlow,props)));
 const click=async text=>act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent===text).click());
 await click('選擇／更換對象');await act(async()=>host.querySelector('input[type=radio]').click());await click('帶入作業單');
 await act(async()=>host.querySelectorAll('.report-record-picker input[type=radio]')[1].click());await click('查看');
 assert.equal(calls.filter(c=>c.body).length,0);await click('返回工單');await click('帶入作業單');await click('取消選取');assert.equal(host.querySelector('#guide-ok').value,'125');assert.equal(guide.args.report_id,'3001');
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
 await act(async()=>host.querySelector('input[type=radio]').click());assert.ok(host.textContent.includes('帶入作業單'));
 await act(async()=>root.render(h(GuidedFlow,{...props,workspace,presentation:'step-wizard'})));assert.equal(host.querySelector('input[type=radio]').checked,true);assert.equal(host.querySelector('.guide-options span').textContent,'2');
 await act(async()=>root.render(h(GuidedFlow,{...props,presentation:'step-wizard',workspace:{...workspace,records:[],page:1,total:0,query_context:{version:3,filters:{equipment:'MC38',page:1,page_size:20}}}})));
 assert.equal(host.querySelector('#guide-search-equipment').value,'MC38');assert.equal(host.querySelector('.candidate-apply'),null);assert.ok(host.textContent.includes('請重新選取'));assert.equal(mutations.length,0);
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='取消選取').click());assert.equal(host.querySelector('#guide-ok').value,'125');
 await act(async()=>root.unmount());host.remove();
});

test('翻頁沿用後端每頁筆數及隱含品號條件，預設 all 不清除暫選',async()=>{
 const {host,root}=mount();const queries=[];const guide={version:1,action:'',args:{},step:'target',missing:[],ready:false};
 const props={presentation:'step-wizard',apiRequest:async()=>guide,conversation:{id:'paging',module:'report',messages:[]},module:'report',selected:null,signal:0,proposal:null,status:'',disabled:false,date:null,onReply:noop,onAudit:noop,onHome:noop};
 function Harness(){const [workspace,setWorkspace]=useState({records:[{WIP_OPI_WDOEACICO_HIST_SID:'2001',WO:'WO-A',EQP_NO:'MC37'}],catalogs:{},page:1,page_size:1,total:2,query_context:{version:1,filters:{equipment:'MC37',part_no:'EPS-A',page:1,page_size:1}}});return h(GuidedFlow,{...props,workspace,onQuery:async filters=>{queries.push(filters);const result={...workspace,records:[{WIP_OPI_WDOEACICO_HIST_SID:'2002',WO:'WO-B',EQP_NO:'MC37'}],page:2,query_context:{version:2,filters}};setWorkspace(result);return result;}});}
 await act(async()=>root.render(h(Harness)));await act(async()=>host.querySelector('input[type=radio]').click());
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='下一頁').click());assert.equal(queries[0].page_size,'1');assert.equal(queries[0].page,'2');assert.equal(queries[0].part_no,'EPS-A');assert.ok(host.querySelector('.candidate-apply').textContent.includes('WO-A'));assert.ok(host.textContent.includes('查看結果'));
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
