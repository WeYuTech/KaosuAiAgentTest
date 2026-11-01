import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
const window=new Window({url:'http://localhost/'});
for(const key of ['window','document','navigator','HTMLElement','HTMLFormElement','HTMLSelectElement','HTMLInputElement','HTMLTextAreaElement','Node','Element','DocumentFragment','MutationObserver','ResizeObserver','NodeFilter','CustomEvent','Event','KeyboardEvent','MouseEvent','PointerEvent','FocusEvent','getComputedStyle','requestAnimationFrame','cancelAnimationFrame'])Object.defineProperty(globalThis,key,{configurable:true,value:['getComputedStyle','requestAnimationFrame','cancelAnimationFrame'].includes(key)?window[key].bind(window):window[key]});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {createElement:h,act,useState}=await import('react');const {createRoot}=await import('react-dom/client');
const {createServer}=await import('vite');const server=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'});
const {MesAssistantProvider,createAssistantAdapter}=await server.ssrLoadModule('/src/chat/assistant-runtime.tsx');
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

test('歷史初載與錯誤不冒充空集合；切範圍立即請求且空頁無分頁',async()=>{
 const {host,root}=mount(),requests=[];
 const request=path=>new Promise((resolve,reject)=>requests.push({path,resolve,reject}));
 function Harness(){const [history,onProjection]=useState();return h(MesAssistantProvider,{state:{...base,history}},h(ConversationHistory,{actor:'甲',current:null,overlay:false,locked:false,busy:false,refresh:0,request,close:noop,select:noop,create:noop,beforeChange:noop,changed:noop,usage:noop,onWorkChange:noop,budget:null,onProjection}));}
 await act(async()=>root.render(h(Harness)));assert.equal(requests.length,1);assert.ok(host.querySelector('[aria-busy="true"]'));assert.ok(!host.textContent.includes('還沒有歷史聊天'));
 await act(async()=>requests[0].reject(Error('連線失敗')));assert.ok(host.textContent.includes('連線失敗'));assert.ok(!host.textContent.includes('還沒有歷史聊天'));
 await act(async()=>button(host,'已刪除聊天').click());assert.equal(requests.length,2);assert.ok(requests[1].path.includes('scope=deleted'));assert.ok(!host.textContent.includes('目前沒有已刪除的聊天'));
 await act(async()=>requests[1].resolve({records:[],total:0,page:1,page_size:10}));assert.ok(host.textContent.includes('目前沒有已刪除的聊天'));assert.equal(host.querySelector('[aria-label="下一頁"]'),null);assert.equal(host.querySelector('[aria-label="搜尋聊天"]').closest('[hidden]')?.className,'history-search-slot');
 await act(async()=>button(host,'封存聊天室').click());assert.equal(requests.length,3);
 await act(async()=>requests[2].resolve({records:[],total:0,page:1,page_size:10}));assert.ok(host.textContent.includes('尚無封存聊天'));
 await act(async()=>root.unmount());host.remove();
});

test('搜尋聚焦及組字清空不隱藏欄位；伺服器 page_size 控制多頁',async()=>{
 const {host,root}=mount(),requests=[];const request=path=>new Promise(resolve=>requests.push({path,resolve}));
 function Harness(){const [history,onProjection]=useState();return h(MesAssistantProvider,{state:{...base,history}},h(ConversationHistory,{actor:'甲',current:null,overlay:false,locked:false,busy:false,refresh:0,request,close:noop,select:noop,create:noop,beforeChange:noop,changed:noop,usage:noop,onWorkChange:noop,budget:null,onProjection}));}
 await act(async()=>root.render(h(Harness)));await act(async()=>requests[0].resolve({records:[],total:21,page:1,page_size:10}));assert.ok(host.textContent.includes('1 / 3'));
 await act(async()=>host.querySelector('[aria-label="下一頁"]').click());assert.equal(requests.length,2);assert.ok(requests[1].path.includes('page=2'));
 const input=host.querySelector('[aria-label="搜尋聊天"]');await act(async()=>input.focus());await act(async()=>requests[1].resolve({records:[],total:0,page:2,page_size:10}));assert.equal(input.closest('[hidden]'),null);
 await act(async()=>input.dispatchEvent(new Event('compositionstart',{bubbles:true})));await act(async()=>input.blur());assert.equal(input.closest('[hidden]'),null);
 await act(async()=>input.dispatchEvent(new Event('compositionend',{bubbles:true})));assert.ok(input.closest('[hidden]'));
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
 await act(async()=>host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));assert.ok(host.textContent.includes('核對管理設定'));assert.equal(document.activeElement.tagName,'H3');
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
