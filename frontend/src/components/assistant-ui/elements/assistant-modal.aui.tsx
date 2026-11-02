import {AssistantModalPrimitive} from '@assistant-ui/react';
import type {ReactNode} from 'react';
import {resolvePortalContainer} from '@/lib/utils';

/** 來源 Modal：forceMount 保留 Guide；宿主 iframe 與全螢幕尺寸仍由 Kaosu 控制。 */
export function AssistantModal({open,onOpenChange,children}:{open:boolean;onOpenChange:(open:boolean)=>void;children:ReactNode}) {
  return <AssistantModalPrimitive.Root open={open} onOpenChange={onOpenChange} unstable_openOnRunStart={false}>{children}</AssistantModalPrimitive.Root>;
}
export const AssistantModalTrigger = AssistantModalPrimitive.Trigger;
export function AssistantModalContent({children}:{children:ReactNode}) {
  // SSR 保留可讀內容；正式瀏覽器採來源 Portal，沒有第二套狀態或請求。
  if(typeof document==='undefined')return children;
  return <AssistantModalPrimitive.Content asChild forceMount portalProps={{container:resolvePortalContainer(),forceMount:true}}
    onOpenAutoFocus={event=>event.preventDefault()} onCloseAutoFocus={event=>event.preventDefault()} onEscapeKeyDown={event=>event.preventDefault()}>
    {children}
  </AssistantModalPrimitive.Content>;
}
