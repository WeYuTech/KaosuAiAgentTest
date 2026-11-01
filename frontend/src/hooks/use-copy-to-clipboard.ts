"use client";

import { useEffect, useRef, useState } from "react";

export type UseCopyToClipboardOptions = {
  copiedDuration?: number;
  fallback?: (value: string) => boolean | void | Promise<boolean | void>;
};

/** 沿用來源 HTTP MES 的選取複製方式，不要求變更部署的 HTTPS 契約。 */
export function copyUsingSelection(value:string):boolean {
  if(typeof document==='undefined')return false;
  const active=document.activeElement as HTMLElement|null;
  const target=document.createElement('textarea');target.className='mes-ai-copy-target';target.value=value;
  (document.getElementById('mes-ai-chat-root')||document.body).append(target);
  try {target.select();return document.execCommand('copy');}
  finally {target.remove();active?.focus({preventScroll:true});}
}

/** 相容請求交回既有控制器；其結果未知時不顯示假的「已複製」 */
export async function copyTextWithFallback(value: string, clipboard?: Pick<Clipboard, 'writeText'>, fallback?: UseCopyToClipboardOptions['fallback']): Promise<boolean> {
  if (!value) return false;
  if (clipboard) {
    try {await clipboard.writeText(value); return true;} catch { /* 權限拒絕時沿用宿主的相容回報 */ }
  }
  try {return await fallback?.(value)===true;} catch { /* 複製失敗不產生未處理的 Promise */ }
  return false;
}

export const useCopyToClipboard = ({
  copiedDuration = 3000,
  fallback=copyUsingSelection,
}: UseCopyToClipboardOptions = {}) => {
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [failed,setFailed]=useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const scopeGenerationRef = useRef(0);

  useEffect(
    () => () => {
      scopeGenerationRef.current += 1;
      if (copiedTimerRef.current === undefined) return;

      clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = undefined;
      setIsCopied(false);
      setFailed(false);
    },
    [fallback],
  );

  const copyToClipboard = (value: string) => {
    if (!value) return;
    setFailed(false);

    const scopeGeneration = scopeGenerationRef.current;
    void copyTextWithFallback(value, typeof navigator === 'undefined' ? undefined : navigator.clipboard,
      fallback ? text => {if (scopeGeneration === scopeGenerationRef.current) return fallback(text);} : undefined).then(
      nativeCopied => {
        if(scopeGeneration !== scopeGenerationRef.current)return;
        if(!nativeCopied){setFailed(true);return;}

        if (copiedTimerRef.current !== undefined) {
          clearTimeout(copiedTimerRef.current);
        }
        setIsCopied(true);
        copiedTimerRef.current = setTimeout(() => {
          copiedTimerRef.current = undefined;
          setIsCopied(false);
        }, copiedDuration);
      },
      () => {},
    );
  };

  return { isCopied, failed, copyToClipboard };
};
