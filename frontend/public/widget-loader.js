/* WeYu main 視覺：深藍黃邊啟動器、520×760 上限；保留 Kaosu 同源與展開契約。 */
(() => {
  const script = document.currentScript;
  if (!script || document.querySelector('[data-kaosu-assistant-host]')) return;
  const target = new URL(script.dataset.assistantUrl || './', script.src);
  if (!['https:', 'http:'].includes(target.protocol) || target.origin !== location.origin) return;
  target.searchParams.set('embed', '1');
  const context = new URLSearchParams(location.search);
  for (const key of ['OPERATION', 'SCHEDULE_DATE', 'WIP_OPI_WDOEACICO_HIST_SID', 'ZZ_KAOSU_PROD_SCHEDULE_SID', 'EQP_NO']) {
    if (context.has(key)) target.searchParams.set(key, context.get(key));
  }
  if (location.pathname.toLowerCase().endsWith('/mes-wip/setup/wip-query_schedule_detail_new.html') && !context.get('ZZ_KAOSU_PROD_SCHEDULE_SID') && context.getAll('SID').length === 1 && /^[1-9]\d{0,17}$/.test(context.get('SID') || '')) {
    target.searchParams.set('ZZ_KAOSU_PROD_SCHEDULE_SID', context.get('SID'));
  }
  if (context.getAll('fac').length === 1 && ['fac1', 'fac2', 'fac3'].includes(context.get('fac'))) target.searchParams.set('fac', context.get('fac'));
  const host = document.createElement('div');
  host.dataset.kaosuAssistantHost = '';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = ':host{all:initial}button{position:fixed;right:max(24px,env(safe-area-inset-right));bottom:max(24px,env(safe-area-inset-bottom));z-index:2147483000;min-height:52px;padding:0 20px;display:flex;gap:8px;align-items:center;border:2px solid #ffce00;border-radius:999px;background:#171d63;color:white;cursor:pointer;font:16px "Microsoft JhengHei","Segoe UI",sans-serif;box-shadow:0 12px 30px #191b2147}button:hover{background:#11164f}button:focus-visible{outline:3px solid #242d83;outline-offset:2px}svg{width:20px;height:20px}iframe{position:fixed;right:max(24px,env(safe-area-inset-right));bottom:max(24px,env(safe-area-inset-bottom));width:min(520px,calc(100vw - 48px));height:min(760px,calc(100dvh - 48px));border:1px solid #e2e8f0;border-radius:24px;background:white;box-shadow:0 28px 80px rgba(15,23,42,.24);z-index:2147483001;display:none}iframe[data-expanded=true]{inset:0;width:100vw;height:100dvh;border:0;border-radius:0}@media(max-width:600px){iframe{inset:0;width:100vw;height:100dvh;border:0;border-radius:0}}';
  const bot = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2m16 0h2M9 13v2m6-2v2"/></svg>';
  const down = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
  const launcher = document.createElement('button');
  launcher.type = 'button'; launcher.innerHTML = bot + '<span>生產情報助理</span>'; launcher.setAttribute('aria-label', '開啟生產情報助理'); launcher.title = '生產情報助理';
  const frame = document.createElement('iframe');
  frame.title = 'WeYu AI 生產情報助理 · 作業'; frame.referrerPolicy = 'strict-origin-when-cross-origin';
  let loaded = false, opened = false;
  let locale = 'zh-TW';
  const captions = () => locale === 'en' ? ['Open production assistant', 'Close production assistant', 'Production assistant'] : locale === 'th' ? ['เปิดผู้ช่วยการผลิต', 'ปิดผู้ช่วยการผลิต', 'ผู้ช่วยการผลิต'] : ['開啟生產情報助理', '收合生產情報助理', '生產情報助理'];
  const paint = resolved => {
    const dark = resolved === 'dark';
    launcher.style.background = '#171d63';
    launcher.style.color = '#ffffff';
    launcher.style.borderColor = '#ffce00';
    frame.style.background = dark ? '#10172a' : '#f7f8fa';
    launcher.setAttribute('aria-label', captions()[opened ? 1 : 0]);
    launcher.innerHTML = bot + '<span>' + captions()[2] + '</span>';
    launcher.title = captions()[2]; frame.title = `WeYu AI · ${captions()[2]}`;
  };
  try {
    const savedLocale = localStorage.getItem('kaosu-assistant:locale');
    if (['zh-TW', 'en', 'th'].includes(savedLocale)) locale = savedLocale;
    const savedTheme = localStorage.getItem('kaosu-assistant:theme');
    paint(savedTheme === 'dark' || ((!savedTheme || savedTheme === 'system') && window.matchMedia?.('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light');
  } catch { /* 瀏覽器禁止偏好儲存時，仍可正常操作。 */ }
  const setOpen = next => {
    opened = next;
    if (next && !loaded) { frame.src = target.href; loaded = true; }
    frame.style.display = next ? 'block' : 'none';
    launcher.style.display = next ? 'none' : '';
    launcher.innerHTML = (next ? down : bot) + '<span>' + captions()[2] + '</span>';
    launcher.setAttribute('aria-expanded', String(next));
    launcher.setAttribute('aria-label', captions()[next ? 1 : 0]);
    if (next) { frame.contentWindow?.postMessage({ type: 'kaosu-assistant:open' }, target.origin); frame.focus(); }
    else { frame.dataset.expanded = 'false'; launcher.focus(); }
  };
  launcher.addEventListener('click', () => setOpen(!opened));
  window.addEventListener('message', event => {
    if (event.source !== frame.contentWindow || event.origin !== target.origin) return;
    if (event.data?.type === 'kaosu-assistant:preferences') {
      if (!['zh-TW', 'en', 'th'].includes(event.data.locale) || !['light', 'dark', 'system'].includes(event.data.theme) || !['light', 'dark'].includes(event.data.resolvedTheme)) return;
      locale = event.data.locale;
      paint(event.data.resolvedTheme);
    }
    if (event.data?.type === 'kaosu-assistant:close') setOpen(false);
    if (event.data?.type === 'kaosu-assistant:resize') {
      const expanded = event.data.expanded === true;
      frame.dataset.expanded = String(expanded);
      launcher.style.display = opened ? 'none' : '';
    }
  });
  shadow.append(style, launcher, frame); document.body.append(host);
})();
