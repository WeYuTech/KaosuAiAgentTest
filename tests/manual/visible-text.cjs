// 共用可見文字驗收：包含控制項目前值，排除未展開內容與僅供讀屏文字。
async function visibleText(page,selector,exclude=''){
 return page.locator(selector).evaluateAll((roots,exclude)=>{
  const items=[];
  function walk(node){
   if(node.nodeType===3){const text=node.textContent.replace(/\s+/g,' ').trim();if(text)items.push(text);return;}
   if(node.nodeType!==1)return;
   const style=getComputedStyle(node);
   if(style.display==='none'||style.visibility==='hidden'||style.clipPath==='inset(50%)'||(style.clip!=='auto'&&style.clip!=='')||node.matches('svg,.sr-only,.ux-sr,[hidden]')||(exclude&&node.matches(exclude)))return;
   // 負座標放在捲動區上方、且無法再向上捲動的內容實際被裁切；下方可捲到的內容仍保留。
   const rect=node.getBoundingClientRect();
   if(rect.height)for(let parent=node.parentElement;parent;parent=parent.parentElement){const s=getComputedStyle(parent);if(['auto','scroll','hidden','clip'].includes(s.overflowY)&&parent.scrollTop===0&&rect.bottom<=parent.getBoundingClientRect().top)return;}
   if(node.matches('input,textarea,select')){
    if(node.matches('input[type=checkbox],input[type=radio]'))return;
    const value=node.tagName==='SELECT'?node.selectedOptions[0]?.textContent:node.value||node.getAttribute('placeholder');
    if(value)items.push(String(value).replace(/\s+/g,' ').trim());return;
   }
   for(const child of node.childNodes){if(node.tagName==='DETAILS'&&!node.open&&child.nodeName!=='SUMMARY')continue;walk(child);}
  }
  roots.filter(root=>root.checkVisibility()&&root.getBoundingClientRect().width&&root.getBoundingClientRect().height).forEach(walk);return items;
 },exclude);
}
function compareText(reference,product){
 // DOM 包裝不同可以分割同一句；只忽略空白，不移除或改寫任何字元。
 const normalize=items=>items.join('').replace(/\s+/g,'');
 return {reference,product,consistent:normalize(reference)===normalize(product)};
}
module.exports={visibleText,compareText};
