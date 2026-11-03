import {useEffect,useRef,useState} from 'react';
/** 單一捲動控制者；只操作 Viewport，永不 scrollIntoView 牽動宿主。 */
export function useChatScroll(scope:string|null,enabled:boolean,completed=false){
 const viewport=useRef<HTMLDivElement>(null),content=useRef<HTMLDivElement>(null);
 const finished=useRef(completed);finished.current=completed;
 const manual=useRef(false);
 const follow=useRef(true),seeking=useRef(false);
 const [away,setAway]=useState(false);
 useEffect(()=>{
  const view=viewport.current,body=content.current;if(!enabled||!view||!body)return;
  manual.current=false;follow.current=true;seeking.current=false;setAway(false);view.scrollTop=0;
  const media=window.matchMedia('(prefers-reduced-motion: reduce)');
  const atBottom=()=>view.scrollHeight-view.clientHeight-view.scrollTop<64;
  const scroll=()=>{if(seeking.current){if(atBottom()){seeking.current=false;follow.current=true;setAway(false);}return;}follow.current=atBottom();setAway(!follow.current);};
  const stop=()=>{manual.current=true;seeking.current=false;follow.current=false;view.scrollTo({top:view.scrollTop,behavior:'instant'});setAway(true);};
  const wheel=(event:WheelEvent)=>{if(event.deltaY!==0)stop();};
  const key=(event:KeyboardEvent)=>{if(event.target instanceof HTMLElement&&event.target.closest('input,textarea,select,[contenteditable=true]'))return;if(['ArrowUp','PageUp','Home'].includes(event.key))stop();};
  const reduce=()=>{if(media.matches&&seeking.current){seeking.current=false;view.scrollTo({top:view.scrollHeight,behavior:'instant'});follow.current=true;setAway(false);}};
  let frame=0;const observer=new ResizeObserver(()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{if(finished.current){if(!manual.current){const reply=body.querySelectorAll<HTMLElement>('.aui-assistant-message,.entry-message.assistant');const last=reply[reply.length-1];if(last)view.scrollTo({top:view.scrollTop+last.getBoundingClientRect().top-view.getBoundingClientRect().top,behavior:'instant'});}setAway(!atBottom());return;}if(follow.current&&!seeking.current)view.scrollTo({top:view.scrollHeight,behavior:'instant'});else setAway(!atBottom());});});
  observer.observe(body);view.addEventListener('scroll',scroll);view.addEventListener('wheel',wheel,{passive:true});view.addEventListener('touchstart',stop,{passive:true});view.addEventListener('keydown',key);media.addEventListener('change',reduce);
  return()=>{cancelAnimationFrame(frame);observer.disconnect();view.removeEventListener('scroll',scroll);view.removeEventListener('wheel',wheel);view.removeEventListener('touchstart',stop);view.removeEventListener('keydown',key);media.removeEventListener('change',reduce);};
 },[scope,enabled]);
 const latest=()=>{const view=viewport.current;if(!view)return;const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;manual.current=false;follow.current=true;seeking.current=!reduced;setAway(false);view.scrollTo({top:view.scrollHeight,behavior:reduced?'instant':'smooth'});};
 return {viewport,content,away,latest};
}
