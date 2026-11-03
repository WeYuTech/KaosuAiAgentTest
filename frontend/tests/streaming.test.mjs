import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {createServer} from 'vite';
const window=new Window({url:'http://localhost/'});
for(const key of ['window','document','location','navigator','HTMLElement','Node','localStorage','sessionStorage'])Object.defineProperty(globalThis,key,{configurable:true,value:window[key]});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const server=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'});
const {parseEvents,streamRequest}=await server.ssrLoadModule('/src/streaming.ts');
const {ProcessingSteps}=await server.ssrLoadModule('/src/ProcessingSteps.tsx');
const {createRoot}=await import('react-dom/client');const {createElement:h,act}=await import('react');
await server.close();after(()=>window.happyDOM.abort());
const encoder=new TextEncoder();const realFetch=globalThis.fetch;
after(()=>globalThis.fetch=realFetch);
function response(parts){return new Response(new ReadableStream({start(c){for(const part of parts)c.enqueue(encoder.encode(part));c.close();}}),{headers:{'Content-Type':'text/event-stream'}});}
test('SSE 跨區塊與 CRLF 不遺失內容',()=>{
 const first=parseEvents('event: delta\r\ndata: {"text":"中"}\r\n\r\nevent: do');
 assert.equal(first.events[0].data.text,'中');assert.equal(first.rest,'event: do');
 assert.equal(parseEvents(first.rest+'ne\ndata: {"messages":[]}\n\n').events[0].event,'done');
});
test('文字只來自後端 delta，完成事件回傳原回應',async()=>{
 const observed=[];globalThis.fetch=async()=>response(['event: delta\ndata: {"text":"MC"}\n\n','event: delta\ndata: {"text":"37"}\n\nevent: done\ndata: {"messages":[]}\n\n']);
 const value=await streamRequest('/api/conversations/test/messages',{text:'查詢'},e=>observed.push(e));
 assert.deepEqual(value,{messages:[]});assert.equal(observed.filter(e=>e.event==='delta').map(e=>e.data.text).join(''),'MC37');
});
test('已受理但斷線只標未知，不重送 JSON',async()=>{
 let calls=0;const observed=[];globalThis.fetch=async()=>{calls++;return response(['event: step\ndata: {"id":1}\n\n']);};
 await assert.rejects(streamRequest('/api/conversations/test/messages',{text:'查詢'},e=>observed.push(e)),e=>e.code==='stream_unknown');
 assert.equal(calls,1);assert.equal(observed.at(-1).event,'unknown');
});
test('只有未受理 404 或 405 才能回退一次',async()=>{
 for(const status of [404,405]){let calls=0;globalThis.fetch=async()=>++calls===1?new Response('',{status}):new Response('{"messages":[]}');const events=[];await streamRequest('/api/conversations/test/messages',{},e=>events.push(e));assert.equal(calls,2);assert.equal(events[0].event,'fallback');}
 let calls=0;globalThis.fetch=async()=>{calls++;return new Response('{"detail":"busy"}',{status:409});};await assert.rejects(streamRequest('/api/conversations/test/messages',{},()=>{}));assert.equal(calls,1);
});
test('步驟完成自動收合，可按原生按鈕展開，停止不顯示半成品',async()=>{
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 const summary={request_id:'one',elapsed_seconds:4.2,steps:[{id:1,label:'查詢作業資料',status:'done'}]};
 await act(async()=>root.render(h(ProcessingSteps,{summary,phase:'running',text:'片段'})));assert.equal(host.querySelector('button').getAttribute('aria-expanded'),'true');
 await act(async()=>root.render(h(ProcessingSteps,{summary,phase:'done'})));assert.equal(host.querySelector('button').getAttribute('aria-expanded'),'false');
 await act(async()=>host.querySelector('button').click());assert.equal(host.querySelector('button').getAttribute('aria-expanded'),'true');
 await act(async()=>root.render(h(ProcessingSteps,{summary,phase:'stopped',text:'半成品'})));assert.ok(!host.textContent.includes('半成品'));assert.ok(host.textContent.includes('已停止'));
 await act(async()=>root.unmount());host.remove();
});
