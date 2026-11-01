import { ActionBarPrimitive, MessagePrimitive, ThreadPrimitive, useAuiState } from '@assistant-ui/react';
import { Check, Copy } from 'lucide-react';
import { MarkdownText } from './markdown-text';
import { TooltipIconButton } from './tooltip-icon-button';
import { t } from '../../../i18n';
import {useCopyToClipboard} from '@/hooks/use-copy-to-clipboard';
import type {Message} from '@/api';

/** 294bc02d Thread 的訊息呈現；Guide 與唯一確認卡由外層原位置承載。 */
export function ThreadMessages() {
  return <div data-slot="aui_message-group" className="flex flex-col gap-y-6 empty:hidden" aria-live="polite" aria-relevant="additions text">
    <ThreadPrimitive.Messages>{() => <ThreadMessage/>}</ThreadPrimitive.Messages>
  </div>;
}
function ThreadMessage() {
  const role = useAuiState(s => s.message.role);
  const message=useAuiState(s=>s.message.metadata.custom.mesMessage as Message|undefined);
  const {isCopied:copied,failed,copyToClipboard}=useCopyToClipboard();
  return <MessagePrimitive.Root data-slot={role === 'user' ? 'aui_user-message-root' : 'aui_assistant-message-root'} data-role={role}
    className={role === 'user' ? 'aui-user-message flex flex-col items-end gap-1' : 'aui-assistant-message relative'}>
    <div className={role === 'user' ? 'aui-user-message-content bg-muted max-w-[90%] rounded-3xl px-4 py-2.5 whitespace-pre-wrap wrap-break-word' : 'text-foreground px-2 leading-relaxed wrap-break-word'}>
      <MessagePrimitive.Parts components={{Text: role === 'user' ? ({text}) => <span>{text}</span> : MarkdownText}}/>
    </div>
    <ActionBarPrimitive.Root hideWhenRunning autohide="not-last" className="text-muted-foreground flex gap-1 min-h-9 ms-2">
      <ActionBarPrimitive.Copy asChild><TooltipIconButton tooltip={t(role==='user'?'複製訊息':'複製回答')} aria-label={t(role==='user'?'複製訊息':'複製回答')} onClick={event=>{event.preventDefault();if(message)copyToClipboard(message.content);}}>
        {copied ? <Check/> : <Copy/>}
      </TooltipIconButton></ActionBarPrimitive.Copy>
    </ActionBarPrimitive.Root>
    {failed&&<span role="status" className="text-muted-foreground text-xs">{t('複製未完成，請選取文字後手動複製。')}</span>}
  </MessagePrimitive.Root>;
}
