import { useLayoutEffect, useRef, type Ref } from 'react';
import { ArrowUp, LoaderCircle } from 'lucide-react';
import { t } from './i18n';
import { submitComposerOnEnter } from './composerInput';

/** 輸入值與送出仍由 App 控制；版面、切主題與尺寸不會重建草稿。 */
export function ConversationComposer({ id, value, onChange, onSend, disabled, sendDisabled, busy, placeholder, inputRef, hint }: {
  id: string; value: string; onChange: (text: string) => void; onSend: () => void;
  disabled?: boolean; sendDisabled?: boolean; busy?: boolean; placeholder: string;
  inputRef?: Ref<HTMLTextAreaElement>; hint?: string;
}) {
  const textarea = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => {
    const input = textarea.current;
    if (input) { input.style.height = 'auto'; input.style.height = `${input.scrollHeight}px`; }
  }, [value]);
  return <form className="composer" onSubmit={event => { event.preventDefault(); if(!disabled && !sendDisabled && !busy) onSend(); }}>
    <label className="sr-only" htmlFor={id}>{t('描述作業需求')}</label>
    <textarea id={id} ref={node => {textarea.current = node; if(typeof inputRef === 'function') inputRef(node); else if(inputRef) inputRef.current = node;}}
      value={value} rows={1} disabled={disabled} placeholder={placeholder} enterKeyHint="send"
      onChange={event => onChange(event.target.value)}
      onKeyDown={event => submitComposerOnEnter(event, !disabled && !sendDisabled && !busy, onSend)}/>
    <div className="composer-actions"><span>{hint}</span><button type="submit" className="send-button" disabled={disabled || sendDisabled || busy} aria-label={t('送出訊息')}>
      {busy ? <LoaderCircle className="spin" size={18}/> : <ArrowUp size={18}/>}
    </button></div>
  </form>;
}
