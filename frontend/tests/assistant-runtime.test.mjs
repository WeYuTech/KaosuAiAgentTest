import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
const window=new Window({url:'http://localhost/'});
for(const key of ['window','document','navigator','HTMLElement','HTMLInputElement','HTMLTextAreaElement','Node','Element','DocumentFragment','MutationObserver','ResizeObserver','NodeFilter','CustomEvent','Event','KeyboardEvent','MouseEvent','PointerEvent','FocusEvent','getComputedStyle','requestAnimationFrame','cancelAnimationFrame'])Object.defineProperty(globalThis,key,{configurable:true,value:['getComputedStyle','requestAnimationFrame','cancelAnimationFrame'].includes(key)?window[key].bind(window):window[key]});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {createElement:h,act,useState}=await import('react');const {createRoot}=await import('react-dom/client');
const {createServer}=await import('vite');const server=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'});
const {MesAssistantProvider,createAssistantAdapter}=await server.ssrLoadModule('/src/chat/assistant-runtime.tsx');
const {ConversationComposer}=await server.ssrLoadModule('/src/ConversationComposer.tsx');
const {RequestProgress}=await server.ssrLoadModule('/src/RequestProgress.tsx');
const {ThreadMessages}=await server.ssrLoadModule('/src/components/assistant-ui/elements/thread.aui.tsx');
const {ChatQueryResults}=await server.ssrLoadModule('/src/ChatQueryResults.tsx');
const {setLocale,t}=await server.ssrLoadModule('/src/i18n.ts');
const {ConversationHistory}=await server.ssrLoadModule('/src/ConversationHistory.tsx');
const {PanelLoadBoundary}=await server.ssrLoadModule('/src/PanelLoadBoundary.tsx');
const {copyTextWithFallback,copyUsingSelection}=await server.ssrLoadModule('/src/hooks/use-copy-to-clipboard.ts');await server.close();
after(()=>window.happyDOM.abort());
const base={conversationId:'chat-a',messages:[],draft:'良品 120',busy:false,disabled:false,sendDisabled:false,onSend:()=>{}};
const message={role:'user',content:[{type:'text',text:'良品 120'}],attachments:[]};
test('舊聊天、停用與忙碌 adapter 均不能發送；不提供 MES 重試入口',async()=>{
  let latest={...base},sent=0;const initial={...base,onSend:()=>sent++};latest=initial;
  const adapter=createAssistantAdapter(initial,()=>latest,async action=>action());
  assert.equal(adapter.onReload,undefined);assert.equal(adapter.onEdit,undefined);assert.equal(adapter.onCancel,undefined);
  for(const patch of [{conversationId:'chat-b'},{busy:true},{disabled:true},{sendDisabled:true}]){latest={...initial,...patch};await adapter.onNew(message);}
  latest=initial;await adapter.onNew({...message,content:[{type:'image',image:'x'}]});await adapter.onNew({...message,attachments:[{}]});assert.equal(sent,0);
  await adapter.onNew(message);assert.equal(sent,1);
});
test('正式 Composer 按鈕重複點擊只發一次；中文組字與換行不送出',async()=>{
  const host=document.createElement('div');host.id='mes-ai-chat-root';document.body.append(host);const root=createRoot(host);let sent=0,release;
  const state={...base,onSend:()=>{sent++;return new Promise(resolve=>release=resolve);}};
  await act(async()=>root.render(h(MesAssistantProvider,{state},h(ConversationComposer,{id:'test-composer',value:state.draft,onChange:()=>{},placeholder:'輸入'}))));
  const input=host.querySelector('textarea'),button=host.querySelector('button');assert.ok(input);assert.ok(button);
  await act(async()=>{input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',shiftKey:true,bubbles:true}));input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true}));});assert.equal(sent,0);
  await act(async()=>{button.click();button.click();});assert.equal(sent,1);
  await act(async()=>release());await act(async()=>root.unmount());host.remove();
});
test('等待中按停止不呼叫送出或取消 API，原請求鎖定到回覆',async()=>{
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host);let sent=0,stopped=0;
  function Harness(){const [stop,setStop]=useState(false);return h(MesAssistantProvider,{state:{...base,busy:true,disabled:true,onSend:()=>sent++}},h(ConversationComposer,{id:'waiting',value:'原需求',onChange:()=>{},placeholder:'輸入',busy:true,disabled:true,stopped:stop,onStop:()=>{stopped++;setStop(true);}}));}
  await act(async()=>root.render(h(Harness)));
  const button=host.querySelector('button');assert.equal(button.getAttribute('aria-label'),'停止等待');assert.equal(button.disabled,false);
  await act(async()=>button.click());assert.equal(stopped,1);assert.equal(sent,0);assert.equal(button.disabled,true);assert.equal(host.querySelector('textarea').disabled,true);assert.equal(host.querySelector('textarea').value,'');
  await act(async()=>button.click());assert.equal(stopped,1);assert.equal(sent,0);
  await act(async()=>root.unmount());host.remove();
});
test('送出等待只隱藏輸入顯示；拒絕或未知恢復原句，成功由草稿狀態清空',async()=>{
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);let changed=0;
 const render=(busy,draft)=>h(MesAssistantProvider,{state:{...base,busy,draft}},h(ConversationComposer,{id:'delivery',value:draft,onChange:()=>changed++,placeholder:'輸入',busy,disabled:busy,onStop:()=>{}}));
 try{
  for(const outcome of ['rejected','unknown','succeeded']){
   await act(async()=>root.render(render(false,'MC37 良品 125')));
   assert.equal(host.querySelector('textarea').value,'MC37 良品 125');
   await act(async()=>root.render(render(true,'MC37 良品 125')));
   assert.equal(host.querySelector('textarea').value,'');assert.equal(host.querySelector('textarea').disabled,true);
   await act(async()=>root.render(render(false,outcome==='succeeded'?'':'MC37 良品 125')));
   assert.equal(host.querySelector('textarea').value,outcome==='succeeded'?'':'MC37 良品 125');
  }
  assert.equal(changed,0);
 }finally{await act(async()=>root.unmount());host.remove();}
});

