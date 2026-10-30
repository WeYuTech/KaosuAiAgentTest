import { t, useLocale, getLocale, isLocale, type Locale } from './i18n';
import { useTheme, isTheme } from './theme';
import { GuidedFlow, type GuideHandle } from './GuidedFlow';
import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowLeft, ArrowRight, ArrowUp, Bot, CalendarDays, Check, CheckCheck, ChevronDown, ChevronRight, CircleHelp, ClipboardList, Clock3, Expand, Factory, History, LoaderCircle, MessageSquare, Minimize2, RefreshCw, ShieldCheck, Sparkles, UserRound, Wrench, X } from 'lucide-react';
import { api, ApiError, display, label, type Conversation, type Identity, type Message, type Module, type Proposal, type Reply, type Row, type Session, type Workspace } from './api';
import { DataView, Fields } from './DataView';
import { MessageContent } from './MessageContent';
import { ProposalBusinessSummary } from './ProposalBusinessSummary';
import { confirmationView, confirmWithRecovery, reconcileProposal, type ConfirmationResult } from './confirmation';
import { FeedbackReview } from './FeedbackReview';
import './styles.css';
import './desktop.css';
import './conversation.css';
import { restoreSubmission, submitRecoverably, hasSubmission } from './submission-recovery';

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
const embedded = typeof location !== 'undefined' && new URLSearchParams(location.search).get('embed') === '1';
function formatMesTime(instant: number, zone: string) {
  const offset = /^UTC([+-])(\d{2}):(\d{2})$/.exec(zone);
  if (!offset) return new Date(instant).toISOString();
  const minutes = (Number(offset[2]) * 60 + Number(offset[3])) * (offset[1] === '+' ? 1 : -1);
  return new Date(instant + minutes * 60000).toISOString().slice(0, 19).replace('T', ' ');
}
const contextFromUrl = () => {
  const values = new URLSearchParams(location.search); const context: Row = {};
  for (const key of ['OPERATION', 'SCHEDULE_DATE', 'WIP_OPI_WDOEACICO_HIST_SID', 'ZZ_KAOSU_PROD_SCHEDULE_SID', 'EQP_NO']) { if (values.has(key)) context[key] = values.get(key); }
  if (values.getAll('fac').length === 1 && ['fac1', 'fac2', 'fac3'].includes(values.get('fac') ?? '')) context.fac = values.get('fac');
  return context;
};
function Brand({ small = false }: { small?: boolean }) { return <div className={`brand ${small ? 'small' : ''}`}><img className="aui-modal-brand" src={new URL('weyu-brand.svg', new URL('./', location.href)).href} width={205} height={48} alt={t("威友科技")}/><span className="brand-title">{t("生產情報助理")}</span></div>; }
export function App({ initialOpen = false }: { initialOpen?: boolean } = {}) {
  const { locale, setLocale } = useLocale();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [localeBusy, setLocaleBusy] = useState(false);
  const [open, setOpen] = useState(embedded || initialOpen);
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
  const [queryBusy, setQueryBusy] = useState(false);
  const [queryError, setQueryError] = useState('');
  const queryGeneration = useRef(0);
  const [workspace, setWorkspace] = useState<Workspace>({ records: [], catalogs: {} });
  const guideRef = useRef<GuideHandle>(null);
  const [guideBusy, setGuideBusy] = useState(false);
  const [guideWorking, setGuideWorking] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const panelTrigger = useRef<HTMLElement | null>(null);
  const [guideSnapshot, setGuideSnapshot] = useState<Row>({});
  const draftMemory = useRef(new Map<string, string>());
  const submitting = useRef(false);
  const checkedActor = useRef('');
  const [sheetContext, setSheetContext] = useState('');
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
  const scrollConversation = useRef<string | null>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const active = modules[module]; const ModuleIcon = active.icon;
  const proposalView = confirmationView(proposalStatus || 'pending');
  const pending = Boolean(proposal && proposalView.canConfirm);
  const unresolved = Boolean(proposal && proposalView.canReconcile);
  const lockedTarget = pending || unresolved || guideBusy;
  const expires = proposal ? new Date(proposal.expires_at).getTime() : Infinity;
  const expired = pending && Number.isFinite(expires) && now >= expires;
  const independent = Boolean(proposal && (proposal.independent_confirmation || /delete|complete|clear|remove|unmount_finish/i.test(proposal.action)));
  const simulation = mode === 'simulation';
  const writesEnabled = proposal?.writes_enabled !== false && (simulation || proposal?.writes_enabled === true);
  const timePolicy = proposal?.time_policy ?? proposal?.preview?.time_policy;
  const newIdPolicy = proposal?.new_id_policy ?? proposal?.preview?.new_id_policy;
  const proposalTimezone = proposal?.business_timezone ?? businessTimezone;

  function memoryKey(actorId: string, currentModule = module) {
    const source = embedded && document.referrer ? document.referrer : location.href;
    const text = JSON.stringify([actorId, currentModule, source, contextFromUrl()]);
    let first = 2166136261, second = 5381;
    for (const char of text) { first = Math.imul(first ^ char.charCodeAt(0), 16777619); second = Math.imul(second, 33) ^ char.charCodeAt(0); }
    return `kaosu-assistant:conversation:${(first >>> 0).toString(16)}${(second >>> 0).toString(16)}`;
  }
  function rememberConversation(chat: Conversation, actorId: string) {
    try { localStorage.setItem(memoryKey(actorId, chat.module), chat.id); } catch { /* 禁用儲存時仍可操作。 */ }
  }
  async function resumeConversation(actorId: string, hostContext: Row, currentModule = module) {
    let saved: string | null = null;
    try { saved = localStorage.getItem(memoryKey(actorId, currentModule)); } catch { /* 無儲存時建立新對話。 */ }
    if (saved) {
      try {
        const chat = await api<Conversation>(`/api/conversations/${encodeURIComponent(saved)}`);
        if (chat.module === currentModule && (!chat.actor_id || chat.actor_id === actorId)) {
          if (chat.locale !== getLocale()) await api(`/api/conversations/${chat.id}/locale`, { locale: getLocale() });
          return chat;
        }
      } catch (error) {
        if (!(error instanceof ApiError) || ![403, 404].includes(error.status)) throw error;
      }
    }
    const chat = await api<Conversation>('/api/conversations', { module: currentModule, context: hostContext, locale: getLocale() });
    rememberConversation(chat, actorId);
    return chat;
  }
  useEffect(() => {
    if (!session || checkedActor.current === session.actor.id) return;
    checkedActor.current = session.actor.id;
    try {
      const pendingModule = (['report','schedule','mold'] as Module[]).find(item => hasSubmission(memoryKey(session.actor.id, item)));
      if (pendingModule) void start(undefined, pendingModule);
    } catch { setError(t('無法讀取恢復資訊，請先確認瀏覽器儲存。')); }
  }, [session?.actor.id]);
  useEffect(() => {
    if (summaryOpen || tab !== 'chat') panelRef.current?.querySelector<HTMLElement>('.operation-pane button')?.focus();
    else panelTrigger.current?.focus();
  }, [summaryOpen, tab]);
  async function changeLanguage(next: Locale) {
    if (!isLocale(next) || next === locale || localeBusy || busy) return;
    setLocaleBusy(true); setIndependentApproval(false);
    try {
      if (conversation) await api(`/api/conversations/${conversation.id}/locale`, { locale: next });
      setLocale(next);
      setError(''); setNotice('');
      setConversation(current => current ? { ...current, locale: next } : current);
    } catch (error) { setError(error instanceof Error ? error.message : t('切換語言未完成，請稍後再試。')); }
    finally { setLocaleBusy(false); }
  }
  function expandAssistant() {
    setExpanded(true);
    if (embedded) parent.postMessage({ type: 'kaosu-assistant:resize', expanded: true }, location.origin);
  }

  useEffect(() => {
    document.documentElement.lang = locale;
    if (embedded) parent.postMessage({ type: 'kaosu-assistant:preferences', locale, theme, resolvedTheme }, location.origin);
  }, [locale, theme, resolvedTheme]);
  useEffect(() => {
    const receivePreferences = (event: MessageEvent) => {
      if (!embedded || event.source !== parent || event.origin !== location.origin || event.data?.type !== 'kaosu-assistant:preferences') return;
      if (isTheme(event.data.theme)) setTheme(event.data.theme);
      if (isLocale(event.data.locale)) void changeLanguage(event.data.locale);
    };
    window.addEventListener('message', receivePreferences);
    return () => window.removeEventListener('message', receivePreferences);
  }, [conversation?.id, locale, localeBusy, busy]);

  useEffect(() => { void api<{ model_configured: boolean; mode: string; business_timezone?: string; business_date?: string; server_time?: string }>('/api/health').then(v => { setModelConfigured(v.model_configured); setMode(v.mode); setBusinessTimezone(v.business_timezone ?? 'UTC+07:00'); setBusinessDate(v.business_date ?? v.server_time?.slice(0, 10) ?? null); }).catch(() => setError(t("尚未連上作業服務，請確認後端已啟動。"))); void api<Session>('/api/session').then(value => { setSession(value); setMode(value.mode); }).catch(() => {}); }, []);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => { if (open) titleRef.current?.focus(); }, [open, stage]);
  useEffect(() => { if (tab !== 'chat' || stage !== 'chat') return; const id = conversation?.id ?? null; if (scrollConversation.current !== id) { scrollConversation.current = id; const container = endRef.current?.closest('.conversation-scroll'); if (container) container.scrollTop = 0; } else endRef.current?.scrollIntoView({ behavior: 'instant', block: 'end' }); }, [messages, proposal, tab, stage, conversation?.id]);
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (!embedded || event.source !== parent) return;
      let expected: string; try { expected = new URL(document.referrer).origin; } catch { return; }
      if (event.origin === expected && event.data?.type === 'kaosu-assistant:open') { setOpen(true); if (stage === 'chat') expandAssistant(); titleRef.current?.focus(); }
    };
    window.addEventListener('message', handler); return () => window.removeEventListener('message', handler);
  }, [stage]);

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
    if (event.key === 'Escape') { event.preventDefault(); if (summaryOpen || tab !== 'chat') { setSummaryOpen(false); setTab('chat'); } else minimize(); }
    if (!expanded && !matchMedia('(max-width: 640px)').matches) return;
    if (event.key !== 'Tab') return;
    const focusable = panelRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]');
    const visible = Array.from(focusable ?? []).filter(el => el.getClientRects().length > 0);
    const first = visible[0], last = visible.at(-1);
    if (event.shiftKey && (document.activeElement === first || document.activeElement === titleRef.current)) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
  function clearSession() {
    setSession(null); setConversation(null); setMessages([]); setWorkspace({records:[],catalogs:{}}); setProposal(null); setProposalStatus(''); setDraft(''); setSelected(null); setQueryData(null); setStage('identity');
    draftMemory.current.clear(); checkedActor.current = '';
    setError(t('登入或權限已失效，請重新核對MES身分。'));
  }
  async function guarded(work: () => Promise<void>) { setBusy(true); setError(''); setNotice(''); try { await work(); } catch (e) { if(e instanceof ApiError && [401,403].includes(e.status)) clearSession(); else setError(e instanceof Error ? e.message : t("操作未完成，請稍後再試。")); } finally { setBusy(false); } }
  async function refreshData(page = workspace.page ?? 1) {
    const generation = ++queryGeneration.current; setQueryBusy(true); setQueryError('');
    try {
      const params = new URLSearchParams({ module, page: String(page), page_size: String(pageSize), ...contextFilter });
      for (const [key,value] of Object.entries(filters)) if(value.trim()) params.set(key,value.trim());
      const value = await api<Workspace>(`/api/workspace?${params}`);
      if(generation === queryGeneration.current) setWorkspace(value);
    } catch(error) { if(generation === queryGeneration.current) setQueryError(error instanceof Error ? error.message : String(error)); throw error; }
    finally { if(generation === queryGeneration.current) setQueryBusy(false); }
  }  async function start(identity?: Identity, currentModule = module) {
    await guarded(async () => {
      queryGeneration.current++; setQueryBusy(false); setQueryError('');
      if (identity && !simulation) throw new Error(t("正式 MES 必須沿用目前登入身分。"));
      const current = identity ? await api<Session>('/api/session/demo', { identity }) : session;
      if (!current) throw new Error(t("請先選擇作業身分。"));
      setSession(current);
      setMode(current.mode);
      if (conversation) draftMemory.current.set(conversation.id, draft);
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
      if (live && hostContext.fac) initialContextFilter.fac = String(hostContext.fac);
      const params = new URLSearchParams({ module: currentModule, page: '1', page_size: '20', ...initialContextFilter });
      for (const [key, value] of Object.entries(initialFilters)) if (value) params.set(key, value);
      const loadWorkspace = async (): Promise<{ data: Workspace; error?: string }> => {
        try { return { data: await api<Workspace>(`/api/workspace?${params}`) }; }
        catch (error) { return { data: { records: [], catalogs: {} }, error: error instanceof Error ? error.message : t("初次資料查詢未完成") }; }
      };
      const [work, chat] = await Promise.all([
        loadWorkspace(), resumeConversation(current.actor.id, hostContext, currentModule),
      ]);
      const restoredGuide = await api<{ proposal?: Proposal | null }>(`/api/conversations/${chat.id}/guide`);
      const lastProposal = restoredGuide.proposal ?? [...(chat.messages ?? [])].reverse().find(message => message.proposal)?.proposal;
      let authoritative: Proposal | null = null;
      if (lastProposal) {
        const result = await api<{ proposal: Proposal }>(`/api/proposals/${lastProposal.id}`);
        authoritative = restoreSubmission(memoryKey(current.actor.id, currentModule), chat.id, result.proposal);
      }
      setModule(currentModule); setWorkspace(work.data); setConversation(chat); setMessages(chat.messages ?? []);
      setFilters(initialFilters); setContextFilter(initialContextFilter); setPageSize(20);
      setSelected(null); setProposal(authoritative); setProposalStatus(authoritative?.status === 'pending' ? '' : authoritative?.status ?? ''); setIndependentApproval(false); setQueryData(null); setDraft(value => draftMemory.current.get(chat.id) ?? (conversation ? '' : value)); setTab('chat'); setStage('chat'); expandAssistant();
      if (work.error) setError(t("初次資料查詢未完成：{0}。你仍可在對話補充設備與日期，或到「作業資料」縮小查詢範圍。", {0: work.error}));
    });
  }
  function receive(reply: Reply) {
    if (reply.proposal && session && conversation) {
      reply = { ...reply, proposal: restoreSubmission(memoryKey(session.actor.id), conversation.id, reply.proposal) };
    }
    if (reply.messages) setMessages(reply.messages);
    if (reply.proposal) { setProposal(reply.proposal); setProposalStatus(reply.proposal.status === 'pending' ? '' : reply.proposal.status ?? ''); setIndependentApproval(false); }
    if (reply.data !== undefined) setQueryData(reply.data);
  }
  async function send(event?: React.FormEvent) {
    event?.preventDefault(); const text = draft.trim(); if (!text || !conversation || busy || guideWorking || unresolved || modelConfigured === false) return;
    await guarded(async () => {
      await guideRef.current?.flush();
      const replacing = pending;
      if (replacing) { setProposalStatus('superseded'); setIndependentApproval(false); }
      const reply = await api<Reply>(`/api/conversations/${conversation.id}/messages`, { text });
      receive(reply); setDraft('');
      if (replacing) setNotice(reply.proposal ? t("已依補充需求取代前一張草稿，請核對新的確認卡。") : t("前一張草稿已停止確認。補齊資料後會建立新的確認卡。"));
    });
    inputRef.current?.focus();
  }
  async function applyConfirmation(result: ConfirmationResult) {
    setProposal(result.proposal); setProposalStatus(result.status === 'pending' ? '' : result.status);
    setNotice(result.message); setIndependentApproval(false);
    if (result.status === 'succeeded') {
      try { await refreshData(); } catch { setError(t('作業已完成，清單更新失敗；請重新查詢。')); }
    }
    if (session && conversation && !confirmationView(result.status).canReconcile) restoreSubmission(memoryKey(session.actor.id), conversation.id, result.proposal);
  }
  async function confirm(approved: boolean) {
    if (!proposal || submitting.current || busy || guideBusy || !proposalView.canConfirm) return;
    if (approved && !writesEnabled) { setError(t("正式寫入尚未啟用。可以查看預覽或取消草稿。")); return; }
    submitting.current = true;
    try { await guarded(async () => { if (!session || !conversation) return;
      try { await applyConfirmation(await submitRecoverably(memoryKey(session.actor.id), conversation.id, proposal, approved)); }
      catch (error) { const restored = restoreSubmission(memoryKey(session.actor.id), conversation.id, proposal); setProposal(restored); setProposalStatus(restored.status ?? ''); throw error; }
    }); }
    finally { submitting.current = false; }
  }
  async function reconcile() {
    if (!proposal || busy || !unresolved) return;
    await guarded(async () => { await applyConfirmation(await reconcileProposal(proposal)); });
  }
  async function chooseRecord(record: Row) {
    if (draft.trim()) { setError(t('切換工單前，請先送出或清除尚未送出的文字。')); return; }
    if (lockedTarget) { setError(unresolved ? t("此操作結果待核對，請先查核執行結果。") : t("目前有待確認的草稿。請先確認或取消，再切換作業資料。")); return; }
    await guarded(async () => {
      if (conversation) draftMemory.current.set(conversation.id, draft);
      const chat = await api<Conversation>('/api/conversations', { module, context: { ...contextFromUrl(), ...record }, locale: getLocale() });
      if (session) rememberConversation(chat, session.actor.id);
      setDraft(draftMemory.current.get(chat.id) ?? '');
      setConversation(chat); setMessages(chat.messages ?? []); setSelected(record); setProposal(null); setProposalStatus(''); setQueryData(null); setTab('chat'); setNotice(t("已切換作業資料，接下來的對話會帶入這筆資料。"));
    });
  }
  async function showAudit() {
    panelTrigger.current = document.activeElement as HTMLElement;
    const generation=++queryGeneration.current;setQueryBusy(true);setQueryError('');setTab('audit');
    try { const value=await api<{records:Row[]}>('/api/audit');if(generation===queryGeneration.current)setAudit(value.records); }
    catch(error){if(generation===queryGeneration.current)setQueryError(error instanceof Error?error.message:String(error));}
    finally{if(generation===queryGeneration.current)setQueryBusy(false);}
  }  async function showHelp() { setHelpOpen(v => !v); if (!budget) { try { setBudget(await api<Row>('/api/budget')); } catch { /* 用量服務失敗不影響回報問題。 */ } } }


  return <>
    {!embedded && <main className="demo-page" aria-hidden={open && expanded ? true : undefined} inert={open && expanded ? true : undefined}>
      <header className="demo-nav"><Brand small/></header>
      <div className="demo-content"><h1>{simulation ? t("MES 作業測試") : t("MES 生產作業")}</h1><p>{t("排程、報工與模具上下模。")}</p><p className="muted">{simulation ? t("目前使用隔離模擬資料。") : mode ? t("沿用目前 MES 登入身分。") : t("正在確認作業環境。")}{t("點選右下角助理開始操作。")}</p><button className="secondary" onClick={() => { setOpen(true); if (stage === 'chat') expandAssistant(); }}>{t("開啟生產情報助理")}</button></div>
    </main>}
    {!embedded && !expanded && <button ref={launcherRef} className="launcher" onClick={() => { if (open) minimize(); else { setOpen(true); if (stage === 'chat') expandAssistant(); } }} aria-label={open ? t("收合生產情報助理") : t("開啟生產情報助理")} title={t("生產情報助理")}>{open ? <ChevronDown size={20}/> : <Bot size={20}/>}</button>}
    {open && <div className={`assistant-overlay ${embedded ? 'embedded' : ''}`}><section ref={panelRef} role="dialog" aria-modal={expanded || embedded || undefined} aria-labelledby="assistant-title" className={`assistant-panel ${expanded ? 'expanded' : ''}`} onKeyDown={keyDialog}>
      <header className="assistant-header"><Brand small/><div className="header-preferences"><label><span className="sr-only">{t('語言')}</span><select aria-label={t('語言')} value={locale} disabled={localeBusy || busy} onChange={event => void changeLanguage(event.target.value as Locale)}><option value="zh-TW">繁體中文</option><option value="en">English</option><option value="th">ไทย</option></select></label><label><span className="sr-only">{t('主題')}</span><select aria-label={t('主題')} value={theme} onChange={event => { if (isTheme(event.target.value)) setTheme(event.target.value); }}><option value="system">{t('跟隨系統')}</option><option value="light">{t('淺色')}</option><option value="dark">{t('深色')}</option></select></label></div><div className="header-controls">{stage !== 'chat' && <button className="icon-button" title={expanded ? t("縮小聊天室") : t("放大聊天室")} aria-label={expanded ? t("縮小聊天室") : t("放大聊天室")} onClick={toggleExpanded}>{expanded ? <Minimize2 size={18}/> : <Expand size={18}/>}</button>}<button className="icon-button" aria-label={t("縮小助理")} title={t("縮小助理（Esc）")} onClick={minimize}><X size={18}/></button></div></header>
      {stage !== 'chat' ? <div className="onboarding">
        <div className="onboarding-top"><span className="step-label">{stage === 'modules' ? t("01 / 選擇作業") : t("02 / 確認身分")}</span>{stage === 'identity' && <button className="text-button" onClick={() => setStage('modules')} disabled={busy}><ArrowLeft size={16}/>{t("返回選擇")}</button>}</div>
        {stage === 'modules' && <label className="form-field">{t("描述作業需求")}<textarea disabled={busy} value={draft} onChange={e => setDraft(e.target.value)} placeholder={t("先說需求，再選擇作業範圍")}/></label>}<div className="welcome-icon"><Sparkles size={27}/></div><h1 id="assistant-title" ref={titleRef} tabIndex={-1}>{stage === 'modules' ? t("今天，想完成什麼作業？") : (simulation ? t("開始{0}前，選擇你的身分", {0: t(active.short)}) : t("開始{0}前，確認登入身分", {0: t(active.short)}))}</h1><p className="welcome-description">{stage === 'modules' ? t("選擇一個入口，我會陪你確認資料，完成現場作業。") : t("身分決定可執行的功能；每次寫入都會留下操作紀錄。")}</p>
        {stage === 'modules' ? <div className="entry-grid">{Object.entries(modules).map(([key, item]) => <button className="entry-card" key={key} disabled={busy || mode === null || (!simulation && !session?.actor.roles.includes(key))} title={!simulation && !session?.actor.roles.includes(key) ? t("目前登入身分無此模組權限") : undefined} onClick={() => { if (session?.actor.roles.includes(key)) void start(undefined, key as Module); else { setModule(key as Module); setStage('identity'); expandAssistant(); setError(''); } }}><span className="entry-icon"><item.icon size={25}/></span><strong>{t(item.title)}</strong><p>{t(item.description)}</p><span className="entry-link">{t("進入")}{t(item.short)}<ArrowRight size={17}/></span></button>)}</div> : <>
          <div className="identity-notice"><ShieldCheck size={18}/><span>{simulation ? t("目前為模擬驗證環境。此處身分切換僅供測試，正式 MES 將沿用已登入身分與伺服器權限。") : t("沿用目前 MES 已登入身分與伺服器授予的模組權限。確認身分後即可開始，不需再次輸入帳號密碼。")}</span></div>
          {session && <button className="session-button" disabled={busy || !session.actor.roles.includes(module)} onClick={() => void start()}><UserRound size={18}/><span>{t("沿用目前身分：")}{session.actor.name}{!session.actor.roles.includes(module) ? t("（此入口無權限）") : ''}</span><ArrowRight size={18}/></button>}
          {simulation && <div className="identity-grid">{identities.map(item => <button key={item.id} className="identity-card" disabled={busy || !(item.id === 'supervisor' || item.id === ({ schedule: 'planner', report: 'operator', mold: 'technician' }[module]))} onClick={() => void start(item.id)}><UserRound size={21}/><span><strong>{t(item.title)}</strong><small>{t(item.description)}</small></span><ChevronRight size={17}/></button>)}</div>}
        </>}
        {mode !== null && !simulation && !session && <div className="identity-notice"><ShieldCheck size={18}/><span>{t("尚未取得可信的 MES 登入身分。請先在原 MES 登入，再重新開啟助理。")}</span><button className="text-button" disabled={busy} onClick={() => void guarded(async () => { const current = await api<Session>('/api/session'); setSession(current); setMode(current.mode); })}>{t("重新確認登入")}</button></div>}
        {error && <div className="error-banner" role="alert">{t(error)}</div>}{busy && <div className="loading" role="status"><LoaderCircle className="spin" size={18}/>{t("正在準備作業資料…")}</div>}
        <div className="onboarding-footer"><span><MessageSquare size={16}/>{t("自然語言操作")}</span><span><CheckCheck size={16}/>{t("確認後寫入")}</span><span><History size={16}/>{t("完整作業紀錄")}</span></div>
      </div> : <>
        <div className="workspace-bar"><button className="icon-button" aria-label={t("返回模組入口")} disabled={busy || lockedTarget} title={unresolved ? t("請先查核執行結果") : pending ? t("請先確認或取消草稿") : t("返回模組入口")} onClick={() => setStage('modules')}><ArrowLeft size={18}/></button><span className="module-badge"><ModuleIcon size={18}/></span><div><h1 id="assistant-title" ref={titleRef} tabIndex={-1}>{t(active.title)}</h1><p>{session?.actor.name} <span>·</span>{t("EPS 成型")}</p></div><nav className="module-switcher" aria-label={t("切換作業模組")}>{Object.entries(modules).map(([key, item]) => <button key={key} className="text-button" aria-current={module === key ? 'page' : undefined} disabled={busy || lockedTarget || !session?.actor.roles.includes(key)} onClick={() => { if (key !== module) void start(undefined, key as Module); }}><item.icon size={16}/>{t(item.short)}</button>)}</nav><span className={`connection ${modelConfigured ? 'ready' : ''}`}><span/>{modelConfigured === true ? t("AI 已設定") : modelConfigured === false ? t("AI 尚未設定") : t("檢查連線中")}</span></div>

        {error && <div className="error-banner" role="alert"><span>{t(error)}</span><button className="icon-button" aria-label={t("關閉錯誤訊息")} onClick={() => setError('')}><X size={17}/></button></div>}{notice && <div className="notice-banner" role="status"><Check size={17}/><span>{t(notice)}</span></div>}
        <div className={`desktop-workbench conversation-first ${summaryOpen || tab !== 'chat' ? 'with-summary' : ''}`}><section className="chat-layout" aria-label={t("與助理對話")}><div className="pane-heading"><h2>{t("與助理對話")}</h2><div className="context-tools"><button className="text-button" aria-expanded={summaryOpen} onClick={event => { panelTrigger.current = event.currentTarget; setSummaryOpen(v => !v); }}>{t("本次作業摘要")}</button><button className="text-button" onClick={event => { panelTrigger.current = event.currentTarget; setTab(tab === 'data' ? 'chat' : 'data'); }}>{t("查看資料")}</button><button className="text-button" onClick={() => void showAudit()}>{t("操作紀錄")}</button></div></div><div className="task-context">{sheetContext}</div><div className="conversation-scroll" role="tabpanel" aria-label={t("對話作業")}>
          {selected && <div className="context-card"><span><ClipboardList size={15}/>{t("目前作業資料")}</span><strong>{display(selected.WO ?? selected.WO_NO ?? selected.EQP_NO ?? selected.ZZ_KAOSU_PROD_SCHEDULE_SID)}</strong><button className="text-button" onClick={() => setTab('data')}>{t("查看")}<ChevronRight size={15}/></button></div>}


          {messages.length === 0 && !guideSnapshot.action && <div className="chat-welcome"><Sparkles size={24}/><h2>{t("說說你想完成的作業")}</h2><p>{t("直接描述需求，或使用下方操作卡；只需補齊缺少的資料。")}</p><div className="prompt-options" hidden={modelConfigured === false}>{active.prompts.map(prompt => <button className="secondary" key={prompt} disabled={busy || unresolved} onClick={() => { setDraft(t(prompt)); inputRef.current?.focus(); }}>{t(prompt)}<ArrowUp size={15}/></button>)}</div></div>}
          <div className="messages" aria-live="polite" aria-relevant="additions text">{messages.map((message, i) => <article key={i} className={`message ${message.role === 'user' ? 'user' : 'assistant'}`}><span className="message-avatar">{message.role === 'user' ? <UserRound size={16}/> : <Sparkles size={16}/>}</span><div><span className="message-author">{message.role === 'user' ? session?.actor.name ?? t("你") : 'Emerald.AI'}</span><MessageContent role={message.role} content={message.content}/></div></article>)}</div>

          {conversation && <GuidedFlow key={conversation.id} ref={guideRef} onBusyChange={setGuideBusy} onWorkChange={setGuideWorking} onContextChange={setSheetContext} onSnapshot={setGuideSnapshot} onAccessDenied={clearSession} beforeTargetChange={() => { if (!draft.trim()) return true; setError(t('切換工單前，請先送出或清除尚未送出的文字。')); return false; }} conversation={conversation} module={module} workspace={workspace} selected={selected} signal={messages.length} proposal={proposal} status={proposalStatus} disabled={busy || unresolved} date={businessDate} onReply={receive} onAudit={() => void showAudit()} onHome={() => { if (!lockedTarget) setStage('modules'); }}/>}          {proposal && proposalStatus !== 'superseded' && <section className={`proposal ${independent ? 'important' : ''}`} aria-label={t("操作確認卡")}><div className="proposal-heading"><span className="proposal-icon"><ShieldCheck size={21}/></span><div><small>{proposalStatus ? t("作業處理結果") : t("待你確認 · 尚未寫入")}</small><h2>{t(actionNames[proposal.action] ?? proposal.action)}</h2></div><span className="proposal-state">{expired ? t("已過期") : proposalView.label}</span></div><p className="proposal-summary">{t(proposal.summary)}</p>
            <ProposalBusinessSummary proposal={proposal} workspace={workspace}/>
            <p className="business-note">{t("MES 時間")}{proposalTimezone}{t("；未指定時區的作業時間依 MES 顯示時間解讀。")}</p>
            {!writesEnabled && <div className="write-disabled" role="status"><ShieldCheck size={18}/><div><strong>{t("正式寫入尚未啟用")}</strong><p>{t("目前可查詢及預覽異動，尚不能執行寫入。你仍可取消或修改這筆草稿。")}</p></div></div>}
            {(timePolicy || newIdPolicy) && <div className="preview-policies">{timePolicy && <p><Clock3 size={15}/>{t(timePolicy)}</p>}{newIdPolicy && <p><CircleHelp size={15}/>{t(newIdPolicy)}</p>}</div>}
            <details className="proposal-details technical-details"><summary>{t("查看資料異動明細")}<span className="count">{proposal.changes.length}{t("項")}</span></summary><div className="diff-list">{proposal.changes.map((change, i) => <div className="diff" key={i}><div className="diff-label"><strong>{label(change.field)}</strong><small>{change.table} · {display(change.key)}</small></div><div className="diff-values"><span className="before">{display(change.before)}</span><ArrowRight size={16}/><span className="after">{display(change.after)}</span></div></div>)}</div><details className="proposal-details"><summary>{t("檢視完整操作參數")}</summary><Fields value={proposal.args}/></details></details>
            {pending && <><div className="expiry"><Clock3 size={15}/>{expired ? t("確認已過期，請重新建立草稿。") : t("確認期限：{0}", {0: Number.isFinite(expires) ? formatMesTime(expires, proposalTimezone) : proposal.expires_at})}</div>{independent && <label className="independent-confirm"><input type="checkbox" checked={independentApproval} onChange={e => setIndependentApproval(e.target.checked)} disabled={busy || guideBusy || expired || !writesEnabled}/><span>{t("我已核對這筆「")}{t(actionNames[proposal.action] ?? proposal.action)}{t("」的對象及影響，確認要單獨執行。")}</span></label>}<div className="proposal-actions"><button className="secondary" onClick={() => void confirm(false)} disabled={busy || guideBusy}>{t("取消草稿")}</button><button className="primary" disabled={busy || guideBusy || expired || !writesEnabled || (independent && !independentApproval)} onClick={() => void confirm(true)}><Check size={17}/>{independent ? t("確認這筆操作") : t("同意並寫入")}</button></div></>}
            <details className="technical-details" open={unresolved || proposalStatus === 'succeeded'}><summary>{t("技術資料")}</summary><p className="operation-id">{t("操作識別碼：")}<code>{proposal.id}</code></p></details>
            {unresolved && <div className="write-disabled" role="status"><CircleHelp size={18}/><div><strong>{t("結果待核對")}</strong><p>{t("請保留操作識別碼。查核只讀取執行紀錄，不會再次送出報工或其他業務操作。")}</p><button className="secondary" disabled={busy} onClick={() => void reconcile()}><RefreshCw size={16}/>{t("查核執行結果")}</button></div></div>}
          </section>}{module === 'report' && queryData !== null && !lockedTarget && <div className="query-candidates">{((queryData as Workspace)?.records ?? []).filter(record => record.WIP_OPI_WDOEACICO_HIST_SID).map((record,i) => <button className="secondary guide-record" key={i} disabled={busy || guideWorking} onClick={() => void guideRef.current?.beginReport(record)}><strong>{[record.EQP_NO,record.WO ?? record.WO_NO,record.PART_NO].filter(Boolean).join(' · ')}</strong><span>{display(record.REAL_CHECK_IN_TIME ?? record.SHIFT_DAY)} · {t("以此工單報工")}</span></button>)}</div>}{queryData !== null && <details className="query-results"><summary>{t("查詢結果")}</summary><DataView data={queryData}/></details>}
          {busy && <div className="loading" role="status"><LoaderCircle className="spin" size={18}/>{t("正在核對資料與處理作業…")}</div>}
<div ref={endRef}/>
        </div><div className="composer-area">{modelConfigured === false && <div className="model-notice"><CircleHelp size={17}/><span>{t("AI 尚未設定，可用下方操作卡完成作業。")}</span></div>}<form className="composer" onSubmit={e => void send(e)}><label className="sr-only" htmlFor="chat-input">{t("描述作業需求")}</label><textarea ref={inputRef} id="chat-input" rows={2} placeholder={unresolved ? t("此操作結果待核對，請先按確認卡的「查核執行結果」") : pending ? t("可直接補充修改，例如：良品改成 25，請重新確認") : t("描述你的{0}需求，例如：{1}", {0: t(active.short), 1: t(active.prompts[0])})} value={draft} disabled={busy || guideWorking || unresolved || modelConfigured === false} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }}/><button type="submit" className="send-button" disabled={busy || guideWorking || unresolved || !draft.trim() || modelConfigured !== true} aria-label={t("送出訊息")}>{busy ? <LoaderCircle className="spin" size={20}/> : <ArrowUp size={18}/>}</button></form><div className="composer-footnote"><span><ShieldCheck size={13}/>{t("確認後才會寫入")}</span><span>{t("Enter 送出 · Shift + Enter 換行")}</span></div></div></section><aside className="operation-pane" hidden={!summaryOpen && tab === 'chat'} aria-label={t("本次作業")}><button className="text-button" onClick={() => {setSummaryOpen(false);setTab('chat');}}>{t("收起附屬面板")}</button><div className="pane-heading"><h2>{t("本次作業")}</h2><span>{t("確認後才會寫入")}</span></div>{queryBusy && <p role="status">{t("正在讀取資料…")}</p>}{queryError && <p role="alert">{queryError}</p>}<div className="sheet-context" aria-label={t("目前作業資料")}>{sheetContext || t("尚未選擇工單")}</div>        <div className="tabs" role="tablist" aria-label={t("作業檢視")}><button role="tab" aria-selected={tab === 'chat'} onClick={() => setTab('chat')}><MessageSquare size={16}/>{t("作業單")}</button><button role="tab" aria-selected={tab === 'data'} onClick={() => setTab('data')}><ClipboardList size={16}/>{t("查詢資料")}<span className="count">{workspace.records.length}</span></button><button role="tab" aria-selected={tab === 'audit'} disabled={busy} onClick={() => void showAudit()}><History size={16}/>{t("操作紀錄")}</button></div><div className="operation-sheet" hidden={tab !== 'chat'}><p className="sheet-context">{sheetContext}</p>{proposal && proposalStatus !== 'superseded' && <ProposalBusinessSummary proposal={proposal} workspace={workspace}/>}<Fields value={guideSnapshot}/>

