// 門檻不做豁免：缺元件、樣式或文字不同仍列未通過，等待審查裁定。
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const dir=path.resolve(__dirname,'../../docs/design/issue58');const rows=JSON.parse(fs.readFileSync(path.join(dir,'量測.json'),'utf8'));assert.equal(rows.length,30);
const missing=r=>r.metrics.filter(m=>m.missing).length;
const max=r=>Math.max(0,...r.metrics.flatMap(m=>Object.values(m.delta||{})));
const styles=r=>r.metrics.filter(m=>!m.missing).reduce((n,m)=>n+m.differences.length,0);
const geo=r=>!missing(r)&&max(r)<=4,style=r=>!missing(r)&&styles(r)===0;
const table='| 情境 | 1366×768 比對 | 390×810 比對 | 像素差異比例（桌面／窄版） | 幾何 ≤4px | 計算樣式 | 可見文字 | 結果 |\n|---|---|---|---|---|---|---|---|\n'+rows.filter(r=>r.width===1366).map(a=>{const b=rows.find(x=>x.width===390&&x.id===a.id),g=geo(a)&&geo(b),s=style(a)&&style(b),t=a.text.consistent&&b.text.consistent;return `| ${a.id} | [左範例／中產品／右差異](1366-${a.id}.png) | [左範例／中產品／右差異](390-${a.id}.png) | ${a.ratio.toFixed(2)}%／${b.ratio.toFixed(2)}% | ${g?'通過':'未通過'}：${Math.max(max(a),max(b)).toFixed(3)}px；缺漏 ${missing(a)+missing(b)} | ${s?'通過':'未通過'}：${styles(a)+styles(b)} 項不一致 | ${t?'一致':'不一致'} | ${g&&s&&t?'通過':'未通過'} |`;}).join('\n');
fs.writeFileSync(path.join(dir,'比對總覽.md'),'# 第四段畫面量測\n\n15 情境各兩種尺寸，深色、繁中、同資料。每張左範例、中產品、右差異疊圖；像素任一 RGB 通道差超過 16 標紅。幾何、樣式、文字三項均通過才算通過，不以像素比例或理由豁免。\n\n每個元件均記錄初始位置與捲動可見的位置；量測.json 保存捲動容器及 scrollTop。截圖的連續動畫固定同一相位，正常速度影片與動態驗收不暫停動畫。範例安全語意依第一輪審查裁定獨立修正；外框位置未動。保留所有可見安全資訊的量測，收合內容不冒充可見元件。\n\n'+table+'\n\n[原始量測](量測.json) · [計算樣式逐項表](計算樣式比對.md) · [安全操作與請求次數](安全操作驗收.json)\n');
const lines=['# 計算樣式逐項比對','','包含初始與捲動可見兩階段；所有實際不同值與缺漏保留。按鈕另核對 opacity、cursor 與 disabled。','','| 情境／尺寸／階段 | 元件／序號 | 屬性 | 範例 | 產品 | 結果 |','|---|---|---|---|---|---|'];
for(const r of rows)for(const m of r.metrics){const n=`${r.id}／${r.width}／${m.phase}`;if(m.missing){lines.push(`| ${n} | ${m.name}／${m.index+1} | 元件 | ${m.missing==='reference'?'缺少':'存在'} | ${m.missing==='product'?'缺少':'存在'} | 未通過 |`);continue;}for(const key of Object.keys(m.reference.style))lines.push(`| ${n} | ${m.name}／${m.index+1} | ${key} | ${m.reference.style[key]} | ${m.product.style[key]} | ${m.reference.style[key]===m.product.style[key]?'一致':'不一致'} |`);if(m.reference.disabled!==null)lines.push(`| ${n} | ${m.name}／${m.index+1} | disabled | ${m.reference.disabled} | ${m.product.disabled} | ${m.reference.disabled===m.product.disabled?'一致':'不一致'} |`);}
fs.writeFileSync(path.join(dir,'計算樣式比對.md'),lines.join('\n')+'\n');
const summary={畫面數:rows.length,通過:rows.filter(r=>geo(r)&&style(r)&&r.text.consistent).length,未通過:rows.filter(r=>!(geo(r)&&style(r)&&r.text.consistent)).map(r=>r.id+'/'+r.width)};fs.writeFileSync(path.join(dir,'驗收統計.json'),JSON.stringify(summary,null,2));console.log(summary);

assert.equal(summary.通過,30,'幾何、樣式與可見文字必須全部通過');
