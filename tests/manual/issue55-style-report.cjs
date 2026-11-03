// 從逐元件原始量測產生計算樣式表；任何不一致或超過位置門檻時回報失敗。
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const dir=path.resolve(__dirname,'../../docs/design/issue55');
const styles=JSON.parse(fs.readFileSync(path.join(dir,'計算樣式比對.json'),'utf8'));
const geometry=JSON.parse(fs.readFileSync(path.join(dir,'量測.json'),'utf8'));
const properties=require('./issue55-metrics.cjs').properties;
assert.equal(styles.length,34);assert.equal(geometry.length,34);
const groups=new Map();let count=0,mismatches=0;
for(const scene of styles)for(const item of scene.comparisons){
 count++;mismatches+=item.differences.length;
 const key=JSON.stringify([scene.width,item.component,item.product.style,item.reference.style]);
 if(!groups.has(key))groups.set(key,{width:scene.width,item,scenes:new Set(),count:0});
 const group=groups.get(key);group.scenes.add(scene.id);group.count++;
}
const failed=geometry.flatMap(s=>s.geometry.filter(x=>!x.passed).map(x=>({...x,width:s.width,id:s.id})));
let text=`# 第 1 輪計算樣式比對\n\n34 個畫面、${count} 組對應元件、${count*6} 項屬性；不一致 **${mismatches} 項**。擴大後的幾何檢查超過 4px：**${failed.length} 項**。\n\n讀取兩邊的 getComputedStyle 原值，沒有將近似色彩、別名字型或行高正規化成相同。下表依相同計算值分組；每格依「範例 → 產品」列出，逐張逐列資料保留在 [JSON](計算樣式比對.json)。\n\n範圍包含品牌／首頁／對話標題、助理與使用者內文、小標、側欄項目、任務與回覆按鈕、輸入框、彈窗標題／說明／每列內容及動作、最新內容按鈕。雙方不存在的元件不比對；#44 處理步驟與 #47 串流是範例沒有的保留功能，不混入對應元件樣式表。五外觀與三語另有 [環境驗收](環境驗收.json)，本表只比較規格要求的深色繁中。\n\n| 寬度／情境／元件（組數） | ${properties.join(' | ')} | 結果 |\n|---|${properties.map(()=>'---').join('|')}|---|\n`;
const safe=s=>String(s).replaceAll('|','\\|').replaceAll('\n',' ');
for(const {width,item,scenes,count:n} of groups.values()){
 text+=`| ${width}／${[...scenes].join('、')}／${item.component}（${n}） | ${properties.map(k=>`${safe(item.reference.style[k])} → ${safe(item.product.style[k])}`).join(' | ')} | ${item.differences.length?'未通過':'通過'} |\n`;
}
text+='\n## 量測補充\n\nC02 原先的 90.39px 是助理訊息的高度差，不是寬度差：多段長回覆仍附上短答工具列。此輪沿用範例的完整閱讀區，並量測訊息 x／y／width／height 及「查看最新內容」按鈕，沒有只檢查寬度而略過高度。\n\n390px 的彈窗說明、每一列及每個列表動作按鈕都納入量測，完整座標差值保留在 [量測 JSON](量測.json)。\n';
fs.writeFileSync(path.join(dir,'計算樣式比對.md'),text);
console.log(JSON.stringify({對應元件:count,屬性檢查:count*6,不一致:mismatches,超過四像素:failed.length}));
assert.equal(mismatches,0,'計算樣式仍有差異');assert.equal(failed.length,0,'仍有元件超過 4px');
