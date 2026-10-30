import { t } from './i18n.ts';
import { api, ApiError, type Change, type Proposal } from './api.ts';

export interface ConfirmationResult { status: string; proposal: Proposal; message: string; changes?: Change[] }
type Response = { status?: string; proposal?: Proposal; message?: string; changes?: Change[] };
type Request = (path: string, body?: unknown) => Promise<Response>;
const unknownMessage = '結果待核對。請保留操作識別碼，按「查核執行結果」讀取紀錄；不要重新送出相同操作。';

export function confirmationView(status: string) {
  const labels: Record<string, string> = { pending: t("待確認"), succeeded: t("已完成"), cancelled: t("已取消"), superseded: t("已被取代"), expired: t("已過期"), failed: t("未完成"), rejected: t("已拒絕") };
  return { label: labels[status] ?? t("結果待核對"), canConfirm: status === 'pending', canCancel: status === 'pending', canReconcile: !(status in labels) };
}

function resultFrom(response: Response, fallback: Proposal, recovering = false): ConfirmationResult {
  let status = response.status ?? response.proposal?.status ?? 'unknown';
  // 查回 pending 仍無法證明剛才的確認是否已送達，不能重新開放寫入。
  if (recovering && status === 'pending') status = 'unknown';
  const view = confirmationView(status);
  if (view.canReconcile) status = 'unknown';
  return { status, proposal: { ...(response.proposal ?? fallback), status }, changes: response.changes,
    message: status === 'unknown' ? t(unknownMessage) : response.message ?? (status === 'succeeded' ? t("已查核執行成功並記錄異動。") : t("此操作{0}。", {0: view.label})) };
}

export async function confirmWithRecovery(proposal: Proposal, approved: boolean, request: Request = api): Promise<ConfirmationResult> {
  try {
    return resultFrom(await request(`/api/proposals/${proposal.id}/confirm`, { digest: proposal.digest, approved }), proposal);
  } catch (error) {
    // 明確的拒絕回應不冒充提交未知；原卡可依錯誤內容取消或重新整理。
    if (error instanceof ApiError && error.status >= 400 && error.status < 500) throw error;
    try { return resultFrom(await request(`/api/proposals/${proposal.id}`), proposal, true); }
    catch { return resultFrom({}, proposal, true); }
  }
}

export async function reconcileProposal(proposal: Proposal, request: Request = api): Promise<ConfirmationResult> {
  try { return resultFrom(await request(`/api/proposals/${proposal.id}/reconcile`, {}), proposal, true); }
  catch { return resultFrom({}, proposal, true); }
}
