import { api, ApiError, type Proposal } from './api.ts';
import { confirmWithRecovery, type ConfirmationResult } from './confirmation.ts';
import { t } from './i18n.ts';

export interface Marker { conversation: string; proposal: string; outcome?: 'rejected' | 'rejected-unverified' }
export class SubmissionBlocked extends Error {
  marker: Marker | undefined;
  constructor(marker?: Marker) { super(t('已有送出紀錄，請先查核原操作。')); this.marker = marker; }
}
const terminal = new Set(['succeeded', 'cancelled', 'superseded', 'expired', 'failed', 'rejected']);
export function recoveryKey(scope: string) { return `${scope}:submission`; }
export function hasSubmission(scope: string, storage: Storage = localStorage) { return markers(scope, storage).some(([,m]) => m.outcome !== 'rejected'); }
export function pendingSubmission(scope: string, storage?: Storage): Marker | undefined {
  try { return markers(scope, storage ?? localStorage).find(([,m]) => m.outcome !== 'rejected')?.[1]; } catch { return undefined; }
}
function markers(scope: string, storage: Storage): [string, Marker][] {
  const result: [string, Marker][] = [];
  for (let i=0; i<storage.length; i++) {
    const key = storage.key(i);
    if (key?.startsWith(`${recoveryKey(scope)}:`)) result.push([key, JSON.parse(storage.getItem(key)!)]);
  }
  return result;
}
export function restoreSubmission(scope: string, conversation: string, proposal: Proposal, storage?: Storage, authoritative = true): Proposal {
  let saved: [string, Marker][];
  try { storage ??= localStorage; saved = markers(scope, storage).filter(([,m]) => m.conversation === conversation && m.proposal === proposal.id); }
  catch { return proposal; } // 禁用儲存仍可預覽；提交時必須能建立恢復標記才放行。
  if (!saved.length) return proposal;
  if (terminal.has(proposal.status ?? '')) { saved.forEach(([key]) => storage.removeItem(key)); return proposal; }
  // 僅權威讀回能把「明確拒絕、尚待核對」轉為可修改；舊畫面不能作證。
  if (authoritative && proposal.status === 'pending') {
    for (const [key, marker] of saved) if (marker.outcome === 'rejected-unverified') {
      marker.outcome = 'rejected'; storage.setItem(key, JSON.stringify(marker));
    }
  }
  if (saved.every(([,m]) => m.outcome === 'rejected')) return { ...proposal, local_rejection: true };
  return { ...proposal, status: 'unknown' };
}
/** 標記只保存原操作識別，不能證明成功，也不能提供跨裝置保護。 */
export async function submitRecoverably(scope: string, conversation: string, proposal: Proposal, approved: boolean,
  storage?: Storage, request: typeof api = api): Promise<ConfirmationResult> {
  try { storage ??= localStorage; markers(scope, storage); }
  catch { throw new Error(t('無法保存恢復資訊，尚未送出。請確認瀏覽器儲存可用。')); }
  if (typeof window !== 'undefined' && navigator.locks) {
    return navigator.locks.request(recoveryKey(scope), { ifAvailable: true }, lock => {
      if (!lock) throw new SubmissionBlocked(pendingSubmission(scope, storage));
      return submitAttempt(scope, conversation, proposal, approved, storage, request);
    });
  }
  return submitAttempt(scope, conversation, proposal, approved, storage, request);
}
async function submitAttempt(scope: string, conversation: string, proposal: Proposal, approved: boolean,
  storage: Storage = localStorage, request: typeof api = api): Promise<ConfirmationResult> {
  const prior = markers(scope, storage);
  if (prior.some(([,m]) => m.outcome !== 'rejected')) throw new SubmissionBlocked(pendingSubmission(scope, storage));
  if (approved && prior.some(([,m]) => m.conversation === conversation && m.proposal === proposal.id)) throw new Error(t('本次提交已拒絕，請返回修改後重新核對。'));
  // 每個嘗試使用獨立鍵；沒有 Web Locks 的原 HTTP 宿主也不會覆寫另一分頁標記。
  const nonce = Array.from(crypto.getRandomValues(new Uint32Array(4)), v => v.toString(16)).join('');
  const key = `${recoveryKey(scope)}:${nonce}`;
  const marker = JSON.stringify({ conversation, proposal: proposal.id });
  try { storage.setItem(key, marker); if (storage.getItem(key) !== marker) throw new Error(); }
  catch { throw new Error(t('無法保存恢復資訊，尚未送出。請確認瀏覽器儲存可用。')); }
  try {
    const result = await confirmWithRecovery(proposal, approved, request);
    if (terminal.has(result.status)) storage.removeItem(key);
    return result;
  } catch (error) {
    if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
      // 先保存已收到拒絕的證據；即時讀取失敗不可把它遺失成送達未知。
      const rejected = JSON.stringify({conversation, proposal: proposal.id, outcome: 'rejected-unverified'});
      if (storage.getItem(key) === marker) storage.setItem(key, rejected);
      try { const value = await request<{ proposal: Proposal }>(`/api/proposals/${proposal.id}`);
        if (value.proposal.id === proposal.id && storage.getItem(key) === rejected) restoreSubmission(scope, conversation, value.proposal, storage);
      } catch { /* 無法查證時保留送出紀錄。 */ }
    }
    throw error;
  }
}
