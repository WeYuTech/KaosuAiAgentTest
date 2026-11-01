import type { ReactNode } from 'react';
import { ArrowLeft, CalendarDays, ClipboardList, History, MessageSquare, Wrench } from 'lucide-react';
import { t } from './i18n';
import type { Module, Session } from './api';

/** 4173 參考頁面的外框投影；不建立第二份聊天或作業狀態。 */
export function AssistantHeader({ title, children }: { title: string; children: ReactNode }) {
  return <header className="assistant-header">
    <img className="aui-modal-brand" src={new URL('weyu-brand.svg', new URL('./', location.href)).href} width={205} height={48} alt={t('威友科技')}/>
    <h2 id="assistant-dialog-title">{title}</h2>
    <div className="header-tools">{children}</div>
  </header>;
}

const tasks = [
  { module: 'schedule' as const, title: '生產排程', Icon: CalendarDays },
  { module: 'report' as const, title: '生產報工', Icon: ClipboardList },
  { module: 'mold' as const, title: '模具上下模', Icon: Wrench },
];

export function OperationSidebar({ module, session, disabled, inert, home, select, audit }: {
  module: Module; session: Session | null; disabled: boolean; inert?: boolean;
  home: () => void; select: (module: Module) => void; audit: () => void;
}) {
  return <aside className="operation-sidebar" aria-label={t('作業導覽')} inert={inert}>
    <div className="sidebar-content">
      <button className="sidebar-home" disabled={disabled} onClick={home}><ArrowLeft size={18}/>{t('返回模組入口')}</button>
      <p className="sidebar-caption">{t('作業範圍')}</p>
      <nav aria-label={t('切換作業模組')}>{tasks.map(({module: key,title,Icon}) =>
        <button key={key} aria-current={key === module ? 'page' : undefined} disabled={disabled || !session?.actor.roles.includes(key)} onClick={() => select(key)}><Icon size={18}/>{t(title)}</button>
      )}</nav>
      <p className="sidebar-caption">{t('本次作業')}</p>
      <div className="sidebar-current"><MessageSquare size={18}/><span>{t(tasks.find(task => task.module === module)!.title)}</span></div>
      <button className="sidebar-audit" onClick={audit}><History size={18}/>{t('操作紀錄')}</button>
    </div>
    <div className="sidebar-identity"><strong>{session?.actor.name}</strong><span>{t('確認後才會寫入')}</span></div>
  </aside>;
}
