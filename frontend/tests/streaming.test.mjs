import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {createServer} from 'vite';
const window=new Window({url:'http://localhost/'});
for(const key of ['window','document','location','navigator','HTMLElement','Node','localStorage','sessionStorage'])Object.defineProperty(globalThis,key,{configurable:true,value:window[key]});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const server=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'});
const {streamRequest}=await server.ssrLoadModule('/src/streaming.ts');
const {ProcessingSteps}=await server.ssrLoadModule('/src/ProcessingSteps.tsx');
const {createRoot}=await import('react-dom/client');const {createElement:h,act}=await import('react');
await server.close();after(()=>window.happyDOM.abort());
const realFetch=globalThis.fetch;
after(()=>globalThis.fetch=realFetch);
const json=value=>new Response(JSON.stringify(value));
function transport(events){let posted=false;globalThis.fetch=async(_,options)=>{if(options.method==='POST'){assert.equal(posted,false);posted=true;return json({request_id:'rid',token:'test'});}return json({events:events.map((e,i)=>({seq:i+1,...e})),terminal:true});};}
test('文字只來自輪詢 delta，完成事件回傳原回應',async()=>{
 const observed=[];transport([{event:'delta',data:{text:'MC'}},{event:'delta',data:{text:'37'}},{event:'done',data:{messages:[]}}]);
 const value=await streamRequest('/api/conversations/test/messages',{text:'查詢'},e=>observed.push(e));
 assert.deepEqual(value,{messages:[]});assert.equal(observed.filter(e=>e.event==='delta').map(e=>e.data.text).join(''),'MC37');
});
test('輪詢失敗只重試 GET，耗盡後標未知且不重送 POST',async()=>{
 const calls=[],observed=[];globalThis.fetch=async(_,options)=>{calls.push(options.method);if(options.method==='POST')return json({request_id:'rid',token:'test'});throw Error('offline');};
 await assert.rejects(streamRequest('/api/conversations/test/messages',{text:'查詢'},e=>observed.push(e)),e=>e.code==='stream_unknown');
 assert.deepEqual(calls,['POST','GET','GET','GET','GET']);assert.equal(observed.at(-1).event,'unknown');
});
test('開始回應遺失或明確拒絕都不重送 POST',async()=>{
 for(const status of [404,405,409,0]){let calls=0;globalThis.fetch=async()=>{calls++;if(!status)throw Error('lost');return new Response('{"detail":"busy"}',{status});};await assert.rejects(streamRequest('/api/conversations/test/messages',{},()=>{}));assert.equal(calls,1);}
});
test('空批次與暫時斷線依序號接續，不重複顯示文字',async()=>{
 const urls=[];let get=0;globalThis.fetch=async(url,options)=>{if(options.method==='POST')return json({request_id:'rid',token:'test'});urls.push(String(url));get++;if(get===1)return json({events:[{seq:1,event:'delta',data:{text:'甲'}}],terminal:false});if(get===2)throw Error('offline');if(get===3)return json({events:[],terminal:false});return json({events:[{seq:1,event:'delta',data:{text:'甲'}},{seq:2,event:'delta',data:{text:'乙'}},{seq:3,event:'done',data:{content:'甲乙'}}],terminal:true});};
 let text='';await streamRequest('/api/entry/messages',{},e=>{if(e.event==='delta')text+=e.data.text;});assert.equal(text,'甲乙');assert.ok(urls.slice(1).every(u=>u.endsWith('after=1')));
});
test('登入失效立即交還權限處理，不輪詢重試',async()=>{
 let gets=0;globalThis.fetch=async(_,o)=>o.method==='POST'?json({request_id:'rid',token:'test'}):(gets++,new Response('{}',{status:401}));await assert.rejects(streamRequest('/api/entry/messages',{},()=>{}),e=>e.status===401);assert.equal(gets,1);
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

test('工具輪次重設會先清除片段，最終回覆只保留最後輪次',async()=>{
 let text='';transport([{event:'delta',data:{text:'中間文字'}},{event:'reset',data:{}},{event:'delta',data:{text:'最終回答'}},{event:'done',data:{content:'最終回答'}}]);
 const value=await streamRequest('/api/conversations/test/messages',{},e=>{if(e.event==='reset')text='';if(e.event==='delta')text+=e.data.text;});
 assert.equal(text,value.content);
});
test('未知步驟使用問號、完成不重複文字、串流文字在框外且秒數一位',async()=>{
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 const summary={request_id:'one',elapsed_seconds:4,steps:[{id:1,label:'已查詢 MC37（1 筆）',status:'done'},{id:2,label:'分析需求',status:'running'}]};
 await act(async()=>root.render(h(ProcessingSteps,{summary,phase:'unknown',text:'回覆片段'})));
 assert.ok(host.querySelector('.lucide-circle-help'));assert.equal(host.querySelector('.lucide-loader-circle'),null);
 assert.equal(host.querySelectorAll('li small').length,1);assert.equal(host.querySelector('.processing-steps .stream-reply'),null);assert.equal(host.querySelector('.stream-reply').textContent,'回覆片段');
 await act(async()=>root.render(h(ProcessingSteps,{summary,phase:'done'})));assert.ok(host.querySelector('button').textContent.includes('4.0'));
 await act(async()=>root.unmount());host.remove();
});

test('停止終態讀回原作業，不重送訊息',async()=>{
 const calls=[];globalThis.fetch=async(url,o)=>{calls.push(o.method);if(o.method==='POST')return json({request_id:'rid',token:'test'});if(String(url).includes('/events?'))return json({events:[{seq:1,event:'stopped',data:{}}],terminal:true});return json({messages:[{stopped:true}]});};
 const result=await streamRequest('/api/conversations/test/messages',{},()=>{});assert.equal(result.messages[0].stopped,true);assert.deepEqual(calls,['POST','GET','GET']);
});
test('事件缺號轉查核，不能冒充完整回覆',async()=>{
 transport([{seq:2,event:'delta',data:{text:'缺少第一筆'}}]);await assert.rejects(streamRequest('/api/conversations/test/messages',{},()=>{}),e=>e.code==='stream_unknown');
});

test('串流標題與表格使用安全 Markdown，半截表格與程式區塊不拋錯',async()=>{
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 const summary={request_id:'markdown',elapsed_seconds:2,steps:[]};
 const render=async text=>{await act(async()=>root.render(h(ProcessingSteps,{summary,phase:'running',text})));};
 await render('### MC37\n\n| 工單 | 數量 |\n| --- | --- |\n| WO-A | 100 |');
 assert.equal(host.querySelector('h3').textContent,'MC37');assert.equal(host.querySelector('td').textContent,'WO-A');
 assert.ok(!host.querySelector('.stream-reply').textContent.includes('###'));assert.ok(!host.querySelector('.stream-reply').textContent.includes('|'));
 for(const text of ['### MC37\n\n| 工單 | 數','### MC37\n\n| 工單 | 數量 |\n| --','### MC37\n\n| 工單 | 數量 |\n| --- | --- |\n| WO','### MC37\n\n```text\n尚未完成'])await render(text);
 assert.ok(host.querySelector('pre').textContent.includes('尚未完成'));
 await render('[安全](https://example.com) [拒絕](javascript:alert%281%29)');
 assert.equal(host.querySelector('a').getAttribute('rel'),'noopener noreferrer nofollow');assert.equal(host.querySelectorAll('a').length,1);
 await act(async()=>root.unmount());host.remove();
});
