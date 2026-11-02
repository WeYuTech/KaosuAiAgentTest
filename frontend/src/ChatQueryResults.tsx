import {type Workspace, display} from './api';
import {t} from './i18n';

/** 唯讀投影；完整資料仍由原查詢面板提供，不另建選取或確認狀態。 */
export function ChatQueryResults({workspace,onAll}:{workspace:Workspace;onAll:()=>void}) {
  return <section className="chat-query-results" aria-label="工單查詢結果">
    <p>{workspace.query_context?.filters.equipment && <span>{display(workspace.query_context.filters.equipment)} · </span>}{t('找到')} {workspace.total??workspace.records.length} {t('筆工單')}</p>
    <div className="chat-query-scroll"><table><thead><tr><th>{t('工單／品號')}</th><th>{t('人工良品')}</th><th>{t('人工不良')}</th></tr></thead>
      <tbody>{workspace.records.slice(0,4).map((row,index)=><tr key={index}><td>{display(row.WO??row.WO_NO)}<small>{[row.PART_NO,row.PART_SPEC].filter(Boolean).join(' · ')}</small></td><td>{display(row.MANUAL_OK)}</td><td>{display(row.MANUAL_NG)}</td></tr>)}</tbody></table></div>
    <button className="text-button" onClick={onAll}>{t('查看全部')}</button>
  </section>;
}
