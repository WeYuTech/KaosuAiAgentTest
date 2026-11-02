// 僅限本機隔離頁，使用 Chrome 原生頁面縮放，不改 DOM 或截圖尺寸。
chrome.tabs.onUpdated.addListener((id,change,tab)=>{if(change.status==='complete'&&tab.url?.startsWith('http://127.0.0.1:'))chrome.tabs.setZoom(id,2);});
