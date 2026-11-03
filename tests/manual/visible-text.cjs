// 共用可見文字驗收：包含控制項目前值，排除未展開內容與僅供讀屏文字。
async function visibleText(page,selector,exclude=''){
 return page.locator(selector).evaluateAll((roots,exclude)=>{
  const items=[];
  function walk(node){
   if(node.nodeType===3){const text=node.textContent.replace(/\s+/g,' ').trim();if(text)items.push(text);return;}
   if(node.nodeType!==1)return;
   const style=getComputedStyle(node);
   if(style.display==='none'||style.visibility==='hidden'||style.clipPath==='inset(50%)'||(style.clip!=='auto'&&style.clip!=='')||node.matches('svg,.sr-only,.ux-sr,[hidden]')||(exclude&&node.matches(exclude)))return;
   if(node.matches('input,textarea,select')){
    if(node.matches('input[type=checkbox],input[type=radio]'))return;
    const value=node.tagName==='SELECT'?node.selectedOptions[0]?.textContent:node.value||node.getAttribute('placeholder');
    if(value)items.push(String(value).replace(/\s+/g,' ').trim());return;
   }
   for(const child of node.childNodes){if(node.tagName==='DETAILS'&&!node.open&&child.nodeName!=='SUMMARY')continue;walk(child);}
  }
  roots.forEach(walk);return items;
 },exclude);
}
function compareText(reference,product){
 // DOM 包裝不同可以分割同一句；只忽略空白，不移除或改寫任何字元。
 const normalize=items=>items.join('').replace(/\s+/g,'');
 return {reference,product,consistent:normalize(reference)===normalize(product)};
}
module.exports={visibleText,compareText};
