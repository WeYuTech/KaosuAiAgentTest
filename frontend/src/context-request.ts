import { api, ApiError, type Session } from './api.ts';

/** 身分或作業已切換；舊請求的結果不得再投影到目前畫面。 */
export class ObsoleteContext extends Error {}

export interface RequestContext {
  epoch: () => number;
  actor: () => string | undefined;
  invalidate: () => void;
}

export async function requestInContext<T>(context: RequestContext, path: string, body?: unknown,
  request: typeof api = api): Promise<T> {
  const epoch = context.epoch();
  const actor = context.actor();
  const current = () => epoch === context.epoch();
  try {
    const value = await request<T>(path, body);
    if (!current()) throw new ObsoleteContext();
    return value;
  } catch (error) {
    if (!current()) throw new ObsoleteContext();
    if (error instanceof ApiError && [401, 403].includes(error.status)) {
      context.invalidate();
      // 保留明確拒絕，讓提交恢復層記錄它；畫面以 epoch 隔離晚到結果。
      throw error;
    }
    if (error instanceof ApiError && error.status === 404 && /^\/api\/(conversations|proposals)\//.test(path)) {
      try {
        const session = await request<Session>('/api/session');
        if (current() && session.actor.id !== actor) context.invalidate();
      } catch (check) {
        if (current() && check instanceof ApiError && [401, 403].includes(check.status)) context.invalidate();
      }
    }
    if (!current()) throw new ObsoleteContext();
    throw error;
  }
}
