import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiError } from '../src/api.ts';
import { requestInContext, ObsoleteContext } from '../src/context-request.ts';

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
