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
await server.close();after(()=>window.happyDOM.abort());
const noop=()=>{};
function mount(){const host=document.createElement('div');host.id='mes-ai-chat-root';document.body.append(host);return {host,root:createRoot(host)};}
const tick=()=>new Promise(r=>setTimeout(r,720));
const inputValue=(input,text)=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,text);input.dispatchEvent(new Event('input',{bubbles:true}));};

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

