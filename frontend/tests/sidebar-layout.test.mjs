import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
const window=new Window({url:'http://localhost/'});
for(const key of ['window','document','navigator','HTMLElement','HTMLFormElement','HTMLSelectElement','HTMLInputElement','Node','Element','DocumentFragment','MutationObserver','ResizeObserver','NodeFilter','CustomEvent','Event','KeyboardEvent','PointerEvent','getComputedStyle','requestAnimationFrame','cancelAnimationFrame','localStorage'])Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:['getComputedStyle','requestAnimationFrame','cancelAnimationFrame'].includes(key)?window[key].bind(window):window[key]});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {createElement:h,act,useState,useRef,useEffect}=await import('react');const {createRoot}=await import('react-dom/client');
const {createServer}=await import('vite');const server=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'});
const {SidebarSplitter,useSidebarLayout,sidebarLimit,clampSidebar,SIDEBAR_KEY}=await server.ssrLoadModule('/src/SidebarSplitter.tsx');await server.close();after(()=>window.happyDOM.abort());
function mount(){const host=document.createElement('div');document.body.append(host);return {host,root:createRoot(host)};}
const key=(node,key,shiftKey=false)=>node.dispatchEvent(new KeyboardEvent('keydown',{key,shiftKey,bubbles:true,cancelable:true}));
function capture(node){let id=null;node.setPointerCapture=v=>id=v;node.hasPointerCapture=v=>id===v;node.releasePointerCapture=v=>{id=null;node.dispatchEvent(new PointerEvent('lostpointercapture',{pointerId:v,bubbles:true}));};return()=>id;}
const pointer=(node,type,x=0)=>node.dispatchEvent(new PointerEvent(type,{pointerId:1,button:0,clientX:x,bubbles:true,cancelable:true}));

test('分隔線動態上限保留主區480與命中區24，偏好只接受合理數值',()=>{
 assert.equal(sidebarLimit(900),396);assert.equal(sidebarLimit(1100),420);assert.equal(sidebarLimit(720),216);
 assert.equal(clampSidebar(900,396),396);assert.equal(clampSidebar(-1,420),240);assert.equal(clampSidebar(NaN,420),288);
});
test('鍵盤調整、收合ARIA與同一輸入/子樹保持；內外偏好隔離',async()=>{
 const {host,root}=mount();let mounts=0,api;localStorage.setItem(SIDEBAR_KEY,'bad');localStorage.setItem('kaosu-assistant:size','外框原值');
 function Child(){useEffect(()=>{mounts++;},[]);return h('input',{defaultValue:'良品120，缺料2'});}
 function Harness(){const body=useRef(null);api=useSidebarLayout(body,true);return h('div',{ref:body},h(SidebarSplitter,{...api,max:420,visible:!api.collapsed,commit:api.commit,preview:api.preview,collapse:()=>api.collapse(true),onDragging:()=>{}}),h(Child));}
 // 使用元件實際容器量測入口，避免直接修改 hook 內部狀態。
 const old=HTMLElement.prototype.getBoundingClientRect;HTMLElement.prototype.getBoundingClientRect=()=>({width:1200});
 await act(async()=>root.render(h(Harness)));const handle=host.querySelector('[role=separator]'),input=host.querySelector('input');
 await act(async()=>key(handle,'ArrowRight'));assert.equal(handle.getAttribute('aria-valuenow'),'296');
 await act(async()=>key(handle,'ArrowRight',true));assert.equal(localStorage.getItem(SIDEBAR_KEY),'328');
 await act(async()=>key(handle,'Home'));assert.equal(handle.getAttribute('aria-valuenow'),'240');
 await act(async()=>key(handle,'End'));assert.equal(handle.getAttribute('aria-valuenow'),'420');
 await act(async()=>key(handle,'Enter'));assert.ok(handle.hidden);assert.equal(handle.getAttribute('aria-valuenow'),null);
 await act(async()=>api.collapse(false));assert.equal(handle.getAttribute('aria-valuenow'),'420');assert.equal(host.querySelector('input'),input);assert.equal(input.value,'良品120，缺料2');assert.equal(mounts,1);assert.equal(localStorage.getItem('kaosu-assistant:size'),'外框原值');
 await act(async()=>root.unmount());host.remove();HTMLElement.prototype.getBoundingClientRect=old;
});
test('拖曳單一RAF，放開後lostcapture不回滾；取消、Escape、blur與卸載清理',async()=>{
 const {host,root}=mount();let dragging=false;const commits=[],previews=[];
 const props={width:288,max:420,preferred:288,visible:true,preview:v=>previews.push(v),commit:v=>commits.push(v),collapse:()=>{},onDragging:v=>dragging=v};
 await act(async()=>root.render(h(SidebarSplitter,props)));const node=host.firstChild,getCapture=capture(node);
 await act(async()=>{pointer(node,'pointerdown',10);pointer(node,'pointermove',100);pointer(node,'pointerup',100);});assert.deepEqual(commits,[378]);assert.equal(getCapture(),null);assert.equal(dragging,false);
 for(const cancel of ['pointercancel','lostpointercapture','Escape','blur']){
  await act(async()=>{pointer(node,'pointerdown',10);pointer(node,'pointermove',400);if(cancel==='Escape')key(node,'Escape');else if(cancel==='blur')window.dispatchEvent(new Event('blur'));else pointer(node,cancel,400);});assert.equal(dragging,false);assert.equal(previews.at(-1),null);assert.equal(commits.length,1);
 }
 await act(async()=>{pointer(node,'pointerdown',10);pointer(node,'pointermove',200);root.unmount();});assert.equal(dragging,false);assert.equal(getCapture(),null);host.remove();
});
test('偏好storage被阻擋時仍可調寬，窄容器不覆寫寬版偏好',async()=>{
 const {host,root}=mount();let api,notify;const oldObserver=globalThis.ResizeObserver,oldRect=HTMLElement.prototype.getBoundingClientRect;HTMLElement.prototype.getBoundingClientRect=()=>({width:1000});
 globalThis.ResizeObserver=class{constructor(fn){notify=fn;}observe(){}disconnect(){}};
 const oldSet=localStorage.setItem;localStorage.setItem=()=>{throw Error('blocked');};
 function Harness(){const body=useRef(null);api=useSidebarLayout(body,true);return h('div',{ref:body});}
 await act(async()=>root.render(h(Harness)));await act(async()=>api.commit(360));assert.equal(api.width,360);
 await act(async()=>notify([{contentRect:{width:320}}]));assert.equal(api.wide,false);assert.equal(api.preferred,360);
 await act(async()=>notify([{contentRect:{width:1200}}]));assert.equal(api.width,360);assert.equal(api.wide,true);
 await act(async()=>root.unmount());host.remove();globalThis.ResizeObserver=oldObserver;HTMLElement.prototype.getBoundingClientRect=oldRect;localStorage.setItem=oldSet;
});