</div>{tab === 'data' && queryData !== null ? <div className="workspace-scroll" role="tabpanel" aria-label={t("查詢結果")}><div className="section-heading"><div><h2>{t("查詢結果")}</h2><p>{t("查詢不會寫入；實際異動請核對作業單。")}</p></div><button className="secondary" onClick={() => setQueryData(null)}>{t("瀏覽其他工單")}</button></div><DataView data={queryData}/></div> : tab === 'data' ? <div className="workspace-scroll" role="tabpanel" aria-label={t("作業資料")}><div className="section-heading"><div><h2>{t("目前作業資料")}</h2><p>{t("選擇一筆資料，帶入新的作業對話。")}</p></div><button className="secondary" disabled={busy} onClick={() => void refreshData().catch(() => {})}><RefreshCw size={16}/>{t("重新整理")}</button></div>{module === 'report' && <p className="data-note">{t("人工報工與 IoT 推算數量各自呈現；未有 IoT 資料不代表產量為零。")}</p>}<DataFilters filters={filters} setFilters={setFilters} pageSize={pageSize} setPageSize={setPageSize} workspace={workspace} busy={busy} load={page => void refreshData(page).catch(() => {})}/><div className="record-grid">{workspace.records.map((record, i) => <article className="workspace-record" key={i}><div className="record-title"><Factory size={18}/><strong>{display(record.EQP_NO ?? record.WO ?? t("第 {0} 筆", {0: i + 1}))}</strong><span className="mode-chip">{record.COMPLETED === 'Y' ? t("已完工") : t("作業資料")}</span></div><Fields value={record}/><button className="secondary" disabled={busy || lockedTarget} onClick={() => void chooseRecord(record)}>{t("以此筆資料開始")}<ArrowRight size={16}/></button></article>)}</div>{!workspace.records.length && <div className="empty-state"><ClipboardList size={28}/><h3>{t("尚無作業資料")}</h3><p>{t("請重新整理，或從對話建立需要的作業。")}</p></div>}<details className="catalogs"><summary>{t("查看設備、工單與模具選項")}</summary><DataView data={workspace.catalogs} title={t("作業選項")}/></details></div> : tab === 'audit' ? <div className="workspace-scroll" role="tabpanel" aria-label={t("操作紀錄")}><div className="section-heading"><div><h2>{t("每次變更，都有紀錄。")}</h2><p>{t("核對操作時間、執行人員與資料前後差異。")}</p></div><button className="secondary" disabled={busy} onClick={() => void showAudit()}><RefreshCw size={16}/>{t("重新整理")}</button></div><DataView data={audit} title={t("操作紀錄")}/></div> : null}</aside></div>
      </>}
      {helpOpen && <aside className="help-panel" aria-label={t("回報問題與用量")}><div className="section-heading"><div><h2>{t("讓作業經驗留下來")}</h2><p>{t("錯誤回報先送審核，再經候選案例回歸後發布，不會自動改變卡控。")}</p></div><button className="icon-button" aria-label={t("關閉問題回報")} onClick={() => setHelpOpen(false)}><X size={18}/></button></div><form onSubmit={e => { e.preventDefault(); void guarded(async () => { await api('/api/feedback', { module, message: feedback, ...(conversation ? { conversation_id: conversation.id } : {}) }); setFeedback(''); setFeedbackSent(true); }); }}><label className="form-field">{t("遇到什麼問題？")}<textarea rows={3} required value={feedback} onChange={e => { setFeedback(e.target.value); setFeedbackSent(false); }} placeholder={t("描述你預期的結果、實際發生的情況，或需要補充的操作知識。")} maxLength={4000}/></label><button className="primary" disabled={busy || !feedback.trim()} type="submit">{t("送出問題回報")}</button>{feedbackSent && <p className="feedback-success" role="status">{t("已收到，將由主管審查後處理。")}</p>}</form><FeedbackReview session={session} refreshToken={feedbackSent}/><details><summary>{t("來源版本與 API 用量")}</summary><p className="muted">{t("作業盤點版本：979d2c6 · 2026-10-30")}</p>{budget ? <Fields value={budget}/> : <p className="muted">{t("目前無法取得用量資訊。")}</p>}</details></aside>}
      <footer className="assistant-footer"><span>EMERALD.AI</span><span>{t("MES 時間")}{proposalTimezone}</span>{stage === 'chat' ? <button className="footer-help" onClick={() => void showHelp()}><CircleHelp size={13}/>{t("回報問題與來源")}</button> : <span>{t("高塑 · 生產作業助理")}</span>}</footer>
    </section></div>}
  </>;
}

