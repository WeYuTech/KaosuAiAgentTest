import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' });
let ProposalBusinessSummary;
try {
  ({ ProposalBusinessSummary } = await server.ssrLoadModule('/src/ProposalBusinessSummary.tsx'));
} finally {
  await server.close();
}

const molds = [{ TOL_NO: 'MOLD-SPLIT', DETAILS: [
  { TOL_DETALS_SID: '63', PART_NO: 'EPS-A', TOL_DETALS_NO: 'MOLD-SPLIT-L', TOL_DETALS_NAME: '同品號左模穴' },
  { TOL_DETALS_SID: '64', PART_NO: 'EPS-A', TOL_DETALS_NO: 'MOLD-SPLIT-R', TOL_DETALS_NAME: '同品號右模穴' },
] }, { TOL_NO: 'MOLD-ONE', DETAILS: [
  { TOL_DETALS_SID: '61', PART_NO: 'EPS-A', TOL_DETALS_NO: 'MOLD-ONE-L', TOL_DETALS_NAME: '單一模穴' },
] }];

test('排程核對直接呈現後端生產日與結束時間，以及各模穴目標件數', () => {
  const proposal = { action: 'schedule.save', args: { start_time: '2026-10-31 07:59', target_shots: 10, cycle_seconds: 60, details: [{ wo: 'WO-A', part_no: 'EPS-A', cavities: 2 }] },
    changes: [{ field: 'SCHEDULE_DATE', after: '2026-10-30' }, { field: 'SCHEDULE_END_TIME', after: '2026-10-31 08:09:00' }] };
  const html = renderToStaticMarkup(createElement(ProposalBusinessSummary, { proposal, workspace: { records: [], catalogs: {} } }));
  for (const text of ['2026-10-30', '2026-10-31 08:09:00', '目標件數', '20<small>件</small>']) assert.ok(html.includes(text), text);
});

test('清除換模核對卡包含進出站與完工取消，不僅四個上下模時間', () => {
  const proposal = { action: 'mold.clear', args: {}, changes: [{ field:'CHECK_IN_TIME', before:'2026-10-30 08:00', after:null }, { field:'CHECK_OUT_TIME', before:'2026-10-30 12:00', after:null }, { field:'COMPLETED', before:'Y', after:'N' }] };
  const html = renderToStaticMarkup(createElement(ProposalBusinessSummary, { proposal, workspace: { records: [], catalogs: {} } }));
  for (const text of ['進站時間','出站時間','完工狀態','2026-10-30 12:00','清除時間']) assert.ok(html.includes(text));
});
function render(details, records = [], extra = {}) {
  const proposal = { action: 'schedule.save', args: { mold_no: 'MOLD-SPLIT', details, ...extra }, changes: [] };
  return renderToStaticMarkup(createElement(ProposalBusinessSummary, { proposal, workspace: { records, catalogs: { molds } } }));
}
function assertAllocation(html, title, cavities) {
  assert.ok(html.includes(`<span>${title}</span><strong><span class="business-after">${cavities}<small>穴</small></span></strong>`), `確認卡應讓人員核對 ${title} 的 ${cavities} 穴`);
}

test('同品號同工單的兩個模具明細，確認卡分別顯示名稱、編號與模穴', () => {
  const html = render([
    { part_no: 'EPS-A', wo: 'WO-A', mold_detail_id: '63', cavities: 3 },
    { part_no: 'EPS-A', wo: 'WO-A', mold_detail_id: '64', cavities: 2 },
  ]);
  assertAllocation(html, 'WO-A · 同品號左模穴（MOLD-SPLIT-L）', 3);
  assertAllocation(html, 'WO-A · 同品號右模穴（MOLD-SPLIT-R）', 2);
});

test('修改省略模具明細識別並調換列順序，確認卡仍依原排程明細顯示正確左右模穴', () => {
  const html = render([
    { detail_id: '1102', part_no: 'EPS-A', wo: 'WO-A', cavities: 4 },
    { detail_id: '1101', part_no: 'EPS-A', wo: 'WO-A', cavities: 5 },
  ], [{ ZZ_KAOSU_PROD_SCHEDULE_SID: '1001', DETAILS: [
    { ZZ_KAOSU_PROD_SCHEDULE_DETAIL_SID: '1101', TOL_DETALS_SID: '63', PART_NO: 'EPS-A' },
    { ZZ_KAOSU_PROD_SCHEDULE_DETAIL_SID: '1102', TOL_DETALS_SID: '64', PART_NO: 'EPS-A' },
  ] }], { schedule_id: '1001' });
  assertAllocation(html, 'WO-A · 同品號右模穴（MOLD-SPLIT-R）', 4);
  assertAllocation(html, 'WO-A · 同品號左模穴（MOLD-SPLIT-L）', 5);
});

test('新增唯一品號明細可省略識別，確認卡仍顯示後端採用的模具明細', () => {
  const html = render([{ part_no: 'EPS-A', wo: '', cavities: 0 }], [], { mold_no: 'MOLD-ONE' });
  assertAllocation(html, 'EPS-A · 單一模穴（MOLD-ONE-L）', 0);
});

test('離頁修改採用確認卡內後端已解析摘要，不受目前頁面與過時選項影響', () => {
  const proposal = { action: 'schedule.save', args: { mold_no: 'MOLD-SPLIT', details: [
    { detail_id: '1102', part_no: 'EPS-A', wo: 'WO-A', cavities: 4 },
    { detail_id: '1101', part_no: 'EPS-A', wo: 'WO-A', cavities: 3 },
  ] }, changes: [], target: { schedule_details: [
    { detail_id: '1102', mold_detail_id: '64', mold_detail_no: 'MOLD-SPLIT-R', mold_detail_name: '同品號右模穴', part_no: 'EPS-A', wo: 'WO-A', cavities: 4 },
    { detail_id: '1101', mold_detail_id: '63', mold_detail_no: 'MOLD-SPLIT-L', mold_detail_name: '同品號左模穴', part_no: 'EPS-A', wo: 'WO-A', cavities: 3 },
  ] } };
  const html = renderToStaticMarkup(createElement(ProposalBusinessSummary, { proposal, workspace: { records: [], catalogs: {} } }));
  assertAllocation(html, 'WO-A · 同品號右模穴（MOLD-SPLIT-R）', 4);
  assertAllocation(html, 'WO-A · 同品號左模穴（MOLD-SPLIT-L）', 3);
});
