import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
let Fields, DataView;
try {
  ({ Fields, DataView } = await server.ssrLoadModule('/src/DataView.tsx'));
} finally {
  await server.close();
}

test('正式執行列只顯示人工與IoT正確摘要，未知不得顯示成零', () => {
  const row = {
    WIP_OPI_WDOEACICO_HIST_SID: '2001', EQP_NO: 'MC37', WO: 'WO-A',
    CREATE_TIME: '2026-10-30 08:00:00', OK_QTY: 999, NG_QTY: 888, IOT_PCS: 777,
    MANUAL_OK: 0, MANUAL_NG: 0, IOT_QUANTITY: null, IOT_INFERRED_OK: null, REPORTS: [],
  };
  const before = JSON.stringify(row);
  const html = renderToStaticMarkup(createElement(Fields, { value: row }));
  assert.ok(html.includes('<dt>人工報工良品合計</dt><dd>0</dd>'));
  assert.ok(html.includes('<dt>人工報工不良合計</dt><dd>0</dd>'));
  assert.ok(html.includes('<dt>IoT 產量</dt><dd>未知</dd>'));
  assert.ok(html.includes('<dt>IoT 推算良品（IoT 產量－不良數）</dt><dd>未知</dd>'));
  assert.ok(!html.includes('<dt>人工良品數</dt>'));
  for (const duplicate of ['999', '888', '777']) assert.ok(!html.includes(duplicate));
  const details = html.indexOf('<summary>詳細資料</summary>');
  assert.ok(details > html.indexOf('IoT 推算良品'));
  assert.ok(html.indexOf('2026-10-30 08:00:00') > details);
  assert.equal(JSON.stringify(row), before, '顯示層不得變更模型及API原始資料');
});

test('執行列的人工報工歷史保留單筆人工良品，IoT推算負值照實顯示', () => {
  const html = renderToStaticMarkup(createElement(DataView, { data: { records: [{
    WIP_OPI_WDOEACICO_HIST_SID: '2001', EQP_NO: 'MC37',
    OK_QTY: -3, NG_QTY: 5, IOT_PCS: 2, MANUAL_OK: 27, MANUAL_NG: 5,
    IOT_QUANTITY: 2, IOT_INFERRED_OK: -3,
    REPORTS: [{ WIP_OPI_WDOEACICOOUTPUT_HIST_SID: '3001', OK_QTY: 27, NG_QTY: 5 }],
  }] } }));
  assert.ok(html.includes('<dt>IoT 推算良品（IoT 產量－不良數）</dt><dd>-3</dd>'));
  assert.ok(html.includes('人工報工歷史'));
  assert.ok(html.includes('<dt>人工良品數</dt><dd>27</dd>'));
  assert.equal(html.split('<dt>人工良品數</dt>').length - 1, 1);
});

test('未帶執行摘要的人工報工紀錄保留原本欄位名稱與數值', () => {
  const html = renderToStaticMarkup(createElement(Fields, { value: {
    WIP_OPI_WDOEACICOOUTPUT_HIST_SID: '3001', OK_QTY: 12, NG_QTY: 2,
  } }));
  assert.ok(html.includes('<dt>人工良品數</dt><dd>12</dd>'));
  assert.ok(html.includes('<dt>不良數</dt><dd>2</dd>'));
  assert.ok(!html.includes('IoT 推算良品'));
});
