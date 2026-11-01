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
test('管理區塊載入失敗只隔離面板，原作業仍可見且不刷新',async()=>{
  const host=document.createElement('div');host.id='mes-ai-chat-root';document.body.append(host);let caught=0,closed=0;
  const root=createRoot(host,{onCaughtError:()=>caught++});
  function Unavailable(){throw Error('隔離延遲載入失敗');}
  await act(async()=>root.render(h('div',null,h('input',{'aria-label':'原作業',defaultValue:'MC37 良品 120'}),h(PanelLoadBoundary,{close:()=>closed++},h(Unavailable)))));
  assert.equal(caught,1);assert.equal(host.querySelector('[aria-label="原作業"]').value,'MC37 良品 120');
  assert.match(host.querySelector('[role="alert"]').textContent,/原作業已保留/);
  await act(async()=>host.querySelector('[role="dialog"] button').click());assert.equal(closed,1);
  await act(async()=>root.unmount());host.remove();
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
