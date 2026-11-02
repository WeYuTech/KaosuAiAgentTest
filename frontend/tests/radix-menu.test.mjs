import {test, after} from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
const window = new Window({url:'http://localhost/'});
for (const key of ['window','document','navigator','HTMLElement','HTMLInputElement','Node','Element','DocumentFragment','MutationObserver','ResizeObserver','NodeFilter','HTMLTextAreaElement','CustomEvent','Event','KeyboardEvent','MouseEvent','PointerEvent','FocusEvent','getComputedStyle','requestAnimationFrame','cancelAnimationFrame']) {
  Object.defineProperty(globalThis,key,{configurable:true,value: typeof window[key] === 'function' && ['getComputedStyle','requestAnimationFrame','cancelAnimationFrame'].includes(key) ? window[key].bind(window) : window[key]});
}
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {createElement,act}=await import('react');
const {createRoot}=await import('react-dom/client');
const {createServer}=await import('vite');
const server=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'});
const {HeaderMenu}=await server.ssrLoadModule('/src/HeaderMenu.tsx');
const {setLocale,t}=await server.ssrLoadModule('/src/i18n.ts');
await server.close();
after(()=>window.happyDOM.abort());
for(const locale of ['zh-TW','en','th']) test(`真實 Radix 選單三語、主題、鍵盤與 Portal 範圍：${locale}`,async()=>{
  const host=document.createElement('div');host.id='mes-ai-chat-root';document.body.append(host);
  const mount=document.createElement('div');host.append(mount);const root=createRoot(mount);const changes=[];
  setLocale(locale);
  await act(async()=>root.render(createElement(HeaderMenu,{signedIn:true,locale,theme:'light',localeBusy:false,onLocale:v=>changes.push(['locale',v]),onTheme:v=>changes.push(['theme',v]),onManage:()=>{},onUsage:()=>{},onMinimize:()=>{},onHistory:()=>{}})));
  const trigger=host.querySelector('button[aria-haspopup="menu"]');assert.ok(trigger);
  await act(async()=>{trigger.focus();trigger.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));});
  const menu=host.querySelector('[role="menu"]');assert.ok(menu,'選單 Portal 留在助理容器');
  assert.ok(menu.querySelector(`[aria-label="${t('語言')}"]`));assert.ok(menu.querySelector(`[aria-label="${t('主題')}"]`));
  for(const text of ['繁體中文','English','ไทย',t('MES 藍色'),t('封存聊天'),t('已刪除聊天')])assert.ok(menu.textContent.includes(text));
  const thai=[...menu.querySelectorAll('[role="menuitemradio"]')].find(x=>x.textContent==='ไทย');
  await act(async()=>{thai.dispatchEvent(new MouseEvent('click',{bubbles:true}));});
  assert.deepEqual(changes,[['locale','th']]);
  await act(async()=>root.unmount());host.remove();
});
