import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { api } from '../src/api.ts';

const originalFetch = globalThis.fetch;
const originalLocation = globalThis.location;
afterEach(() => { globalThis.fetch = originalFetch; if (originalLocation === undefined) delete globalThis.location; else globalThis.location = originalLocation; });

for (const [page, expected] of [
  ['http://localhost:8000/', 'http://localhost:8000/api/session'],
  ['http://mes.local/KSS_MES/ai-agent/?embed=1', 'http://mes.local/KSS_MES/ai-agent/api/session'],
  ['http://mes.local/KSS_MES/ai-agent/index.html?embed=1', 'http://mes.local/KSS_MES/ai-agent/api/session'],
]) {
  test(`登入 API 保留部署目錄：${new URL(page).pathname}`, async () => {
    globalThis.location = new URL(page);
    let called;
    globalThis.fetch = async (url, options) => { called = { url: String(url), options }; return new Response(JSON.stringify({ actor: { id: '測試身分' }, mode: 'mes' })); };
    const result = await api('/api/session');
    assert.equal(called.url, expected);
    assert.equal(called.options.credentials, 'same-origin');
    assert.equal(result.actor.id, '測試身分');
  });
}

test('作業 API 不接受跨站位置', async () => {
  globalThis.location = new URL('http://mes.local/KSS_MES/ai-agent/');
  globalThis.fetch = async () => { assert.fail('不應送出跨站請求'); };
  await assert.rejects(api('https://other.invalid/api/session'), /同源/);
});

test('嵌入載入器拒絕跨站目標', () => {
  const source = readFileSync(new URL('../public/widget-loader.js', import.meta.url), 'utf8');
  let created = false;
  const document = { currentScript: { src: 'http://mes.local/KSS_MES/ai-agent/widget-loader.js', dataset: { assistantUrl: 'https://other.invalid/' } }, querySelector: () => null, createElement: () => { created = true; throw new Error('不應建立跨站框架'); } };
  runInNewContext(source, { document, location: new URL('http://mes.local/KSS_MES/wwwroot/'), URL });
  assert.equal(created, false);
});

function openWidget(hostUrl) {
  const elements = [];
  const createElement = tag => {
    const element = { tag, dataset: {}, style: {}, listeners: {},
      setAttribute() {}, focus() {}, append() {},
      addEventListener(name, handler) { this.listeners[name] = handler; },
      attachShadow() { return { append() {} }; },
    };
    elements.push(element);
    return element;
  };
  const document = { currentScript: { src: 'http://mes.local/KSS_MES/ai-agent/widget-loader.js', dataset: { assistantUrl: '/KSS_MES/ai-agent/' } }, querySelector: () => null, createElement, body: { append() {} } };
  runInNewContext(readFileSync(new URL('../public/widget-loader.js', import.meta.url), 'utf8'), {
    document, location: new URL(hostUrl), URL, URLSearchParams, window: { addEventListener() {} },
  });
  const frame = elements.find(element => element.tag === 'iframe');
  assert.equal(frame.src, undefined, '未點開前不應載入助理');
  elements.find(element => element.tag === 'button').listeners.click();
  return new URL(frame.src);
}

test('排程編輯頁的SID只在對應宿主映射目前排程，且不接受URL身分', () => {
  const target = openWidget('http://mes.local/KSS_MES/wwwroot/MES-WIP/setup/wip-query_schedule_detail_new.html?SID=425929454366110&uid=ADMIN&account=ADMIN&OPERATION=EPS-FORMING');
  assert.equal(target.searchParams.get('ZZ_KAOSU_PROD_SCHEDULE_SID'), '425929454366110');
  assert.equal(target.searchParams.get('OPERATION'), 'EPS-FORMING');
  for (const key of ['SID', 'uid', 'account']) assert.equal(target.searchParams.has(key), false);
});

for (const query of ['SID=', 'SID=abc', 'SID=-1', 'SID=1.5', 'SID=1&SID=2', 'SID=1234567890123456789']) {
  test(`排程SID拒絕空值及不合法或歧義值：${query}`, () => {
    const target = openWidget(`http://mes.local/KSS_MES/wwwroot/MES-WIP/setup/wip-query_schedule_detail_new.html?${query}`);
    assert.equal(target.searchParams.has('ZZ_KAOSU_PROD_SCHEDULE_SID'), false);
  });
}

test('其他宿主的SID不得推定為排程，既有明確排程識別不被別名覆蓋', () => {
  const unrelated = openWidget('http://mes.local/KSS_MES/wwwroot/MES-WIP/OPI/mold/wip-opi_schedule_mold_eqp.html?SID=1001');
  assert.equal(unrelated.searchParams.has('ZZ_KAOSU_PROD_SCHEDULE_SID'), false);
  const explicit = openWidget('http://mes.local/KSS_MES/wwwroot/MES-WIP/setup/wip-query_schedule_detail_new.html?SID=1001&ZZ_KAOSU_PROD_SCHEDULE_SID=1002');
  assert.equal(explicit.searchParams.get('ZZ_KAOSU_PROD_SCHEDULE_SID'), '1002');
});

for (const fac of ['fac1', 'fac2', 'fac3', 'fac4', 'admin', '']) {
  test(`模具宿主只帶入三個既有廠別：${fac || '空值'}`, () => {
    const target = openWidget(`http://mes.local/KSS_MES/wwwroot/MES-WIP/OPI/mold/wip-opi_schedule_mold_eqp.html?fac=${fac}`);
    assert.equal(target.searchParams.get('fac'), ['fac1', 'fac2', 'fac3'].includes(fac) ? fac : null);
  });
}
