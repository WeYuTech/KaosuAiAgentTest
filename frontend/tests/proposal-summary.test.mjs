import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' });
let ProposalBusinessSummary, CompactSummary, mesDate, setBusinessTimezone, productionStatus;
try {
  ({ DetailedProposalBusinessSummary: ProposalBusinessSummary } = await server.ssrLoadModule('/src/ProposalBusinessSummary.tsx'));
  ({ ProposalBusinessSummary: CompactSummary } = await server.ssrLoadModule('/src/ProposalBusinessSummary.tsx'));
  ({mesDate,setBusinessTimezone,productionStatus}=await server.ssrLoadModule('/src/presentation.ts'));
} finally {
  await server.close();
}

const molds = [{ TOL_NO: 'MOLD-SPLIT', DETAILS: [
  { TOL_DETALS_SID: '63', PART_NO: 'EPS-A', TOL_DETALS_NO: 'MOLD-SPLIT-L', TOL_DETALS_NAME: '同品號左模穴' },
  { TOL_DETALS_SID: '64', PART_NO: 'EPS-A', TOL_DETALS_NO: 'MOLD-SPLIT-R', TOL_DETALS_NAME: '同品號右模穴' },
] }, { TOL_NO: 'MOLD-ONE', DETAILS: [
  { TOL_DETALS_SID: '61', PART_NO: 'EPS-A', TOL_DETALS_NO: 'MOLD-ONE-L', TOL_DETALS_NAME: '單一模穴' },
] }];

test('報工快照在查詢離頁後保留時間、原量及被移除原因歸零',()=>{
 const proposal={action:'report.update',args:{report_id:'r',ok:130,defects:[{code:'NG01',quantity:1}]},changes:[],target:{report_before:{CREATE_TIME:'2026-11-02 14:00',OK_QTY:125,NG_QTY:5,DEFECTS:[{NG_CODE:'NG01',NG_CODE_QTY:3},{NG_CODE:'NG02',NG_CODE_QTY:2}]}}};
 const html=renderToStaticMarkup(createElement(ProposalBusinessSummary,{proposal,workspace:{records:[],catalogs:{defect_reasons:[{NG_CODE_NO:'NG02',NG_CODE_NAME:'破損'}]}}}));
 for(const text of ['2026-11-02 14:00','破損','business-before">2</span>','business-after">0<small>件','business-before">125</span>'])assert.ok(html.includes(text),text);
});

test('排程修改呈現模次、模穴與取消工單的前後值',()=>{
 const proposal={action:'schedule.save',args:{target_shots:12,cycle_seconds:60},changes:[{field:'TARGET_SHOT',before:11,after:12}],target:{schedule_details:[{wo:'',part_no:'B',cavities:0,mold_detail_no:'R',previous:{wo:'WO-B',cavities:1,target_pcs:11}}]}};
 const html=renderToStaticMarkup(createElement(ProposalBusinessSummary,{proposal,workspace:{records:[],catalogs:{}}}));
 for(const value of ['工單分配','未分配工單','business-before">WO-B','business-before">1</span>','business-before">11</span>'])assert.ok(html.includes(value),value);
});

test('未變動數量不畫刪除線，離頁核對仍呈現後端執行時間與品號', () => {
  const proposal={action:'report.update',args:{report_id:'3001',ok:125,defects:[]},changes:[{field:'OK_QTY',before:125,after:125}],target:{equipment:'MC37',work_order:'WO-261102-0382',part_no:'P-102',part_spec:'外殼',execution_time:'2026-11-02 08:10:00'}};
  const html=renderToStaticMarkup(createElement(ProposalBusinessSummary,{proposal,workspace:{records:[],catalogs:{}}}));
  assert.ok(!html.includes('business-before'));
  for(const value of ['P-102 · 外殼','2026-11-02 08:10:00','WO-261102-0382'])assert.ok(html.includes(value));
  proposal.changes[0].before=120;
  const changed=renderToStaticMarkup(createElement(ProposalBusinessSummary,{proposal,workspace:{records:[],catalogs:{}}}));
  assert.ok(changed.includes('class="business-before">120</span>'));
});

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


