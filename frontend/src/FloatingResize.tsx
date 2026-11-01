import { useRef, useState, type RefObject, type CSSProperties } from 'react';
import { t } from './i18n';

/** 桌面浮窗尺寸只屬於外框；不重建聊天或 Guide。 */
export function FloatingResize({ panel, change }: {panel:RefObject<HTMLElement|null>;change:(size:{width:number;height:number}|null)=>void}) {
  const drag=useRef<{x:number;y:number;width:number;height:number}|null>(null);
  const commit=(width:number,height:number)=>change({width:Math.max(320,Math.min(width,window.innerWidth-32)),height:Math.max(400,Math.min(height,window.innerHeight-96))});
  return <button className="floating-resize" aria-label={t('調整聊天室大小')} title={t('拖曳調整大小，方向鍵微調，Enter 還原')} onDoubleClick={()=>change(null)}
    onPointerDown={e=>{if(e.button!==0||!panel.current)return;const rect=panel.current.getBoundingClientRect();drag.current={x:e.clientX,y:e.clientY,width:rect.width,height:rect.height};e.currentTarget.setPointerCapture(e.pointerId);e.preventDefault();}}
    onPointerMove={e=>{const d=drag.current;if(d)commit(d.width+d.x-e.clientX,d.height+d.y-e.clientY);}}
    onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}
    onKeyDown={e=>{const rect=panel.current?.getBoundingClientRect();if(!rect)return;const step=e.shiftKey?64:16;const delta:Record<string,number[]>={ArrowLeft:[step,0],ArrowRight:[-step,0],ArrowUp:[0,step],ArrowDown:[0,-step]};if(delta[e.key]){e.preventDefault();e.stopPropagation();commit(rect.width+delta[e.key][0],rect.height+delta[e.key][1]);}else if(e.key==='Enter'||e.key===' '){e.preventDefault();change(null);}}}>◩</button>;
}
export function useFloatingSize() {
  const [size,setSize]=useState<{width:number;height:number}|null>(()=>{try{const saved=JSON.parse(localStorage.getItem('kaosu-assistant:size')||'null');return saved&&Number.isFinite(saved.width)&&Number.isFinite(saved.height)?saved:null;}catch{return null;}});
  return {style:size?{'--floating-width':`${size.width}px`,'--floating-height':`${size.height}px`} as CSSProperties:undefined,change:(next:typeof size)=>{setSize(next);try{if(next)localStorage.setItem('kaosu-assistant:size',JSON.stringify(next));else localStorage.removeItem('kaosu-assistant:size');}catch{/* 尺寸仍保留於本次畫面。 */}}};
}
