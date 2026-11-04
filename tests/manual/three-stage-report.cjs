// 三段統一門檻：缺漏、幾何、計算樣式、可見文字任何一項失敗都不得放行。
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const base=path.resolve(__dirname,'../../docs/design'),summary=[];
const max=r=>Math.max(0,...r.metrics.flatMap(m=>Object.values(m.delta||{})));
const missing=r=>r.metrics.filter(m=>m.missing).length;
const style=r=>r.metrics.reduce((n,m)=>n+(m.differences?.length||0),0);
const passed=r=>missing(r)===0&&max(r)<=4&&style(r)===0&&r.text.consistent;
const table=['# 第三輪三段共同驗收','','範例已依裁定修正；三段均包含共用輸入框、停用狀態與可見文字。主要畫面之外，390 寬另切到對話頁量測並拍圖。沒有修改 4px 門檻或豁免任何可見文字／樣式。','','| 段落／情境 | 1366／390 並排圖 | 幾何 ≤4px | 樣式 | 文字 | 結果 |','|---|---|---|---|---|---|'];
for(const stage of [56,57,58]){
 const rows=JSON.parse(fs.readFileSync(path.join(base,`issue${stage}/量測.json`),'utf8'));assert.equal(rows.length,stage===58?30:32);
 summary.push({段落:stage,畫面數:rows.length,通過:rows.filter(passed).length,幾何最大:max({metrics:rows.flatMap(r=>r.metrics)}),樣式不一致:rows.reduce((n,r)=>n+style(r),0),文字不一致:rows.filter(r=>!r.text.consistent).length,未通過:rows.filter(r=>!passed(r)).map(r=>({情境:r.id,寬度:r.width,差異:r.metrics.filter(m=>m.missing||m.differences.length||Object.values(m.delta).some(v=>v>4)),文字:r.text.groups.filter(g=>!g.consistent)}))});
 const styles=['# 計算樣式逐項比對','','第三輪：包含輸入框、提示、底部說明與送出／停止鍵；保留所有實際值。','','| 情境／寬度／階段 | 元件 | 屬性 | 範例 | 產品 | 結果 |','|---|---|---|---|---|---|'];
 for(const r of rows)for(const m of r.metrics){if(m.missing){styles.push(`| ${r.id}／${r.width} | ${m.name} | 缺漏 | ${m.missing} | — | 未通過 |`);continue;}for(const key of Object.keys(m.reference.style))styles.push(`| ${r.id}／${r.width}／${m.phase||'初始'} | ${m.name}／${m.index+1} | ${key} | ${m.reference.style[key]} | ${m.product.style[key]} | ${m.reference.style[key]===m.product.style[key]?'一致':'不一致'} |`);if(m.reference.disabled!==undefined&&m.reference.disabled!==null)styles.push(`| ${r.id}／${r.width} | ${m.name}／${m.index+1} | disabled | ${m.reference.disabled} | ${m.product.disabled} | ${m.reference.disabled===m.product.disabled?'一致':'不一致'} |`);}
 fs.writeFileSync(path.join(base,`issue${stage}/計算樣式比對.md`),styles.join('\n')+'\n');
 for(const a of rows.filter(r=>r.width===1366)){const b=rows.find(r=>r.id===a.id&&r.width===390),g=Math.max(max(a),max(b)),s=style(a)+style(b),t=a.text.consistent&&b.text.consistent;const extra=fs.existsSync(path.join(base,`issue${stage}/390-${a.id}-輸入框.png`))?` · [對話頁](../issue${stage}/390-${a.id}-輸入框.png)`:'';table.push(`| #${stage} ${a.id} | [1366](../issue${stage}/1366-${a.id}.png)／[390](../issue${stage}/390-${a.id}.png)${extra} | ${g<=4&&!missing(a)&&!missing(b)?'通過':'未通過'} ${g.toFixed(3)}px | ${s?'未通過':'通過'}：${s} 項不一致 | ${t?'一致':'不一致'} | ${passed(a)&&passed(b)?'通過':'未通過'} |`);}
}
fs.writeFileSync(path.join(base,'issue58/三段總表.md'),table.join('\n')+'\n');
fs.writeFileSync(path.join(base,'issue58/三段驗收.json'),JSON.stringify(summary,null,2));
console.log(summary.map(({未通過,...s})=>s));assert.equal(summary.reduce((n,s)=>n+s.通過,0),94,'三段 94 張必須全數通過');
