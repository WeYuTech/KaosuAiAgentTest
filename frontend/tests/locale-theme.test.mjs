import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { readFileSync } from 'node:fs';

const originalLocation = globalThis.location;
const originalFetch = globalThis.fetch;
const originalStorage = globalThis.localStorage;
globalThis.location = new URL('http://mes.local/KSS_MES/ai-agent/');
const storage = new Map();
globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
const { App } = await server.ssrLoadModule('/src/main.tsx');
const { Fields } = await server.ssrLoadModule('/src/DataView.tsx');
const { MessageContent } = await server.ssrLoadModule('/src/MessageContent.tsx');
const { ProposalBusinessSummary } = await server.ssrLoadModule('/src/ProposalBusinessSummary.tsx');
const { confirmationView } = await server.ssrLoadModule('/src/confirmation.ts');
const { api, label } = await server.ssrLoadModule('/src/api.ts');
const { getLocale, setLocale, t } = await server.ssrLoadModule('/src/i18n.ts');
const { getTheme, setTheme, resolveTheme } = await server.ssrLoadModule('/src/theme.ts');
const { translations } = await server.ssrLoadModule('/src/translations.ts');
await server.close();
afterEach(() => { setLocale('zh-TW'); setTheme('system'); globalThis.fetch = originalFetch; });
process.on('exit', () => { globalThis.location = originalLocation; globalThis.localStorage = originalStorage; });

test('預設繁中與系統主題，三語固定詞彙皆有完整翻譯', () => {
  assert.equal(getLocale(), 'zh-TW');
  assert.equal(getTheme(), 'system');
  for (const [key, value] of Object.entries(translations)) {
    assert.equal(value.length, 2, key);
    assert.ok(value[0]?.trim() && value[1]?.trim(), key);
    assert.equal(t(key, {}, 'en'), value[0], key);
    assert.equal(t(key, {}, 'th'), value[1], key);
  }
});

for (const [locale, languageLabel, themeLabel, moduleLabel] of [
  ['zh-TW', '語言', '主題', '生產排程'],
  ['en', 'Language', 'Theme', 'Production scheduling'],
  ['th', 'ภาษา', 'ธีม', 'จัดตารางการผลิต'],
]) {
  test(`三語入口與固定頁首控件：${locale}`, () => {
    setLocale(locale);
    const html = renderToStaticMarkup(createElement(App, { initialOpen: true }));
    // Radix Portal 開啟後才掛載；語言／主題選項改由 radix-menu.test.mjs 實際開選單驗證。
    assert.ok(html.includes(`aria-label="${t('更多功能')}"`));
    assert.ok(html.includes(t('正在連線…')));
    assert.ok(!html.includes('id="entry-input"'), '連線未確認前不呈現可送出的首頁');
    if (locale !== 'zh-TW') assert.ok(!html.includes('今天，想完成什麼作業？'));
  });
}

for (const locale of ['en', 'th']) {
  test(`確認摘要與欄位切換語言保留MES名稱、數量與草稿原始內容：${locale}`, () => {
    const proposal = { action: 'report.add', args: { ok: 25, execution_id: '2001', defects: [{code: 'NG01', quantity: 2}] }, changes: [], target: { equipment: '機台原名37', work_order: '工單原名A', schedule_id: '425929454366110' }, digest: 'unchanged-digest' };
    const original = JSON.stringify(proposal);
    setLocale(locale);
    const html = renderToStaticMarkup(createElement(ProposalBusinessSummary, { proposal, workspace: { records: [], catalogs: {} } }));
    assert.ok(html.includes('機台原名37') && html.includes('工單原名A'));
    assert.ok(html.includes('25') && html.includes('2'));
    assert.ok(!html.includes('人工良品') && !html.includes('不良合計'));
    assert.ok(!html.includes('425929454366110'), '正常摘要不顯示排程SID');
    assert.equal(JSON.stringify(proposal), original);
    assert.notEqual(label('OK_QTY'), '人工良品數');
    assert.notEqual(confirmationView('unknown').label, '結果待核對');
    const history = '人工報工原始歷史 **不得重譯**';
    assert.ok(renderToStaticMarkup(createElement(MessageContent, { role: 'assistant', content: history })).includes('人工報工原始歷史'));
  });
}

