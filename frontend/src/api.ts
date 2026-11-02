import { getLocale, t } from './i18n.ts';
export type Module = 'schedule' | 'report' | 'mold';
export type Identity = 'planner' | 'operator' | 'technician' | 'supervisor';
export type Row = Record<string, unknown>;
export interface Session { actor: { id: string; name: string; roles: string[] }; mode: string }
export interface Message { data?:unknown; role: string; content: string; proposal?: Proposal | null }
export interface Change { table: string; key: unknown; field: string; before: unknown; after: unknown }
export interface Proposal { local_rejection?: boolean; id: string; digest: string; summary: string; changes: Change[]; expires_at: string; action: string; args: Row; status?: string; independent_confirmation?: boolean; writes_enabled?: boolean; business_timezone?: string; time_policy?: string; new_id_policy?: string; preview?: { time_policy?: string; new_id_policy?: string }; target?: { report_before?:Row; part_no?: string; part_spec?: string; execution_time?: string; equipment?: string; work_order?: string; schedule_id?: string; execution_id?: string; report_id?: string; affected_orders?: unknown[]; schedule_details?: Row[] } }
export interface Conversation { id: string; module: Module; messages: Message[]; locale?: string; actor_id?: string; title?: string; is_archived?: boolean; is_deleted?: boolean; metadata_version?: number }
export interface QueryContext {version:number;filters:Record<string,string|number>}
export interface Reply { messages?: Message[]; proposal?: Proposal | null; data?: unknown; message?: string; query_context?:QueryContext }
export interface Workspace { records: Row[]; catalogs: Record<string, unknown>; total?: number; page?: number; page_size?: number; query_context?:QueryContext }
export interface Schema { type?: string | string[]; title?: string; description?: string; module?: string; properties?: Record<string, Schema>; required?: string[]; enum?: unknown[]; default?: unknown; items?: Schema; minimum?: number; maximum?: number; format?: string; parameters?: Schema; input_schema?: Schema }

export class ApiError extends Error {
  status: number;
  code?: string;
  params?: unknown;
  constructor(message: string, status: number, code?: string, params?: unknown) { super(message); this.name = 'ApiError'; this.status = status; this.code = code; this.params = params; }
}

export async function api<T>(path: string, body?: unknown): Promise<T> {
  const endpoint = new URL(path.replace(/^\/+/, ''), new URL('./', location.href));
  if (endpoint.origin !== location.origin) throw new Error(t('作業服務必須與目前 MES 頁面同源。'));
  let response: Response;
  try { response = await fetch(endpoint, {
    method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin',
    headers: { Accept: 'application/json', 'Accept-Language': getLocale(), 'X-AI-Locale': getLocale(), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }); } catch { throw new ApiError(t('無法連線至作業服務，請確認網路後再試。'), 0, 'network'); }
  const text = await response.text();
  let value: unknown;
  try { value = text ? JSON.parse(text) : {}; } catch { throw new Error(t('伺服器回應格式異常，請重新整理資料後再試。')); }
  if (!response.ok) {
    const result = value as Row;
    const detail = result?.detail ?? result?.error;
    const fallback = typeof detail === 'string' ? detail : typeof detail === 'object' && detail && 'message' in detail ? String(detail.message) : t('請求未完成（{0}）', {0: response.status});
    const code = result?.code ?? (typeof detail === 'object' && detail ? (detail as Row).code : undefined);
    throw new ApiError(typeof result?.message === 'string' ? result.message : t(fallback), response.status, typeof code === 'string' ? code : undefined, result?.params);
  }
  return value as T;
}

export const labels: Record<string, string> = {
  model:'模型',reasoning_effort:'推理強度',max_tool_rounds:'每輪最多模型呼叫次數',warning_percent:'用量提醒比例',remaining_usd:'剩餘額度（美元）',near_limit:'用量提醒',reached:'已達上限',frequency:'頻率',title:'報告名稱',
  conversations:'聊天總數',messages:'訊息總數',archived:'封存數量',operations:'操作總數',succeeded:'成功操作',unknown:'結果待核對數量',
  draft_save_state: '草稿保存狀態',
  EQP_NO: '設備', WO: '工單', WO_NO: '工單', PART_NO: '料號', SPEC: '規格', MOLD_NO: '模具',
  PART_SPEC: '規格', EQP_NAME: '設備名稱', TOL_DETALS_NAME: '模具明細名稱', TOL_DETALS_NO: '模具明細編號',
  SHIFT_DAY: '班日', SCHEDULE_DATE: '排程日期', OPERATION: '製程', COMPLETED: '完工狀態',
  OPI_CAV: '報工模穴', CUR_CAV: '排程模穴', SCHEDULE_CUR_CAV: '排程模穴', CYCLE_TIME: '週期秒數',
  OK_QTY: '人工良品數', NG_QTY: '不良數', OK_TOTAL: '人工良品數', NG_TOTAL: '不良總數',
  IOT_PCS: 'IoT 產量', IOT_SHOT: 'IoT 模次', TARGET_PCS: '目標產量', TARGET_SHOT: '目標模次',
  CREATE_TIME: '建立時間', EDIT_TIME: '更新時間', COMPLETED_TIME: '完工時間', REAL_CHECK_IN_TIME: '實際開始時間',
  CHECK_IN_TIME: '預計開始時間', CHECK_OUT_TIME: '預計結束時間', COMMENT: '備註', ENABLE_FLAG: '啟用狀態',
  WIP_OPI_WDOEACICO_HIST_SID: '執行識別', WIP_OPI_WDOEACICOOUTPUT_HIST_SID: '報工識別',
  ZZ_KAOSU_PROD_SCHEDULE_SID: '排程識別', NG_CODE_INFOS: '不良原因明細', NG_CODE_NO: '不良原因', NG_CODE_QTY: '不良數量',
  action: '操作', module: '模組', actor: '操作人員', status: '結果', created_at: '建立時間', executed_at: '執行時間',
  execution_id: '執行識別', report_id: '報工識別', schedule_id: '排程識別（新增時留空）',
  ok: '人工良品數', defects: '不良明細', comment: '備註', cavities: '模穴數', equipment: '設備編號',
  part_no: '料號', mold_no: '模具編號', start_time: '開始時間', cycle_seconds: '週期（秒）',
  mold_detail_id: '模具模穴明細識別', detail_id: '既有排程明細識別', TOL_DETALS_SID: '模具模穴明細識別',
  target_shots: '目標模次', priority: '優先順序', details: '工單與模穴明細', code: '原因代碼', quantity: '數量',
  MANUAL_OK: '人工報工良品合計', MANUAL_NG: '人工報工不良合計', IOT_QUANTITY: 'IoT 產量',
  IOT_INFERRED_OK: 'IoT 推算良品（IoT 產量－不良數）', REPORTS: '人工報工歷史', DEFECTS: '不良原因明細',
  TOL_NO: '模具', NEXT_ACTION: '下一階段', ZZ_MODLE_UPLOAD_START: '開始上模時間', ZZ_MODLE_UPLOAD_END: '完成上模時間',
  ZZ_MODLE_REMOVE_START: '開始下模時間', ZZ_MODLE_REMOVE_END: '完成下模時間',
  time: '操作時間', event_time: '事件時間', changes: '欄位變更明細', mode: '環境',
  limit_usd: '累計費用上限（美元）', spent_usd: '已使用（美元）', reserved_usd: '處理中預留（美元）', calls: 'API 呼叫次數',
};
export const label = (key: string) => t(labels[key] ?? key);
export const display = (value: unknown): string => value === null || value === undefined ? '—' : typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