test('管理區塊載入失敗只隔離面板，原作業仍可見且不刷新',async()=>{
  const host=document.createElement('div');host.id='mes-ai-chat-root';document.body.append(host);let caught=0,closed=0;
  const root=createRoot(host,{onCaughtError:()=>caught++});
  function Unavailable(){throw Error('隔離延遲載入失敗');}
  try {await act(async()=>root.render(h('div',null,h('input',{'aria-label':'原作業',defaultValue:'MC37 良品 120'}),h(PanelLoadBoundary,{close:()=>closed++},h(Unavailable)))));
  assert.equal(caught,1);assert.equal(host.querySelector('[aria-label="原作業"]').value,'MC37 良品 120');
  assert.match(host.querySelector('[role="alert"]').textContent,/關閉此視窗不會影響目前作業/);
  await act(async()=>host.querySelector('[role="dialog"] button').click());assert.equal(closed,1);
  }finally{await act(async()=>root.unmount());host.remove();}
});
test('HTTP 或剪貼簿權限拒絕時採來源相容複製；失敗不回報成功',async()=>{
  let fallback=0;
  assert.equal(await copyTextWithFallback('文字',{writeText:async()=>{}},()=>{fallback++;return true;}),true);assert.equal(fallback,0);
  assert.equal(await copyTextWithFallback('文字',{writeText:async()=>{throw Error('拒絕');}},()=>{fallback++;return true;}),true);assert.equal(fallback,1);
  assert.equal(await copyTextWithFallback('文字',undefined,()=>false),false);
  assert.equal(await copyTextWithFallback('文字',undefined,()=>{throw Error('失敗');}),false);
  const original=document.execCommand;document.execCommand=()=>true;
  const input=document.createElement('input');document.body.append(input);input.focus();
  assert.equal(copyUsingSelection('原文字'),true);assert.equal(document.activeElement,input);assert.equal(document.querySelector('.mes-ai-copy-target'),null);
  document.execCommand=original;input.remove();
});

test('換帳號立刻撤下舊聊天列，晚到清單不可重現前人資料',async()=>{
  const host=document.createElement('div');host.id='mes-ai-chat-root';document.body.append(host);const root=createRoot(host);
  const pending=[];const request=()=>new Promise(resolve=>pending.push(resolve));const noop=()=>{};
  function Harness({actor}){
    const [history,setHistory]=useState();
    return h(MesAssistantProvider,{state:{...base,history}},h(ConversationHistory,{actor,current:null,overlay:false,locked:false,busy:false,refresh:0,request,close:noop,select:noop,create:noop,beforeChange:noop,changed:noop,usage:noop,onWorkChange:noop,budget:null,onProjection:setHistory}));
  }
  const records=[{id:'甲聊天',module:'report',title:'甲的私人作業',is_pinned:false,is_archived:false,is_deleted:false,metadata_version:0,created_at:new Date().toISOString(),updated_at:new Date().toISOString(),message_count:0}];
  await act(async()=>root.render(h(Harness,{actor:'甲'})));
  await act(async()=>new Promise(resolve=>setTimeout(resolve,220)));
  await act(async()=>pending.shift()({records,total:1,page:1,page_size:30}));assert.ok(host.textContent.includes('甲的私人作業'));
  await act(async()=>root.render(h(Harness,{actor:'乙'})));assert.equal(host.textContent.includes('甲的私人作業'),false);
  await act(async()=>new Promise(resolve=>setTimeout(resolve,220)));
  await act(async()=>root.render(h(Harness,{actor:'丙'})));
  await act(async()=>pending.shift()({records,total:1,page:1,page_size:30}));assert.equal(host.textContent.includes('甲的私人作業'),false);
  await act(async()=>root.unmount());host.remove();
});


