// 由瀏覽器原始量測產生審查表；有缺漏、樣式差異或幾何超標就失敗。
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),dir=path.join(root,'docs/design/issue57');
const rows=JSON.parse(fs.readFileSync(path.join(dir,'量測.json'),'utf8'));
assert.equal(rows.length,32);
const bad=rows.flatMap(r=>r.metrics.filter(m=>m.missing||m.differences.length||Object.values(m.delta).some(v=>v>4)).map(m=>({情境:r.id,寬:r.width,...m})));
const textBad=rows.filter(r=>!r.text?.consistent);
const count=rows.reduce((n,r)=>n+r.metrics.filter(m=>!m.missing).length*6,0);
const max=r=>Math.max(...r.metrics.filter(m=>m.delta).flatMap(m=>Object.values(m.delta)));
const groups=new Map();for(const r of rows)for(const m of r.metrics){if(m.missing)continue;const key=m.name+'／'+r.width;const group=groups.get(key)||{n:0,reference:{},product:{}};group.n++;for(const side of ['reference','product'])for(const [k,v]of Object.entries(m[side].style)){group[side][k]??=new Set();group[side][k].add(v);}groups.set(key,group);}
const props=['font-family','font-size','font-weight','line-height','letter-spacing','color'];
fs.writeFileSync(path.join(dir,'計算樣式比對.md'),'# 計算樣式比對\n\n使用瀏覽器 getComputedStyle；每個可見語意元件逐項比對六個屬性，原始位置與值見 [量測.json](量測.json)。以下依元件與尺寸彙整，所有不同值都保留；不是只抽查一筆。\n\n比較 '+count+' 項屬性。\n\n| 元件／寬度 | 元件筆數 | 屬性 | 範例計算值 | 產品計算值 | 結果 |\n|---|---:|---|---|---|---|\n'+[...groups].flatMap(([name,g])=>props.map(k=>{const a=[...g.reference[k]].sort().join('；'),b=[...g.product[k]].sort().join('；');return `| ${name} | ${g.n} | ${k} | ${a} | ${b} | ${a===b?'一致':'不一致'} |`;})).join('\n')+'\n');
const table='| 情境 | 1366×768 比對 | 差異比例 | 390×810 比對 | 差異比例 | 最大位置／大小差 | 文字一致 | 量測結果 |\n|---|---|---:|---|---:|---:|---|---|\n'+rows.filter(r=>r.width===1366).map(r=>{const m=rows.find(x=>x.id===r.id&&x.width===390);return `| ${r.id} | [左範例／中產品／右差異](${r.width}-${r.id}.png) | ${r.ratio.toFixed(2)}% | [左範例／中產品／右差異](390-${r.id}.png) | ${m.ratio.toFixed(2)}% | ${Math.max(max(r),max(m)).toFixed(3)}px | ${r.text?.consistent&&m.text?.consistent?'一致':'不一致'} | ${bad.some(b=>b.情境===r.id)||textBad.some(b=>b.id===r.id)?'未通過':'通過'} |`;}).join('\n');
fs.writeFileSync(path.join(dir,'比對總覽.md'),`# 第三段畫面量測\n\n16 情境 × 2 尺寸，深色、繁中、同一份受控資料。範例與產品採同一 Chromium、同一字型反鋸齒設定。只移除範例的展示選單並把外框設為相同 viewport，不修改範例內部 CSS。\n\n六項文字樣式共 ${count} 次比對，失敗項目 ${bad.filter(x=>x.missing||x.differences?.length).length}；幾何超過 4px 項目 ${bad.filter(x=>x.delta&&Object.values(x.delta).some(v=>v>4)).length}。最大差 ${Math.max(...rows.map(max)).toFixed(3)}px。可見文字不一致 ${textBad.length} 組；逐組標題、狀態、內容、步驟及動作文字保存在量測.json。\n\n像素比例採任一 RGB 通道差超過 16 作為標紅門檻，不用比例取代幾何與樣式門檻。轉圈相位、瀏覽器表單與焦點繪製，以及保留的產品功能也會出現在疊圖，沒有遮罩刪除。\n\n${table}\n\n詳見 [計算樣式比對](計算樣式比對.md)、[逐元件原始量測](量測.json)。\n`);
console.log({情境:rows.length,樣式屬性:count,最大幾何差:Math.max(...rows.map(max)),幾何樣式失敗:bad.length,文字失敗:textBad.length});assert.equal(bad.length,0,JSON.stringify(bad.slice(0,4)));

assert.equal(textBad.length,0,'可見文字不一致：'+textBad.map(r=>r.id+'/'+r.width).join('、'));
