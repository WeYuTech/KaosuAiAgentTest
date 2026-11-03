// 對應範例的同一語意元件，逐項保留瀏覽器計算值，不以像素比例替代樣式門檻。
const properties=['font-family','font-size','font-weight','line-height','letter-spacing','color'];
const pairs=[
 ['品牌名稱','.assistant-header h2','.ux-appbrand span'],
 ['首頁標題','.welcome-card h1','.ux-home h1'],
 ['對話標題','.reference-title-row>span','.ux-top-title>span'],
 ['使用者訊息','.entry-message.user p','.ux-message.user'],
 ['助理內文','.entry-message.assistant .aui-md p','.ux-message.assistant p'],
 ['助理小標','.entry-message.assistant h3','.ux-message.assistant h3'],
 ['側欄項目','.history-select strong','.ux-history-row>button:first-child'],
 ['任務按鈕','.entry-card strong','.ux-quick button'],
 ['回覆按鈕','.entry-reply-choices button','.ux-message.assistant>.ux-row button'],
 ['輸入框','#entry-input','.ux-compose textarea'],
 ['彈窗標題','.operation-dialog-header h2','.ux-dialog-head h2'],
 ['彈窗說明','.history-scope-note,.history-dialog .operation-dialog-body p','.ux-dialog-body>p'],
 ['彈窗列表列','.history-search-result','.ux-list-item'],
 ['彈窗列表標題','.history-search-result strong','.ux-list-item strong'],
 ['彈窗列表副文','.history-search-result small','.ux-list-item small'],
 ['彈窗列表動作','.history-search-result button','.ux-list-item button'],
 ['彈窗輸入','.history-search-dialog input,.history-dialog input','.ux-dialog input'],
 ['彈窗底部按鈕','.operation-dialog-footer button,.history-dialog .operation-dialog-actions button','.ux-dialog-foot button'],
 ['最新內容','.entry-latest button','.ux-main-content>div[style="text-align:center"] button'],
];
async function collect(page,side){
 return page.evaluate(({pairs,properties,side})=>pairs.map(([label,...selectors])=>({
  label,items:[...document.querySelectorAll(selectors[side])]
   .filter(el=>el.getBoundingClientRect().width&&el.getBoundingClientRect().height&&!el.closest('[hidden]')&&getComputedStyle(el).visibility!=='hidden')
   .map(el=>({text:el.textContent,rect:el.getBoundingClientRect().toJSON(),style:Object.fromEntries(properties.map(key=>[key,getComputedStyle(el).getPropertyValue(key)]))}))
 })),{pairs,properties,side});
}
async function metrics(product,reference){const [p,r]=await Promise.all([collect(product,0),collect(reference,1)]);return p.flatMap((group,i)=>group.items.flatMap((item,j)=>{const ref=r[i].items[j];if(!ref)return [];return [{component:group.label,index:j,product:item,reference:ref,differences:properties.filter(key=>item.style[key]!==ref.style[key]),delta:Object.fromEntries(['x','y','width','height'].map(key=>[key,Math.abs(item.rect[key]-ref.rect[key])]))}]}));}
module.exports={metrics,properties};
