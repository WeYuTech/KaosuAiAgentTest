import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
let reportDraft, canChooseRecord, mountCandidates;
try { ({ reportDraft, canChooseRecord, mountCandidates } = await server.ssrLoadModule('/src/guided-records.ts')); }
finally { await server.close(); }

test('修改來源報工時保留原原因代碼與多筆不良數量，刪除只指定該筆', () => {
  const record = { WIP_OPI_WDOEACICOOUTPUT_HIST_SID: '9011', OK_QTY: 18, COMMENT: '原始備註',
    DEFECTS: [{ NG_CODE: 'NG01', NG_CODE_QTY: 2 }, { NG_CODE: 'NG02', NG_CODE_QTY: 3 }] };
  const before = JSON.stringify(record);
  assert.deepEqual(reportDraft(record, 'report.update'), { report_id: '9011', ok: 18, comment: '原始備註', defects: [{ code: 'NG01', quantity: 2 }, { code: 'NG02', quantity: 3 }] });
  assert.deepEqual(reportDraft(record, 'report.delete'), { report_id: '9011' });
  assert.equal(JSON.stringify(record), before);
});

test('模具查詢能查看進行中與歷史，執行選擇只允許對應下一階段', () => {
  const row = { NEXT_ACTION: 'mold.unmount_start' };
  assert.equal(canChooseRecord('mold', '', true, row), true);
  assert.equal(canChooseRecord('mold', 'mold.mount_start', false, row), false);
  assert.equal(canChooseRecord('mold', 'mold.unmount_start', false, row), true);
  assert.equal(canChooseRecord('mold', 'mold.clear', false, row), true);
  assert.equal(canChooseRecord('report', 'report.add', false, row), true);
});

test('閒置看板明確選候選排程，不能將無識別的設備或生產中排程當待上模', () => {
  const records = [
    { EQP_NO: 'MC37', ZZ_KAOSU_PROD_SCHEDULE_SID:'1001', NEXT_ACTION:'mold.unmount_start' },
    { EQP_NO: 'MC36', ZZ_KAOSU_PROD_SCHEDULE_SID:null, CANDIDATES:[{ schedule_id:'1003', equipment:'MC36', TOL_NO:'MOLD-A' }] },
    { EQP_NO: 'MC36', ZZ_KAOSU_PROD_SCHEDULE_SID:'1003', TOL_NO:'MOLD-A', NEXT_ACTION:'mold.mount_start' },
  ];
  const found = mountCandidates(records);
  assert.equal(found.length,1);
  assert.equal(found[0].ZZ_KAOSU_PROD_SCHEDULE_SID,'1003');
  assert.equal(found[0].TOL_NO,'MOLD-A');
  assert.equal(found[0].EQP_NO,'MC36');
});
