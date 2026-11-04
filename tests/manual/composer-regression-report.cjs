// 第二輪新增範圍：三段一律使用 composer-comparison.cjs，不豁免停用差異。
const fs=require('node:fs'),path=require('node:path');
const base=path.resolve(__dirname,'../../docs/design');
const names=new Set(require('./composer-comparison.cjs').pairs.map(p=>p[0]));
const max=ms=>Math.max(0,...ms.flatMap(m=>Object.values(m.delta||{})));
const bad=ms=>ms.filter(m=>m.missing||m.differences.length||Object.values(m.delta).some(v=>v>4));
const output=['# 第二輪：共用輸入框回歸','','包含提示與底部說明的可見文字、輸入框與送出／停止鍵的幾何、計算樣式及 disabled；390 寬作業單情境會切換至「對話」後再量，不以隱藏輸入框算通過。初始及捲動後均保留。','','空白訊息停用、查詢中輸入鎖定與範例不同，仍算未通過；沒有藉由填入文字或改範例避開差異。','','| 段落／情境 | 幾何 ≤4px | 樣式與停用 | 提示及小字 | 輸入框結論 | 證據 |','|---|---|---|---|---|---|'];
const summary=[];
for(const stage of [56,57,58]){
 const rows=JSON.parse(fs.readFileSync(path.join(base,`issue${stage}/量測.json`),'utf8'));
 const items=rows.map(r=>{const ms=r.metrics.filter(m=>names.has(m.name)),groups=r.text.groups.filter(g=>['輸入提示','輸入底部小字'].includes(g.name));return {情境:r.id,寬度:r.width,幾何最大:max(ms),缺漏:ms.filter(m=>m.missing),樣式差異:ms.filter(m=>m.differences?.length),文字差異:groups.filter(g=>!g.consistent),未通過:bad(ms),通過:bad(ms).length===0&&groups.every(g=>g.consistent)};});
 summary.push({段落:stage,畫面數:rows.length,通過:items.filter(r=>r.通過).length,明細:items});
 for(const a of items.filter(r=>r.寬度===1366)){
  const b=items.find(r=>r.情境===a.情境&&r.寬度===390),g=Math.max(a.幾何最大,b.幾何最大),s=a.樣式差異.length+b.樣式差異.length,t=!a.文字差異.length&&!b.文字差異.length;
  const extra=fs.existsSync(path.join(base,`issue${stage}/390-${a.情境}-輸入框.png`))?` · [390 對話頁](../issue${stage}/390-${a.情境}-輸入框.png)`:'';
  output.push(`| #${stage}／${a.情境} | ${g<=4&&!a.缺漏.length&&!b.缺漏.length?'通過':'未通過'} ${g.toFixed(3)}px | ${s===0?'通過':'未通過'}：${s} 筆 | ${t?'一致':'不一致'} | ${a.通過&&b.通過?'通過':'未通過'} | [1366](../issue${stage}/1366-${a.情境}.png) · [390](../issue${stage}/390-${a.情境}.png)${extra} |`);
 }
}
output.push('','## 剩餘差異清單','','- #58：W01–W05、W07、W08、W10 的空白送出鍵；範例啟用、產品停用，因此 disabled 與 cursor 不一致。W06、W09 鎖定狀態兩尺寸全部通過。','- #57：F01–F06、B01–B10 同樣存在空白送出鍵差異，幾何與提示文字通過。','- #56：Q01／Q02 查詢中範例可編輯輸入框，產品保留查詢鎖定；Q03–Q08、P04 有空白送出鍵差異。Q01–Q08 的輸入框另有位置／寬度差異，詳見上表與原始量測。其餘選取彈窗無可見輸入框時，兩方均不量；P04 詢問 AI 輸入框有實際量測。','- #56 全畫面回歸還抓到查詢區寬度及訊息字級／行高差異，原始量測已保留，未宣稱整段通過。','- 390 作業對話頁仍使用既有「僅最新助理訊息」呈現，附加截圖中可見與範例保留使用者訊息的差異；本輪沒有把它當成輸入框差異豁免。','','[完整輸入框回歸數據](輸入框回歸.json) · [第二段全量](../issue56/量測.json) · [第三段全量](../issue57/量測.json)');
fs.writeFileSync(path.join(base,'issue58/輸入框回歸.json'),JSON.stringify(summary,null,2));
fs.writeFileSync(path.join(base,'issue58/輸入框回歸.md'),output.join('\n')+'\n');
console.log(summary.map(({段落,畫面數,通過})=>({段落,畫面數,通過})));
