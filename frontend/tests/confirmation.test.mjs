import assert from 'node:assert/strict';
import { test } from 'node:test';
import { confirmWithRecovery, reconcileProposal, confirmationView } from '../src/confirmation.ts';
import { ApiError } from '../src/api.ts';

const card = { id: 'operation-1', digest: 'digest', status: 'pending' };

test('確認斷線後先查伺服器，已成功不再次寫入', async () => {
  const calls = [];
  const request = async (path, body) => {
    calls.push({ path, body });
    if (body) throw new TypeError('網路中斷');
    return { proposal: { ...card, status: 'succeeded' } };
  };
  const result = await confirmWithRecovery(card, true, request);
  assert.equal(result.status, 'succeeded');
  assert.deepEqual(calls.map(c => c.path), ['/api/proposals/operation-1/confirm', '/api/proposals/operation-1']);
  assert.equal(calls.filter(c => c.body).length, 1);
});

test('確認與查詢均斷線時保持未知，只有查核按鈕', async () => {
  const result = await confirmWithRecovery(card, true, async () => { throw new TypeError('網路中斷'); });
  const view = confirmationView(result.status);
  assert.equal(view.label, '結果待核對');
  assert.equal(view.canConfirm, false);
  assert.equal(view.canCancel, false);
  assert.equal(view.canReconcile, true);
  assert.equal(result.proposal.id, card.id);
});

test('斷線後伺服器仍pending不能當成尚未送出而開啟寫入', async () => {
  const result = await confirmWithRecovery(card, true, async (path, body) => {
    if (body) throw new TypeError('網路中斷');
    return { proposal: card };
  });
  assert.equal(result.status, 'unknown');
});

test('重複查核只讀取結果，不重新送出確認', async () => {
  const calls = [];
  const request = async (path, body) => {
    calls.push({ path, body });
    return { status: calls.length === 1 ? 'unknown' : 'succeeded', proposal: card };
  };
  assert.equal((await reconcileProposal(card, request)).status, 'unknown');
  assert.equal((await reconcileProposal(card, request)).status, 'succeeded');
  assert.deepEqual(calls.map(c => c.path), ['/api/proposals/operation-1/reconcile', '/api/proposals/operation-1/reconcile']);
  assert.deepEqual(calls.map(c => c.body), [{}, {}]);
});

test('狀態與確認按鈕一致，不把unknown顯示待確認或取消', () => {
  assert.deepEqual(confirmationView('pending'), { label: '待確認', canConfirm: true, canCancel: true, canReconcile: false });
  assert.equal(confirmationView('cancelled').label, '已取消');
  assert.equal(confirmationView('succeeded').label, '已完成');
  assert.equal(confirmationView('unexpected').label, '結果待核對');
});

test('明確的權限或版本拒絕保留錯誤，不冒充已取消或成功', async () => {
  let calls = 0;
  await assert.rejects(confirmWithRecovery(card, true, async () => { calls++; throw new ApiError('資料已變更', 409); }), /資料已變更/);
  assert.equal(calls, 1);
});

test('取消回應遺失時以伺服器已取消狀態回復', async () => {
  const result = await confirmWithRecovery(card, false, async (path, body) => {
    if (body) throw new TypeError('網路中斷');
    return { proposal: { ...card, status: 'cancelled' } };
  });
  assert.equal(result.status, 'cancelled');
  assert.equal(confirmationView(result.status).canReconcile, false);
});
