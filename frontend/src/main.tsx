import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowLeft, ArrowRight, ArrowUp, Bot, CalendarDays, Check, CheckCheck, ChevronDown, ChevronRight, CircleHelp, ClipboardList, Clock3, Expand, Factory, History, LoaderCircle, MessageSquare, Minimize2, RefreshCw, ShieldCheck, Sparkles, UserRound, Wrench, X } from 'lucide-react';
import { api, display, label, type Conversation, type Identity, type Message, type Module, type Proposal, type Reply, type Row, type Schema, type Session, type Workspace } from './api';
import { DataView, Fields } from './DataView';
import { DraftForm } from './DraftForm';
import { ProposalBusinessSummary } from './ProposalBusinessSummary';
import './styles.css';

const modules = {
  schedule: { title: '生產排程', short: '排程', icon: CalendarDays, description: '安排設備、工單與模穴，確認每一個生產時段。', prompts: ['查詢目前的生產排程', '幫我安排一筆新排程，請引導我補齊需要的資料', '我要修改排程的工單與模穴數'] },
  report: { title: '生產報工', short: '報工', icon: ClipboardList, description: '記錄良品與不良、修改報工、調整模穴及完工。', prompts: ['查看目前可以報工的工單', '我要新增一筆報工，請先確認工單和數量', '查看報工歷史，分開列出人工報工與 IoT 產量'] },
  mold: { title: '模具上下模', short: '上下模', icon: Wrench, description: '依現場進度，完成上模與下模各階段作業。', prompts: ['查詢各設備目前的模具狀態', '我要開始上模，請確認排程與模具', '查詢可以開始下模的排程'] },
};
const identities: { id: Identity; title: string; description: string }[] = [
  { id: 'planner', title: '生管人員', description: '安排與調整生產排程' },
  { id: 'operator', title: '現場作業員', description: '登錄產量與報工資料' },
  { id: 'technician', title: '模具技術員', description: '執行模具上下模作業' },
  { id: 'supervisor', title: '現場主管', description: '跨模組驗證與作業確認' },
];
const actionNames: Record<string, string> = { 'schedule.save': '儲存排程', 'report.add': '新增報工', 'report.update': '修改報工', 'report.delete': '刪除報工', 'report.cavities': '調整模穴數', 'report.complete': '排程完工', 'mold.clear': '清空上下模', 'mold.mount_start': '開始上模', 'mold.mount_finish': '完成上模', 'mold.unmount_start': '開始下模', 'mold.unmount_finish': '完成下模' };
const embedded = new URLSearchParams(location.search).get('embed') === '1';
function formatMesTime(instant: number, zone: string) {
  const offset = /^UTC([+-])(\d{2}):(\d{2})$/.exec(zone);
  if (!offset) return new Date(instant).toISOString();
  const minutes = (Number(offset[2]) * 60 + Number(offset[3])) * (offset[1] === '+' ? 1 : -1);
  return new Date(instant + minutes * 60000).toISOString().slice(0, 19).replace('T', ' ');
}
const contextFromUrl = () => {
  const values = new URLSearchParams(location.search); const context: Row = {};
  for (const key of ['OPERATION', 'SCHEDULE_DATE', 'WIP_OPI_WDOEACICO_HIST_SID', 'ZZ_KAOSU_PROD_SCHEDULE_SID', 'EQP_NO']) { if (values.has(key)) context[key] = values.get(key); }
  return context;
};
function Brand({ small = false }: { small?: boolean }) { return <div className={`brand ${small ? 'small' : ''}`}><img className="aui-modal-brand" src={new URL('weyu-brand.svg', new URL('./', location.href)).href} width={205} height={48} alt="威友科技"/><span className="brand-title">生產情報助理</span></div>; }
function App() {
  const [open, setOpen] = useState(embedded);
  const [expanded, setExpanded] = useState(false);
  const [stage, setStage] = useState<'modules' | 'identity' | 'chat'>('modules');
  const [module, setModule] = useState<Module>('report');
  const [session, setSession] = useState<Session | null>(null);
  const [mode, setMode] = useState<string | null>(null);
  const [businessTimezone, setBusinessTimezone] = useState('UTC+07:00');
  const [businessDate, setBusinessDate] = useState<string | null>(null);
  const [modelConfigured, setModelConfigured] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [workspace, setWorkspace] = useState<Workspace>({ records: [], catalogs: {} });
  const [actions, setActions] = useState<Record<string, Schema>>({});
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [proposalStatus, setProposalStatus] = useState('');
  const [independentApproval, setIndependentApproval] = useState(false);
  const [queryData, setQueryData] = useState<unknown>(null);
  const [tab, setTab] = useState<'chat' | 'data' | 'audit'>('chat');
  const [audit, setAudit] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Row | null>(null);
  const [now, setNow] = useState(Date.now());
  const [helpOpen, setHelpOpen] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [budget, setBudget] = useState<Row | null>(null);
  const [filters, setFilters] = useState({ equipment: '', date: '', wo: '' });
  const [contextFilter, setContextFilter] = useState<Record<string, string>>({});
  const [pageSize, setPageSize] = useState(20);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const active = modules[module]; const ModuleIcon = active.icon;
  const pending = Boolean(proposal && !proposalStatus);
  const expires = proposal ? new Date(proposal.expires_at).getTime() : Infinity;
  const expired = pending && Number.isFinite(expires) && now >= expires;
  const independent = Boolean(proposal && (proposal.independent_confirmation || /delete|complete|clear|remove|unmount_finish/i.test(proposal.action)));
  const simulation = mode === 'simulation';
  const writesEnabled = proposal?.writes_enabled !== false && (simulation || proposal?.writes_enabled === true);
  const timePolicy = proposal?.time_policy ?? proposal?.preview?.time_policy;
  const newIdPolicy = proposal?.new_id_policy ?? proposal?.preview?.new_id_policy;
  const proposalTimezone = proposal?.business_timezone ?? businessTimezone;

  useEffect(() => { void api<{ model_configured: boolean; mode: string; business_timezone?: string; business_date?: string; server_time?: string }>('/api/health').then(v => { setModelConfigured(v.model_configured); setMode(v.mode); setBusinessTimezone(v.business_timezone ?? 'UTC+07:00'); setBusinessDate(v.business_date ?? v.server_time?.slice(0, 10) ?? null); }).catch(() => setError('尚未連上作業服務，請確認後端已啟動。')); void api<Session>('/api/session').then(value => { setSession(value); setMode(value.mode); }).catch(() => {}); }, []);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => { if (open) titleRef.current?.focus(); }, [open, stage]);
  useEffect(() => { if (tab === 'chat') endRef.current?.scrollIntoView({ behavior: 'instant', block: 'end' }); }, [messages, proposal, busy, tab]);
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (!embedded || event.source !== parent) return;
      let expected: string; try { expected = new URL(document.referrer).origin; } catch { return; }
      if (event.origin === expected && event.data?.type === 'kaosu-assistant:open') { setOpen(true); titleRef.current?.focus(); }
    };
    window.addEventListener('message', handler); return () => window.removeEventListener('message', handler);
  }, []);

  function minimize() {
    setExpanded(false);
    if (embedded) { try { parent.postMessage({ type: 'kaosu-assistant:close' }, new URL(document.referrer).origin); } catch { /* 無宿主來源時保留介面。 */ } }
    else { setOpen(false); setTimeout(() => launcherRef.current?.focus(), 0); }
  }
  function toggleExpanded() {
    const next = !expanded;
    setExpanded(next);
    if (embedded) { try { parent.postMessage({ type: 'kaosu-assistant:resize', expanded: next }, new URL(document.referrer).origin); } catch { /* 無宿主時由頁面自行展開。 */ } }
  }
  function keyDialog(event: React.KeyboardEvent) {
    if (event.key === 'Escape') { event.preventDefault(); minimize(); }
    if (!expanded && !matchMedia('(max-width: 640px)').matches) return;
    if (event.key !== 'Tab') return;
    const focusable = panelRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]');
    const visible = Array.from(focusable ?? []).filter(el => el.getClientRects().length > 0);
    const first = visible[0], last = visible.at(-1);
    if (event.shiftKey && (document.activeElement === first || document.activeElement === titleRef.current)) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
  async function guarded(work: () => Promise<void>) { setBusy(true); setError(''); setNotice(''); try { await work(); } catch (e) { setError(e instanceof Error ? e.message : '操作未完成，請稍後再試。'); } finally { setBusy(false); } }
  async function refreshData(page = workspace.page ?? 1) { const params = new URLSearchParams({ module, page: String(page), page_size: String(pageSize), ...contextFilter }); for (const [key, value] of Object.entries(filters)) { if (value.trim()) params.set(key, value.trim()); } const value = await api<Workspace>(`/api/workspace?${params}`); setWorkspace(value); }
  async function start(identity?: Identity) {
    await guarded(async () => {
      if (identity && !simulation) throw new Error('正式 MES 必須沿用目前登入身分。');
      const current = identity ? await api<Session>('/api/session/demo', { identity }) : session;
      if (!current) throw new Error('請先選擇作業身分。');
      setSession(current);
      setMode(current.mode);
      const hostContext = contextFromUrl();
      const live = current.mode !== 'simulation';
      const initialFilters = {
        equipment: live ? String(hostContext.EQP_NO ?? '') : '',
        date: live ? String(hostContext.SCHEDULE_DATE ?? businessDate ?? new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10)) : '',
        wo: '',
      };
      const initialContextFilter: Record<string, string> = {};
      if (live && hostContext.WIP_OPI_WDOEACICO_HIST_SID) initialContextFilter.execution_id = String(hostContext.WIP_OPI_WDOEACICO_HIST_SID);
      if (live && hostContext.ZZ_KAOSU_PROD_SCHEDULE_SID) initialContextFilter.schedule_id = String(hostContext.ZZ_KAOSU_PROD_SCHEDULE_SID);
      const params = new URLSearchParams({ module, page: '1', page_size: '20', ...initialContextFilter });
      for (const [key, value] of Object.entries(initialFilters)) if (value) params.set(key, value);
      const loadWorkspace = async (): Promise<{ data: Workspace; error?: string }> => {
        try { return { data: await api<Workspace>(`/api/workspace?${params}`) }; }
        catch (error) { return { data: { records: [], catalogs: {} }, error: error instanceof Error ? error.message : '初次資料查詢未完成' }; }
      };
      const [work, capability, chat] = await Promise.all([
        loadWorkspace(), api<{ actions: Record<string, Schema> }>('/api/capabilities'),
        api<Conversation>('/api/conversations', { module, context: hostContext }),
      ]);
      setWorkspace(work.data); setActions(capability.actions); setConversation(chat); setMessages(chat.messages ?? []);
      setFilters(initialFilters); setContextFilter(initialContextFilter); setPageSize(20);
      setSelected(null); setProposal(null); setProposalStatus(''); setQueryData(null); setDraft(''); setTab('chat'); setStage('chat');
      if (work.error) setError(`初次資料查詢未完成：${work.error}。你仍可在對話補充設備與日期，或到「作業資料」縮小查詢範圍。`);
    });
  }
  function receive(reply: Reply) {
    if (reply.messages) setMessages(reply.messages);
    if (reply.proposal) { setProposal(reply.proposal); setProposalStatus(''); setIndependentApproval(false); }
    if (reply.data !== undefined) setQueryData(reply.data);
  }
  async function send(event?: React.FormEvent) {
    event?.preventDefault(); const text = draft.trim(); if (!text || !conversation || busy || modelConfigured === false) return;
    await guarded(async () => {
      const replacing = pending;
      if (replacing) { setProposalStatus('superseded'); setIndependentApproval(false); }
      const reply = await api<Reply>(`/api/conversations/${conversation.id}/messages`, { text });
      receive(reply); setDraft('');
      if (replacing) setNotice(reply.proposal ? '已依補充需求取代前一張草稿，請核對新的確認卡。' : '前一張草稿已停止確認。補齊資料後會建立新的確認卡。');
    });
    inputRef.current?.focus();
  }
  async function confirm(approved: boolean) {
    if (!proposal) return;
    if (approved && !writesEnabled) { setError('正式寫入尚未啟用。可以查看預覽或取消草稿。'); return; }
    await guarded(async () => {
      const result = await api<{ status: string; message: string }>(`/api/proposals/${proposal.id}/confirm`, { digest: proposal.digest, approved });
      setProposalStatus(result.status); setNotice(result.message ?? (result.status === 'succeeded' ? '已完成作業。' : '已取消這筆草稿。')); setIndependentApproval(false);
      await refreshData();
    });
  }
  async function chooseRecord(record: Row) {
    if (pending) { setError('目前有待確認的草稿。請先確認或取消，再切換作業資料。'); return; }
    await guarded(async () => {
      const chat = await api<Conversation>('/api/conversations', { module, context: { ...contextFromUrl(), ...record } });
      setConversation(chat); setMessages(chat.messages ?? []); setSelected(record); setProposal(null); setProposalStatus(''); setQueryData(null); setTab('chat'); setNotice('已切換作業資料，接下來的對話會帶入這筆資料。');
    });
  }
  async function showAudit() { await guarded(async () => { const value = await api<{ records: Row[] }>('/api/audit'); setAudit(value.records); setTab('audit'); }); }
  async function showHelp() { setHelpOpen(v => !v); if (!budget) { try { setBudget(await api<Row>('/api/budget')); } catch { /* 用量服務失敗不影響回報問題。 */ } } }
  const availableActions = Object.fromEntries(Object.entries(actions).filter(([key, value]) => (value.module ?? key.split('.')[0]) === module).map(([key, value]) => [key, { ...value, title: value.title ?? actionNames[key] ?? key }]));

  return <>
    {!embedded && <main className="demo-page" aria-hidden={open && expanded ? true : undefined} inert={open && expanded ? true : undefined}>
      <header className="demo-nav"><Brand small/></header>
      <div className="demo-content"><h1>MES 作業測試</h1><p>排程、報工與模具上下模。</p><p className="muted">{simulation ? '目前使用隔離模擬資料。' : mode ? '沿用目前 MES 登入身分。' : '正在確認作業環境。'} 點選右下角助理開始操作。</p><button className="secondary" onClick={() => setOpen(true)}>開啟生產情報助理</button></div>
    </main>}
    {!embedded && !expanded && <button ref={launcherRef} className="launcher" onClick={() => open ? minimize() : setOpen(true)} aria-label={open ? '收合生產情報助理' : '開啟生產情報助理'} title="生產情報助理">{open ? <ChevronDown size={20}/> : <Bot size={20}/>}</button>}
    {open && <div className={`assistant-overlay ${embedded ? 'embedded' : ''}`}><section ref={panelRef} role="dialog" aria-modal={expanded || embedded || undefined} aria-labelledby="assistant-title" className={`assistant-panel ${expanded ? 'expanded' : ''}`} onKeyDown={keyDialog}>
      <header className="assistant-header"><Brand small/><div className="header-controls"><button className="icon-button" title={expanded ? '縮小聊天室' : '放大聊天室'} aria-label={expanded ? '縮小聊天室' : '放大聊天室'} onClick={toggleExpanded}>{expanded ? <Minimize2 size={18}/> : <Expand size={18}/>}</button><button className="icon-button" aria-label="縮小助理" title="縮小助理（Esc）" onClick={minimize}><X size={18}/></button></div></header>
      {stage !== 'chat' ? <div className="onboarding">
        <div className="onboarding-top"><span className="step-label">{stage === 'modules' ? '01 / 選擇作業' : '02 / 確認身分'}</span>{stage === 'identity' && <button className="text-button" onClick={() => setStage('modules')} disabled={busy}><ArrowLeft size={16}/>返回選擇</button>}</div>
        <div className="welcome-icon"><Sparkles size={27}/></div><h1 id="assistant-title" ref={titleRef} tabIndex={-1}>{stage === 'modules' ? '今天，想完成什麼作業？' : (simulation ? `開始${active.short}前，選擇你的身分` : `開始${active.short}前，確認登入身分`)}</h1><p className="welcome-description">{stage === 'modules' ? '選擇一個入口，我會陪你確認資料，完成現場作業。' : '身分決定可執行的功能；每次寫入都會留下操作紀錄。'}</p>
        {stage === 'modules' ? <div className="entry-grid">{Object.entries(modules).map(([key, item]) => <button className="entry-card" key={key} disabled={busy || mode === null || (!simulation && !session?.actor.roles.includes(key))} title={!simulation && !session?.actor.roles.includes(key) ? '目前登入身分無此模組權限' : undefined} onClick={() => { setModule(key as Module); setStage('identity'); setError(''); }}><span className="entry-icon"><item.icon size={25}/></span><strong>{item.title}</strong><p>{item.description}</p><span className="entry-link">進入{item.short}<ArrowRight size={17}/></span></button>)}</div> : <>
          <div className="identity-notice"><ShieldCheck size={18}/><span>{simulation ? '目前為模擬驗證環境。此處身分切換僅供測試，正式 MES 將沿用已登入身分與伺服器權限。' : '沿用目前 MES 已登入身分與伺服器授予的模組權限。確認身分後即可開始，不需再次輸入帳號密碼。'}</span></div>
          {session && <button className="session-button" disabled={busy || !session.actor.roles.includes(module)} onClick={() => void start()}><UserRound size={18}/><span>沿用目前身分：{session.actor.name}{!session.actor.roles.includes(module) ? '（此入口無權限）' : ''}</span><ArrowRight size={18}/></button>}
          {simulation && <div className="identity-grid">{identities.map(item => <button key={item.id} className="identity-card" disabled={busy || !(item.id === 'supervisor' || item.id === ({ schedule: 'planner', report: 'operator', mold: 'technician' }[module]))} onClick={() => void start(item.id)}><UserRound size={21}/><span><strong>{item.title}</strong><small>{item.description}</small></span><ChevronRight size={17}/></button>)}</div>}
        </>}
        {mode !== null && !simulation && !session && <div className="identity-notice"><ShieldCheck size={18}/><span>尚未取得可信的 MES 登入身分。請先在原 MES 登入，再重新開啟助理。</span><button className="text-button" disabled={busy} onClick={() => void guarded(async () => { const current = await api<Session>('/api/session'); setSession(current); setMode(current.mode); })}>重新確認登入</button></div>}
        {error && <div className="error-banner" role="alert">{error}</div>}{busy && <div className="loading" role="status"><LoaderCircle className="spin" size={18}/>正在準備作業資料…</div>}
        <div className="onboarding-footer"><span><MessageSquare size={16}/>自然語言操作</span><span><CheckCheck size={16}/>確認後寫入</span><span><History size={16}/>完整作業紀錄</span></div>
      </div> : <>
        <div className="workspace-bar"><button className="icon-button" aria-label="返回模組入口" disabled={busy || pending} title={pending ? '請先確認或取消草稿' : '返回模組入口'} onClick={() => setStage('modules')}><ArrowLeft size={18}/></button><span className="module-badge"><ModuleIcon size={18}/></span><div><h1 id="assistant-title" ref={titleRef} tabIndex={-1}>{active.title}</h1><p>{session?.actor.name} <span>·</span> EPS 成型</p></div><span className={`connection ${modelConfigured ? 'ready' : ''}`}><span/>{modelConfigured === true ? 'AI 已連線' : modelConfigured === false ? 'AI 尚未設定' : '檢查連線中'}</span></div>
        <div className="tabs" role="tablist" aria-label="作業檢視"><button role="tab" aria-selected={tab === 'chat'} onClick={() => setTab('chat')}><MessageSquare size={16}/>對話作業</button><button role="tab" aria-selected={tab === 'data'} onClick={() => setTab('data')}><ClipboardList size={16}/>作業資料<span className="count">{workspace.records.length}</span></button><button role="tab" aria-selected={tab === 'audit'} disabled={busy} onClick={() => void showAudit()}><History size={16}/>操作紀錄</button></div>
        {error && <div className="error-banner" role="alert"><span>{error}</span><button className="icon-button" aria-label="關閉錯誤訊息" onClick={() => setError('')}><X size={17}/></button></div>}{notice && <div className="notice-banner" role="status"><Check size={17}/><span>{notice}</span></div>}
        {tab === 'chat' ? <div className="chat-layout"><div className="conversation-scroll" role="tabpanel" aria-label="對話作業">
          {selected && <div className="context-card"><span><ClipboardList size={15}/>目前作業資料</span><strong>{display(selected.WO ?? selected.WO_NO ?? selected.EQP_NO ?? selected.ZZ_KAOSU_PROD_SCHEDULE_SID)}</strong><button className="text-button" onClick={() => setTab('data')}>查看<ChevronRight size={15}/></button></div>}
          {!messages.length && <div className="chat-welcome"><div className="welcome-icon"><ModuleIcon size={24}/></div><h2>一起完成這次{active.short}。</h2><p>直接描述你要做的事。缺少的資料，我會逐一詢問；<br className="desktop-only"/>準備好後，會先提供變更清單讓你核對。</p><div className="suggestions">{active.prompts.map(prompt => <button key={prompt} disabled={busy || modelConfigured === false} onClick={() => { setDraft(prompt); inputRef.current?.focus(); }}><MessageSquare size={16}/><span>{prompt}</span><ArrowRight size={16}/></button>)}</div></div>}
          <div className="messages" aria-live="polite" aria-relevant="additions text">{messages.map((message, i) => <article key={i} className={`message ${message.role === 'user' ? 'user' : 'assistant'}`}><span className="message-avatar">{message.role === 'user' ? <UserRound size={16}/> : <Sparkles size={16}/>}</span><div><span className="message-author">{message.role === 'user' ? session?.actor.name ?? '你' : 'Emerald.AI'}</span><div className="message-body">{message.content}</div></div></article>)}</div>
          {queryData !== null && <DataView data={queryData}/>}
          {proposal && <section className={`proposal ${independent ? 'important' : ''}`} aria-label="操作確認卡"><div className="proposal-heading"><span className="proposal-icon"><ShieldCheck size={21}/></span><div><small>{proposalStatus ? '作業處理結果' : '待你確認 · 尚未寫入'}</small><h2>{actionNames[proposal.action] ?? proposal.action}</h2></div><span className="proposal-state">{proposalStatus === 'succeeded' ? '已完成' : proposalStatus === 'cancelled' ? '已取消' : proposalStatus === 'superseded' ? '已被取代' : expired ? '已過期' : '待確認'}</span></div><p className="proposal-summary">{proposal.summary}</p>
            <ProposalBusinessSummary proposal={proposal} workspace={workspace}/>
            <p className="business-note">MES 時間 {proposalTimezone}；未指定時區的作業時間依 MES 顯示時間解讀。</p>
            {!writesEnabled && <div className="write-disabled" role="status"><ShieldCheck size={18}/><div><strong>正式寫入尚未啟用</strong><p>目前可查詢及預覽異動，尚不能執行寫入。你仍可取消或修改這筆草稿。</p></div></div>}
            {(timePolicy || newIdPolicy) && <div className="preview-policies">{timePolicy && <p><Clock3 size={15}/>{timePolicy}</p>}{newIdPolicy && <p><CircleHelp size={15}/>{newIdPolicy}</p>}</div>}
            <details className="proposal-details technical-details"><summary>查看資料異動明細 <span className="count">{proposal.changes.length} 項</span></summary><div className="diff-list">{proposal.changes.map((change, i) => <div className="diff" key={i}><div className="diff-label"><strong>{label(change.field)}</strong><small>{change.table} · {display(change.key)}</small></div><div className="diff-values"><span className="before">{display(change.before)}</span><ArrowRight size={16}/><span className="after">{display(change.after)}</span></div></div>)}</div><details className="proposal-details"><summary>檢視完整操作參數</summary><Fields value={proposal.args}/></details></details>
            {!proposalStatus && <><div className="expiry"><Clock3 size={15}/>{expired ? '確認已過期，請重新建立草稿。' : `確認期限：${Number.isFinite(expires) ? formatMesTime(expires, proposalTimezone) : proposal.expires_at}`}</div>{independent && <label className="independent-confirm"><input type="checkbox" checked={independentApproval} onChange={e => setIndependentApproval(e.target.checked)} disabled={busy || expired || !writesEnabled}/><span>我已核對這筆「{actionNames[proposal.action] ?? proposal.action}」的對象及影響，確認要單獨執行。</span></label>}<div className="proposal-actions"><button className="secondary" onClick={() => void confirm(false)} disabled={busy}>取消草稿</button><button className="primary" disabled={busy || expired || !writesEnabled || (independent && !independentApproval)} onClick={() => void confirm(true)}><Check size={17}/>{independent ? '確認這筆操作' : '同意並寫入'}</button></div></>}
          </section>}
          {busy && <div className="loading" role="status"><LoaderCircle className="spin" size={18}/>正在核對資料與處理作業…</div>}
          <DraftForm actions={availableActions} busy={busy || pending} onSubmit={async (action, args) => {
            if (!conversation) return;
            setBusy(true); setError('');
            try { const reply = await api<Reply>(`/api/conversations/${conversation.id}/proposals`, { action, args }); receive(reply); } finally { setBusy(false); }
          }}/><div ref={endRef}/>
        </div><div className="composer-area">{modelConfigured === false && <div className="model-notice"><CircleHelp size={17}/><span>尚未設定 AI 模型，自然語言對話暫不可用。可展開「結構化操作草稿」驗證流程。</span></div>}<form className="composer" onSubmit={e => void send(e)}><label className="sr-only" htmlFor="chat-input">描述作業需求</label><textarea ref={inputRef} id="chat-input" rows={2} placeholder={pending ? '可直接補充修改，例如：良品改成 25，請重新確認' : `描述你的${active.short}需求，例如：${active.prompts[0]}`} value={draft} disabled={busy || modelConfigured === false} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }}/><button type="submit" className="send-button" disabled={busy || !draft.trim() || modelConfigured !== true} aria-label="送出訊息">{busy ? <LoaderCircle className="spin" size={20}/> : <ArrowUp size={18}/>}</button></form><div className="composer-footnote"><span><ShieldCheck size={13}/>確認後才會寫入</span><span>Enter 送出 · Shift + Enter 換行</span></div></div></div> : tab === 'data' ? <div className="workspace-scroll" role="tabpanel" aria-label="作業資料"><div className="section-heading"><div><h2>目前作業資料</h2><p>選擇一筆資料，帶入新的作業對話。</p></div><button className="secondary" disabled={busy} onClick={() => void guarded(refreshData)}><RefreshCw size={16}/>重新整理</button></div>{module === 'report' && <p className="data-note">人工報工與 IoT 推算數量各自呈現；未有 IoT 資料不代表產量為零。</p>}<DataFilters filters={filters} setFilters={setFilters} pageSize={pageSize} setPageSize={setPageSize} workspace={workspace} busy={busy} load={page => void guarded(() => refreshData(page))}/><div className="record-grid">{workspace.records.map((record, i) => <article className="workspace-record" key={i}><div className="record-title"><Factory size={18}/><strong>{display(record.EQP_NO ?? record.WO ?? `第 ${i + 1} 筆`)}</strong><span className="mode-chip">{record.COMPLETED === 'Y' ? '已完工' : '作業資料'}</span></div><Fields value={record}/><button className="secondary" disabled={busy || pending} onClick={() => void chooseRecord(record)}>以此筆資料開始<ArrowRight size={16}/></button></article>)}</div>{!workspace.records.length && <div className="empty-state"><ClipboardList size={28}/><h3>尚無作業資料</h3><p>請重新整理，或從對話建立需要的作業。</p></div>}<details className="catalogs"><summary>查看設備、工單與模具選項</summary><DataView data={workspace.catalogs} title="作業選項"/></details></div> : <div className="workspace-scroll" role="tabpanel" aria-label="操作紀錄"><div className="section-heading"><div><h2>每次變更，都有紀錄。</h2><p>核對操作時間、執行人員與資料前後差異。</p></div><button className="secondary" disabled={busy} onClick={() => void showAudit()}><RefreshCw size={16}/>重新整理</button></div><DataView data={audit} title="操作紀錄"/></div>}
      </>}
      {helpOpen && <aside className="help-panel" aria-label="回報問題與用量"><div className="section-heading"><div><h2>讓作業經驗留下來</h2><p>錯誤回報會先送待審查，審核後才納入知識，不會自動改變卡控。</p></div><button className="icon-button" aria-label="關閉問題回報" onClick={() => setHelpOpen(false)}><X size={18}/></button></div><form onSubmit={e => { e.preventDefault(); void guarded(async () => { await api('/api/feedback', { module, message: feedback, ...(conversation ? { conversation_id: conversation.id } : {}) }); setFeedback(''); setFeedbackSent(true); }); }}><label className="form-field">遇到什麼問題？<textarea rows={3} required value={feedback} onChange={e => { setFeedback(e.target.value); setFeedbackSent(false); }} placeholder="描述你預期的結果、實際發生的情況，或需要補充的操作知識。" maxLength={4000}/></label><button className="primary" disabled={busy || !feedback.trim()} type="submit">送出問題回報</button>{feedbackSent && <p className="feedback-success" role="status">已收到，將由主管審查後處理。</p>}</form><details><summary>來源版本與 API 用量</summary><p className="muted">作業盤點版本：979d2c6 · 2026-10-30</p>{budget ? <Fields value={budget}/> : <p className="muted">目前無法取得用量資訊。</p>}</details></aside>}
      <footer className="assistant-footer"><span>EMERALD.AI</span><span>MES 時間 {proposalTimezone}</span>{stage === 'chat' ? <button className="footer-help" onClick={() => void showHelp()}><CircleHelp size={13}/>回報問題與來源</button> : <span>高塑 · 生產作業助理</span>}</footer>
    </section></div>}
  </>;
}

