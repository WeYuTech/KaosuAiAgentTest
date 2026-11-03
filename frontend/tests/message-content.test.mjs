import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
let MessageContent,ProcessingSteps,EntryMessageBody;
try {
  ({ MessageContent, EntryMessageBody } = await server.ssrLoadModule('/src/MessageContent.tsx'));
  ({ ProcessingSteps } = await server.ssrLoadModule('/src/ProcessingSteps.tsx'));
} finally {
  await server.close();
}
const render = (content, role = 'assistant') => renderToStaticMarkup(createElement(MessageContent, { role, content }));

test('助理真正渲染工單粗體、表格與普通換行', () => {
  const html = render('**工單** WO-A\n請確認以下數量\n\n| 項目 | 數量 |\n| --- | ---: |\n| 人工良品 | 0 |\n| IoT產量 | 未知 |');
  assert.match(html, /<strong(?: class="[^"]*")?>工單<\/strong>/);
  assert.match(html, /WO-A<br\/>\s*請確認以下數量/);
  assert.ok(html.includes('<table>') && html.includes('<thead>') && html.includes('<tbody>'));
  assert.ok(html.includes('<th>項目</th>') && html.includes('<td>人工良品</td>'));
  assert.match(html, /<td[^>]*>0<\/td>/);
  assert.ok(html.includes('class="markdown-table"'));
});

test('原始HTML不成為可執行元素，程式碼區仍可安全閱讀', () => {
  const html = render('<script>alert(1)</script>\n\n<img src="https://tracking.invalid/raw.png" onerror="alert(1)">\n\n<iframe src="https://tracking.invalid/frame"></iframe>\n\n安全的 **提醒**\n\n```html\n<script>範例</script>\n```');
  assert.ok(!/<script|<iframe|<img|onerror=/.test(html));
  assert.ok(!html.includes('tracking.invalid'));
  assert.match(html, /<strong(?: class="[^"]*")?>提醒<\/strong>/);
  assert.ok(html.includes('&lt;script&gt;範例&lt;/script&gt;'));
});

test('Markdown圖片不產生任何圖片或預載請求，只顯示替代文字', () => {
  const html = render('![圖表](https://tracking.invalid/pixel.png)\n\n![本機圖](/private/image.png)\n\n![內嵌](data:image/png;base64,AAAA)');
  assert.ok(!/<img|<link|\bsrc=|\bsrcSet=/.test(html));
  assert.ok(!html.includes('tracking.invalid') && !html.includes('/private/image.png') && !html.includes('base64'));
  assert.ok(html.includes('圖片：圖表') && html.includes('圖片：本機圖'));
});

test('連結拒絕不安全scheme，正常網址保留並隔離opener及referrer', () => {
  const html = render('[安全](https://example.com/docs) [內頁](/KSS_MES/help) [危險](javascript:alert%281%29) [資料](data:text/html,evil) [檔案](file:///C:/secret.txt)');
  assert.ok(html.includes('href="https://example.com/docs"') && html.includes('href="/KSS_MES/help"'));
  assert.ok(html.includes('target="_blank"') && html.includes('rel="noopener noreferrer nofollow"'));
  assert.ok(!/href="(?:javascript|data|file):/.test(html));
  assert.ok(html.includes('<span>危險</span>') && html.includes('<span>資料</span>') && html.includes('<span>檔案</span>'));
});

test('人員訊息維持純文字及原始換行，不把Markdown或HTML變成元素', () => {
  const html = render('**工單**\n<img src="x">\n|欄|值|', 'user');
  assert.ok(html.includes('**工單**\n&lt;img'));
  assert.ok(!/<strong|<img|<table|<br/.test(html));
  assert.ok(!html.includes('markdown-message'));
});

test('完整串流與最終訊息的 Markdown 標記一致，不因切換重新排版',()=>{
 const content='### MC37\n\n| 工單 | 數量 |\n| --- | --- |\n| WO-A | 100 |\n\n```text\n數量\n```';
 const stream=renderToStaticMarkup(createElement(ProcessingSteps,{summary:{steps:[],request_id:'test',elapsed_seconds:1},phase:'running',text:content}));
 const final=render(content);const markdown=html=>html.slice(html.indexOf('<div class="aui-md">'),html.lastIndexOf('</div>'));
 assert.equal(markdown(stream),markdown(final));
});

test('首頁交接紀錄的助理回覆不露出原始 Markdown，使用者原句維持純文字', () => {
  const entry = (content, role) => renderToStaticMarkup(createElement(EntryMessageBody, { role, content }));
  const html = entry('### MC37｜2026-10-30 工單\n\n共查得 **4 筆工單**：\n\n| 工單 | 品號 |\n|---|---|\n| 30074933 | FGE-O013-06401 |', 'assistant');
  assert.ok(!html.includes('###') && !html.includes('|---|') && !html.includes('**'));
  assert.ok(html.includes('<h3') && html.includes('<table>') && html.includes('<strong'));
  assert.ok(html.includes('markdown-message'));
  const user = entry('查詢 **MC37** | 今天', 'user');
  assert.equal(user, '<p>查詢 **MC37** | 今天</p>');
});
