import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiError } from '../src/api.ts';
import { requestInContext, resultInContext, ObsoleteContext } from '../src/context-request.ts';
import { submitRecoverably, pendingSubmission } from '../src/submission-recovery.ts';
import { reconcileProposal } from '../src/confirmation.ts';

function context() {
  let epoch = 1, actor = 'A', invalidations = 0;
  return {
    epoch: () => epoch, actor: () => actor,
    invalidate() { epoch++; actor = undefined; invalidations++; },
    switchActor() { epoch++; actor = 'B'; },
    count: () => invalidations,
  };
}
for (const status of [401, 403]) test(`登入拒絕 ${status} 清理情境且保留拒絕證據`, async () => {
  const state = context(), error = new ApiError('登入失效', status);
  await assert.rejects(requestInContext(state, '/api/audit', undefined, async () => {throw error;}), value => value === error);
  assert.equal(state.actor(), undefined);
  assert.equal(state.count(), 1);
});
test('跨身分 404 重新查核登入，不能留下前一位作業內容', async () => {
  const state = context(), calls = [];
  await assert.rejects(requestInContext(state, '/api/conversations/A/guide', undefined, async path => {
    calls.push(path);
    if (path === '/api/session') return {actor: {id: 'B'}};
    throw new ApiError('找不到對話', 404);
  }), ObsoleteContext);
  assert.deepEqual(calls, ['/api/conversations/A/guide', '/api/session']);
  assert.equal(state.count(), 1);
});
test('同身分 404 保留一般錯誤，不誤登出', async () => {
  const state = context(), error = new ApiError('找不到對話', 404);
  await assert.rejects(requestInContext(state, '/api/conversations/missing', undefined, async path => {
    if (path === '/api/session') return {actor: {id: 'A'}};
    throw error;
  }), value => value === error);
  assert.equal(state.count(), 0);
});
for (const reject of [false, true]) test(`切換身分後晚到的${reject ? '拒絕' : '成功'}不影響新情境`, async () => {
  const state = context();
  let finish;
  const result = requestInContext(state, '/api/audit', undefined, () => new Promise((resolve, failure) => {
    finish = () => reject ? failure(new ApiError('舊登入失效', 401)) : resolve({records: ['A 的紀錄']});
  }));
  state.switchActor(); finish();
  await assert.rejects(result, ObsoleteContext);
  assert.equal(state.actor(), 'B');
  assert.equal(state.count(), 0);
});
test('實際確認恢復層吞成 unknown 時仍拒絕跨身分套用，原標記保留', async () => {
  const state = context(), entries = new Map();
  const storage = {get length(){return entries.size;}, key: i => [...entries.keys()][i], getItem: k => entries.get(k) ?? null, setItem: (k,v) => entries.set(k,v), removeItem: k => entries.delete(k)};
  let finish, calls = 0;
  const card = {id: 'A-proposal', status: 'pending', digest: 'A-digest'};
  const scopedRequest = (path,body) => {
    if (state.actor() !== 'A') throw new ObsoleteContext();
    return requestInContext(state, path, body, () => {
      calls++; return new Promise(resolve => {finish = () => resolve({status:'succeeded',proposal:{...card,status:'succeeded'}});});
    });
  };
  const result = resultInContext(state, () => submitRecoverably('A-scope','A-chat',card,true,storage,scopedRequest));
  state.switchActor(); finish();
  await assert.rejects(result, ObsoleteContext);
  assert.equal(calls, 1);
  assert.deepEqual(pendingSubmission('A-scope',storage), {conversation:'A-chat',proposal:'A-proposal'});
});
test('實際查核層回傳 unknown 仍不能回填過期作業情境', async () => {
  const state = context();
  let finish;
  const result = resultInContext(state, () => reconcileProposal({id:'A-proposal',status:'unknown'}, (path,body) => requestInContext(state,path,body,() => new Promise(resolve => {finish=resolve;}))));
  state.switchActor(); finish({status:'unknown',proposal:{id:'A-proposal',status:'unknown'}});
  await assert.rejects(result, ObsoleteContext);
});