test('API以目前語言送header，切換對話語言不送新的訊息或digest', async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => { calls.push({ url: String(url), ...options }); return new Response(JSON.stringify({ id: 'conversation-1', locale: 'th' })); };
  setLocale('th');
  await api('/api/conversations/conversation-1/locale', { locale: 'th' });
  assert.equal(calls[0].headers['Accept-Language'], 'th');
  assert.equal(calls[0].headers['X-AI-Locale'], 'th');
  assert.equal(calls[0].credentials, 'same-origin');
  assert.deepEqual(JSON.parse(calls[0].body), {locale: 'th'});
  assert.equal(calls.length, 1);
});

test('語言及主題偏好可保存，系統深色跟隨OS且無效值被拒絕', () => {
  setLocale('en'); setTheme('dark');
  assert.equal(storage.get('kaosu-assistant:locale'), 'en');
  assert.equal(storage.get('kaosu-assistant:theme'), 'dark');
  setLocale('invalid'); setTheme('invalid');
  assert.equal(getLocale(), 'en'); assert.equal(getTheme(), 'dark');
  assert.equal(resolveTheme('system', true), 'dark');
  assert.equal(resolveTheme('system', false), 'light');
  assert.equal(resolveTheme('light', true), 'light');
  setTheme('navy');
  assert.equal(getTheme(), 'navy');
  assert.equal(storage.get('kaosu-assistant:theme'), 'navy');
  assert.equal(resolveTheme('navy', false), 'navy');
  setTheme('mes');
  assert.equal(getTheme(), 'mes');
  assert.equal(storage.get('kaosu-assistant:theme'), 'mes');
  assert.equal(resolveTheme('mes', true), 'mes');
  assert.equal(resolveTheme('mes', false), 'mes');
});

test('主要錯誤優先使用後端本地化message，原始detail不覆蓋且保留code', async () => {
  setLocale('th');
  globalThis.fetch = async () => new Response(JSON.stringify({detail: '原始中文診斷', message: 'ข้อมูลเปลี่ยนแล้ว กรุณาตรวจสอบใหม่', code: 'stale', params: {version: 2}}), {status: 409});
  await assert.rejects(api('/api/proposals'), error => error.message === 'ข้อมูลเปลี่ยนแล้ว กรุณาตรวจสอบใหม่' && error.code === 'stale' && error.params.version === 2);
});

test('連線失敗顯示目前語言且保留未知結果的網路錯誤分類', async () => {
  setLocale('th');
  globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(api('/api/proposals/test/confirm', {}), error => error.status === 0 && error.code === 'network' && error.message.includes('เครือข่าย'));
});

test('一般資料不呈現JSON；SID與技術欄僅在未展開的詳細資料內', () => {
  const html = renderToStaticMarkup(createElement(Fields, { value: { WO: '工單原名', WIP_OPI_WDOEACICO_HIST_SID: 'secret-sid', DETAILS: [{PART_NO: '產品原名'}] } }));
  assert.ok(html.includes('工單原名'));
  assert.ok(html.indexOf('secret-sid') > html.indexOf('<summary>詳細資料</summary>'));
  assert.ok(!html.includes('<pre>') && !html.includes(' open=""'));
});

test('離線泰文字型與授權隨包提供，不需外部字型請求', () => {
  for (const weight of [400, 600]) assert.ok(readFileSync(new URL(`../public/fonts/noto-sans-thai-thai-${weight}-normal.woff2`, import.meta.url)).length > 8000);
  assert.match(readFileSync(new URL('../public/fonts/Noto-Sans-Thai-OFL.txt', import.meta.url), 'utf8'), /SIL OPEN FONT LICENSE/);
});
