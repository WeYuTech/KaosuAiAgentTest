import assert from 'node:assert/strict';
import { ApiError } from '../../../frontend/src/api.ts';
import {
  hasSubmission, pendingSubmission, restoreSubmission, submitRecoverably,
} from '../../../frontend/src/submission-recovery.ts';
import {
  confirmationView, reconcileProposal,
} from '../../../frontend/src/confirmation.ts';

// 從 repository 根目錄執行：node docs/evidence/main-ux-review-20261031/submission-recovery-repro.mjs
// 沿用前端測試的 Node.js TypeScript 執行環境與既有相依套件，不新增套件。
// 直接執行前端實際匯出函式；Storage 與 HTTP 全部使用記憶體替身。
// 不讀寫業務資料、不呼叫真實 API、不修改正式 app 或持久化儲存。
// 斷言驗證基準版本的缺陷狀態；重現成立≠產品通過。修正後應另以正向驗收測試判定。
const makeStorage = () => {
  const data = new Map();
  return {
    get length() { return data.size; },
    key: index => [...data.keys()][index] ?? null,
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: key => data.delete(key),
  };
};
const card = id => ({ id, status: 'pending', digest: `digest-${id}` });
const scope = 'same-actor-same-module-same-host';
const output = [];

{
  const storage = makeStorage();
  const original = card('explicit-rejected-operation');
  const requests = [];
  await assert.rejects(
    submitRecoverably(scope, 'conversation-A', original, true, storage, async (path, body) => {
      requests.push({ path, method: body === undefined ? 'GET' : 'POST' });
      if (body !== undefined) throw new ApiError('資料已變更，請重新查詢並確認', 409);
      throw new ApiError('暫時無法讀取', 0, 'network');
    }),
    error => error instanceof ApiError && error.status === 409,
  );
  assert.equal(requests.length, 2);
  assert.equal(requests[0].method, 'POST');
  assert.equal(requests[1].method, 'GET');

  // 網路恢復、刷新時，main.start() 已取得同一確認卡的權威 pending 回覆。
  const afterSuccessfulRead = restoreSubmission(scope, 'conversation-A', original, storage);
  assert.equal(afterSuccessfulRead.status, 'unknown');
  assert.equal(afterSuccessfulRead.local_rejection, undefined);
  assert.equal(hasSubmission(scope, storage), true);
  assert.deepEqual(pendingSubmission(scope, storage), {
    conversation: 'conversation-A', proposal: original.id,
  });

  // 模擬後端對拒絕前就仍 pending 的 proposal 查核：沒有執行，也不會自動變終態。
  const reconciled = await reconcileProposal(afterSuccessfulRead, async () => ({
    status: 'pending', proposal: original,
  }));
  assert.equal(reconciled.status, 'unknown');
  assert.equal(confirmationView(reconciled.status).canConfirm, false);
  assert.equal(confirmationView(reconciled.status).canCancel, false);
  assert.equal(confirmationView(reconciled.status).canReconcile, true);

  let laterBusinessCalls = 0;
  const blocked = [];
  for (const approved of [true, false]) {
    await assert.rejects(
      submitRecoverably(scope, 'conversation-A', original, approved, storage, async () => {
        laterBusinessCalls++;
      }),
      error => { blocked.push(error.message); return /已有送出紀錄/.test(error.message); },
    );
  }
  assert.equal(laterBusinessCalls, 0);
  output.push({
    case: 'C13：明確409 → 唯一驗證GET失敗 → 網路恢復後GET pending',
    initialRequests: requests,
    storedMarker: pendingSubmission(scope, storage),
    restoredStatus: afterSuccessfulRead.status,
    localRejection: afterSuccessfulRead.local_rejection ?? false,
    reconciledStatus: reconciled.status,
    ui: confirmationView(reconciled.status),
    laterConfirmAndCancelNetworkCalls: laterBusinessCalls,
    blocked,
    reproduced: '本次已明確拒絕，但成功讀回 pending 後仍被當成送達未知；現有查核流程無法回到重新核對或取消路徑。',
  });
}

{
  const storage = makeStorage();
  const tabA = card('original-unresolved-A');
  const tabB = card('already-open-B');
  // 分頁B原本已載入自己的確認卡；兩分頁共用actor/module/source scope。
  const initialB = restoreSubmission(scope, 'conversation-B', tabB, storage);
  assert.equal(initialB.status, 'pending');

  // A提交後回覆與立即GET都遺失。保留A marker是正確行為。
  const aResult = await submitRecoverably(scope, 'conversation-A', tabA, true, storage, async () => {
    throw new ApiError('網路暫時中斷', 0, 'network');
  });
  assert.equal(aResult.status, 'unknown');

  let tabBNetworkCalls = 0;
  const errors = [];
  for (const approved of [true, false]) {
    await assert.rejects(
      submitRecoverably(scope, 'conversation-B', tabB, approved, storage, async () => {
        tabBNetworkCalls++;
      }),
      error => { errors.push(error.message); return /已有送出紀錄/.test(error.message); },
    );
  }
  // main.confirm() catch 使用當前B卡呼叫此函式。不同pid/conv無法取得A恢復狀態。
  const afterBlockedB = restoreSubmission(scope, 'conversation-B', tabB, storage);
  assert.equal(afterBlockedB.id, tabB.id);
  assert.equal(afterBlockedB.status, 'pending');
  const viewB = confirmationView(afterBlockedB.status);
  assert.equal(viewB.canConfirm, true);
  assert.equal(viewB.canCancel, true);
  assert.equal(viewB.canReconcile, false);
  assert.equal(tabBNetworkCalls, 0);
  assert.deepEqual(pendingSubmission(scope, storage), {
    conversation: 'conversation-A', proposal: tabA.id,
  });
  output.push({
    case: 'D04：另一分頁已有未決A操作，當前分頁仍顯示不同的B卡',
    realPendingOperation: pendingSubmission(scope, storage),
    displayedProposal: { id: afterBlockedB.id, status: afterBlockedB.status },
    ui: viewB,
    tabBConfirmAndCancelNetworkCalls: tabBNetworkCalls,
    errors,
    reproduced: 'B的確認與取消都被A marker攔下，但仍呈現B pending且沒有查核入口；只有重載才會在start()轉回A。',
  });
}

console.log(JSON.stringify({
  commit: '3e1c7c002177f4bb16255cf3d26b840b82d7b4c7',
  interpretation: '重現成立≠產品通過：此診斷確認基準版本仍存在所列缺陷，不能當作產品驗收通過。',
  scope: '實際前端函式＋隔離HTTP/Storage替身；沒有真實網路或業務寫入，非瀏覽器或正式MES驗收',
  findings: output,
}, null, 2));
