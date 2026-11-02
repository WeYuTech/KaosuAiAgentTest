import {RequestProgress} from './RequestProgress';
import {ChatQueryResults} from './ChatQueryResults';
import {restoreQueryWorkspace} from './query-context';
import {rememberOperationFocus,operationFocusTarget,type OperationFocus} from './operation-focus';
import {WorkspaceChoices} from './WorkspaceChoices';
import {useEntry} from './use-entry';
import {useOperationMode} from './operation-mode';
import {InterfaceSettings} from './InterfaceSettings';
import {useChatScroll} from './chat/use-chat-scroll';
import {beginAttempt,acceptAttempt,projectMessages,type Presentation} from './chat/message-presentation';
import './motion.css';
import {PanelLoadBoundary} from './PanelLoadBoundary';
import {draftStorageKey,readTextDraft,saveTextDraft,clearTextDrafts,type DraftDelivery} from './draft-recovery';
import { AssistantModal, AssistantModalContent, AssistantModalTrigger } from './components/assistant-ui/elements/assistant-modal.aui';
import {TooltipIconButton} from './components/assistant-ui/elements/tooltip-icon-button';
import { MesAssistantProvider, type HistoryProjection } from './chat/assistant-runtime';
import { ThreadPrimitive } from '@assistant-ui/react';
import { ThreadMessages } from './components/assistant-ui/elements/thread.aui';
import './source-styles.css';
import './emerald-design-tokens.css';
import { t, useLocale, getLocale, isLocale, type Locale } from './i18n';
import { useTheme, isTheme } from './theme';
import {HeaderMenu} from './HeaderMenu';
import { AssistantHeader } from './AssistantChrome';
import {BudgetSummary} from './BudgetSummary';
import {SidebarSplitter,useSidebarLayout} from './SidebarSplitter';
import { ConversationHistory, type ChatEntry, type HistoryController, type HistoryScope } from './ConversationHistory';
import type {ManagementSection} from './ManagementPanel';
import {OperationDialog} from './OperationDialog';
const ManagementPanel=React.lazy(()=>import('./ManagementPanel').then(module=>({default:module.ManagementPanel})));
import { FloatingResize, useFloatingSize } from './FloatingResize';
import { ConversationComposer } from './ConversationComposer';
import { GuidedFlow, type GuideHandle } from './GuidedFlow';
import React, { useEffect, useRef, useState, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowLeft, ArrowRight, ArrowDown, Plus, MoreHorizontal, Bot, CalendarDays, Check, CheckCheck, ChevronDown, ChevronRight, CircleHelp, ClipboardList, Clock3, Maximize2, Factory, History, LoaderCircle, MessageSquare, Minimize2, RefreshCw, ShieldCheck, Sparkles, UserRound, Wrench, X } from 'lucide-react';
import { api, ApiError, display, label, type Conversation, type Identity, type Message, type Module, type Proposal, type Reply, type Row, type Session, type Workspace } from './api';
import { DataView, Fields } from './DataView';
import { ProposalBusinessSummary } from './ProposalBusinessSummary';
import { confirmationView, reconcileProposal, type ConfirmationResult } from './confirmation';
import { FeedbackReview } from './FeedbackReview';
import './styles.css';
import './desktop.css';
import './conversation.css';
import './history.css';
import './management.css';
import './operation-layout.css';
import './dual-flow.css';
import { ObsoleteContext, requestInContext, resultInContext } from './context-request';
import { restoreSubmission, submitRecoverably, hasSubmission, pendingSubmission, SubmissionBlocked, type Marker } from './submission-recovery';

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
function Brand({ small = false }: { small?: boolean }) { return <div className={`brand ${small ? 'small' : ''}`}><img className="aui-modal-brand" src={new URL('weyu-brand.svg', new URL('./', location.href)).href} width={112} height={36} alt={t("威友科技")}/><span className="brand-copy"><strong className="brand-title">{t("生產情報助理")}</strong></span></div>; }
export function App({ initialOpen = false }: { initialOpen?: boolean } = {}) {
  const { locale, setLocale } = useLocale();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [localeBusy, setLocaleBusy] = useState(false);
  const [open, setOpen] = useState(embedded || initialOpen);
  const [expanded, setExpanded] = useState(false);
  const [management,setManagement]=useState<ManagementSection|null>(null);
  const [managementOpen,setManagementOpen]=useState(false);
  const [managementGeneration,setManagementGeneration]=useState(0);
  const managementTrigger=useRef<HTMLElement|null>(null);
  function closeManagement(){setManagementOpen(false);}
  const [historyOpen,setHistoryOpen]=useState(false);
  const [historyBusy,setHistoryBusy]=useState(false);
  const [historyRevision,setHistoryRevision]=useState(0);
  const [historyProjection,setHistoryProjection]=useState<HistoryProjection>();
  const forceNew=useRef(false);
  const historyTrigger=useRef<HTMLElement|null>(null);
  const [compactViewport, setCompactViewport] = useState(false);

  const fullScreen = expanded || compactViewport;
  const floating=useFloatingSize();
  useEffect(() => {
    const media = window.matchMedia('(max-width:640px)');

    const sync = () => {setCompactViewport(media.matches);};
    sync(); media.addEventListener('change', sync);
    return () => {media.removeEventListener('change', sync);};
  }, []);
  const [narrowPanel,setNarrowPanel]=useState(false);
  useEffect(()=>{if(!open || !panelRef.current)return;const observer=new ResizeObserver(entries=>setNarrowPanel(entries[0].contentRect.width<=850));observer.observe(panelRef.current.querySelector('.assistant-main') ?? panelRef.current);return()=>observer.disconnect();},[open]);
  const [stage, setStage] = useState<'modules' | 'identity' | 'chat'>('modules');
  const [module, setModule] = useState<Module>('report');
  const [session, setSession] = useState<Session | null>(null);
  const [mode, setMode] = useState<string | null>(null);
  const [businessTimezone, setBusinessTimezone] = useState('UTC+07:00');
  const [businessDate, setBusinessDate] = useState<string | null>(null);
  const [modelConfigured, setModelConfigured] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [waitingStopped,setWaitingStopped]=useState(false);
  useEffect(()=>{if(!busy)setWaitingStopped(false);},[busy]);
  const working = useRef(false);
  const contextEpoch = useRef(0);
  const renderEpoch = contextEpoch.current;
  const [recoveryTarget, setRecoveryTarget] = useState<Marker | null>(null);
  const [externalRecovery, setExternalRecovery] = useState<ConfirmationResult | null>(null);
  const suspendedChat = useRef<Conversation | null>(null);
  const [returnChat, setReturnChat] = useState<Conversation | null>(null);
  const initialIntent = useRef<string | null>(null);
  const requestContext = { epoch: () => contextEpoch.current, actor: () => checkedActor.current || session?.actor.id, invalidate: clearSession };
  async function request<T>(path: string, body?: unknown): Promise<T> {
    return requestInContext<T>(requestContext, path, body);
  }
  async function scopedRequest<T>(path: string, body?: unknown): Promise<T> {
    if (renderEpoch !== contextEpoch.current) throw new ObsoleteContext();
    return request<T>(path, body);
  }
  const entry=useEntry(session?.actor.id,mode,scopedRequest);
  const entryIdentity=useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [presentation,setPresentation]=useState<Presentation|null>(null);
  const attemptSequence=useRef(0);
  function beginMessage(cid:string,text:string,index:number){const id=`${cid}:attempt:${++attemptSequence.current}`;setPresentation(previous=>beginAttempt(previous,cid,index,text,id));}
  function acceptMessage(cid:string,reply:Reply){if(reply.messages)setPresentation(previous=>previous?.conversation===cid?acceptAttempt(previous,reply.messages!):previous);}
  function failMessage(cid:string,error:unknown,sent=true){setPresentation(previous=>previous?.conversation===cid&&previous.attempt?{...previous,attempt:{...previous.attempt,delivery:!sent?'not_sent':error instanceof ApiError&&error.status>=400&&error.status<500?'rejected':'unknown'}}:previous);}
  const projectedMessages=useMemo(()=>projectMessages(messages,conversation?.id??null,presentation),[messages,conversation?.id,presentation]);
  const messagePending=presentation?.conversation===conversation?.id&&presentation?.attempt?.delivery==='pending'&&presentation.attempt.accepted===undefined;
  const [draft, setDraft] = useState('');
  const [draftDelivery,setDraftDelivery]=useState<DraftDelivery>('unsent');
  const draftScope=useRef('');
  const draftScopeActor=useRef('');
  useEffect(()=>{
    if(!session?.actor.id)return;
    const key=draftStorageKey(session.actor.id,memoryKey(session.actor.id),conversation?.id??null);
    if(draftScope.current!==key){
      if(draftScopeActor.current&&draftScopeActor.current!==session.actor.id)clearTextDrafts(sessionStorage,draftScopeActor.current);
      draftScope.current=key;draftScopeActor.current=session.actor.id;
      const saved=readTextDraft(sessionStorage,key);
      if(saved){setDraft(saved.text);setDraftDelivery(saved.delivery);initialIntent.current=null;return;}
    }
    saveTextDraft(sessionStorage,key,draft,draftDelivery);
  },[session?.actor.id,conversation?.id,draft,draftDelivery,module]);
  function editDraft(text:string){setDraft(text);setDraftDelivery('unsent');}

  const [queryBusy, setQueryBusy] = useState(false);
  const [queryError, setQueryError] = useState('');
  const queryGeneration = useRef(0);
  const [workspace, setWorkspace] = useState<Workspace>({ records: [], catalogs: {} });
  const guideRef = useRef<GuideHandle>(null);
  const [guideBusy, setGuideBusy] = useState(false);
  const [guideWorking, setGuideWorking] = useState(false);
  useEffect(() => { if (guideWorking) { setNotice(''); setError(''); } }, [guideWorking]);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const panelTrigger = useRef<HTMLElement | null>(null);
  const helpTrigger = useRef<HTMLElement | null>(null);
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
  const [usageOpen,setUsageOpen]=useState(false);
  const [usageStats,setUsageStats]=useState<Row|null>(null);
  const [usageError,setUsageError]=useState('');
  const [filters, setFilters] = useState({ equipment: '', date: '', wo: '' });
  const [contextFilter, setContextFilter] = useState<Record<string, string>>({});
  const [pageSize, setPageSize] = useState(20);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const bodyRef=useRef<HTMLDivElement>(null);
  const sidebar=useSidebarLayout(bodyRef,open);
  const [sidebarDragging,setSidebarDragging]=useState(false);
  const historyVisible=sidebar.wide?!sidebar.collapsed:historyOpen;
  const showHistoryOverlay=!sidebar.wide&&historyOpen;
  function collapseHistory(){historyTrigger.current?.focus({preventScroll:true});setHistoryOpen(false);if(sidebar.wide)sidebar.collapse(true);}
  const focusHistory=useRef(false);
  const historyController=useRef<HistoryController>(null);
  function openHistoryScope(scope:HistoryScope){
    if(sidebar.wide)sidebar.collapse(false);else setHistoryOpen(true);
    historyController.current?.showScope(scope);
  }
  function toggleHistory(){if(historyVisible){collapseHistory();return;}focusHistory.current=true;if(sidebar.wide)sidebar.collapse(false);else setHistoryOpen(true);setHistoryRevision(v=>v+1);}
  useEffect(()=>{if(historyVisible&&focusHistory.current){focusHistory.current=false;panelRef.current?.querySelector<HTMLElement>('.history-search-trigger')?.focus({preventScroll:true});}else if(!historyVisible&&panelRef.current?.querySelector('.conversation-history')?.contains(document.activeElement))historyTrigger.current?.focus({preventScroll:true});},[historyVisible]);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const chatScroll=useChatScroll(conversation?.id??null,stage==='chat');
  const launcherRef = useRef<HTMLButtonElement>(null);
  const active = modules[module]; const ModuleIcon = active.icon;
  const proposalView = confirmationView(proposalStatus || 'pending');
  const pending = Boolean(proposal && proposalView.canConfirm);
  const unresolved = Boolean(proposal && proposalView.canReconcile);
  const chatReadOnly=Boolean(conversation?.is_archived);
  const lockedTarget = pending || unresolved || guideBusy || Boolean(recoveryTarget);
  const expires = proposal ? new Date(proposal.expires_at).getTime() : Infinity;
  const expired = pending && Number.isFinite(expires) && now >= expires;
  const independent = Boolean(proposal && (proposal.independent_confirmation || /delete|complete|clear|remove|unmount_finish/i.test(proposal.action)));
  const simulation = mode === 'simulation';
  const writesEnabled = proposal?.writes_enabled !== false && (simulation || proposal?.writes_enabled === true);
  const timePolicy = proposal?.time_policy ?? proposal?.preview?.time_policy;
  const newIdPolicy = proposal?.new_id_policy ?? proposal?.preview?.new_id_policy;
  const proposalTimezone = proposal?.business_timezone ?? businessTimezone;

  useEffect(() => {
    if (!open || !session) return;
    let active = true;
    void scopedRequest<Row>('/api/budget').then(value => { if (active) setBudget(value); }).catch(() => { if (active) setBudget(null); });
    return () => { active = false; };
  }, [open, session?.actor.id, management]);

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
    try { saved = pendingSubmission(memoryKey(actorId, currentModule))?.conversation ?? localStorage.getItem(memoryKey(actorId, currentModule)); } catch { /* 無儲存時建立新對話。 */ }
    if (saved) {
      try {
        const chat = await request<Conversation>(`/api/conversations/${encodeURIComponent(saved)}`);
        if (chat.module === currentModule && (!chat.actor_id || chat.actor_id === actorId)) {
          if (chat.locale !== getLocale()) await request(`/api/conversations/${chat.id}/locale`, { locale: getLocale() });
          return chat;
        }
      } catch (error) {
        if (hasSubmission(memoryKey(actorId,currentModule))) throw error;
        if (!(error instanceof ApiError) || error.status !== 404) throw error;
      }
    }
    const chat = await request<Conversation>('/api/conversations', { module: currentModule, context: hostContext, locale: getLocale() });
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
  useEffect(() => {
    if(helpOpen) panelRef.current?.querySelector<HTMLElement>('.help-panel button')?.focus();
    else helpTrigger.current?.focus();
  }, [helpOpen]);
  async function changeLanguage(next: Locale) {
    if (!isLocale(next) || next === locale || localeBusy || busy) return;
    setLocaleBusy(true); setIndependentApproval(false);
    try {
      if (conversation) await request(`/api/conversations/${conversation.id}/locale`, { locale: next });
      setLocale(next);
      setError(''); setNotice('');
      setConversation(current => current ? { ...current, locale: next } : current);
    } catch (error) { setError(error instanceof Error ? error.message : t('切換語言未完成，請稍後再試。')); }
    finally { setLocaleBusy(false); }
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

  useEffect(() => {
    let live = true;
    const epoch = contextEpoch.current;
    void api<{ model_configured: boolean; mode: string; business_timezone?: string; business_date?: string; server_time?: string }>('/api/health').then(v => {
      if (!live) return;
      setModelConfigured(v.model_configured); setMode(v.mode); setBusinessTimezone(v.business_timezone ?? 'UTC+07:00'); setBusinessDate(v.business_date ?? v.server_time?.slice(0, 10) ?? null);
    }).catch(() => { if(live) setError(t("尚未連上作業服務，請確認後端已啟動。")); });
    void api<Session>('/api/session').then(value => {
      if(live && epoch === contextEpoch.current) {setSession(value);setMode(value.mode);}
    }).catch(() => {});
    return () => {live = false;};
  }, []);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => { if (open) titleRef.current?.focus(); }, [open, stage]);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (!embedded || event.source !== parent) return;
      let expected: string; try { expected = new URL(document.referrer).origin; } catch { return; }
      if (event.origin === expected && event.data?.type === 'kaosu-assistant:open') { setOpen(true); parent.postMessage({type:'kaosu-assistant:resize',expanded},expected); titleRef.current?.focus(); }
    };
    window.addEventListener('message', handler); return () => window.removeEventListener('message', handler);
  }, [stage, expanded]);

  useEffect(() => {
    if (!session || !conversation) return;
    const sync=()=>{const marker=pendingSubmission(memoryKey(session.actor.id));setRecoveryTarget(marker && (marker.proposal!==proposal?.id || marker.conversation!==conversation.id)?marker:null);};
    sync(); window.addEventListener('storage',sync); window.addEventListener('focus',sync);
    return ()=>{window.removeEventListener('storage',sync);window.removeEventListener('focus',sync);};
  },[session?.actor.id,conversation?.id,proposal?.id,module]);
  async function checkOriginal() {
    if (!recoveryTarget || !session || busy) return;
    const marker = recoveryTarget;
    await guarded(async () => {
      const read = await request<{proposal:Proposal}>(`/api/proposals/${marker.proposal}`);
      const original = restoreSubmission(memoryKey(session.actor.id),marker.conversation,read.proposal);
      const terminal = !confirmationView(original.status ?? 'pending').canReconcile && original.status !== 'pending';
      const result = terminal || original.local_rejection
        ? {proposal:original,status:original.status ?? 'pending',message:t('已查回原操作結果。')}
        : await resultInContext(requestContext, () => reconcileProposal(original,scopedRequest));
      if (renderEpoch !== contextEpoch.current) throw new ObsoleteContext();
      restoreSubmission(memoryKey(session.actor.id),marker.conversation,result.proposal);
      setExternalRecovery(result);
      setRecoveryTarget(pendingSubmission(memoryKey(session.actor.id)) ?? null);
    });
  }
  async function recoverOriginal() {
    if(!recoveryTarget || !conversation || busy || guideWorking) return;
    try { await guideRef.current?.flush(); }
    catch(error) {if(renderEpoch===contextEpoch.current)setError(error instanceof Error?error.message:String(error));return;}
    if(renderEpoch!==contextEpoch.current)return;
    suspendedChat.current=conversation; draftMemory.current.set(conversation.id,draft);
    const restored = await start(undefined,module,recoveryTarget.conversation);
    if (restored) setReturnChat(suspendedChat.current);
  }

  function minimize() {
    if (embedded) { try { parent.postMessage({ type: 'kaosu-assistant:close' }, new URL(document.referrer).origin); } catch { /* 無宿主來源時保留介面。 */ } }
    else { setOpen(false); setTimeout(() => launcherRef.current?.focus(), 0); }
  }
  function toggleExpanded() {
    const next = !expanded;
    setExpanded(next);
    if (embedded) { try { parent.postMessage({ type: 'kaosu-assistant:resize', expanded: next }, new URL(document.referrer).origin); } catch { /* 無宿主時由頁面自行展開。 */ } }
  }
  function keyDialog(event: React.KeyboardEvent) {
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode===229) return;
    if (event.key === 'Escape') { event.preventDefault(); if(usageOpen){setUsageOpen(false);return;} if(showHistoryOverlay){closeHistory();return;} if(helpOpen){setHelpOpen(false);return;} if (summaryOpen || tab !== 'chat') { setSummaryOpen(false); setTab('chat'); } else minimize(); }
    if (!fullScreen && !embedded && !helpOpen && !showHistoryOverlay && !usageOpen && !(narrowPanel && (summaryOpen || tab !== 'chat'))) return;
    if (event.key !== 'Tab') return;
    const focusRoot=usageOpen ? panelRef.current?.querySelector('.usage-panel') : showHistoryOverlay ? panelRef.current?.querySelector('.conversation-history') : helpOpen ? panelRef.current?.querySelector('.help-panel') : narrowPanel && (summaryOpen || tab!=='chat') ? panelRef.current?.querySelector('.operation-pane') : panelRef.current;
    const focusable = focusRoot?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]');
    const visible = Array.from(focusable ?? []).filter(el => el.getClientRects().length > 0);
    const first = visible[0], last = visible.at(-1);
    if (focusRoot && !focusRoot.contains(document.activeElement)) {event.preventDefault();(event.shiftKey ? last : first)?.focus();}
    else if (event.shiftKey && (document.activeElement === first || document.activeElement === titleRef.current)) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
  function clearSession() {
    clearTextDrafts(sessionStorage);draftScope.current="";draftScopeActor.current="";setDraftDelivery("unsent");
    setManagement(null);setManagementOpen(false);setPresentation(null);contextEpoch.current++; queryGeneration.current++;
    working.current = false; setBusy(false); setQueryBusy(false); setGuideBusy(false); setGuideWorking(false);
    setAudit([]); setFeedback(''); setFeedbackSent(false); setBudget(null); setHelpOpen(false);setHistoryOpen(false);setUsageOpen(false);setUsageStats(null);forceNew.current=false;
    setGuideSnapshot({}); setSheetContext(''); setSummaryOpen(false); setTab('chat');
    setNotice(''); setQueryError(''); setIndependentApproval(false); setContextFilter({});
    setFilters({equipment:'',date:'',wo:''}); setRecoveryTarget(null); setExternalRecovery(null); setReturnChat(null);
    suspendedChat.current=null; initialIntent.current=null;
    setSession(null); setConversation(null); setMessages([]); setWorkspace({records:[],catalogs:{}}); setProposal(null); setProposalStatus(''); setDraft(''); setSelected(null); setQueryData(null); setStage('identity');
    draftMemory.current.clear(); checkedActor.current = '';
    setError(t('登入或權限已失效，請重新核對MES身分。'));
  }
  async function guarded(work: () => Promise<void>) {
    if (working.current) return false;
    const epoch=contextEpoch.current; working.current=true; setBusy(true); setError(''); setNotice('');
    try { await work(); return epoch === contextEpoch.current; }
    catch(e) { if(epoch===contextEpoch.current && !(e instanceof ObsoleteContext)) setError(e instanceof Error ? e.message : t('操作未完成，請稍後再試。')); return false; }
    finally { if(epoch===contextEpoch.current) { working.current=false; setBusy(false); } }
  }
  const [selectionActive,setSelectionActive]=useState(false);
  const [selectionAI,setSelectionAI]=useState(false);
  const selectionScroll=useRef(0);
  function askSelection(){selectionScroll.current=panelRef.current?.querySelector(".operation-primary")?.scrollTop??0;setSelectionAI(true);requestAnimationFrame(()=>inputRef.current?.focus());}
  function closeSelectionAI(){setSelectionAI(false);requestAnimationFrame(()=>{document.getElementById("guide-selection-ai")?.focus({preventScroll:true});const area=panelRef.current?.querySelector(".operation-primary");if(area)area.scrollTop=selectionScroll.current;});}
  useEffect(()=>{if(!selectionActive)setSelectionAI(false);},[selectionActive]);
  function acceptWorkspace(value:Workspace){
    setWorkspace(value);
    const f=value.query_context?.filters;
    if(f){setFilters({equipment:String(f.equipment??''),date:String(f.date??''),wo:String(f.wo??'')});setContextFilter(Object.fromEntries(Object.entries(f).filter(([k])=>!['equipment','date','wo','page','page_size'].includes(k)).map(([k,v])=>[k,String(v)])));setPageSize(Number(f.page_size??20));}
  }
  async function queryWorkspace(criteria:Row):Promise<Workspace>{
    if(!conversation)throw new Error(t('請先選擇作業身分。'));
    const generation=++queryGeneration.current;
    let value:Workspace;
    try{value=await request<Workspace>(`/api/conversations/${conversation.id}/query`,{version:workspace.query_context?.version??0,filters:criteria});}
    catch(error){if(error instanceof ApiError&&error.status===409){const current=await request<Workspace>(`/api/conversations/${conversation.id}/query`);if(generation===queryGeneration.current)acceptWorkspace(current);}throw error;}
    if(generation===queryGeneration.current)acceptWorkspace(value);
    return value;
  }
  async function refreshData(page = workspace.page ?? 1) {
    const generation = ++queryGeneration.current; setQueryBusy(true); setQueryError('');
    try {
      const params = new URLSearchParams({ module, page: String(page), page_size: String(pageSize), ...contextFilter });
      for (const [key,value] of Object.entries(filters)) if(value.trim()) params.set(key,value.trim());
      const value = conversation ? await request<Workspace>(`/api/conversations/${conversation.id}/query`,{version:workspace.query_context?.version??0,filters:Object.fromEntries([...params.entries()].filter(([key])=>key!=='module'))}) : await request<Workspace>(`/api/workspace?${params}`);
      if(generation === queryGeneration.current) acceptWorkspace(value);
    } catch(error) { if(generation === queryGeneration.current) { if(error instanceof ApiError && [401,403].includes(error.status)) clearSession(); else setQueryError(error instanceof Error ? error.message : String(error)); } throw error; }
    finally { if(generation === queryGeneration.current) setQueryBusy(false); }
  }  async function start(identity?: Identity, currentModule = module, resumeId?: string) {
    if (working.current) return;
    contextEpoch.current++;
    const startEpoch=contextEpoch.current;setPresentation(null);
    return await guarded(async () => {
      queryGeneration.current++; setQueryBusy(false); setQueryError('');
      if (identity && !simulation) throw new Error(t("正式 MES 必須沿用目前登入身分。"));
      const current = identity ? await request<Session>('/api/session/demo', { identity }) : session;
      if (!current) throw new Error(t("請先選擇作業身分。"));
      try {
        currentModule = (['report','schedule','mold'] as Module[]).find(item => hasSubmission(memoryKey(current.actor.id, item))) ?? currentModule;
        // 另一分頁尚未決的提交必須回到原對話，不能只切換模組而沿用點選的聊天。
        resumeId = pendingSubmission(memoryKey(current.actor.id, currentModule))?.conversation ?? resumeId;
      }
      catch { /* 禁用儲存仍可查詢；提交會在恢復標記寫入前阻擋。 */ }
      checkedActor.current = current.actor.id;
      if (session && session.actor.id !== current.actor.id) { setAudit([]); setFeedback(''); setFeedbackSent(false); setHelpOpen(false); setBudget(null); draftMemory.current.clear(); }
      setGuideSnapshot({}); setSheetContext(''); setSummaryOpen(false); setQueryData(null);
      setSession(current);
      setMode(current.mode);
      if (conversation && current.actor.id === session?.actor.id) draftMemory.current.set(conversation.id, draft);
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
        try { return { data: await request<Workspace>(`/api/workspace?${params}`) }; }
        catch (error) { if (error instanceof ObsoleteContext || error instanceof ApiError && [401,403].includes(error.status)) throw error; return { data: { records: [], catalogs: {} }, error: error instanceof Error ? error.message : t("初次資料查詢未完成") }; }
      };
      const [work, chat] = await Promise.all([
        loadWorkspace(), resumeId ? request<Conversation>(`/api/conversations/${resumeId}`) : (forceNew.current || stage==='modules' && entry.messages.length>0) ? request<Conversation>('/api/conversations',{module:currentModule,context:hostContext,locale:getLocale(),...(stage==='modules'&&entry.messages.length>0?{entry_id:entry.entryId}:{})}) : resumeConversation(current.actor.id, hostContext, currentModule),
      ]);
      const restoredGuide = await request<{ version: number; proposal?: Proposal | null; args?: Row; action?: string }>(`/api/conversations/${chat.id}/guide`);
      // 有引導版本時以引導為準，不能把歷史已完成卡帶入下一筆作業。
      const legacyProposal = restoredGuide.version === 0 ? [...(chat.messages ?? [])].reverse().find(message => message.proposal)?.proposal : null;
      const recovery = pendingSubmission(memoryKey(current.actor.id, currentModule));
      const lastProposal = recovery?.conversation === chat.id ? {id: recovery.proposal} : restoredGuide.proposal ?? (legacyProposal && ['pending', 'unknown'].includes(legacyProposal.status ?? 'pending') ? legacyProposal : null);
      let authoritative: Proposal | null = null;
      if (lastProposal) {
        const result = await request<{ proposal: Proposal }>(`/api/proposals/${lastProposal.id}`);
        authoritative = restoreSubmission(memoryKey(current.actor.id, currentModule), chat.id, result.proposal);
      }
      // 先恢復原聊天原句，再決定是否接續首次需求；恢復文字本身不授權重送。
      const textKey=draftStorageKey(current.actor.id,memoryKey(current.actor.id,currentModule),chat.id);
      const restoredText=readTextDraft(sessionStorage,textKey);
      if(restoredText)initialIntent.current=null;
      if(!conversation&&draftScope.current)saveTextDraft(sessionStorage,draftScope.current,'','unsent');
      setGuideSnapshot({...restoredGuide.args,action:restoredGuide.action});forceNew.current=false;rememberConversation(chat,current.actor.id);setHistoryRevision(v=>v+1);
      setModule(currentModule); setWorkspace(work.data); setConversation(chat); setMessages(chat.messages ?? []);
      setFilters(initialFilters); setContextFilter(initialContextFilter); setPageSize(20);
      try{acceptWorkspace(await restoreQueryWorkspace(request,chat,{...initialContextFilter,...initialFilters}));
      }catch(error){if(error instanceof ObsoleteContext||error instanceof ApiError&&[401,403].includes(error.status))throw error;setQueryError(error instanceof Error?error.message:String(error));}
      setSelected(null); setProposal(authoritative); setProposalStatus(authoritative?.status === 'pending' ? '' : authoritative?.status ?? ''); setIndependentApproval(false); setQueryData([...(chat.messages??[])].reverse().find(message=>message.data!==undefined)?.data??null); setDraft(value => restoredText?.text ?? draftMemory.current.get(chat.id) ?? (conversation ? '' : value)); setDraftDelivery(restoredText?.delivery??'unsent'); setTab('chat'); setStage('chat');
      setRecoveryTarget(null); setExternalRecovery(null);
      if (initialIntent.current !== null && modelConfigured === true && !authoritative && !recovery) {
        const text=initialIntent.current; initialIntent.current=null;
        beginMessage(chat.id,text,(chat.messages??[]).length);
        setDraftDelivery('unknown');
        const initialKey=draftStorageKey(current.actor.id,memoryKey(current.actor.id,currentModule),chat.id);
        saveTextDraft(sessionStorage,initialKey,text,'unknown');
        try {
        const reply=await request<Reply>(`/api/conversations/${chat.id}/messages`,{text});
        acceptMessage(chat.id,reply);if(reply.messages) setMessages(reply.messages);
        if(reply.proposal) {setProposal(reply.proposal);setProposalStatus(reply.proposal.status==='pending'?'':reply.proposal.status??'');}
        if(reply.data!==undefined){setQueryData(reply.data);if((reply.data as Workspace)?.query_context)acceptWorkspace(reply.data as Workspace);}
        setDraft('');
          setDraftDelivery('unsent');saveTextDraft(sessionStorage,initialKey,'','unsent');
        }catch(error){
          const delivery=error instanceof ApiError && error.status>=400 && error.status<500?'rejected':'unknown';
          if(startEpoch===contextEpoch.current){failMessage(chat.id,error);setDraftDelivery(delivery);saveTextDraft(sessionStorage,initialKey,text,delivery);}
          throw error;
        }

      }
      if (work.error) setError(t("初次資料查詢未完成：{0}。你仍可在對話補充設備與日期，或到「作業資料」縮小查詢範圍。", {0: work.error}));
    });
  }
  async function sendEntry(textOverride?:string,moduleChoice?:Module){
    const text=(textOverride??draft).trim();if(!text||busy||entry.busy||entry.blocked)return;
    if(!session){entryIdentity.current=true;setStage('identity');return;}
    let routed:Awaited<ReturnType<typeof entry.send>>;
    const ok=await guarded(async()=>{routed=await entry.send(text,contextFromUrl(),moduleChoice);if(routed&&!['unknown','processing','failed'].includes(routed.status)){setDraft('');setDraftDelivery('unsent');}});
    if(ok&&routed?.conversation_id&&routed.module){initialIntent.current=null;await start(undefined,routed.module,routed.conversation_id);}
  }
  async function checkEntry(){
    let result:Awaited<ReturnType<typeof entry.check>>;
    const ok=await guarded(async()=>{result=await entry.check();});
    if(ok&&result?.conversation_id&&result.module){initialIntent.current=null;await start(undefined,result.module,result.conversation_id);}
  }
  async function resumeEntry(){
    let original:Conversation|undefined;
    const ok=await guarded(async()=>{original=await request<Conversation>(`/api/conversations/${entry.receipt!.recovery_conversation_id}`);});
    if(ok&&original)await start(undefined,original.module,original.id);
  }
  async function chooseIdentity(identity:Identity){
    if(!entryIdentity.current){await start(identity);return;}
    const ok=await guarded(async()=>{const value=await request<Session>('/api/session/demo',{identity});setSession(value);setMode(value.mode);});
    if(ok){entryIdentity.current=false;setStage('modules');}
  }
  async function showBudget() {
    setUsageOpen(true);setUsageError('');setBudget(null);setUsageStats(null);
    try {const [value,stats]=await Promise.all([request<Row>('/api/budget'),request<Row>('/api/conversations/statistics')]);setBudget(value);setUsageStats(stats);}
    catch(e){setUsageError(e instanceof Error?e.message:String(e));}
  }
  useEffect(()=>{if(usageOpen)panelRef.current?.querySelector<HTMLElement>('.usage-panel button')?.focus();},[usageOpen]);
  function closeHistory() {setHistoryOpen(false);requestAnimationFrame(()=>historyTrigger.current?.focus());}
  async function prepareChatChange() {
    if(busy||historyBusy||pending||unresolved||recoveryTarget) throw new Error(t('請先完成、取消或查核原操作，再切換聊天。'));
    await guideRef.current?.flush();
    if(conversation)draftMemory.current.set(conversation.id,draft);
  }
  async function selectChat(entry:ChatEntry) {
    try {await prepareChatChange();initialIntent.current=null;const ok=await start(undefined,entry.module,entry.id);if(ok)closeHistory();}
    catch(e){setError(e instanceof Error?e.message:String(e));}
  }
  async function newChat() {
    try {await prepareChatChange();contextEpoch.current++;forceNew.current=true;initialIntent.current=null;setConversation(null);setMessages([]);setProposal(null);setProposalStatus('');setDraft('');entry.reset();setStage('modules');setSummaryOpen(false);setTab('chat');setHistoryOpen(false);setError('');}
    catch(e){setError(e instanceof Error?e.message:String(e));}
  }
  function historyChanged(entry:ChatEntry) {
    if(renderEpoch!==contextEpoch.current)return;
    setHistoryRevision(v=>v+1);
    if(entry.id!==conversation?.id)return;
    if(entry.is_deleted){forceNew.current=true;setConversation(null);setMessages([]);setProposal(null);setProposalStatus('');setDraft('');setStage('modules');}
    else setConversation(value=>value?.id===entry.id?{...value,...entry}:value);
  }
  function receive(reply: Reply) {
    if (renderEpoch !== contextEpoch.current) return;
    // 未決請求只接受原操作；其他分頁的新卡不能取代需要查核的識別。
    if (unresolved && reply.proposal && proposal && reply.proposal.id !== proposal.id) reply = { ...reply, proposal: null };
    if (reply.proposal && session && conversation) {
      reply = { ...reply, proposal: restoreSubmission(memoryKey(session.actor.id), conversation.id, reply.proposal) };
    }
    if (reply.messages) setMessages(reply.messages);
    if (reply.proposal) { setProposal(reply.proposal); setProposalStatus(reply.proposal.status === 'pending' ? '' : reply.proposal.status ?? ''); if(reply.proposal.id!==proposal?.id||reply.proposal.digest!==proposal?.digest)setIndependentApproval(false); }
    else if ('proposal' in reply && !unresolved) { setProposal(null); setProposalStatus(''); setIndependentApproval(false); }
    if (reply.data !== undefined){setQueryData(reply.data);if((reply.data as Workspace)?.query_context)acceptWorkspace(reply.data as Workspace);}
  }
  async function send(textOverride?: string) {
    const text = (textOverride ?? draft).trim(); if (!text || !conversation || chatReadOnly || busy || guideWorking || recoveryTarget || modelConfigured !== true) return;
    await guarded(async () => {
      beginMessage(conversation.id,text,messages.length);
      try {if(!unresolved&&!selectionActive)await guideRef.current?.flush();}catch(error){failMessage(conversation.id,error,false);throw error;}
      const replacing = pending;
      setDraftDelivery('unknown');
      if(session)saveTextDraft(sessionStorage,draftStorageKey(session.actor.id,memoryKey(session.actor.id),conversation.id),text,'unknown');
      try {
        const reply = await request<Reply>(`/api/conversations/${conversation.id}/messages`, { text, scope:selectionActive?'selection':'operation' });
        acceptMessage(conversation.id,reply);receive(reply); setDraft('');setDraftDelivery('unsent');
        if (replacing && (!reply.proposal || reply.proposal.id!==proposal?.id)) setNotice(reply.proposal ? t("已依補充需求取代前一張草稿，請核對新的確認卡。") : t("前一張草稿已停止確認。補齊資料後會建立新的確認卡。"));
      } catch(error) {
        if(renderEpoch===contextEpoch.current){failMessage(conversation.id,error);setDraftDelivery(error instanceof ApiError && error.status>=400 && error.status<500 ? 'rejected':'unknown');}
        throw error;
      }

    });
    inputRef.current?.focus();
  }
  async function applyConfirmation(result: ConfirmationResult) {
    if(renderEpoch!==contextEpoch.current)throw new ObsoleteContext();
    setProposal(result.proposal); setProposalStatus(result.status === 'pending' ? '' : result.status);
    setNotice(result.message); setIndependentApproval(false);
    if (result.status === 'succeeded') {
      try { await refreshData(); } catch { if(renderEpoch===contextEpoch.current) setError(t('作業已完成，清單更新失敗；請重新查詢。')); }
    }
    if (session && conversation && !confirmationView(result.status).canReconcile) restoreSubmission(memoryKey(session.actor.id), conversation.id, result.proposal);
  }
  async function confirm(approved: boolean) {
    if (!proposal || submitting.current || busy || guideBusy || !proposalView.canConfirm) return;
    if (approved && proposal.local_rejection) { setError(t('本次提交已拒絕，請返回修改後重新核對。')); return; }
    if (approved && !writesEnabled) { setError(t("正式寫入尚未啟用。可以查看預覽或取消草稿。")); return; }
    submitting.current = true;
    try { await guarded(async () => { if (!session || !conversation) return;
      try { await applyConfirmation(await resultInContext(requestContext, () => submitRecoverably(memoryKey(session.actor.id), conversation.id, proposal, approved, undefined, scopedRequest))); }
      catch (error) { if (renderEpoch !== contextEpoch.current) throw error; if (error instanceof SubmissionBlocked && error.marker) setRecoveryTarget(error.marker); const restored = restoreSubmission(memoryKey(session.actor.id), conversation.id, proposal, undefined, false); setProposal(restored); setProposalStatus(restored.status === 'pending' ? '' : restored.status ?? ''); throw error; }
    }); }
    finally { submitting.current = false; }
  }
  async function reconcile() {
    if (!proposal || busy || !unresolved) return;
    await guarded(async () => {
      if (!session || !conversation) return;
      const read=await request<{proposal:Proposal}>(`/api/proposals/${proposal.id}`);
      const restored=restoreSubmission(memoryKey(session.actor.id),conversation.id,read.proposal);
      if(restored.local_rejection && restored.status==='pending' || !confirmationView(restored.status??'pending').canReconcile && restored.status!=='pending') {
        await applyConfirmation({proposal:restored,status:restored.status??'pending',message:restored.local_rejection?t('本次提交已拒絕，請返回修改後重新核對。'):t('已查回原操作結果。')});
      } else await applyConfirmation(await resultInContext(requestContext, () => reconcileProposal(proposal,scopedRequest)));
    });
  }
  async function chooseRecord(record: Row) {
    if (draft.trim()) { setError(t('切換工單前，請先送出或清除尚未送出的文字。')); return; }
    if (lockedTarget) { setError(unresolved ? t("此操作結果待核對，請先查核執行結果。") : t("目前有待確認的草稿。請先確認或取消，再切換作業資料。")); return; }
    if(working.current)return;
    await guideRef.current?.flush();
    await guideRef.current?.selectTarget(record);
    setSelected(record);setTab('chat');setNotice(t("已帶入目前作業，請選擇操作。"));
  }
  async function showAudit() {
    panelTrigger.current = document.activeElement as HTMLElement;
    const generation=++queryGeneration.current;setQueryBusy(true);setQueryError('');setAudit([]);setTab('audit');
    try { const value=await request<{records:Row[]}>('/api/audit');if(generation===queryGeneration.current)setAudit(value.records); }
    catch(error){if(generation===queryGeneration.current){if(error instanceof ApiError && [401,403].includes(error.status))clearSession();else setQueryError(error instanceof Error?error.message:String(error));}}
    finally{if(generation===queryGeneration.current)setQueryBusy(false);}
  }  async function showHelp() { helpTrigger.current = document.activeElement as HTMLElement; setHelpOpen(v => !v); if (!budget) { try { setBudget(await request<Row>('/api/budget')); } catch { /* 用量服務失敗不影響回報問題。 */ } } }


  const [interfaceOpen,setInterfaceOpen]=useState(false);
  const [composingMode,setComposingMode]=useState(false);
  const [presentationBusy,setPresentationBusy]=useState(false);
  const interfaceFocus=useRef<OperationFocus|null>(null);
  const operationMode=useOperationMode(session?.actor.id,mode,conversation?.id??'entry',busy||presentationBusy||queryBusy||composingMode);
  return <MesAssistantProvider state={{history:historyProjection?.actor===session?.actor.id?historyProjection:undefined,conversationId: conversation?.id ?? null, messages:projectedMessages, draft, busy:busy||entry.busy,
    disabled: stage === 'chat' ? chatReadOnly || busy || guideWorking || Boolean(recoveryTarget) : busy||entry.busy||entry.blocked,
    sendDisabled: !draft.trim() || (stage === 'chat' && modelConfigured !== true),
    onSend: text => stage === 'chat' ? send(text) : sendEntry(text),
  }}><AssistantModal open={open} onOpenChange={value=>{if(value)setOpen(true);else minimize();}}>
    {!embedded && <main className="demo-page" aria-hidden={open && fullScreen ? true : undefined} inert={open && fullScreen ? true : undefined}>
      <header className="demo-nav"><Brand small/></header>
      <div className="demo-content"><h1>{simulation ? t("MES 作業測試") : t("MES 生產作業")}</h1><p>{t("排程、報工與模具上下模。")}</p><p className="muted">{simulation ? t("目前使用隔離模擬資料。") : mode ? t("沿用目前 MES 登入身分。") : t("正在確認作業環境。")}{t("點選右下角助理開始操作。")}</p><button className="secondary" onClick={() => { setOpen(true); }}>{t("開啟生產情報助理")}</button></div>
    </main>}
    {!embedded && (!open || !fullScreen) && <AssistantModalTrigger asChild><button ref={launcherRef} className="launcher" aria-label={open ? t("收合生產情報助理") : t("開啟生產情報助理")} title={t("生產情報助理")}>{open ? <ChevronDown size={20}/> : <Bot size={20}/>}<span>{t("生產情報助理")}</span></button></AssistantModalTrigger>}
    {<AssistantModalContent><section hidden={!open} inert={!open?true:undefined} data-embedded={embedded||undefined} ref={panelRef} style={floating.style} role="dialog" aria-modal={fullScreen || embedded || undefined} aria-labelledby="assistant-dialog-title" className={`assistant-panel ${expanded ? 'expanded' : ''}`} onCompositionStartCapture={()=>setComposingMode(true)} onCompositionEndCapture={()=>setComposingMode(false)} onBlurCapture={event=>{const remembered=rememberOperationFocus(event.target);if(remembered)interfaceFocus.current=remembered;}} onFocusCapture={event=>{const remembered=rememberOperationFocus(event.target);if(remembered)interfaceFocus.current=remembered;}} onKeyDown={keyDialog}>
      {!embedded&&!fullScreen&&<FloatingResize panel={panelRef} change={floating.change}/>}
      <AssistantHeader titleRef={titleRef} title={t('生產情報助理')}>
        <TooltipIconButton tooltip={t('聊天紀錄')} className="aui-modal-tool text-muted-foreground hover:text-foreground size-7 rounded-md p-0 header-history" aria-label={t('聊天紀錄')} title={t('聊天紀錄')} ref={historyTrigger as React.RefObject<HTMLButtonElement>} aria-pressed={historyVisible} onClick={toggleHistory}><History size={16}/></TooltipIconButton><TooltipIconButton hidden={historyVisible} tooltip={t('新聊天')} className="aui-modal-tool text-muted-foreground hover:text-foreground size-7 rounded-md p-0 header-new-chat" aria-label={t('新聊天')} title={t('新聊天')} disabled={busy||historyBusy||pending||unresolved||!!recoveryTarget} onClick={()=>void newChat()}><Plus size={16}/></TooltipIconButton>
        <TooltipIconButton tooltip={expanded ? t('縮小聊天室') : t('放大聊天室')} className="aui-modal-tool text-muted-foreground hover:text-foreground size-7 rounded-md p-0" title={expanded ? t('縮小聊天室') : t('放大聊天室')} aria-label={expanded ? t('縮小聊天室') : t('放大聊天室')} onClick={toggleExpanded}>{expanded ? <Minimize2 size={18}/> : <Maximize2 size={18}/>}</TooltipIconButton>
        <HeaderMenu onInterfaceSettings={()=>setInterfaceOpen(true)} onHistory={openHistoryScope} signedIn={!!session} locale={locale} theme={theme} localeBusy={localeBusy||busy} onLocale={value=>void changeLanguage(value)} onTheme={setTheme} onManage={(section,trigger)=>{managementTrigger.current=trigger;setManagement(section);setManagementGeneration(v=>v+1);setManagementOpen(true);}} onUsage={()=>void showBudget()} onMinimize={minimize}/>
        <TooltipIconButton tooltip={t('縮小助理')} className="aui-modal-tool text-muted-foreground hover:text-foreground size-7 rounded-md p-0" aria-label={t('縮小助理')} title={t('縮小助理（Esc）')} onClick={minimize}><X size={18}/></TooltipIconButton>
      </AssistantHeader>
      {(mode === null || !simulation && !session) && <div className="assistant-session-status" role="status">{mode === null ? t('檢查連線中') : t('登入已逾時，請重新登入 MES 後再使用')}</div>}
      <div className="assistant-body" ref={bodyRef} data-sidebar-dragging={sidebarDragging||undefined} style={{'--sidebar-width':`${sidebar.width}px`} as React.CSSProperties}>
      <ConversationHistory ref={historyController} visible={historyVisible} onProjection={setHistoryProjection} key={session?.actor.id||'signed-out'} actor={session?.actor.id} current={conversation} overlay={showHistoryOverlay} locked={pending||unresolved||!!recoveryTarget} busy={busy||guideWorking} refresh={historyRevision+messages.length} request={scopedRequest} close={collapseHistory} select={selectChat} create={newChat} beforeChange={async id=>{if(id===conversation?.id)await guideRef.current?.flush();}} changed={historyChanged} onWorkChange={setHistoryBusy} usage={()=>void showBudget()} budget={budget}/>
      <SidebarSplitter width={sidebar.width} preferred={sidebar.preferred} max={sidebar.max} visible={sidebar.wide&&historyVisible} preview={sidebar.preview} commit={sidebar.commit} collapse={collapseHistory} onDragging={setSidebarDragging}/>
      <div className="assistant-main" inert={showHistoryOverlay||usageOpen||managementOpen ? true : undefined}>

      {stage !== 'chat' ? <div className={`onboarding ${stage} ${stage==='modules'&&entry.messages.length?'entry-chat':''}`}><div className="onboarding-content">
        <div className="onboarding-top"><span className="step-label">{stage === 'modules' ? t("01 / 選擇作業") : t("02 / 確認身分")}</span>{stage === 'identity' && <button className="text-button" onClick={() => setStage('modules')} disabled={busy}><ArrowLeft size={16}/>{t("返回選擇")}</button>}</div>
        <div className="welcome-card"><h1 id="assistant-title">{stage === 'modules' ? t("今天想完成什麼？") : (entryIdentity.current ? (locale==='en'?'Choose your identity':locale==='th'?'เลือกบทบาทของคุณ':'選擇你的身分') : simulation ? t("開始{0}前，選擇你的身分", {0:t(active.short)}) : t("開始{0}前，確認登入身分", {0:t(active.short)}))}</h1><p className="welcome-description">{stage === 'modules' ? t("選擇一個入口，我會陪你確認資料，完成現場作業。") : t("身分決定可執行的功能；每次寫入都會留下操作紀錄。")}</p></div>
        {stage === 'modules' && <><div className="entry-transcript" aria-live="polite">{entry.messages.map((message,index)=><article key={index} className={`entry-message dual-enter ${message.role}`}><p>{message.content}</p></article>)}{entry.busy&&<RequestProgress stopped={waitingStopped}/>}</div>{entry.blocked&&!entry.busy&&<button className="secondary" onClick={()=>void checkEntry()}>{locale==='en'?'Check original message':locale==='th'?'ตรวจสอบข้อความเดิม':'查核原訊息'}</button>}{entry.receipt?.recovery_conversation_id&&<button className="primary" onClick={()=>void resumeEntry()}>{locale==='en'?'Continue original operation':locale==='th'?'กลับไปทำงานเดิม':'繼續原作業'}</button>}{entry.receipt?.error&&<p role="alert">{entry.receipt.error}</p>}<div className="entry-composer"><ConversationComposer id="entry-input" busy={entry.busy} onStop={()=>setWaitingStopped(true)} stopped={waitingStopped} value={entry.busy?'':draft} onChange={editDraft} disabled={busy||entry.busy||entry.blocked} sendDisabled={!draft.trim()} placeholder={t('輸入生產問題…')} onSend={()=>void sendEntry()}/></div></>}
        {stage === 'modules' ? <div className="entry-grid" hidden={entry.messages.length>0&&!(['clarify','unsupported','model_unavailable'].includes(entry.receipt?.status??''))}>{Object.entries(modules).map(([key, item]) => <button className="entry-card" key={key} disabled={busy || entry.blocked || entry.receipt?.status==='recovery_required' || mode === null || (!simulation && !session?.actor.roles.includes(key))} title={!simulation && !session?.actor.roles.includes(key) ? t("目前登入身分無此模組權限") : undefined} onClick={() => { if(entry.receipt?.status==='clarify'&&!draft.trim()){void sendEntry(`${locale==='en'?'Choose':locale==='th'?'เลือก':'選擇'} ${t(item.title)}`,key as Module);return;}entryIdentity.current=false; initialIntent.current = !conversation && draft.trim() && draftDelivery === 'unsent' ? draft : null; if (session?.actor.roles.includes(key)) void start(undefined, key as Module); else { setModule(key as Module); setStage('identity'); setError(''); } }}><item.icon className="entry-icon" size={16} aria-hidden="true"/><strong>{t(item.title)}</strong><p>{t(item.description)}</p></button>)}</div> : <>
          <div className="identity-notice"><ShieldCheck size={18}/><span>{simulation ? t("此處可切換模擬身分；正式 MES 沿用登入權限。") : t("沿用 MES 登入權限，請確認本次作業人員。")}</span></div>
          {session && <button className="session-button" disabled={busy || !session.actor.roles.includes(module)} onClick={() => void start()}><UserRound size={18}/><span>{t("沿用目前身分：")}{session.actor.name}{!session.actor.roles.includes(module) ? t("（此入口無權限）") : ''}</span><ArrowRight size={18}/></button>}
          {simulation && <div className="identity-grid">{identities.map(item => <button key={item.id} className="identity-card" disabled={busy || (!entryIdentity.current && !(item.id === 'supervisor' || item.id === ({ schedule: 'planner', report: 'operator', mold: 'technician' }[module])))} onClick={() => void chooseIdentity(item.id)}><UserRound size={21}/><span><strong>{t(item.title)}</strong><small>{t(item.description)}</small></span><ChevronRight size={17}/></button>)}</div>}
        </>}
        {mode !== null && !simulation && !session && <div className="identity-notice"><ShieldCheck size={18}/><span>{t("尚未取得可信的 MES 登入身分。請先在原 MES 登入，再重新開啟助理。")}</span><button className="text-button" disabled={busy} onClick={() => void guarded(async () => { const current = await request<Session>('/api/session'); setSession(current); setMode(current.mode); })}>{t("重新確認登入")}</button></div>}
        {error && <div className="error-banner" role="alert">{t(error)}</div>}{busy && !entry.busy && !messagePending && <div className="loading" role="status"><LoaderCircle className="spin" size={18}/>{t("正在準備作業資料…")}</div>}

        <div className="onboarding-footer"><span><MessageSquare size={16}/>{t("自然語言操作")}</span><span><CheckCheck size={16}/>{t("確認後寫入")}</span><span><History size={16}/>{t("完整作業紀錄")}</span></div>
      </div></div> : <>
        {chatReadOnly&&<p className="notice-banner" role="status">{t("封存聊天為唯讀，取消封存後可接續操作。")}</p>}<div className="workspace-bar"><button className="icon-button" aria-label={t("返回模組入口")} disabled={busy || lockedTarget} title={unresolved ? t("請先查核執行結果") : pending ? t("請先確認或取消草稿") : t("返回模組入口")} onClick={() => setStage('modules')}><ArrowLeft size={18}/></button><span className="module-badge"><ModuleIcon size={18}/></span><div><h1 id="assistant-title">{t(active.title)}</h1><p>{session?.actor.name} <span>·</span>{t("EPS 成型")}</p></div><nav className="module-switcher" aria-label={t("切換作業模組")}>{Object.entries(modules).map(([key, item]) => <button key={key} className="text-button" aria-current={module === key ? 'page' : undefined} disabled={busy || lockedTarget || !session?.actor.roles.includes(key)} onClick={() => { if (key !== module) void start(undefined, key as Module); }}><item.icon size={16}/>{t(item.short)}</button>)}</nav>{modelConfigured!==false&&<span className={`connection ${modelConfigured ? 'ready' : ''}`}><span/>{modelConfigured === true ? t("AI 已設定") : modelConfigured === false ? t("AI 尚未設定") : t("檢查連線中")}</span>}</div>

        {recoveryTarget && <div className="notice-banner" role="status"><span>{t('另一分頁的操作仍待核對，請先查看原操作。')}</span><button className="secondary" disabled={busy || guideWorking} onClick={()=>void recoverOriginal()}>{t('恢復並查核原操作')}</button><button className="secondary" disabled={busy} onClick={()=>void checkOriginal()}>{t('保留本頁，只查核原操作')}</button></div>}
        {externalRecovery && <details className="external-recovery"><summary>{t('原操作查核結果')}：{externalRecovery.proposal.local_rejection ? t('本次提交已拒絕，請返回修改後重新核對。') : confirmationView(externalRecovery.status).label}</summary><p>{externalRecovery.message}</p><ProposalBusinessSummary proposal={externalRecovery.proposal} workspace={workspace}/><p>{t('操作識別碼：')}<code>{externalRecovery.proposal.id}</code></p></details>}
        {returnChat && !unresolved && !pending && <button className="secondary" disabled={busy} onClick={()=>{const chat=returnChat;setReturnChat(null);void start(undefined,chat.module,chat.id);}}>{t('返回先前作業')}</button>}
        {error && <div className="error-banner" role="alert"><span>{t(error)}</span><button className="icon-button" aria-label={t("關閉錯誤訊息")} onClick={() => setError('')}><X size={17}/></button></div>}{notice && <div className="notice-banner" role="status"><Check size={17}/><span>{t(notice)}</span></div>}
        <div className={`desktop-workbench dual-flow ${operationMode.mode} ${queryData!==null&&!guideSnapshot.action&&!guideSnapshot._started&&!proposal?'chat-only':''} ${selectionActive&&selectionAI?'selection-ai-open':''} ${summaryOpen || tab !== 'chat' ? 'with-summary' : ''}`}><ThreadPrimitive.Root className="chat-layout" inert={helpOpen || tab!=='chat' ? true : undefined} aria-label={t("與助理對話")}><div className="pane-heading"><div className="context-tools"><button className="text-button" onClick={event => { panelTrigger.current = event.currentTarget; setTab(tab === 'data' ? 'chat' : 'data'); }}>{t("資料")}</button><button className="text-button" onClick={() => void showAudit()}>{t("紀錄")}</button></div></div><ThreadPrimitive.Viewport autoScroll={false} scrollToBottomOnRunStart={false} scrollToBottomOnInitialize={false} scrollToBottomOnThreadSwitch={false} className="conversation-scroll" ref={chatScroll.viewport} tabIndex={0} role="tabpanel" aria-label={t("對話作業")}><div ref={chatScroll.content} className="conversation-content">



          {projectedMessages.length === 0 && !guideSnapshot._started && <div className="chat-welcome"><h2>{t("說說你想完成的作業")}</h2><p>{t("直接描述需求，或使用下方操作卡；只需補齊缺少的資料。")}</p></div>}
          <ThreadMessages latestAssistantOnly={operationMode.mode==='step-wizard'&&!selectionAI&&Boolean(guideSnapshot.action||guideSnapshot._started||proposal)} onViewData={module==='report'?value=>void guarded(async()=>{if(value.query_context)await queryWorkspace(value.query_context.filters);setTab('data');}):undefined}/>
          {messagePending&&<RequestProgress stopped={waitingStopped}/>}


{queryData !== null && !selectionActive && !(module==='report'&&messages.some(message=>Array.isArray((message.data as Workspace)?.records))) && <div className="query-candidates">{module==='report'&&(queryData as Workspace)?.records?<ChatQueryResults workspace={queryData as Workspace} onAll={()=>setTab('data')}/>:<><DataView data={queryData}/><button className="text-button" onClick={()=>setTab('data')}>{t('更多查詢條件')}</button></>}</div>}
          {busy && !messagePending && <div className="loading" role="status"><LoaderCircle className="spin" size={18}/>{t("正在核對資料與處理作業…")}</div>}
</div>
        </ThreadPrimitive.Viewport>{chatScroll.away && <button className="latest-message icon-button" aria-label={t("查看最新內容")} title={t("查看最新內容")} onClick={chatScroll.latest}><ArrowDown size={18}/></button>}<div className="composer-area">{selectionActive&&selectionAI&&<button type="button" className="text-button" onClick={closeSelectionAI}>{t('返回選取資料')}</button>}{draft && !messagePending && draftDelivery!=='unsent' && <p role="status">{t(draftDelivery==='unknown'?'原句已恢復，先前送達結果未知；系統不會自動重送。':'原句已恢復，先前請求已拒絕；尚未再次送出。')}</p>}{modelConfigured === false && <div className="model-notice"><CircleHelp size={17}/><span>{t("AI 尚未設定，可用下方操作卡完成作業。")}</span></div>}{draft && modelConfigured === false && <button className="text-button" onClick={() => {setDraft('');initialIntent.current=null;inputRef.current?.focus();}}>{t('清除文字，繼續人工操作')}</button>}<ConversationComposer compact={operationMode.mode==='step-wizard'} id="chat-input" inputRef={inputRef} value={draft} onChange={editDraft} onSend={()=>void send()} busy={!!messagePending} onStop={()=>setWaitingStopped(true)} stopped={waitingStopped} disabled={chatReadOnly || busy || guideWorking || Boolean(recoveryTarget)} sendDisabled={!draft.trim() || modelConfigured !== true} placeholder={unresolved ? t('此操作結果待核對，請先按確認卡的「查核執行結果」') : pending ? t('可直接補充修改，例如：良品改成 25，請重新確認') : t('描述你的{0}需求，例如：{1}', {0:t(active.short),1:t(active.prompts[0])})} hint={t('確認後才會寫入')}/><div className="composer-footnote"><span>{t("Enter 送出 · Shift + Enter 換行")}</span></div></div></ThreadPrimitive.Root><section className="operation-primary" inert={tab!=='chat'?true:undefined} aria-label={t("本次作業")}>          {chatReadOnly&&<section className="guided-flow"><h2>{t("本次作業摘要")}</h2><Fields value={{...Object.fromEntries(Object.entries(guideSnapshot).filter(([key])=>!key.startsWith("_")&&key!=="draft_save_state")),action:t(actionNames[String(guideSnapshot.action)]??String(guideSnapshot.action??""))}}/></section>}{conversation && !chatReadOnly && <GuidedFlow reviewActionsExternal onQuery={queryWorkspace} onSelectionChange={setSelectionActive} onAskSelection={askSelection} presentation={operationMode.mode} onPresentationBusyChange={setPresentationBusy} apiRequest={scopedRequest} key={conversation.id} ref={guideRef} onBusyChange={setGuideBusy} onWorkChange={setGuideWorking} onContextChange={setSheetContext} onSnapshot={setGuideSnapshot} onAccessDenied={() => {if(renderEpoch===contextEpoch.current) clearSession();}} beforeTargetChange={() => { if (!draft.trim()) return true; setError(t('切換工單前，請先送出或清除尚未送出的文字。')); return false; }} conversation={conversation} module={module} workspace={workspace} selected={selected} signal={messages.length} proposal={proposal} status={proposalStatus} disabled={busy || unresolved || Boolean(recoveryTarget)} date={simulation?null:businessDate} onReply={receive} onAudit={() => void showAudit()} onHome={() => { if (!lockedTarget) setStage('modules'); }}/>}          {proposal && proposalStatus !== 'superseded' && <section hidden={pending&&guideSnapshot._view_step!=='review'} className={`proposal ${independent ? 'important' : ''}`} aria-label={t("操作確認卡")}><div className="proposal-heading"><span className="proposal-icon"><ShieldCheck size={21}/></span><div><small>{pending ? t("待你確認 · 尚未寫入") : t("作業處理結果")}</small><h2>{t(actionNames[proposal.action] ?? proposal.action)}</h2></div>{(expired||proposalStatus)&&<span className="proposal-state">{expired ? t("已過期") : proposalView.label}</span>}</div>
            <ProposalBusinessSummary proposal={proposal} workspace={workspace}/>
            {proposal.local_rejection && <p role="alert">{t('本次提交已拒絕，請返回修改後重新核對。')}</p>}
            <p className="business-note" hidden>{t("MES 時間")}{proposalTimezone}{t("；未指定時區的作業時間依 MES 顯示時間解讀。")}</p>
            {!writesEnabled && <div className="write-disabled" role="status"><ShieldCheck size={18}/><div><strong>{t("正式寫入尚未啟用")}</strong><p>{t("目前可查詢及預覽異動，尚不能執行寫入。你仍可取消或修改這筆草稿。")}</p></div></div>}
            {(timePolicy || newIdPolicy) && <details className="preview-policies"><summary>{t("預覽說明")}</summary>{timePolicy && <p><Clock3 size={15}/>{t(timePolicy)}</p>}{newIdPolicy && <p><CircleHelp size={15}/>{t(newIdPolicy)}</p>}</details>}
            {pending && !recoveryTarget && <div className="proposal-confirmation"><div className="expiry"><Clock3 size={15}/>{expired ? t("確認已過期，請重新建立草稿。") : t("確認期限：{0}", {0: Number.isFinite(expires) ? formatMesTime(expires, proposalTimezone) : proposal.expires_at})}</div>{independent && <label className="independent-confirm"><input type="checkbox" checked={independentApproval} onChange={e => setIndependentApproval(e.target.checked)} disabled={busy || guideBusy || expired || !writesEnabled}/><span>{t("我已核對這筆「")}{t(actionNames[proposal.action] ?? proposal.action)}{t("」的對象及影響，確認要單獨執行。")}</span></label>}<div className="proposal-actions">{!chatReadOnly&&<button className="secondary proposal-back" disabled={busy||guideBusy} onClick={()=>guideRef.current?.backToEdit()}><ArrowLeft size={16}/>{t("返回修改")}</button>}<button className="secondary" onClick={() => void confirm(false)} disabled={busy || guideBusy}>{t("取消草稿")}</button><button className="primary" disabled={busy || guideBusy || expired || !writesEnabled || proposal.local_rejection || (independent && !independentApproval)} onClick={() => void confirm(true)}><Check size={17}/>{independent ? t("確認這筆操作") : t("同意並寫入")}</button></div></div>}
            <details className="proposal-details technical-details"><summary>{t("查看資料異動明細")}<span className="count">{proposal.changes.length}{t("項")}</span></summary><div className="diff-list">{proposal.changes.map((change, i) => <div className="diff" key={i}><div className="diff-label"><strong>{label(change.field)}</strong><small>{change.table} · {display(change.key)}</small></div><div className="diff-values"><span className="before">{display(change.before)}</span><ArrowRight size={16}/><span className="after">{display(change.after)}</span></div></div>)}</div><details className="proposal-details"><summary>{t("檢視完整操作參數")}</summary><Fields value={proposal.args}/></details></details>
            <details className="technical-details" open={unresolved}><summary>{t("技術資料")}</summary><p className="operation-id">{t("操作識別碼：")}<code>{proposal.id}</code></p></details>
            {unresolved && <div className="write-disabled" role="status"><CircleHelp size={18}/><div><strong>{t("結果待核對")}</strong><p>{t("請保留操作識別碼。查核只讀取執行紀錄，不會再次送出報工或其他業務操作。")}</p><button className="secondary" disabled={busy} onClick={() => void reconcile()}><RefreshCw size={16}/>{t("查核執行結果")}</button></div></div>}
          </section>}</section><aside className="operation-pane" hidden={tab === 'chat'} inert={tab==='chat'?true:undefined} aria-label={t("本次作業")}><div className="pane-heading"><h2>{t("本次作業")}</h2><button className="icon-button" aria-label={t("收起附屬面板")} onClick={() => {setSummaryOpen(false);setTab('chat');}}><X size={18}/></button></div>{queryBusy && <p role="status">{t("正在讀取資料…")}</p>}{queryError && <p role="alert">{queryError}</p>}{!(proposal && proposalStatus !== 'superseded') && <div className="sheet-context" aria-label={t("目前作業資料")}>{sheetContext || t("尚未選擇工單")}</div>}        <div className="tabs" role="tablist" aria-label={t("作業檢視")}><button role="tab" aria-selected={tab === 'chat'} onClick={() => setTab('chat')}><MessageSquare size={16}/>{t("作業")}</button><button role="tab" aria-selected={tab === 'data'} onClick={() => setTab('data')}><ClipboardList size={16}/>{t("資料")}<span className="count">{workspace.records.length}</span></button><button role="tab" aria-selected={tab === 'audit'} disabled={busy} onClick={() => void showAudit()}><History size={16}/>{t("紀錄")}</button></div>{tab === 'data' ? <div className="workspace-scroll" role="tabpanel" aria-label={t("作業資料")}><div className="section-heading"><div><h2>{t("目前作業資料")}</h2><p>{t("選擇一筆資料，帶入目前作業。")}</p></div><button className="secondary" disabled={busy} onClick={() => void refreshData().catch(() => {})}><RefreshCw size={16}/>{t("重新整理")}</button></div>{module === 'report' && <p className="data-note">{t("人工報工與 IoT 推算數量各自呈現；未有 IoT 資料不代表產量為零。")}</p>}<DataFilters filters={filters} setFilters={setFilters} pageSize={pageSize} setPageSize={setPageSize} workspace={workspace} busy={busy||queryBusy} load={page => void refreshData(page).catch(() => {})}/><WorkspaceChoices workspace={workspace} disabled={busy||queryBusy||lockedTarget} apply={record=>void chooseRecord(record)}/>{!workspace.records.length && <div className="empty-state"><ClipboardList size={28}/><h3>{t("尚無作業資料")}</h3><p>{t("請重新整理，或從對話建立需要的作業。")}</p></div>}<details className="catalogs"><summary>{t("查看設備、工單與模具選項")}</summary><DataView data={workspace.catalogs} title={t("作業選項")}/></details></div> : tab === 'audit' ? <div className="workspace-scroll" role="tabpanel" aria-label={t("操作紀錄")}><div className="section-heading"><div><h2>{t("每次變更，都有紀錄。")}</h2><p>{t("核對操作時間、執行人員與資料前後差異。")}</p></div><button className="secondary" disabled={busy} onClick={() => void showAudit()}><RefreshCw size={16}/>{t("重新整理")}</button></div><DataView data={audit} title={t("操作紀錄")}/></div> : null}</aside></div>
      </>}
      {interfaceOpen&&session&&<InterfaceSettings mode={operationMode.chosen} choose={operationMode.choose} deferred={operationMode.deferred} close={()=>setInterfaceOpen(false)} returnFocus={()=>operationFocusTarget(panelRef.current,interfaceFocus.current)}/>}
      {helpOpen && session && <aside className="help-panel" aria-label={t("回報問題與用量")}><div className="section-heading"><div><h2>{t("讓作業經驗留下來")}</h2><p>{t("錯誤回報先送審核，再經候選案例回歸後發布，不會自動改變卡控。")}</p></div><button className="icon-button" aria-label={t("關閉問題回報")} onClick={() => setHelpOpen(false)}><X size={18}/></button></div><form onSubmit={e => { e.preventDefault(); void guarded(async () => { await request('/api/feedback', { module, message: feedback, ...(conversation ? { conversation_id: conversation.id } : {}) }); setFeedback(''); setFeedbackSent(true); }); }}><label className="form-field">{t("遇到什麼問題？")}<textarea rows={3} required value={feedback} onChange={e => { setFeedback(e.target.value); setFeedbackSent(false); }} placeholder={t("描述你預期的結果、實際發生的情況，或需要補充的操作知識。")} maxLength={4000}/></label><button className="primary" disabled={busy || !feedback.trim()} type="submit">{t("送出問題回報")}</button>{feedbackSent && <p className="feedback-success" role="status">{t("已收到，將由主管審查後處理。")}</p>}</form><FeedbackReview apiRequest={scopedRequest} key={session.actor.id} session={session} refreshToken={feedbackSent} onAccessDenied={() => {if(renderEpoch===contextEpoch.current) clearSession();}}/><details><summary>{t("來源版本與 API 用量")}</summary><p className="muted">{t("作業盤點版本：979d2c6 · 2026-10-30")}</p>{budget ? <Fields value={budget}/> : <p className="muted">{t("目前無法取得用量資訊。")}</p>}</details></aside>}
      <footer className="assistant-footer" hidden><span>WEYU AI</span><span>{t("MES 時間")}{proposalTimezone}</span>{stage === 'chat' ? <button className="footer-help" onClick={() => void showHelp()}><CircleHelp size={13}/>{t("回報問題與來源")}</button> : <span>{t("高塑 · 生產作業助理")}</span>}</footer>
      <p className="assistant-copyright">Corp. 2026 WeYu Technology Co., Ltd. All Rights Reserved.</p>
      </div></div>
      {management&&session&&<PanelLoadBoundary open={managementOpen} key={`${session.actor.id}:${management}:${managementGeneration}`} close={closeManagement}><React.Suspense fallback={<p role="status">{t("正在讀取資料…")}</p>}><ManagementPanel key={`${session.actor.id}:${management}:${managementGeneration}`} open={managementOpen} returnFocus={()=>managementTrigger.current} section={management} request={scopedRequest} close={closeManagement} roles={session.actor.roles} locked={busy||pending||unresolved||!!recoveryTarget}/></React.Suspense></PanelLoadBoundary> }
      {session&&<OperationDialog open={usageOpen} title={t('使用統計')} close={()=>setUsageOpen(false)}><div className="usage-content"><p>{t('統計只包含目前登入者可存取的聊天與操作。模型費用沿用既有累計帳本。')}</p>{usageError?<p role="alert">{usageError}</p>:!usageStats?<p role="status">{t('正在讀取資料…')}</p>:<>{budget&&<BudgetSummary value={budget}/>}<h3>{t('使用統計')}</h3><Fields value={usageStats}/></>}</div></OperationDialog>}
    </section></AssistantModalContent>}
  </AssistantModal></MesAssistantProvider>;
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
    <button type="submit" className="secondary" disabled={busy}><RefreshCw className={busy?'spin':undefined} size={16}/>{t("套用查詢")}</button>
  </form><div className="pagination"><span>{t("共 {0} 筆 · 第 {1} / {2} 頁", {0: total, 1: page, 2: Math.max(1, Math.ceil(total / size))})}</span><button className="icon-button" aria-label={t("上一頁")} disabled={busy || page <= 1} onClick={() => load(page - 1)}><ArrowLeft size={16}/></button><button className="icon-button" aria-label={t("下一頁")} disabled={busy || page * size >= total} onClick={() => load(page + 1)}><ArrowRight size={16}/></button></div></>;
}

if (typeof document !== 'undefined' && document.getElementById('mes-ai-chat-root')) createRoot(document.getElementById('mes-ai-chat-root')!).render(<React.StrictMode><App/></React.StrictMode>);





