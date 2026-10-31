import assert from 'node:assert/strict';
import { test } from 'node:test';
import { restoreSubmission, submitRecoverably, pendingSubmission } from '../src/submission-recovery.ts';
import { ApiError } from '../src/api.ts';
const card = {id:'original',status:'pending',digest:'hash'};
const storage = () => {const data=new Map();return {get length(){return data.size;},key:i=>[...data.keys()][i]??null,getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};};
test('恢復資訊寫不入時零提交', async()=>{
  let calls=0;
  await assert.rejects(submitRecoverably('actor','chat',card,true,{getItem:()=>null,setItem:()=>{throw Error();}},async()=>{calls++;}));
  assert.equal(calls,0);
});
test('確認回應遺失，刷新即使pending仍鎖原操作；終態才解除',async()=>{
  const db=storage();let writes=0;
  const result=await submitRecoverably('actor','chat',card,true,db,async(path,body)=>{if(body){writes++;throw TypeError();}return {proposal:card};});
  assert.equal(result.status,'unknown');assert.equal(writes,1);
  assert.deepEqual(pendingSubmission('actor',db), {conversation:'chat',proposal:'original'});
  assert.equal(pendingSubmission('other',db),undefined);
  assert.equal(restoreSubmission('actor','chat',card,db).status,'unknown');
  await assert.rejects(submitRecoverably('actor','chat',card,true,db));
  assert.equal(restoreSubmission('other','chat',card,db).status,'pending');
  assert.equal(restoreSubmission('actor','chat',{...card,status:'succeeded'},db).status,'succeeded');
  assert.equal(pendingSubmission('actor',db),undefined);
  assert.equal(db.length,0);
});
test('本次明確拒絕並讀回原卡後不留下假unknown',async()=>{
  const db=storage();
  await assert.rejects(submitRecoverably('actor','chat',card,true,db,async(path,body)=>{if(body)throw new ApiError('資料已變更',409);return {proposal:card};}));
  assert.equal(restoreSubmission('actor','chat',card,db).status,'pending');
  assert.equal(restoreSubmission('actor','chat',card,db).local_rejection,true);
  assert.equal(pendingSubmission('actor',db),undefined);
  let calls=0;
  await assert.rejects(submitRecoverably('actor','chat',card,true,db,async()=>{calls++;}));
  assert.equal(calls,0);
});
test('另一分頁留下未知嘗試時，本次4xx不能刪掉它',async()=>{
  const db=storage();
  await assert.rejects(submitRecoverably('actor','chat',card,true,db,async(path,body)=>{
    if(body){db.setItem('actor:submission:other-attempt',JSON.stringify({conversation:'chat',proposal:card.id}));throw new ApiError('拒絕本次',409);}
    return {proposal:card};
  }));
  assert.equal(restoreSubmission('actor','chat',card,db).status,'unknown');
  assert.ok(db.getItem('actor:submission:other-attempt'));
});
test('晚到guide的pending也必須再次合併恢復標記',async()=>{
  const db=storage();
  await submitRecoverably('actor','chat',card,false,db,async()=>{throw TypeError('中斷');});
  for(let i=0;i<3;i++) assert.equal(restoreSubmission('actor','chat',{...card},db).status,'unknown');
});

