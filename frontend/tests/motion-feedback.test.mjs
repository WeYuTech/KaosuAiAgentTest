import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
const window=new Window({url:'http://localhost/'});
for(const key of ['window','document','navigator','HTMLElement','HTMLFormElement','HTMLSelectElement','HTMLInputElement','HTMLTextAreaElement','Node','Element','DocumentFragment','MutationObserver','ResizeObserver','NodeFilter','CustomEvent','Event','KeyboardEvent','MouseEvent','PointerEvent','FocusEvent','getComputedStyle','requestAnimationFrame','cancelAnimationFrame'])Object.defineProperty(globalThis,key,{configurable:true,value:['getComputedStyle','requestAnimationFrame','cancelAnimationFrame'].includes(key)?window[key].bind(window):window[key]});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {createElement:h,act,useState,useRef}=await import('react');const {createRoot}=await import('react-dom/client');
const {createServer}=await import('vite');const server=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'});
const {MesAssistantProvider,createAssistantAdapter}=await server.ssrLoadModule('/src/chat/assistant-runtime.tsx');
const {HeaderMenu}=await server.ssrLoadModule('/src/HeaderMenu.tsx');
const {ConversationHistory}=await server.ssrLoadModule('/src/ConversationHistory.tsx');
const {ManagementPanel}=await server.ssrLoadModule('/src/ManagementPanel.tsx');
const {OperationDialog}=await server.ssrLoadModule('/src/OperationDialog.tsx');
const {beginAttempt,acceptAttempt,projectMessages}=await server.ssrLoadModule('/src/chat/message-presentation.ts');
const {useChatScroll}=await server.ssrLoadModule('/src/chat/use-chat-scroll.ts');
await server.close();
after(()=>window.happyDOM.abort());
const base={conversationId:null,messages:[],draft:'',busy:false,disabled:false,sendDisabled:false,onSend:()=>{}};
const noop=()=>{};
function mount(){const host=document.createElement('div');host.id='mes-ai-chat-root';document.body.append(host);return {host,root:createRoot(host)};}
const button=(host,text)=>[...host.querySelectorAll('button')].find(b=>b.textContent.trim()===text);
const tick=()=>new Promise(r=>setTimeout(r,220));

