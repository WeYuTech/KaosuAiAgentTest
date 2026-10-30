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
