import { t } from './i18n';
import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { api, ApiError, type Module, type Session } from './api';

interface FeedbackEntry { id: string; module: Module; message: string; actor_id: string; status: string; time: string; text?: string; source?: string; reviewer?: string }
const statuses: Record<string, string> = { pending: '待審核', reviewed: '已審核，待案例回歸與發布', published: '已發布' };
const modules = { schedule: '排程', report: '報工', mold: '模具上下模' };

export function FeedbackReview({ session, refreshToken, onAccessDenied, apiRequest = api }: { apiRequest?: typeof api; session: Session | null; refreshToken: boolean; onAccessDenied?: () => void }) {
  const alive = useRef(true);
  const generation = useRef(0);
  useEffect(() => { alive.current=true; return () => {alive.current=false;generation.current++;}; }, []);
  const [records, setRecords] = useState<FeedbackEntry[]>([]);
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState<FeedbackEntry | null>(null);
  const [text, setText] = useState('');
  const [source, setSource] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const reviewer = session?.actor.roles.includes('review');

  async function load() { const token=++generation.current; const result = await apiRequest<{ records: FeedbackEntry[] }>('/api/feedback'); if(alive.current && token===generation.current) setRecords(result.records); }
  async function refresh() { setRecords([]); setSelected(null); setText('');setSource('');setBusy(true); setError(''); try { await load(); } catch (e) { if(!alive.current)return; if(e instanceof ApiError && [401,403].includes(e.status))onAccessDenied?.(); else setError(e instanceof Error ? e.message : t("無法取得回饋紀錄。")); } finally { if(alive.current)setBusy(false); } }
  useEffect(() => { void refresh(); }, [session?.actor.id, refreshToken]);

  return <section className="feedback-review" aria-label={t("回饋紀錄與審核")}>
    <div className="section-heading"><div><h2>{reviewer ? t("回饋追蹤與知識審核") : t("我的回饋紀錄")}</h2><p>{reviewer ? t("只顯示你獲授權的模組；審核後仍須由管理員完成候選案例回歸，才會發布。") : t("查看回饋處理進度；修正內容經審核與案例回歸後才會發布。")}</p></div><button className="icon-button" disabled={busy} aria-label={t("重新整理回饋")} onClick={() => void refresh()}><RefreshCw size={16}/></button></div>
    <label className="form-field">{t("處理狀態")}<select value={filter} onChange={e => setFilter(e.target.value)}><option value="all">{t("全部")}</option><option value="pending">{t("待審核")}</option><option value="reviewed">{t("已審核，待發布")}</option><option value="published">{t("已發布")}</option></select></label>
    {error && <p className="error" role="alert">{t(error)}</p>}{notice && <p role="status">{t(notice)}</p>}
    <div className="feedback-list">{records.filter(row => filter === 'all' || row.status === filter).map(row => <article className="feedback-entry" key={row.id}>
      <div className="record-title"><strong>{t(modules[row.module])}</strong><span>{t(statuses[row.status] ?? row.status)}</span></div>
      <p className="message-body">{row.message}</p><small className="muted">{t("回報人員：")}{row.actor_id} · {row.time}</small>
      {row.text && <details><summary>{t("查看審核內容與來源")}</summary><p className="message-body">{row.text}</p><p className="message-body">{t("來源：")}{row.source}</p><small>{t("審核人員：")}{row.reviewer}</small></details>}
      {reviewer && session?.actor.roles.includes(row.module) && row.status !== 'published' && <button className="secondary" disabled={busy} onClick={() => { setSelected(row); setText(row.text ?? ''); setSource(row.source ?? ''); setNotice(''); setError(''); }}>{row.status === 'reviewed' ? t("修訂審核內容") : t("審核這筆回饋")}</button>}
    </article>)}</div>
    {!busy && !records.some(row => filter === 'all' || row.status === filter) && <p className="muted">{t("目前沒有此狀態的回饋。")}</p>}
    {selected && <form className="feedback-review-form" aria-label={t("知識審核表單")} onSubmit={e => {
      e.preventDefault(); setBusy(true); setError(''); setNotice('');
      void (async () => { try { await apiRequest(`/api/feedback/${selected.id}/review`, { text: text.trim(), source: source.trim() }); if(!alive.current)return; setSelected(null); setNotice(t("已提交審核內容，尚未發布。請交由管理員完成候選案例回歸。")); await load(); } catch (e) { if(!alive.current)return; if(e instanceof ApiError && [401,403].includes(e.status))onAccessDenied?.();else setError(e instanceof Error ? e.message : t("審核未完成。")); } finally { if(alive.current)setBusy(false); } })();
    }}>
      <h3>{t("審核")}{t(modules[selected.module])}{t("回饋")}</h3><p className="message-body">{t("原回饋：")}{selected.message}</p>
      <label className="form-field">{t("修正後的知識說明")}<textarea required rows={5} maxLength={4000} value={text} onChange={e => setText(e.target.value)} disabled={busy} placeholder={t("填入已核對的正確說明；不能以知識文字改寫業務卡控。")}/></label>
      <label className="form-field">{t("核實來源")}<textarea required rows={2} maxLength={500} value={source} onChange={e => setSource(e.target.value)} disabled={busy} placeholder={t("文件、程式版本或其他可追查的來源。")}/></label>
      <div className="proposal-actions"><button type="button" className="secondary" disabled={busy} onClick={() => setSelected(null)}>{t("取消編輯")}</button><button className="primary" type="submit" disabled={busy || !text.trim() || !source.trim()}>{t("提交審核（尚不發布）")}</button></div>
    </form>}
  </section>;
}
