// 各段共用：輸入框、提示、底部說明及送出／停止鍵不能漏量。
const {visibleText,compareText}=require('./visible-text.cjs');
const pairs=[
 ['聊天輸入框','.ux-compose','[data-slot=aui_composer-shell]'],
 ['輸入提示','.ux-compose textarea','.aui-composer-input'],
 ['輸入底部小字','.ux-compose-bottom small','.composer-hint'],
 ['送出／停止鍵','.ux-compose .ux-send','.aui-composer-send'],
 ['送出／停止圖示','.ux-compose .ux-send svg','.aui-composer-send svg']
];
const props=['font-family','font-size','font-weight','line-height','letter-spacing','color','background-color','opacity','cursor','border-radius'];
async function measure(page,selector,scroll){return page.locator(selector).evaluateAll((els,{props,scroll})=>els.filter(e=>e.checkVisibility()&&e.getBoundingClientRect().width&&e.getBoundingClientRect().height).map(e=>{
 if(scroll)e.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
 const style=getComputedStyle(e),isInput=e.matches('textarea');
 return {rect:e.getBoundingClientRect().toJSON(),disabled:e.matches('button,textarea')?e.disabled:null,style:Object.fromEntries(props.map(p=>[p,style.getPropertyValue(p)]).concat(isInput?[['placeholder-color',getComputedStyle(e,'::placeholder').color]]:[]))};
}),{props,scroll});}
async function compareComposer(reference,product,evidencePath){
 const mobile=reference.locator('[data-action=pane-chat]');
 const switchPane=await mobile.isVisible()&&await reference.locator('.ux-compose:visible').count()===0&&await reference.locator('.ux-dialog:visible').count()===0;
 if(switchPane){await mobile.click();await product.locator('.mobile-work-tabs').getByRole('button',{name:'對話',exact:true}).click();}
 const metrics=[];
 for(const phase of ['初始','捲動可見'])for(const [name,r,p] of pairs){
  const [a,b]=await Promise.all([measure(reference,r,phase==='捲動可見'),measure(product,p,phase==='捲動可見')]);
  for(let i=0;i<Math.max(a.length,b.length);i++){
   if(!a[i]||!b[i]){metrics.push({name,index:i,phase,missing:!a[i]?'reference':'product'});continue;}
   metrics.push({name,index:i,phase,reference:a[i],product:b[i],delta:Object.fromEntries(['x','y','width','height','bottom'].map(k=>[k,Math.abs(a[i].rect[k]-b[i].rect[k])])),differences:[...Object.keys(a[i].style).filter(k=>a[i].style[k]!==b[i].style[k]),...(a[i].disabled!==b[i].disabled?['disabled']:[])]});
  }
 }
 const groups=[];
 for(const [name,r,p] of pairs.slice(1,3))groups.push({name,...compareText(await visibleText(reference,r),await visibleText(product,p))});
 if(switchPane&&evidencePath){
  const {compare}=require('./issue55-capture.cjs'),fs=require('node:fs');
  const {width,height}=product.viewportSize();
  const shot=await compare(product,await reference.locator('#ux-app').screenshot(),await product.screenshot(),width,height);
  fs.writeFileSync(evidencePath,Buffer.from(shot.png,'base64'));
 }
 if(switchPane){await reference.locator('[data-action=pane-task]').click();await product.locator('.mobile-work-tabs').getByRole('button',{name:'作業單',exact:true}).click();}
 return {metrics,text:{groups,consistent:groups.every(g=>g.consistent)}};
}
module.exports={compareComposer,pairs};
