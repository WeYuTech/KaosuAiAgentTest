import type { ReactNode, Ref } from 'react';
import { t } from './i18n';

/** 4173 參考頁面的外框投影；不建立第二份聊天或作業狀態。 */
export function AssistantHeader({ title, children, titleRef }: { title: string; children: ReactNode; titleRef?: Ref<HTMLHeadingElement> }) {
  return <header className="assistant-header">
    <img className="aui-modal-brand" src={new URL('weyu-brand.svg', new URL('./', location.href)).href} width={205} height={48} alt={t('威友科技')}/>
    <h2 id="assistant-dialog-title" ref={titleRef} tabIndex={-1}>{title}</h2>
    <div className="header-tools">{children}</div>
  </header>;
}
