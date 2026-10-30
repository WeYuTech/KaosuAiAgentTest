import type { Module, Row } from './api';

/** 來源報工紀錄轉成編輯草稿，保持原不良原因及數量。 */
export function reportDraft(record: Row, action: string): Row {
  const result: Row = { report_id: record.WIP_OPI_WDOEACICOOUTPUT_HIST_SID };
  if (action === 'report.update') Object.assign(result, {
    ok: record.OK_QTY, comment: record.COMMENT ?? '',
    defects: (Array.isArray(record.DEFECTS) ? record.DEFECTS as Row[] : []).map(d => ({ code: d.NG_CODE ?? d.NG_CODE_NO, quantity: d.NG_CODE_QTY })),
  });
  return result;
}

/** 查詢可查看任何階段；業務動作仍須後端重新驗證。 */
export function canChooseRecord(module: Module, action: string, query: boolean, record: Row): boolean {
  return module !== 'mold' || query || action === 'mold.clear' || !record.NEXT_ACTION || record.NEXT_ACTION === action;
}

export function mountCandidates(records: Row[]): Row[] {
  const key = 'ZZ_KAOSU_PROD_SCHEDULE_SID';
  const candidates = records.flatMap(record => [
    ...(Array.isArray(record.CANDIDATES) ? record.CANDIDATES as Row[] : []).map(c => ({ ...c, [key]: c[key] ?? c.schedule_id, EQP_NO: c.EQP_NO ?? c.equipment, NEXT_ACTION: 'mold.mount_start' })),
    ...(record[key] && record.NEXT_ACTION === 'mold.mount_start' ? [record] : []),
  ]).filter(r => r[key]);
  return [...new Map(candidates.map(r => [String(r[key]), r])).values()];
}
