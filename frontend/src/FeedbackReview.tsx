import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { api, type Module, type Session } from './api';

interface FeedbackEntry { id: string; module: Module; message: string; actor_id: string; status: string; time: string; text?: string; source?: string; reviewer?: string }
const statuses: Record<string, string> = { pending: '待審核', reviewed: '已審核，待案例回歸與發布', published: '已發布' };
const modules = { schedule: '排程', report: '報工', mold: '模具上下模' };

export function FeedbackReview({ session, refreshToken }: { session: Session | null; refreshToken: boolean }) {
  const [records, setRecords] = useState<FeedbackEntry[]>([]);
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState<FeedbackEntry | null>(null);
  const [text, setText] = useState('');
  const [source, setSource] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const reviewer = session?.actor.roles.includes('review');

  async function load() { const result = await api<{ records: FeedbackEntry[] }>('/api/feedback'); setRecords(result.records); }
  async function refresh() { setBusy(true); setError(''); try { await load(); } catch (e) { setError(e instanceof Error ? e.message : '無法取得回饋紀錄。'); } finally { setBusy(false); } }
  useEffect(() => { void refresh(); }, [session?.actor.id, refreshToken]);

  return <section className="feedback-review" aria-label="回饋紀錄與審核">
    <div className="section-heading"><div><h2>{reviewer ? '回饋追蹤與知識審核' : '我的回饋紀錄'}</h2><p>{reviewer ? '只顯示你獲授權的模組；審核後仍須由管理員完成候選案例回歸，才會發布。' : '查看回饋處理進度；修正內容經審核與案例回歸後才會發布。'}</p></div><button className="icon-button" disabled={busy} aria-label="重新整理回饋" onClick={() => void refresh()}><RefreshCw size={16}/></button></div>
    <label className="form-field">處理狀態<select value={filter} onChange={e => setFilter(e.target.value)}><option value="all">全部</option><option value="pending">待審核</option><option value="reviewed">已審核，待發布</option><option value="published">已發布</option></select></label>
    {error && <p className="error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    <div className="feedback-list">{records.filter(row => filter === 'all' || row.status === filter).map(row => <article className="feedback-entry" key={row.id}>
      <div className="record-title"><strong>{modules[row.module]}</strong><span>{statuses[row.status] ?? row.status}</span></div>
      <p className="message-body">{row.message}</p><small className="muted">回報人員：{row.actor_id} · {row.time}</small>
      {row.text && <details><summary>查看審核內容與來源</summary><p className="message-body">{row.text}</p><p className="message-body">來源：{row.source}</p><small>審核人員：{row.reviewer}</small></details>}
      {reviewer && session?.actor.roles.includes(row.module) && row.status !== 'published' && <button className="secondary" disabled={busy} onClick={() => { setSelected(row); setText(row.text ?? ''); setSource(row.source ?? ''); setNotice(''); setError(''); }}>{row.status === 'reviewed' ? '修訂審核內容' : '審核這筆回饋'}</button>}
    </article>)}</div>
    {!busy && !records.some(row => filter === 'all' || row.status === filter) && <p className="muted">目前沒有此狀態的回饋。</p>}
    {selected && <form className="feedback-review-form" aria-label="知識審核表單" onSubmit={e => {
      e.preventDefault(); setBusy(true); setError(''); setNotice('');
      void (async () => { try { await api(`/api/feedback/${selected.id}/review`, { text: text.trim(), source: source.trim() }); setSelected(null); setNotice('已提交審核內容，尚未發布。請交由管理員完成候選案例回歸。'); await load(); } catch (e) { setError(e instanceof Error ? e.message : '審核未完成。'); } finally { setBusy(false); } })();
    }}>
      <h3>審核{modules[selected.module]}回饋</h3><p className="message-body">原回饋：{selected.message}</p>
      <label className="form-field">修正後的知識說明<textarea required rows={5} maxLength={4000} value={text} onChange={e => setText(e.target.value)} disabled={busy} placeholder="填入已核對的正確說明；不能以知識文字改寫業務卡控。"/></label>
      <label className="form-field">核實來源<textarea required rows={2} maxLength={500} value={source} onChange={e => setSource(e.target.value)} disabled={busy} placeholder="文件、程式版本或其他可追查的來源。"/></label>
      <div className="proposal-actions"><button type="button" className="secondary" disabled={busy} onClick={() => setSelected(null)}>取消編輯</button><button className="primary" type="submit" disabled={busy || !text.trim() || !source.trim()}>提交審核（尚不發布）</button></div>
    </form>}
  </section>;
}