test('等待狀態、停止鍵與查詢卡的可見文字及無障礙名稱均隨語言切換',async()=>{
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{
  for(const locale of ['en','th']){
   setLocale(locale);
   const render=stopped=>h(MesAssistantProvider,{state:{...base,busy:true}},h('div',null,h(RequestProgress,{stopped}),h(ConversationComposer,{id:'localized',value:'',onChange:()=>{},placeholder:'',busy:true,disabled:true,onStop:()=>{},stopped}),h(ChatQueryResults,{workspace:{records:[{WO:'WO-A'}],catalogs:{},total:1,page:1,page_size:20},onAll:()=>{}})));
   await act(async()=>root.render(render(false)));
   assert.notEqual(t('正在查詢與整理資料…'),'正在查詢與整理資料…');assert.equal(host.querySelector('[role=status]').textContent,t('正在查詢與整理資料…'));
   assert.equal(host.querySelector('.aui-composer-send').getAttribute('aria-label'),t('停止等待'));
   assert.ok(host.querySelector('section').getAttribute('aria-label'));
   assert.doesNotMatch(host.textContent,/[\u3400-\u9fff]/);
   await act(async()=>root.render(render(true)));
   assert.match(host.querySelector('[role=status]').textContent,locale==='en'?/original request is still processing/:/คำขอเดิม/);
   assert.doesNotMatch(host.textContent,/[\u3400-\u9fff]/);
  }
 }finally{setLocale('zh-TW');await act(async()=>root.unmount());host.remove();}
});

test('查詢卡預覽四筆，完整資料入口與空結果、未知總數分開呈現',async()=>{
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);let opened=0;
 const records=Array.from({length:6},(_,i)=>({WO:'WO-'+(i+1),PART_NO:'P',MANUAL_OK:i,MANUAL_NG:0}));
 const render=workspace=>h(ChatQueryResults,{workspace:{catalogs:{},...workspace},onAll:()=>opened++});
 try{
  await act(async()=>root.render(render({records,page:2,page_size:6,total:20})));
  assert.equal(host.querySelectorAll('tbody tr').length,4);assert.match(host.textContent,/7–10／20 筆/);
  await act(async()=>host.querySelector('.query-pagination button').click());assert.equal(opened,1);
  await act(async()=>root.render(render({records,page:1,page_size:20,total:6})));
  assert.match(host.textContent,/1–4／6 筆/);assert.doesNotMatch(host.textContent,/已顯示全部結果/);
  await act(async()=>root.render(render({records:[],total:0})));
  assert.match(host.textContent,/修改條件/);assert.equal(host.querySelector('table'),null);
  await act(async()=>root.render(render({records})));
  assert.match(host.textContent,/總筆數未提供/);assert.doesNotMatch(host.textContent,/已顯示全部結果/);
 }finally{await act(async()=>root.unmount());host.remove();}
});


test('精靈可讀到最新助理補問，切回聊天保留全部訊息且不重新送出',async()=>{
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);let sent=0;
 const messages=[{role:'user',content:'查工單'},{role:'assistant',content:'找到工單'},{role:'user',content:'我要報工'},{role:'assistant',content:'請補充本次人工良品數量？'}];
 const render=compact=>h(MesAssistantProvider,{state:{...base,messages,onSend:()=>sent++}},h(ThreadMessages,{latestAssistantOnly:compact}));
 try{
  await act(async()=>root.render(render(true)));assert.equal(host.querySelectorAll('[data-role]').length,1);assert.match(host.textContent,/請補充本次人工良品數量/);
  await act(async()=>root.render(render(false)));assert.equal(host.querySelectorAll('[data-role]').length,4);assert.match(host.textContent,/找到工單/);assert.equal(sent,0);
 }finally{await act(async()=>root.unmount());host.remove();}
});
