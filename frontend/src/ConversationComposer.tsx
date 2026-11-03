import { type Ref } from 'react';
import { ComposerPrimitive } from '@assistant-ui/react';
import { ArrowUp, Square } from 'lucide-react';
import { TooltipIconButton } from './components/assistant-ui/elements/tooltip-icon-button';
import { t } from './i18n';

/** 移植 thread.aui.tsx 的 Composer；value 永遠來自同一份 App 草稿。 */
export function ConversationComposer({ id, value, onChange, disabled, sendDisabled, busy, onStop, stopped, placeholder, inputRef, hint, compact=false }: {
  id: string; value: string; onChange: (text: string) => void; onSend?: () => void;
  disabled?: boolean; sendDisabled?: boolean; busy?: boolean; onStop?: () => void; stopped?: boolean; placeholder: string;
  inputRef?: Ref<HTMLTextAreaElement>; hint?: string; compact?: boolean;
}) {
  return <ComposerPrimitive.Root className="aui-composer-root relative flex w-full flex-col" style={{["--composer-bg" as string]:"color-mix(in oklab, var(--color-muted) 30%, transparent)",["--composer-radius" as string]:"1rem",["--composer-padding" as string]:"8px"}}>
    <div data-slot="aui_composer-shell" className={`border-foreground/10 focus-within:border-foreground/25 flex w-full cursor-text ${compact?'flex-row items-end':'flex-col'} gap-2 rounded-(--composer-radius) border bg-(--composer-bg) p-(--composer-padding) transition-[border-color]`}>
      <ComposerPrimitive.Input id={id} ref={inputRef} value={busy?'':value} rows={1} disabled={disabled} placeholder={placeholder} enterKeyHint="send"
        className="aui-composer-input caret-primary placeholder:text-muted-foreground/60 max-h-48 min-h-10 w-full resize-none bg-transparent px-2.5 py-1 text-base leading-6 outline-none"
        aria-label={t('描述作業需求')} onChange={event => onChange(event.currentTarget.value)} cancelOnEscape={false} addAttachmentOnPaste={false}
        unstable_focusOnRunStart={false} unstable_focusOnScrollToBottom={false} unstable_focusOnThreadSwitched={false}/>
      <div className="aui-composer-action-wrapper relative flex items-center justify-between"><small className="composer-hint">{hint}</small>
        {busy ? <TooltipIconButton tooltip={t(stopped?'已停止等待；原請求仍在處理':'停止等待')} type="button" variant="default" size="icon" className="aui-composer-send size-7 rounded-full" aria-label={t('停止等待')} disabled={stopped||!onStop} onClick={onStop}><Square className="size-4"/></TooltipIconButton> : <ComposerPrimitive.Send asChild><TooltipIconButton tooltip={t('送出訊息')} type="button" variant="default" size="icon"
          className="aui-composer-send size-7 rounded-full" disabled={disabled || sendDisabled || busy} aria-label={t('送出訊息')}>
          <ArrowUp className="aui-composer-send-icon size-4"/>
        </TooltipIconButton></ComposerPrimitive.Send>}
      </div>
    </div>
  </ComposerPrimitive.Root>;
}