test('完工不以空異動清單假定無下一張，明確 null 才顯示；模穴保留零與原值',()=>{
 const workspace={records:[],catalogs:{}};
 const render=target=>renderToStaticMarkup(createElement(ProposalBusinessSummary,{workspace,proposal:{action:'report.complete',args:{schedule_id:'s'},changes:[],target}}));
 assert.ok(!render({}).includes('無下一張排程'));
 assert.ok(render({next_schedule:null}).includes('無下一張排程'));
 const next=render({next_schedule:{start_time:'2026-11-02T13:00',orders:['WO-NEXT-FULL']}});
 assert.ok(next.includes('WO-NEXT-FULL'));assert.ok(next.includes('2026-11-02 13:00:00'));assert.ok(!next.includes('T13:00'));
 const html=renderToStaticMarkup(createElement(ProposalBusinessSummary,{workspace,proposal:{action:'report.cavities',args:{cavities:0},changes:[],target:{cavities_before:2,mold_detail_name:'左模穴',mold_detail_no:'LEFT'}}}));
 assert.ok(html.includes('左模穴'));assert.ok(html.includes('LEFT'));assert.ok(html.includes('business-before">2'));assert.ok(html.includes('business-after">0'));
});


test('新增排程的空狀態原值不冒充修改前狀態',()=>{
 const html=renderToStaticMarkup(createElement(ProposalBusinessSummary,{workspace:{records:[],catalogs:{}},proposal:{action:'schedule.save',args:{status:'DO'},changes:[{field:'PRODUCTION_STATUS',before:null,after:'DO'}]}}));
 assert.ok(html.includes('量產'));assert.ok(!html.includes('business-before'));assert.ok(!html.includes('未提供狀態'));
});


test('時間依後端業務時區，未設定不猜測，未知狀態保留來源值',()=>{
 setBusinessTimezone(undefined);
 assert.equal(mesDate('2026-11-03T01:00:00Z'),'2026-11-03T01:00:00Z');
 setBusinessTimezone('UTC+08:00');
 assert.equal(mesDate('2026-11-03T01:00:00Z'),'2026-11-03 09:00:00');
 assert.equal(mesDate('2026-11-03T01:00:00+07:00'),'2026-11-03 02:00:00');
 assert.equal(mesDate('2026-11-03 01:00'),'2026-11-03 01:00:00');
 assert.equal(mesDate('2026-11-03T01:00:00Z','UTC-03:30'),'2026-11-02 21:30:00');
 assert.equal(productionStatus('CUSTOM'),'CUSTOM（未知狀態）');
 assert.equal(productionStatus(null),'未提供狀態');
 setBusinessTimezone(undefined);
});
test('刪除不重複空的影響框，清除換模仍明示進出站與取消完工',()=>{
 const render=action=>renderToStaticMarkup(createElement(ProposalBusinessSummary,{proposal:{action,args:{},changes:[],target:{work_order:'WO-A'}},workspace:{records:[],catalogs:{}}}));
 assert.ok(!render('report.delete').includes('business-impact'));
 assert.match(render('mold.clear'),/進出站時間，並取消完工/);
});

test('精簡核對投影只顯示原因名稱，良品原值採確認卡快照',()=>{
 const proposal={action:'report.update',args:{report_id:'r',ok:125,defects:[{code:'NG01',quantity:3}]},changes:[],target:{report_before:{OK_QTY:120,NG_QTY:3}}};
 const html=renderToStaticMarkup(createElement(CompactSummary,{proposal,workspace:{records:[],catalogs:{defect_reasons:[{NG_CODE_NO:'NG01',NG_CODE_NAME:'刮傷'}]}}}));
 assert.ok(html.includes('刮傷 3 件'));assert.ok(!html.includes('NG01'));assert.ok(html.includes('<del>120 件</del>'));assert.ok(html.includes('<strong>125 件</strong>'));
 assert.ok(!html.includes('<del>3 件</del>'));
});

test('精簡核對不以未提供的下一排程與狀態假造已知結果',()=>{
 const render=target=>renderToStaticMarkup(createElement(CompactSummary,{proposal:{action:'report.complete',args:{schedule_id:'s'},changes:[],target},workspace:{records:[],catalogs:{}}}));
 assert.ok(!render({}).includes('無下一張排程'));assert.ok(render({}).includes('依伺服器預覽確認'));
 assert.ok(!render({}).includes('<strong>未完工</strong>'));assert.ok(render({next_schedule:null}).includes('無下一張排程'));
});

test('精簡摘要不以缺漏識別誤配另一張工單，排程原值不受查詢離頁影響',()=>{
 const proposal={action:'schedule.save',args:{schedule_id:'wanted',target_shots:500,details:[]},changes:[],target:{schedule_details:[{mold_detail_no:'D1',part_no:'P-102',wo:'WO-A',cavities:2,previous:{cavities:1}}]}};
 const html=renderToStaticMarkup(createElement(CompactSummary,{proposal,workspace:{records:[{ZZ_KAOSU_PROD_SCHEDULE_SID:'other',EQP_NO:'WRONG'}],catalogs:{}}}));
 assert.ok(!html.includes('WRONG'));assert.ok(html.includes('D1 · P-102'));assert.ok(html.includes('<del>1 穴</del>'));assert.ok(html.includes('1000 件'));
});