test('全域入口在清單未重掛下切範圍；延遲回覆隔離、焦點與空集合',async()=>{
 const {host,root}=mount(),requests=[];
 const request=path=>new Promise((resolve,reject)=>requests.push({path,resolve,reject}));
 function Harness(){const [history,onProjection]=useState(),[visible,setVisible]=useState(false);const controller=useRef();return h(MesAssistantProvider,{state:{...base,history}},h(HeaderMenu,{signedIn:true,locale:'zh-TW',theme:'light',localeBusy:false,onLocale:noop,onTheme:noop,onManage:noop,onUsage:noop,onMinimize:noop,onHistory:scope=>{setVisible(true);controller.current.showScope(scope);}}),h(ConversationHistory,{ref:controller,visible,actor:'甲',current:null,overlay:true,locked:true,busy:false,refresh:0,request,close:()=>setVisible(false),select:noop,create:noop,beforeChange:noop,changed:noop,usage:noop,onWorkChange:noop,budget:null,onProjection}));}
 try {
 await act(async()=>root.render(h(Harness)));const original=host.querySelector('aside');assert.equal(requests.length,1);assert.ok(original.hidden);
 const open=async name=>{await act(async()=>host.querySelector('[aria-label="更多功能"]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})));await act(async()=>[...host.querySelectorAll('[role=menuitem]')].find(x=>x.textContent===name).click());};
 await open('已刪除聊天');assert.equal(requests.length,2);assert.ok(requests[1].path.includes('scope=deleted'));assert.equal(original.hidden,false);assert.equal(document.activeElement.textContent,'已刪除聊天');assert.equal(host.querySelector('[aria-label="聊天範圍"]'),null);
 await act(async()=>requests[0].resolve({records:[{id:'old',title:'不可出現的舊回覆'}],total:1,page:1,page_size:30}));assert.ok(!host.textContent.includes('不可出現'));
 await act(async()=>requests[1].resolve({records:[],total:0,page:1,page_size:30}));assert.equal(host.querySelectorAll('.history-empty').length,1);assert.equal(host.querySelector('.history-empty').textContent,'尚無聊天');assert.equal(host.querySelector('[aria-label="下一頁"]'),null);
 await open('封存聊天');assert.equal(host.querySelector('aside'),original);assert.equal(document.activeElement.textContent,'封存聊天');assert.equal(requests.length,3);
 await act(async()=>requests[2].reject(Error('連線失敗')));assert.ok(host.textContent.includes('連線失敗'));assert.equal(host.querySelector('.history-empty'),null);
 await act(async()=>button(host,'返回聊天').click());assert.ok(requests.at(-1).path.includes('scope=active'));assert.equal(document.activeElement,host.querySelector('button[aria-label="搜尋聊天"]'));
 assert.deepEqual([...host.querySelectorAll('.history-group h3')].map(x=>x.textContent),['已釘選','近期']);assert.ok(button(host,'新聊天').disabled,'未知／待確認鎖定未被管理導覽解除');
 } finally {await act(async()=>root.unmount());host.remove();}
});

test('搜尋聚焦及組字清空不隱藏欄位；伺服器 page_size 控制多頁',async()=>{
 const {host,root}=mount(),requests=[];const request=path=>new Promise(resolve=>requests.push({path,resolve}));
 function Harness(){const [history,onProjection]=useState();return h(MesAssistantProvider,{state:{...base,history}},h(ConversationHistory,{actor:'甲',current:null,overlay:false,locked:false,busy:false,refresh:0,request,close:noop,select:noop,create:noop,beforeChange:noop,changed:noop,usage:noop,onWorkChange:noop,budget:null,onProjection}));}
 await act(async()=>root.render(h(Harness)));await act(async()=>requests[0].resolve({records:[],total:21,page:1,page_size:10}));assert.ok(host.textContent.includes('1 / 3'));
 await act(async()=>host.querySelector('[aria-label="下一頁"]').click());assert.equal(requests.length,2);assert.ok(requests[1].path.includes('page=2'));
 await act(async()=>host.querySelector('button[aria-label="搜尋聊天"]').click());const input=host.querySelector('input[aria-label="搜尋聊天"]');await act(async()=>input.focus());await act(async()=>requests[1].resolve({records:[],total:21,page:2,page_size:10}));assert.equal(input.closest('[hidden]'),null);
 await act(async()=>input.dispatchEvent(new Event('compositionstart',{bubbles:true})));await act(async()=>input.blur());assert.equal(input.closest('[hidden]'),null);
 await act(async()=>input.dispatchEvent(new Event('compositionend',{bubbles:true})));assert.equal(input.closest('[hidden]'),null);await act(async()=>host.querySelector('[aria-label="關閉搜尋"]').click());assert.ok(input.closest('[hidden]'));assert.equal(document.activeElement,host.querySelector('button[aria-label="搜尋聊天"]'));
 await act(async()=>root.unmount());host.remove();
});

test('定時報告初載不顯示假空態；解析成功不搶焦點，核對返回保留值',async()=>{
 const {host,root}=mount(),requests=[];const request=(path,body)=>new Promise((resolve,reject)=>requests.push({path,body,resolve,reject}));
 await act(async()=>root.render(h(ManagementPanel,{section:'reports',request,close:noop,roles:['report','review'],locked:false})));
 assert.ok(host.textContent.includes('正在載入報告…'));assert.ok(!host.textContent.includes('尚未建立定時報告'));
 await act(async()=>requests.shift().resolve({records:[]}));assert.ok(host.textContent.includes('尚未建立定時報告'));
 const input=host.querySelector('textarea');
 await act(async()=>{const setter=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set;setter.call(input,'每天 08:00 產生 MC37 的報工報告');input.dispatchEvent(new Event('input',{bubbles:true}));});
 const parse=button(host,'解析並填入');await act(async()=>{parse.focus();parse.click();});assert.ok(host.textContent.includes('正在解析條件…'));
 await act(async()=>requests.shift().resolve({title:'早班報告',module:'report',equipment:'MC37',frequency:'weekdays',hour:8,minute:0}));assert.equal(document.activeElement,parse);assert.ok(host.textContent.includes('已填入，請核對'));
 await act(async()=>host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));assert.ok(host.textContent.includes('建立定時報告？'));assert.equal(document.activeElement.tagName,'H2');assert.equal(document.activeElement.textContent,'建立定時報告？');
 await act(async()=>button(host,'返回修改').click());assert.equal([...host.querySelectorAll('input')].some(x=>x.value==='早班報告'),true);
 await act(async()=>root.unmount());host.remove();
});

test('受控 Dialog 關閉移除可互動內容；五次重開無殘留遮罩',async()=>{
 const {host,root}=mount();const trigger=document.createElement('button');host.append(trigger);trigger.focus();
 for(let i=0;i<5;i++){
  await act(async()=>root.render(h(OperationDialog,{open:true,title:'測試視窗',close:noop,returnFocus:()=>trigger},h('button',null,'核對'))));assert.equal(host.querySelectorAll('[role="dialog"]').length,1);
  await act(async()=>root.render(h(OperationDialog,{open:false,title:'測試視窗',close:noop,returnFocus:()=>trigger},h('button',null,'核對'))));assert.equal(host.querySelectorAll('[role="dialog"]:not([inert])').length,0);
 }
 await act(async()=>root.unmount());host.remove();
});



test('待處理投影用原嘗試及回覆序號調和，相同文字不去重且舊訊息識別穩定',()=>{
 const original=[{role:'user',content:'100'},{role:'assistant',content:'已讀取'}];
 let state=beginAttempt(null,'a',2,'100','attempt-1');let rows=projectMessages(original,'a',state);
 assert.equal(rows.length,3);assert.equal(rows[2].delivery,'pending');assert.equal(rows[2].uiId,'attempt-1');
 const reply=[...original,{role:'user',content:'100'},{role:'assistant',content:'新回覆'}];state=acceptAttempt(state,reply);rows=projectMessages(reply,'a',state);
 assert.equal(rows.length,4);assert.equal(rows[2].uiId,'attempt-1');assert.equal(rows[2].delivery,undefined);assert.equal(rows[0].enter,undefined);
 state=beginAttempt(state,'a',4,'100','attempt-2');rows=projectMessages(reply,'a',state);assert.equal(rows[2].uiId,'attempt-1');assert.equal(rows[4].uiId,'attempt-2');
 assert.deepEqual(projectMessages(reply,'b',state),reply);
 for(const delivery of ['rejected','unknown']){const failed={...state,attempt:{...state.attempt,delivery}};assert.equal(projectMessages(reply,'a',failed)[4].delivery,delivery);}
});

test('聊天捲動只控制容器，向上接管；動態減少動畫立即完成定位',async()=>{
 const {host,root}=mount();let api,mediaListener;const calls=[];const media={matches:false,addEventListener:(_,fn)=>mediaListener=fn,removeEventListener:noop};const originalMatch=window.matchMedia;window.matchMedia=()=>media;
 function Harness(){api=useChatScroll('a',true);return h('div',{ref:api.viewport},h('div',{ref:api.content},'長文'));}
 await act(async()=>root.render(h(Harness)));const view=host.firstChild;view.scrollTo=options=>calls.push(options);
 Object.defineProperty(view,'scrollHeight',{configurable:true,value:2000});Object.defineProperty(view,'clientHeight',{configurable:true,value:400});
 await act(async()=>api.latest());assert.equal(calls.at(-1).behavior,'smooth');
 await act(async()=>view.dispatchEvent(new window.WheelEvent('wheel',{deltaY:-10})));assert.equal(calls.at(-1).behavior,'instant');assert.equal(api.away,true);
 await act(async()=>api.latest());await act(async()=>{media.matches=true;mediaListener();});assert.deepEqual(calls.at(-1),{top:2000,behavior:'instant'});
 await act(async()=>api.latest());assert.equal(calls.at(-1).behavior,'instant');
 await act(async()=>root.unmount());host.remove();window.matchMedia=originalMatch;
});


test('定時報告暫停、恢復及刪除以實際動詞確認，按確認前不寫入',async()=>{
 const {host,root}=mount(),writes=[];let state='active',version=1;
 const request=async(path,body)=>{if(body){writes.push(body);state=body.status;version++;return {}; }return {records:state==='deleted'?[]:[{id:'job-1',title:'早班驗收',module:'report',equipment:'MC37',frequency:'daily',hour:8,minute:0,status:state,version,next_run_at:'2026-11-02T01:00:00Z'}]};};
 try {
 await act(async()=>root.render(h(ManagementPanel,{section:'reports',request,close:noop,roles:['report','review'],locked:false})));
 assert.equal(host.querySelector('.operation-dialog-header h2').textContent,'定時報告');
 for(const [verb,status] of [['暫停','paused'],['恢復','active'],['刪除','deleted']]){
 const count=writes.length;
 await act(async()=>host.querySelector('[aria-label="報告操作"]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})));
 await act(async()=>[...document.querySelectorAll('[role=menuitem]')].find(x=>x.textContent===verb).click());
 assert.equal(host.querySelector('.operation-dialog-header h2').textContent,verb+'定時報告？');
 assert.equal(document.activeElement,host.querySelector('.operation-dialog-header h2'));
 assert.ok(host.querySelector('.management-summary').textContent.includes('早班驗收'));assert.equal(writes.length,count);
 await act(async()=>button(host,verb).click());assert.equal(writes.length,count+1);assert.equal(writes.at(-1).status,status);assert.equal(writes.at(-1).version,count+1);
 }
 assert.ok(host.textContent.includes('尚未建立定時報告'));
 } finally {await act(async()=>root.unmount());host.remove();}
});


test('固定分組保留伺服器順序，第二頁無釘選不冒充全帳號無釘選；刪除末列退回有效頁',async()=>{
 const {host,root}=mount(),requests=[];let controller;
 const row=(id,pin=false)=>({id,module:'report',title:id,is_pinned:pin,is_archived:false,is_deleted:false,metadata_version:3,updated_at:'2026-01-01T00:00:00Z'});
 const request=(path,body)=>new Promise((resolve,reject)=>requests.push({path,body,resolve,reject}));
 function Harness(){const [history,onProjection]=useState();const ref=useRef();controller=ref;return h(MesAssistantProvider,{state:{...base,history}},h(ConversationHistory,{ref,actor:'甲',current:null,overlay:false,locked:false,busy:false,refresh:0,request,close:noop,select:noop,create:noop,beforeChange:noop,changed:noop,usage:noop,onWorkChange:noop,budget:null,onProjection}));}
 try {
 await act(async()=>root.render(h(Harness)));
 await act(async()=>requests[0].resolve({records:[row('釘選乙',true),row('釘選甲',true),row('近期乙')],total:4,page:1,page_size:3}));
 const groups=host.querySelectorAll('.history-group');assert.deepEqual([...groups[0].querySelectorAll('.history-select')].map(x=>x.textContent),['釘選乙','釘選甲']);assert.deepEqual([...groups[1].querySelectorAll('.history-select')].map(x=>x.textContent),['近期乙']);
 await act(async()=>host.querySelector('[aria-label="下一頁"]').click());await act(async()=>requests[1].resolve({records:[row('近期甲')],total:4,page:2,page_size:3}));
 assert.equal(groups[0].querySelectorAll('.history-row').length,0);assert.equal(groups[0].querySelector('h3').textContent,'已釘選');assert.equal(host.querySelector('.history-empty'),null);
 await act(async()=>host.querySelector('[aria-label="聊天室選單：近期甲"]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})));await act(async()=>[...host.querySelectorAll('[role=menuitem]')].find(x=>x.textContent==='刪除聊天').click());
 assert.ok(host.textContent.includes('更多功能 → 已刪除聊天'));await act(async()=>button(host,'刪除').click());assert.deepEqual(requests.at(-1).body,{version:3,is_deleted:true});
 await act(async()=>requests.at(-1).resolve({...row('近期甲'),is_deleted:true,metadata_version:4}));await act(async()=>requests.at(-1).resolve({records:[],total:3,page:2,page_size:3}));
 assert.ok(requests.at(-1).path.includes('page=1'));assert.equal(host.querySelector('.history-empty'),null,'回退頁讀取中不閃現空集合');
 await act(async()=>requests.at(-1).resolve({records:[row('釘選乙',true),row('釘選甲',true),row('近期乙')],total:3,page:1,page_size:3}));assert.equal(host.querySelector('[aria-label="下一頁"]'),null);
 } finally {await act(async()=>root.unmount());host.remove();}
});

test('搜尋與管理返回均清空查詢回第一頁；搜尋關閉還焦點且晚回覆不能污染新範圍',async()=>{
 const {host,root}=mount(),requests=[];let controller;
 const request=path=>new Promise(resolve=>requests.push({path,resolve}));
 function Harness(){const [history,onProjection]=useState();const ref=useRef();controller=ref;return h(MesAssistantProvider,{state:{...base,history}},h(ConversationHistory,{ref,actor:'甲',current:null,overlay:false,locked:false,busy:false,refresh:0,request,close:noop,select:noop,create:noop,beforeChange:noop,changed:noop,usage:noop,onWorkChange:noop,budget:null,onProjection}));}
 try {
 await act(async()=>root.render(h(Harness)));await act(async()=>requests[0].resolve({records:[],total:0,page:1,page_size:30}));
 await act(async()=>host.querySelector('button[aria-label="搜尋聊天"]').click());const input=host.querySelector('input');
 await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,'MC37');input.dispatchEvent(new Event('input',{bubbles:true}));});
 await act(tick);const old=requests.at(-1);assert.ok(old.path.includes('q=MC37'));
 await act(async()=>controller.current.showScope('archived'));assert.ok(requests.at(-1).path.includes('q=&scope=archived&page=1'));assert.ok(input.closest('[hidden]'));assert.equal(input.value,'');
 await act(async()=>old.resolve({records:[{id:'old',title:'不應出現'}],total:1,page:1,page_size:30}));assert.ok(!host.textContent.includes('不應出現'));
 await act(async()=>button(host,'返回聊天').click());assert.ok(requests.at(-1).path.includes('q=&scope=active&page=1'));
 await act(async()=>host.querySelector('button[aria-label="搜尋聊天"]').click());await act(async()=>input.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));assert.ok(input.closest('[hidden]'));assert.equal(document.activeElement,host.querySelector('button[aria-label="搜尋聊天"]'));
 } finally {await act(async()=>root.unmount());host.remove();}
});
