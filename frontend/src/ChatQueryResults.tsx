import {type Workspace, display} from './api';
import {t} from './i18n';

/** 唯讀投影；完整資料仍由原查詢面板提供，不另建選取或確認狀態。 */
export function ChatQueryResults({workspace,onAll}:{workspace:Workspace;onAll:()=>void}) {
  const count=workspace.records.length;
  const start=count?((workspace.page??1)-1)*(workspace.page_size??count)+1:0;
  const end=count?start+count-1:0;
  const total=workspace.total;
  const complete=total!==undefined&&start<=1&&count===total;
  return <section className="chat-query-results" aria-label={t('工單查詢結果')}>
    <p>{workspace.query_context?.filters.equipment && <span>{display(workspace.query_context.filters.equipment)} · </span>}{total===undefined?t('顯示 {0}–{1} 筆；總筆數未提供',{0:start,1:end}):t('顯示 {0}–{1}／{2} 筆',{0:start,1:end,2:total})}<small>{t(complete?'已顯示全部結果':'目前為部分結果，請查看全部資料')}</small></p>
    <div className="chat-query-scroll"><table><thead><tr><th>{t('工單／品號')}</th><th>{t('人工良品')}</th><th>{t('人工不良')}</th></tr></thead>
      <tbody>{workspace.records.map((row,index)=><tr key={index}><td>{display(row.WO??row.WO_NO)}<small>{[row.PART_NO,row.PART_SPEC].filter(Boolean).join(' · ')}</small></td><td>{display(row.MANUAL_OK)}</td><td>{display(row.MANUAL_NG)}</td></tr>)}</tbody></table></div>
    <button className="text-button" onClick={onAll}>{t('查看全部')}</button>
  </section>;
}
