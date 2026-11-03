import {useEffect,useRef,useState,type RefObject,type PointerEvent as ReactPointerEvent} from 'react';
import {t} from './i18n';
export const SIDEBAR_KEY='kaosu-assistant:sidebar-width';
export const SIDEBAR_DEFAULT=244, SIDEBAR_MIN=220, SIDEBAR_MAX=360, SPLITTER_SIZE=6;
export function sidebarLimit(container:number){return Math.min(SIDEBAR_MAX,Math.floor(container-SPLITTER_SIZE-480));}
export function clampSidebar(value:number,max:number){return Math.max(SIDEBAR_MIN,Math.min(Number.isFinite(value)?value:SIDEBAR_DEFAULT,max));}
function storedWidth(){try{const value=Number(localStorage.getItem(SIDEBAR_KEY));return value>=SIDEBAR_MIN&&value<=SIDEBAR_MAX?value:SIDEBAR_DEFAULT;}catch{return SIDEBAR_DEFAULT;}}
/** 偏好與暫時可用寬度分離；窄版不能覆寫寬版偏好。 */
export function useSidebarLayout(body:RefObject<HTMLDivElement|null>,open:boolean){
 const [container,setContainer]=useState(0),[preferred,setPreferred]=useState(storedWidth),[preview,setPreview]=useState<number|null>(null);
 const [collapsed,setCollapsed]=useState(()=>{try{return localStorage.getItem('kaosu-assistant:sidebar-collapsed')==='true';}catch{return false;}});
 useEffect(()=>{if(!open||!body.current)return;const node=body.current;setContainer(node.getBoundingClientRect().width);const observer=new ResizeObserver(entries=>setContainer(entries[0].contentRect.width));observer.observe(node);return()=>observer.disconnect();},[open,body]);
 const max=sidebarLimit(container),wide=container>880&&max>=SIDEBAR_MIN;
 const width=clampSidebar(preview??preferred,Math.max(SIDEBAR_MIN,max));
 function commit(value:number){const next=clampSidebar(value,Math.max(SIDEBAR_MIN,max));setPreview(null);setPreferred(next);try{localStorage.setItem(SIDEBAR_KEY,String(next));}catch{/* 本次畫面仍可操作。 */}}
 function collapse(value:boolean){setCollapsed(value);try{localStorage.setItem('kaosu-assistant:sidebar-collapsed',String(value));}catch{/* 本次畫面仍可操作。 */}}
 return {wide,width,max,preferred,collapsed,collapse,commit,preview:setPreview};
}
export function SidebarSplitter({width,max,preferred,visible,preview,commit,collapse,onDragging}:{width:number;max:number;preferred:number;visible:boolean;preview:(value:number|null)=>void;commit:(value:number)=>void;collapse:()=>void;onDragging:(value:boolean)=>void}){
 const node=useRef<HTMLDivElement>(null),frame=useRef<number|null>(null);
 const current=useRef({width,max,preferred,preview,commit,collapse,onDragging});current.current={width,max,preferred,preview,commit,collapse,onDragging};
 const drag=useRef<{node:HTMLDivElement;pointer:number;x:number;width:number;pending:number}|null>(null);
 function finish(save:boolean){const d=drag.current;if(!d)return;drag.current=null;if(frame.current!==null){cancelAnimationFrame(frame.current);frame.current=null;}if(save)current.current.commit(d.pending);else current.current.preview(null);current.current.onDragging(false);if(d.node.hasPointerCapture?.(d.pointer))d.node.releasePointerCapture(d.pointer);}
 useEffect(()=>{const blur=()=>finish(false);window.addEventListener('blur',blur);return()=>{window.removeEventListener('blur',blur);finish(false);};},[]);
 useEffect(()=>{finish(false);},[visible,max]);
 const move=(event:ReactPointerEvent<HTMLDivElement>)=>{const d=drag.current;if(!d||d.pointer!==event.pointerId)return;d.pending=clampSidebar(d.width+event.clientX-d.x,current.current.max);if(frame.current===null)frame.current=requestAnimationFrame(()=>{frame.current=null;if(drag.current===d)current.current.preview(d.pending);});};
 return <div ref={node} hidden={!visible} inert={!visible?true:undefined} className="sidebar-splitter" role="separator" tabIndex={visible?0:-1} aria-label={t('聊天側欄寬度')} title={t('左右鍵調整寬度；Home／End 到上下限；Backspace 重設')} aria-controls="chat-history" aria-orientation="vertical" aria-valuemin={visible?SIDEBAR_MIN:undefined} aria-valuemax={visible?max:undefined} aria-valuenow={visible?width:undefined} aria-valuetext={t('{0} 像素',{0:width})}
 onPointerDown={event=>{if(event.button!==0||!visible)return;event.preventDefault();event.stopPropagation();event.currentTarget.focus();drag.current={node:event.currentTarget,pointer:event.pointerId,x:event.clientX,width,pending:width};event.currentTarget.setPointerCapture(event.pointerId);onDragging(true);}}
 onPointerMove={move} onPointerUp={event=>{if(drag.current?.pointer===event.pointerId){move(event);finish(true);}}} onPointerCancel={()=>finish(false)} onLostPointerCapture={()=>finish(false)} onDoubleClick={()=>{finish(false);commit(SIDEBAR_DEFAULT);}}
 onKeyDown={event=>{if(event.nativeEvent.isComposing)return;const step=event.shiftKey?32:8;const next=event.key==='ArrowLeft'?width-step:event.key==='ArrowRight'?width+step:event.key==='Home'?SIDEBAR_MIN:event.key==='End'?max:null;
 if(event.key==='Backspace'){event.preventDefault();finish(false);commit(SIDEBAR_DEFAULT);}else if(next!==null){event.preventDefault();event.stopPropagation();finish(false);commit(next);}else if(event.key==='Enter'){event.preventDefault();event.stopPropagation();finish(false);collapse();}else if(event.key==='Escape'&&drag.current){event.preventDefault();event.stopPropagation();finish(false);}}}/>;
}