function DataFilters({ filters, setFilters, pageSize, setPageSize, workspace, busy, load }: {
  filters: { equipment: string; date: string; wo: string }; setFilters: React.Dispatch<React.SetStateAction<{ equipment: string; date: string; wo: string }>>;
  pageSize: number; setPageSize: (value: number) => void; workspace: Workspace; busy: boolean; load: (page: number) => void;
}) {
  const page = workspace.page ?? 1, size = workspace.page_size ?? pageSize, total = workspace.total ?? workspace.records.length;
  return <><form className="data-filters" onSubmit={e => { e.preventDefault(); load(1); }}>
    <label>{t("設備")}<input value={filters.equipment} onChange={e => setFilters(v => ({ ...v, equipment: e.target.value }))} placeholder={t("全部設備")}/></label>
    <label>{t("日期或區間")}<input value={filters.date} onChange={e => setFilters(v => ({ ...v, date: e.target.value }))} placeholder={t("2026-10-30 或 起日~迄日")}/></label>
    <label>{t("工單")}<input value={filters.wo} onChange={e => setFilters(v => ({ ...v, wo: e.target.value }))} placeholder={t("全部工單")}/></label>
    <label>{t("每頁")}<select value={pageSize} onChange={e => setPageSize(Number(e.target.value))}><option value={20}>{t("20 筆")}</option><option value={50}>{t("50 筆")}</option><option value={100}>{t("100 筆")}</option></select></label>
    <button type="submit" className="secondary" disabled={busy}>{t("套用查詢")}</button>
  </form><div className="pagination"><span>{t("共 {0} 筆 · 第 {1} / {2} 頁", {0: total, 1: page, 2: Math.max(1, Math.ceil(total / size))})}</span><button className="icon-button" aria-label={t("上一頁")} disabled={busy || page <= 1} onClick={() => load(page - 1)}><ArrowLeft size={16}/></button><button className="icon-button" aria-label={t("下一頁")} disabled={busy || page * size >= total} onClick={() => load(page + 1)}><ArrowRight size={16}/></button></div></>;
}

if (typeof document !== 'undefined' && document.getElementById('mes-ai-chat-root')) createRoot(document.getElementById('mes-ai-chat-root')!).render(<React.StrictMode><App/></React.StrictMode>);





