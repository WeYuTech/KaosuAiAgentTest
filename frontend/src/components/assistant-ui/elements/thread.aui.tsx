import {ProcessingSteps} from '@/ProcessingSteps';
import { ActionBarPrimitive, MessagePrimitive, ThreadPrimitive, useAuiState } from '@assistant-ui/react';
import { Check, Copy } from 'lucide-react';
import { MarkdownText } from './markdown-text';
import { TooltipIconButton } from './tooltip-icon-button';
import { t } from '../../../i18n';
import {useCopyToClipboard} from '@/hooks/use-copy-to-clipboard';
import {useEffect,useRef,useState} from 'react';
import type {PresentedMessage} from '@/chat/message-presentation';
import {ChatQueryResults} from '@/ChatQueryResults';
import type {Workspace} from '@/api';

/** 294bc02d Thread 的訊息呈現；Guide 與唯一確認卡由外層原位置承載。 */
export function ThreadMessages({onViewData,latestAssistantOnly=false}:{onViewData?:(workspace:Workspace)=>void;latestAssistantOnly?:boolean}) {
  const latestAssistantId=useAuiState(s=>s.thread.messages.filter(message=>message.role==='assistant').at(-1)?.id);
  return <div data-slot="aui_message-group" className="flex flex-col gap-y-6 empty:hidden" aria-live="polite" aria-relevant="additions text">
    <ThreadPrimitive.Messages>{() => <ThreadMessage onViewData={latestAssistantOnly?undefined:onViewData} latestAssistantOnly={latestAssistantOnly} latestAssistantId={latestAssistantId}/>}</ThreadPrimitive.Messages>
  </div>;
}
function ThreadMessage({onViewData,latestAssistantOnly,latestAssistantId}:{onViewData?:(workspace:Workspace)=>void;latestAssistantOnly:boolean;latestAssistantId?:string}) {
  const role = useAuiState(s => s.message.role);
  const id = useAuiState(s => s.message.id);
  const message=useAuiState(s=>s.message.metadata.custom.mesMessage as PresentedMessage|undefined);
  const [enter,setEnter]=useState(message?.enter===true);
  const root=useRef<HTMLDivElement>(null);
  useEffect(()=>{const media=window.matchMedia('(prefers-reduced-motion: reduce)');const stop=()=>setEnter(false);const change=()=>{if(media.matches)stop();};change();const element=root.current;element?.addEventListener('animationcancel',stop);media.addEventListener('change',change);return()=>{element?.removeEventListener('animationcancel',stop);media.removeEventListener('change',change);};},[]);
  const {isCopied:copied,failed,copyToClipboard}=useCopyToClipboard();
  if(!message || latestAssistantOnly&&id!==latestAssistantId)return null;
  return <MessagePrimitive.Root data-slot={role === 'user' ? 'aui_user-message-root' : 'aui_assistant-message-root'} data-role={role} ref={root} data-enter={enter||undefined} onAnimationEnd={event=>{if(event.target===event.currentTarget)setEnter(false);}}
    className={`${enter?'dual-enter ':''}${role === 'user' ? 'aui-user-message flex flex-col items-end gap-1' : 'aui-assistant-message relative'}`}>
    {message.processing_summary&&<ProcessingSteps summary={message.processing_summary} phase={message.stopped?'stopped':'done'}/>}
    <div className={role === 'user' ? 'aui-user-message-content bg-muted max-w-[90%] rounded-3xl px-4 py-2.5 whitespace-pre-wrap wrap-break-word' : 'text-foreground px-2 leading-relaxed wrap-break-word'}>
      <MessagePrimitive.Parts components={{Text: role === 'user' ? ({text}) => <span>{text}</span> : MarkdownText}}/>
    </div>
    {onViewData && role==='assistant' && Array.isArray((message.data as Workspace)?.records) && <ChatQueryResults workspace={message.data as Workspace} onAll={()=>onViewData(message.data as Workspace)}/>}
    {message?.delivery&&<span className="message-delivery">{t(message.delivery==='pending'?'待處理 · 尚未取得回覆':message.delivery==='rejected'?'請求已拒絕，未重新送出':message.delivery==='not_sent'?'訊息尚未送出，請先處理資料保存錯誤。':'送達結果未知，未重新送出')}</span>}
    {!latestAssistantOnly&&<ActionBarPrimitive.Root hideWhenRunning autohide="not-last" className="text-muted-foreground flex gap-1 min-h-9 ms-2">
      <ActionBarPrimitive.Copy asChild><TooltipIconButton tooltip={t(role==='user'?'複製訊息':'複製回答')} aria-label={t(role==='user'?'複製訊息':'複製回答')} onClick={event=>{event.preventDefault();if(message)copyToClipboard(message.content);}}>
        {copied ? <Check/> : <Copy/>}
      </TooltipIconButton></ActionBarPrimitive.Copy>
    </ActionBarPrimitive.Root>}
    {failed&&<span role="status" className="text-muted-foreground text-xs">{t('複製未完成，請選取文字後手動複製。')}</span>}
  </MessagePrimitive.Root>;
}