function DataFilters({ filters, setFilters, pageSize, setPageSize, workspace, busy, load }: {
  filters: { equipment: string; date: string; wo: string }; setFilters: React.Dispatch<React.SetStateAction<{ equipment: string; date: string; wo: string }>>;
  pageSize: number; setPageSize: (value: number) => void; workspace: Workspace; busy: boolean; load: (page: number) => void;
}) {
  const page = workspace.page ?? 1, size = workspace.page_size ?? pageSize, total = workspace.total ?? workspace.records.length;
  return <><form className="data-filters" onSubmit={e => { e.preventDefault(); load(1); }}>
    <label>設備<input value={filters.equipment} onChange={e => setFilters(v => ({ ...v, equipment: e.target.value }))} placeholder="全部設備"/></label>
    <label>日期或區間<input value={filters.date} onChange={e => setFilters(v => ({ ...v, date: e.target.value }))} placeholder="2026-10-30 或 起日~迄日"/></label>
    <label>工單<input value={filters.wo} onChange={e => setFilters(v => ({ ...v, wo: e.target.value }))} placeholder="全部工單"/></label>
    <label>每頁<select value={pageSize} onChange={e => setPageSize(Number(e.target.value))}><option value={20}>20 筆</option><option value={50}>50 筆</option><option value={100}>100 筆</option></select></label>
    <button type="submit" className="secondary" disabled={busy}>套用查詢</button>
  </form><div className="pagination"><span>共 {total} 筆 · 第 {page} / {Math.max(1, Math.ceil(total / size))} 頁</span><button className="icon-button" aria-label="上一頁" disabled={busy || page <= 1} onClick={() => load(page - 1)}><ArrowLeft size={16}/></button><button className="icon-button" aria-label="下一頁" disabled={busy || page * size >= total} onClick={() => load(page + 1)}><ArrowRight size={16}/></button></div></>;
}

createRoot(document.getElementById('mes-ai-chat-root')!).render(<React.StrictMode><App/></React.StrictMode>);





