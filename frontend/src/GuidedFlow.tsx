import {RecordChoices} from './RecordChoices';
import {queryCriteria} from './query-context';
import {CandidateSelect} from './CandidateSelect';
import React, { useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ClipboardList, RefreshCw } from 'lucide-react';
import { api, ApiError, display, label, type Conversation, type Module, type Proposal, type Reply, type Row, type Workspace } from './api';
import { Fields } from './DataView';
import { useLocale } from './i18n';
import { reportDraft, canChooseRecord, mountCandidates } from './guided-records';
import './guided.css';
import type {OperationMode} from './operation-mode';

export interface Guide { version: number; action: string; intent?: 'create' | 'update' | null; args: Row; step: string; missing: string[]; ready: boolean; proposal?: Proposal | null }
export interface GuideHandle { backToEdit: () => void; flush: () => Promise<void>; focusField: (key: string) => void; beginReport: (record: Row) => Promise<void>; selectTarget: (record:Row) => Promise<void> }
const SID = 'ZZ_KAOSU_PROD_SCHEDULE_SID';
const EID = 'WIP_OPI_WDOEACICO_HIST_SID';
const RID = 'WIP_OPI_WDOEACICOOUTPUT_HIST_SID';
const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : [];
const string = (value: unknown) => value == null ? '' : String(value);
const numericKeys=new Set(['ok','quantity','cavities','cycle_seconds','target_shots','priority']);
const normalized=(value:unknown,key=''):unknown=>Array.isArray(value)?value.map(v=>normalized(v)):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,normalized(v,k)])):numericKeys.has(key)&&typeof value==='string'&&/^-?\d+$/.test(value)&&Number.isSafeInteger(Number(value))?Number(value):value;
const comparable = (raw: Row) => {const value=normalized(raw) as Row;return JSON.stringify(Object.fromEntries(Object.entries(value).filter(([,v]) => v !== null && v !== '').sort(([a],[b]) => a.localeCompare(b))));};
const fieldId = (key: string) => 'guide-' + key.replace(/[.\[\]]+/g, '-').replace(/-$/, '');
const steps = ['action', 'target', 'details', 'review', 'result'];

/** 步驟與自然語言共用後端草稿；此元件只準備確認卡，不執行業務寫入。 */
export function GuidedFlow({ presentation='chat-sheet', reviewActionsExternal=false, onQuery, onSelectionChange, onAskSelection, onPresentationBusyChange, apiRequest = api, ref, onBusyChange, onWorkChange, onContextChange, onSnapshot, onAccessDenied, beforeTargetChange, conversation, module, workspace, selected, signal, proposal, status, disabled, date, onReply, onAudit, onHome }: {
  onQuery?:(filters:Row)=>Promise<Workspace>;onSelectionChange?:(value:boolean)=>void;onAskSelection?:()=>void;
  presentation?:OperationMode;onPresentationBusyChange?:(busy:boolean)=>void;
  reviewActionsExternal?:boolean;
  apiRequest?: typeof api;
  onAccessDenied?: () => void;
  beforeTargetChange?: () => boolean;
  onSnapshot?: (value: Row) => void;
  ref?: React.Ref<GuideHandle>; onBusyChange?: (busy: boolean) => void; onWorkChange?: (busy: boolean) => void; onContextChange?: (context: string) => void;
  conversation: Conversation; module: Module; workspace: Workspace; selected: Row | null; signal: number;
  proposal: Proposal | null; status: string; disabled: boolean; date: string | null;
  onReply: (reply: Reply) => void; onAudit: () => void; onHome: () => void;
}) {
  const alive=useRef(true);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  async function request<T>(path:string,body?:unknown):Promise<T> {
    const value=await apiRequest<T>(path,body);
    if(!alive.current)throw new Error('作業情境已切換');
    return value;
  }
  const { locale } = useLocale();
  const L = (zh: string, en: string, th: string) => locale === 'en' ? en : locale === 'th' ? th : zh;
  function missingText(key: string) {
    if (key === 'ok') return L('人工良品','Good units','ชิ้นงานดี');
    if (key === 'defects') return L('請回答有無不良品','Specify whether there are defects','ระบุว่ามีของเสียหรือไม่');
    if (['execution_id','schedule_id','report_id'].includes(key)) return L('選擇作業對象','Choose the target','เลือกเป้าหมายงาน');
    const defect=/^defects\[(\d+)\]\.(code|quantity)$/.exec(key);
    if (defect) return `${defect[2] === 'code' ? L('不良原因','Defect reason','สาเหตุของเสีย') : L('不良數量','Defect quantity','จำนวนชิ้นงานเสีย')} ${Number(defect[1])+1}`;
    const detail = /^details\[(\d+)\]\.(part_no|wo|cavities|mold_detail_id)$/.exec(key);
    if (detail) return `${L('工單與模穴','Order and cavities','ใบสั่งผลิตและจำนวนโพรง')} ${Number(detail[1])+1} · ${detail[2] === 'cavities' ? L('模穴數','Cavities','จำนวนโพรง') : detail[2] === 'wo' ? L('工單','Work order','ใบสั่งผลิต') : L('模具明細／品號','Mold detail / Part','รายละเอียดแม่พิมพ์ / รหัสชิ้นงาน')}`;
    return label(key);
  }
  const [guide, setGuide] = useState<Guide | null>(null);
  const [args, setArgs] = useState<Row>({});
  const latestArgs = useRef(args);
  const serverArgs = useRef<Row>({});
  const serverGuide = useRef<Guide | null>(null);
  const obsoleteValidation = useRef(new WeakSet<object>());
  useEffect(() => { latestArgs.current = args; }, [args]);
  const [step, setStep] = useState('action');
  const [action, setAction] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [saveState, setSaveStateValue] = useState<'saved'|'saving'|'failed'|'conflict'|'invalid'>('saved');
  const saveStateRef = useRef(saveState);
  const setSaveState = (value: typeof saveState) => { saveStateRef.current = value; setSaveStateValue(value); };
  useEffect(() => { if (saveStateRef.current === 'invalid') { setSaveState('saved'); setError(''); } }, [args]);
  const [conflict, setConflict] = useState<Guide | null>(null);
  const readGeneration = useRef(0);
  const editorRef = useRef<HTMLElement>(null);
  const focusedStep = useRef('action');
  useEffect(() => {
    const enteredDetails = step === 'details' && focusedStep.current !== step;
    focusedStep.current = step;
    if (error) editorRef.current?.querySelector<HTMLElement>('[aria-invalid="true"], :invalid')?.focus();
    else if (enteredDetails) editorRef.current?.querySelector<HTMLElement>('input, select')?.focus();
  }, [step, error]);
  const [records, setRecords] = useState<Row[]>(workspace.records);
  const [catalogs, setCatalogs] = useState<Row>(workspace.catalogs);
  const [filters, setFilters] = useState({ equipment: '', date: date ?? '', wo: '', history: 'all', search: '', fac: '', sort: '' });
  const [endDate, setEndDate] = useState('');
  const [total, setTotal] = useState(workspace.total ?? workspace.records.length);
  const [page, setPage] = useState(1);
  const pageSize=workspace.page_size??20;
  const [target, setTarget] = useState<Row | null>(selected);
  const [query, setQuery] = useState(false);
  const [loadedQuery, setLoadedQuery] = useState(false);
  const [newSchedule, setNewSchedule] = useState(true);
  const [defectChoice, setDefectChoice] = useState<'none' | 'some' | ''>('');
  const [picker,setPicker]=useState(false);
  const [candidate,setCandidate]=useState<Row|null>(null);
  const [candidateBusy,setCandidateBusy]=useState(false);
  const [selectionNotice,setSelectionNotice]=useState('');
  const [pendingTarget, setPendingTarget] = useState<Row | null>(null);
  const [reportCandidate,setReportCandidate]=useState<Row|null>(null);
  const candidateCriteria=useRef('');
  const [retainTarget, setRetainTarget] = useState(false);
  useEffect(()=>{if(pendingTarget)editorRef.current?.querySelector<HTMLElement>('.report-record-picker button')?.focus();else if(picker)editorRef.current?.querySelector<HTMLElement>('.guide-body input')?.focus();},[pendingTarget,picker]);
  const versionRef = useRef(0);
  const queueRef = useRef(Promise.resolve());
  const locked = disabled || busy || ['unknown'].includes(status);
  const dirty = Boolean(guide && ['details','target'].includes(step) && action && comparable(args) !== comparable(guide.args));
  useEffect(() => { onSnapshot?.({ ...args, action, _view_step:step, _started:step!=='action' || query, _stage_label:status==='unknown'?L('結果待核對','Verify result','ตรวจสอบผลลัพธ์'):status==='succeeded'?L('已完成','Completed','เสร็จแล้ว'):status==='cancelled'?L('已取消','Cancelled','ยกเลิกแล้ว'):[L('選作業','Choose task','เลือกงาน'),L('選擇對象','Choose target','เลือกเป้าหมาย'),L('填寫資料','Enter details','กรอกข้อมูล'),L('核對與確認','Review and confirm','ตรวจสอบและยืนยัน'),L('查看結果','View result','ดูผลลัพธ์')][Math.max(0,steps.indexOf(step))], _missing:(guide?.missing??[]).map(key=>({key,text:missingText(key)})), draft_save_state: saveState === 'saving' ? L('正在儲存草稿…','Saving draft…','กำลังบันทึกฉบับร่าง…') : saveState === 'invalid' ? L('資料需修正，輸入仍保留','Correct the details; input retained','โปรดแก้ไขข้อมูล เก็บข้อมูลที่กรอกไว้แล้ว') : saveState === 'failed' || saveState === 'conflict' ? L('儲存失敗','Save failed','บันทึกไม่สำเร็จ') : dirty ? L('尚未同步','Not synced','ยังไม่ซิงค์') : L('已保存','Saved','บันทึกแล้ว') }); }, [args, action, saveState, dirty, locale, onSnapshot, guide, step, query, status]);
  useEffect(()=>{onPresentationBusyChange?.(busy||candidateBusy||saveState==='saving'||!guide&&!error);},[busy,candidateBusy,saveState,guide,error,onPresentationBusyChange]);
  useEffect(() => { onBusyChange?.(busy || dirty || saveState === 'saving' || (!guide && !error)); }, [busy, dirty, saveState, guide, error, onBusyChange]);
  useEffect(() => () => { onWorkChange?.(false); }, [onWorkChange]);
  useEffect(() => () => { onBusyChange?.(false); }, [onBusyChange]);
  useImperativeHandle(ref, () => ({ backToEdit: () => {if(!locked)setStep(hasEditableFields(action)?'details':'target');}, selectTarget: async record=>{if(locked)return;await work(async()=>{if(action){await applyTarget(record,action);}else{setTarget(record);setRetainTarget(true);setPicker(false);}});}, focusField: key => { const field=editorRef.current?.querySelector<HTMLElement>(`#${fieldId(key.replace(/^(details\[\d+\])\.part_no$/, '$1.mold_detail_id'))}`); (field ?? editorRef.current?.querySelector<HTMLElement>('input, select, button'))?.focus(); }, beginReport: async record => {
    if (locked || beforeTargetChange && !beforeTargetChange()) return;
    await work(async () => {
      await save('target', {execution_id: null, report_id: null, schedule_id: null}, 'report.add');
      await save('details', { execution_id: record[EID] }, 'report.add');
    });
  }, flush: async () => {
    if (busy) throw new Error(L('作業單正在處理，請稍候。','The operation sheet is busy. Please wait.','ใบงานกำลังดำเนินการ โปรดรอสักครู่'));
    if (!guide) throw new Error(L('請先重新載入作業單。','Reload the operation sheet first.','โปรดโหลดใบงานใหม่ก่อน'));
    if (saveState === 'failed' || saveState === 'conflict') throw new Error(L('請先核對儲存失敗的內容。','Review the save failure first.','โปรดตรวจสอบข้อผิดพลาดการบันทึกก่อน'));
    await queueRef.current;
    if (['failed','conflict'].includes(saveStateRef.current)) throw new Error(L('請先核對儲存失敗的內容。','Review the save failure first.','โปรดตรวจสอบข้อผิดพลาดการบันทึกก่อน'));
    if (['details','target'].includes(step) && action && comparable(latestArgs.current) !== comparable(serverArgs.current)) await save('details', latestArgs.current, action, true);
  } }));
  const actionName = (value: string) => ({
    'query': L('查詢資料', 'Find records', 'ค้นหาข้อมูล'),
    'schedule.new': L('新增排程', 'New schedule', 'เพิ่มแผนการผลิต'),
    'schedule.save': L('修改排程', 'Edit schedule', 'แก้ไขแผนการผลิต'),
    'report.add': L('新增報工', 'Record production', 'บันทึกผลผลิต'),
    'report.update': L('修改報工', 'Edit production record', 'แก้ไขผลผลิต'),
    'report.delete': L('刪除報工', 'Delete production record', 'ลบผลผลิต'),
    'report.cavities': L('修改模穴', 'Change cavities', 'เปลี่ยนจำนวนโพรงแม่พิมพ์'),
    'report.complete': L('整張排程完工', 'Complete schedule', 'จบแผนการผลิต'),
    'mold.mount_start': L('開始上模', 'Start mounting', 'เริ่มติดตั้งแม่พิมพ์'),
    'mold.mount_finish': L('完成上模', 'Finish mounting', 'ติดตั้งแม่พิมพ์เสร็จ'),
    'mold.unmount_start': L('開始下模', 'Start removal', 'เริ่มถอดแม่พิมพ์'),
    'mold.unmount_finish': L('完成下模', 'Finish removal', 'ถอดแม่พิมพ์เสร็จ'),
    'mold.clear': L('清除換模紀錄', 'Clear mold history', 'ล้างประวัติการเปลี่ยนแม่พิมพ์'),
  }[value] ?? value);
  const title = (row: Row) => [row.EQP_NO, row.WO ?? row.WO_NO, row.TOL_NO ?? row.MOLD_NO,
    row.SCHEDULE_START_TIME ?? row.REAL_CHECK_IN_TIME ?? row.CHECK_IN_TIME ?? row.CREATE_TIME ?? row.SHIFT_DAY,
    row[EID] ? row.COMPLETED === 'Y' ? L('已完工','Completed','เสร็จแล้ว') : row.ZZ_MODLE_UPLOAD_END ? L('生產中','In production','กำลังผลิต') : L('待上模','Awaiting mounting','รอติดตั้งแม่พิมพ์') : null].filter(Boolean).join(' · ');
  const catalog = (key: string) => rows(catalogs[key]);
  const partDescription = (row:Row) => [row.PART_NO,row.PART_SPEC ?? catalog('parts').find(part=>part.PART_NO===row.PART_NO)?.PART_SPEC].filter(Boolean).join(' · ');
  const draftOrders=rows(args.details).map(row=>string(row.wo)).filter(Boolean).join(' · ');
  const contextTitle = target ? title(target) : [args.equipment, args.mold_no].filter(Boolean).join(' · ') || L('尚未選擇工單','No order selected','ยังไม่ได้เลือกใบสั่งผลิต');
  useEffect(() => { onContextChange?.(contextTitle); }, [contextTitle, onContextChange]);
  const reportRows = rows(target?.REPORTS);
  const mold = catalog('molds').find(m => m.TOL_NO === args.mold_no);
  const moldDetails = rows(mold?.DETAILS);
  const details = rows(args.details);
  const defects = rows(args.defects);
  const hasTarget = query || (action === 'schedule.save' && newSchedule) || Boolean(args.execution_id || args.report_id || args.schedule_id);
  const choices: Row[] = module === 'mold' && !query && action === 'mold.mount_start'
    ? mountCandidates(records)
    : records;

  function adopt(value: Guide) {
    serverGuide.current = value;
    versionRef.current = value.version;
    serverArgs.current = value.args ?? {};
    setGuide(value); setArgs(value.args ?? {}); setStep(value.step==='details'&&value.action&&!(value.action==='schedule.save'&&value.intent==='create')&&!value.args?.execution_id&&!value.args?.report_id&&!value.args?.schedule_id?'target':value.step || 'action'); setAction(value.action || '');
    setNewSchedule(value.intent === 'create' || (value.intent == null && value.step !== 'target' && !value.args?.schedule_id));
    setQuery(!value.action && value.step !== 'action');
    setDefectChoice(Array.isArray(value.args?.defects) ? value.args.defects.length ? 'some' : 'none' : '');
    if (value.proposal && (!proposal || proposal.id !== value.proposal.id || (status || proposal.status) !== value.proposal.status)) onReply({ proposal: value.proposal });
    else if (!value.proposal && proposal && status !== 'unknown') onReply({ proposal: null });
  }
  useEffect(() => {
    if (((disabled || busy || dirty || saveState === 'saving') && guide) || saveState === 'failed' || saveState === 'conflict') return;
    let live = true;
    request<Guide>(`/api/conversations/${conversation.id}/guide`).then(value => { if (live && (!guide || value.version !== versionRef.current)) adopt(value); }).catch(e => { if (live) { if(e instanceof ApiError && [401,403].includes(e.status)) onAccessDenied?.(); else setError(String(e.message)); } });
    return () => { live = false; };
  }, [conversation.id, signal, status, disabled, busy, dirty, saveState, reload]);
  useEffect(() => {
    setRecords(workspace.records); setCatalogs(workspace.catalogs); setTotal(workspace.total ?? workspace.records.length);setPage(workspace.page??1);
    const context=workspace.query_context;
    if(context){const f=context.filters;const dates=String(f.date??'').split('~');setFilters({equipment:String(f.equipment??''),date:dates[0],wo:String(f.wo??''),history:String(f.history??'all'),search:String(f.search??''),fac:String(f.factory??''),sort:String(f.sort??'')});setEndDate(dates[1]??'');
      const signature=queryCriteria(f);
      if(candidateCriteria.current&&candidateCriteria.current!==signature){setCandidate(null);setPendingTarget(null);setReportCandidate(null);setSelectionNotice(L('查詢條件已更新，請重新選取；原作業內容保留。','Search updated. Select again; your operation is retained.','อัปเดตเงื่อนไขแล้ว โปรดเลือกใหม่ เก็บใบงานเดิมไว้แล้ว'));}
      candidateCriteria.current=signature;
    }
  }, [workspace]);
  useEffect(() => { setTarget(selected); }, [selected]);

  async function work(fn: () => Promise<void>) {
    setBusy(true); onWorkChange?.(true); onBusyChange?.(true); setError('');
    try { await fn(); }
    catch (e) { if(!alive.current)return; if(e instanceof ApiError && [401,403].includes(e.status)) onAccessDenied?.(); else setError(e instanceof Error ? e.message : String(e)); }
    finally { if(alive.current){setBusy(false); onWorkChange?.(false);} }
  }
  async function save(next: string, patch = args, chosen = action, quiet = false, intent = guide?.intent): Promise<Guide> {
    if (!guide) throw new Error(L('請稍候，正在載入步驟。', 'Please wait for the steps to load.', 'โปรดรอสักครู่ กำลังโหลดขั้นตอน'));
    if (saveState === 'failed' || saveState === 'conflict') throw new Error(L('請先核對儲存失敗的內容。','Review the save failure first.','โปรดตรวจสอบข้อผิดพลาดการบันทึกก่อน'));
    const job = queueRef.current.then(async () => {
      if (['failed','conflict'].includes(saveStateRef.current)) throw new Error(L('請先核對儲存失敗的內容。','Review the save failure first.','โปรดตรวจสอบข้อผิดพลาดการบันทึกก่อน'));
      if(!alive.current)throw new Error('作業情境已切換');
      const current=serverGuide.current;
      if(current && current.action===chosen && comparable(current.args)===comparable(patch) && (chosen!=='schedule.save'||current.intent===intent)) {
        if(!quiet)setStep(next);
        return current;
      }
      setSaveState('saving');
      let value: Guide;
      try { value = await request<Guide>(`/api/conversations/${conversation.id}/guide`, { version: versionRef.current, action: chosen, args: normalized(patch), step: next, intent: chosen === 'schedule.save' ? intent : null }); }
      catch (e) {
        if (quiet && e instanceof ApiError && e.status === 422 && comparable(patch) !== comparable(latestArgs.current)) {
          obsoleteValidation.current.add(e); setSaveState('saved'); throw e;
        }
        setSaveState(e instanceof ApiError && e.status === 422 ? 'invalid' : e instanceof ApiError && e.status === 409 ? 'conflict' : 'failed');
        if(e instanceof ApiError && [401,403].includes(e.status)) onAccessDenied?.(); throw e;
      }
      versionRef.current = value.version;
      serverGuide.current = value;
      serverArgs.current = value.args ?? {};
      setSaveState('saved'); setError('');
      if (quiet) {setGuide(value);if(proposal&&!value.proposal)onReply({proposal:null});} else adopt(value);
      return value;
    });
    queueRef.current = job.then(() => {}, () => {});
    return job;
  }
  useEffect(() => {
    if (!guide || !['details','target'].includes(step) || !action || busy || disabled || saveState === 'invalid' || saveState === 'saving' || saveState === 'failed' || saveState === 'conflict' || comparable(args) === comparable(guide.args)) return;
    const timer = setTimeout(() => { void save('details', args, action, true).catch(e => { if (!obsoleteValidation.current.has(e)) setError(String(e.message)); }); }, 650);
    return () => clearTimeout(timer);
  }, [args, guide, step, action, busy, disabled, saveState]);
  useEffect(() => {
    const found = records.find(r => (args.execution_id && string(r[EID]) === string(args.execution_id)) || (args.schedule_id && string(r[SID]) === string(args.schedule_id)) || rows(r.REPORTS).some(p => string(p[RID]) === string(args.report_id)));
    if (found) { setTarget(found); return; }
    if (!args.execution_id && !args.schedule_id && !args.report_id) return;
    setTarget(null);
    const matchesCard = proposal && ['execution_id','schedule_id','report_id'].some(key => args[key] && args[key] === proposal.args[key]);
    const execution = args.execution_id || (matchesCard ? proposal?.target?.execution_id : null);
    const schedule = args.schedule_id || (matchesCard ? proposal?.target?.schedule_id : null);
    const params = new URLSearchParams({ module });
    if (execution) params.set('execution_id', string(execution));
    else if (schedule) params.set('schedule_id', string(schedule));
    else return;
    let active = true;
    void request<Workspace>(`/api/workspace?${params}`).then(value => { if (active && value.records.length === 1) setTarget(value.records[0]); }).catch(() => {});
    return () => { active = false; };
  }, [args.execution_id, args.schedule_id, args.report_id, records, proposal?.id]);
  async function chooseAction(value: string) {
    await work(async () => {
      const kept = retainTarget ? target : selected;setPicker(false);
      setTarget(value==='query'?null:kept); setPendingTarget(null); setQuery(value === 'query'); setLoadedQuery(false); setDefectChoice('');
      setCandidate(null);
      const chosen = value === 'schedule.new' ? 'schedule.save' : value;
      setNewSchedule(value === 'schedule.new');
      if (module === 'mold' && value !== 'query') {
        const history = value === 'mold.mount_start' ? 'pending' : value === 'mold.clear' ? 'history' : 'running';
        setFilters(v => ({ ...v, history })); await load(1, { history });
      }
      const next = await save('target', { execution_id: null, report_id: null, schedule_id: null, ...(value === 'schedule.new' ? { status: 'DO', priority: 0 } : {}) }, value === 'query' ? '' : chosen, false, chosen === 'schedule.save' ? value === 'schedule.new' ? 'create' : 'update' : null);
      setNewSchedule(value === 'schedule.new');
      if (kept && chosen!=='query' && value!=='schedule.new' && canChooseRecord(module,chosen,false,kept)) await applyTarget(kept,chosen);
      setRetainTarget(false);
    });
  }
  async function load(nextPage = 1, extra: Row = {}) {
    const generation = ++readGeneration.current;
    const params = new URLSearchParams({ module, page: String(nextPage), page_size: String(pageSize) });
    for (const [key, value] of Object.entries({ ...workspace.query_context?.filters, ...filters, factory:filters.fac, date: endDate && filters.date ? `${filters.date}~${endDate}` : filters.date, ...extra, page:nextPage, page_size:pageSize })) if (key!=='fac' && value !== '' && value != null) params.set(key, String(value));
    const result = onQuery ? await onQuery(Object.fromEntries([...params.entries()].filter(([key])=>key!=='module'))) : await request<Workspace>(`/api/workspace?${params}`);
    if (generation !== readGeneration.current) return result;
    setRecords(result.records); setTotal(result.total ?? result.records.length); setPage(nextPage);
    setCatalogs(previous => ({ ...previous, ...result.catalogs })); setLoadedQuery(true);
    return result;
  }
  function hasEditableFields(value:string){return ['schedule.save','report.add','report.update','report.cavities'].includes(value);}
  async function preview(value:Guide){
    if(!value.ready)throw new Error(L('資料還沒填齊，請完成必要欄位。','Some details are missing.','ข้อมูลยังไม่ครบ'));
    if(proposal?.status==='pending' && !status && !proposal.local_rejection && proposal.action===value.action && value.proposal?.id===proposal.id && Date.parse(proposal.expires_at)>Date.now() && comparable(proposal.args)===comparable(value.args)) {setStep('review');return;}
    const reply=await request<Reply>(`/api/conversations/${conversation.id}/proposals`,{version:value.version,action:value.action,args:value.args});
    adopt(await request<Guide>(`/api/conversations/${conversation.id}/guide`));onReply(reply);setStep('review');
  }
  async function chooseTarget(record: Row) {
    if (query) { setTarget(record); onReply({ data: { records: [record] } }); setStep('result');setPicker(false); return; }
    if (beforeTargetChange && !beforeTargetChange()) return;
    await work(()=>applyTarget(record,action));
  }
  async function applyTarget(record:Row,chosen:string){
      if(target&&String(target[EID]??target[SID])!==String(record[EID]??record[SID]))setSelectionNotice(L('已更換作業對象，原數量與明細不沿用。','Target changed; previous quantities and details were cleared.','เปลี่ยนเป้าหมายแล้ว ไม่ใช้จำนวนและรายละเอียดเดิม'));
      setPendingTarget(null);setReportCandidate(null);
      let next: Row;
      if (chosen === 'schedule.save' && chosen===action && string(args.schedule_id)===string(record[SID])) {
        next=args;
      } else if (chosen === 'schedule.save') {
        const exact = await request<Workspace>(`/api/workspace?module=schedule&schedule_id=${encodeURIComponent(string(record[SID]))}`);
        const source = exact.records[0];
        if (!source) throw new Error(L('資料已改變，請重新查詢。', 'Record changed. Search again.', 'ข้อมูลเปลี่ยนแล้ว โปรดค้นหาอีกครั้ง'));
        setCatalogs(previous => ({ ...previous, ...exact.catalogs }));
        const orders = rows(exact.catalogs.work_orders);
        next = { schedule_id: source[SID], equipment: source.EQP_NO, mold_no: source.TOL_NO, part_no: rows(source.DETAILS)[0]?.PART_NO,
          start_time: source.SCHEDULE_START_TIME, cycle_seconds: source.SCHEDULE_CYCLE_TIME, target_shots: source.TARGET_SHOT,
          status: source.PRODUCTION_STATUS, priority: source.PRIORITY, comment: source.COMMENT ?? '',
          details: rows(source.DETAILS).map(d => ({ detail_id: d.ZZ_KAOSU_PROD_SCHEDULE_DETAIL_SID, mold_detail_id: d.TOL_DETALS_SID,
            part_no: d.PART_NO, wo: d.WO ?? orders.find(w => string(w.WO_SID) === string(d.WO_SID))?.WO ?? '', cavities: d.SCHEDULE_CUR_CAV })) };
      } else if (['report.update', 'report.delete'].includes(chosen)) {
        setPendingTarget(record); setPicker(true); return;
      } else if (chosen === 'report.add' || chosen === 'report.cavities') {
        next = { ...(chosen===action && (!args.execution_id || string(args.execution_id)===string(record[EID])) ? args : {}), execution_id: record[EID] };
        if (chosen === 'report.cavities') next.cavities = record.OPI_CAV;
      } else next = { schedule_id: record[SID] };
      const value=await save('details', next,chosen);
      setTarget(record);
      setPicker(false);
      if(!hasEditableFields(chosen))await preview(value);
  }
  async function chooseReport(record: Row) {
    await work(async () => {
      const next = reportDraft(record, action);
      const value=await save('details', next);
      setTarget(pendingTarget);setPicker(false);setPendingTarget(null);setReportCandidate(null);if(!hasEditableFields(action))await preview(value);
    });
  }
  function field(key: string, text: string, type = 'text', minimum = 0) {
    return <label className="guide-field">{text}<input id={`guide-${key}`} aria-invalid={Boolean(error && guide?.missing.includes(key))} required={!['comment','priority'].includes(key)} type={type==='number'?'text':type} inputMode={type==='number'?'decimal':undefined} min={type === 'number' ? minimum : undefined} step={type === 'number' ? '1' : undefined}
      max={type === 'number' ? 2147483647 : undefined} aria-describedby={guide?.missing.includes(key) ? 'missing-fields' : undefined}
      value={type === 'datetime-local' ? string(args[key]).replace(' ', 'T').slice(0, 16) : string(args[key])}
      onInput={type === 'datetime-local' ? e => { const value = e.currentTarget.value; setArgs(v => ({ ...v, [key]: value })); } : undefined}
      onChange={e => setArgs(v => ({ ...v, [key]: e.target.value }))}/></label>;
  }
  function select(key: string, text: string, options: { value: string; name: string }[], change?: (value: string) => void) {
    return <label className="guide-field">{text}<select id={fieldId(key)} required value={string(args[key])} onChange={e => change ? change(e.target.value) : setArgs(v => ({ ...v, [key]: e.target.value }))}>
      <option value="">{L('請選擇', 'Please select', 'โปรดเลือก')}</option>{options.map(o => <option key={o.value} value={o.value}>{o.name}</option>)}
    </select></label>;
  }
  function detailsForm(targetOnly=false) {
    if (action === 'schedule.save') return <>
      {(targetOnly||presentation==='chat-sheet'||!newSchedule)&&<>
      <div className="guide-fields">
        <CandidateSelect id="guide-equipment" kind="equipment" title={L('設備','Machine','เครื่องจักร')} value={string(args.equipment)} request={request} onBusy={setCandidateBusy} choose={row=>setArgs(v=>({...v,equipment:row.EQP_NO,details:[]}))}/>
        <CandidateSelect id="guide-part_no" kind="parts" title={L('品號／規格','Part / specification','รหัสชิ้นงาน / ข้อมูลจำเพาะ')} value={string(args.part_no)} request={request} onBusy={setCandidateBusy} choose={row=>{setArgs(v=>({...v,part_no:row.PART_NO,mold_no:null,details:[]}));}}/>
        <CandidateSelect id="guide-mold_no" kind="molds" title={L('模具','Mold','แม่พิมพ์')} part={string(args.part_no)} value={string(args.mold_no)} request={request} onBusy={setCandidateBusy} choose={row=>{
          setArgs(v=>({...v,mold_no:row.TOL_NO,details:[]}));void work(async()=>{const value=await request<Workspace>(`/api/workspace?module=schedule&catalog=molds&part_no=${encodeURIComponent(string(args.part_no))}&mold_no=${encodeURIComponent(string(row.TOL_NO))}`);setCatalogs(previous=>({...previous,...value.catalogs}));});
        }}/>
      </div>
      <p>{L('選擇模具的各組模穴，再分配工單與穴數。', 'Choose each mold detail, then assign an order and cavities.', 'เลือกแต่ละชุดโพรงแม่พิมพ์ แล้วกำหนดใบสั่งผลิตและจำนวนโพรง')}</p>
      <p>{L('已加入明細：','Added details: ','รายละเอียดที่เพิ่ม: ')}{details.length}</p>{details.map((d, i) => <fieldset className="guide-detail" key={i}>
        <legend>{L('工單與模穴', 'Order and cavities', 'ใบสั่งผลิตและจำนวนโพรง')} {i + 1}</legend>
        <label className="guide-field">{L('模具明細／品號', 'Mold detail / Part', 'รายละเอียดแม่พิมพ์ / รหัสชิ้นงาน')}<select id={fieldId(`details[${i}].mold_detail_id`)} aria-describedby="missing-fields" required value={string(d.mold_detail_id)} onChange={e => {
          const chosen = moldDetails.find(m => string(m.TOL_DETALS_SID) === e.target.value);
          setArgs(v => ({ ...v, part_no: i === 0 ? chosen?.PART_NO : v.part_no, details: details.map((r, j) => i === j ? { ...r, mold_detail_id: e.target.value, part_no: chosen?.PART_NO, wo: '', cavities: null } : r) }));
        }}><option value="">{L('請選擇', 'Please select', 'โปรดเลือก')}</option>{moldDetails.map(m => <option disabled={details.some((other,j)=>j!==i&&string(other.mold_detail_id)===string(m.TOL_DETALS_SID))} key={string(m.TOL_DETALS_SID)} value={string(m.TOL_DETALS_SID)}>{[m.TOL_DETALS_NO, m.TOL_DETALS_NAME, m.PART_NO].filter(Boolean).join(' · ')}</option>)}</select></label>
        <CandidateSelect id={fieldId(`details[${i}].wo`)} kind="work_orders" title={L('工單','Work order','ใบสั่งผลิต')} part={string(d.part_no)} value={string(d.wo)} request={request} onBusy={setCandidateBusy} choose={row=>setArgs(v=>({...v,details:details.map((r,j)=>j===i?{...r,wo:row.WO}:r)}))}/>
        <button className="text-button" type="button" onClick={()=>setArgs(v=>({...v,details:details.map((r,j)=>j===i?{...r,wo:'',cavities:0}:r)}))}>{L('未分配工單（0 穴）','Unassigned (0 cavities)','ไม่กำหนดใบสั่งผลิต (0 โพรง)')}</button>
        <label className="guide-field">{L('模穴數', 'Cavities', 'จำนวนโพรง')}<input id={fieldId(`details[${i}].cavities`)} aria-describedby="missing-fields" type="text" inputMode="decimal" required min={0} max={2147483647} step={1} value={string(d.cavities)} onChange={e => setArgs(v => ({ ...v, details: details.map((r, j) => j === i ? { ...r, cavities: e.target.value } : r) }))}/></label>
        <button type="button" className="secondary" onClick={() => setArgs(v => ({ ...v, details: details.filter((_, j) => j !== i) }))}>{L('移除此列', 'Remove row', 'ลบรายการนี้')}</button>
      </fieldset>)}
      <button type="button" className="secondary" disabled={!args.mold_no||details.length>=moldDetails.length} onClick={() => setArgs(v => ({ ...v, details: [...details, {}] }))}>+ {L('加入工單／模穴', 'Add order / cavities', 'เพิ่มใบสั่งผลิต / โพรง')}</button>
      </>}
      {!targetOnly&&<>
      <div className="guide-fields">{field('start_time', L('開始時間（MES時間）', 'Start (MES time)', 'เวลาเริ่ม (เวลา MES)'), 'datetime-local')}{field('cycle_seconds', L('週期（秒）', 'Cycle (seconds)', 'รอบการผลิต (วินาที)'), 'number', 1)}{field('target_shots', L('目標模次', 'Target shots', 'จำนวนรอบเป้าหมาย'), 'number')}</div>
      <details><summary>{L('進階設定：狀態、優先序、備註', 'More: status, priority and note', 'เพิ่มเติม: สถานะ ลำดับ และหมายเหตุ')}</summary>
        {select('status', L('生產狀態', 'Production status', 'สถานะการผลิต'), ['TRY','DO','RUN'].map(value => ({ value, name: value })))}
        {field('priority', L('優先序', 'Priority', 'ลำดับความสำคัญ'), 'number')}
        {field('comment', L('備註', 'Note', 'หมายเหตุ'))}
      </details></>}
    </>;
    if (action === 'report.add' || action === 'report.update') return <div className="report-entry-fields">
      {field('ok', L('這一筆人工良品數量', 'Good units in this record', 'จำนวนชิ้นงานดีในรายการนี้'), 'number')}
      <fieldset id="guide-defects" tabIndex={-1}><legend>{L('有不良品嗎？', 'Any defects?', 'มีชิ้นงานเสียหรือไม่?')}</legend><div className="guide-options">
        <button type="button" aria-pressed={defectChoice === 'none'} className="secondary" onClick={() => { setDefectChoice('none'); setArgs(v => ({ ...v, defects: [] })); }}>{L('沒有不良品', 'No defects', 'ไม่มีชิ้นงานเสีย')}</button>
        <button type="button" aria-pressed={defectChoice === 'some'} className="secondary" onClick={() => { setDefectChoice('some'); if (!defects.length) setArgs(v => ({ ...v, defects: [{}] })); }}>{L('有，選原因與數量', 'Yes, add reason and quantity', 'มี ระบุสาเหตุและจำนวน')}</button>
      </div></fieldset>
      {defectChoice === 'some' && defects.map((d, i) => <div className="guide-defect" key={i}>
        <label className="guide-field">{L('不良原因', 'Defect reason', 'สาเหตุของเสีย')}<select id={fieldId(`defects[${i}].code`)} aria-describedby="missing-fields" required value={string(d.code)} onChange={e => setArgs(v => ({ ...v, defects: defects.map((r, j) => j === i ? { ...r, code: e.target.value } : r) }))}><option value="">{L('請選擇', 'Please select', 'โปรดเลือก')}</option>{catalog('defect_reasons').map(r => <option key={string(r.NG_CODE_NO)} value={string(r.NG_CODE_NO)}>{[r.NG_CODE_NO, r.NG_CODE_NAME].filter(Boolean).join(' · ')}</option>)}</select></label>
        <label className="guide-field">{L('不良數量', 'Defect quantity', 'จำนวนชิ้นงานเสีย')}<input id={fieldId(`defects[${i}].quantity`)} aria-describedby="missing-fields" type="text" inputMode="decimal" required min={1} max={2147483647} step={1} value={string(d.quantity)} onChange={e => setArgs(v => ({ ...v, defects: defects.map((r, j) => j === i ? { ...r, quantity: e.target.value } : r) }))}/></label>
        <button type="button" className="secondary" onClick={() => setArgs(v => ({ ...v, defects: defects.filter((_, j) => j !== i) }))}>{L('移除', 'Remove', 'ลบ')}</button>
      </div>)}
      <div className="defect-tools">{defectChoice === 'some' && <button type="button" className="secondary" onClick={() => setArgs(v => ({ ...v, defects: [...defects, {}] }))}>+ {L('另一個原因', 'Another reason', 'เพิ่มสาเหตุ')}</button>}
      {defectChoice==='some'&&<p className="defect-total">{L('不良合計','Total defects','รวมของเสีย')}：{defects.reduce((sum,d)=>sum+(Number(d.quantity)||0),0)}</p>}</div>
      <details className="optional-note"><summary>{L('備註（選填）', 'Note (optional)', 'หมายเหตุ (ไม่บังคับ)')}</summary><label className="guide-field">{L('備註','Note','หมายเหตุ')}<input id="guide-comment" value={string(args.comment)} onChange={e => setArgs(v => ({ ...v, comment: e.target.value }))}/></label></details>
    </div>;
    if (action === 'report.cavities') return field('cavities', L('實際報工模穴數', 'Actual reporting cavities', 'จำนวนโพรงที่ใช้รายงาน'), 'number');
    return <div className="guide-operation-note"><ClipboardList size={24}/><p>{L('下一步會列出實際影響，核對並同意後才執行。', 'Next, review the actual impact. Execution requires your confirmation.', 'ขั้นตอนถัดไปจะแสดงผลกระทบ กรุณาตรวจสอบและยืนยันก่อนดำเนินการ')}</p></div>;
  }
  const selectedReport = pendingTarget ? rows(pendingTarget.REPORTS) : reportRows;
  const completed = ['succeeded', 'cancelled'].includes(status);
  const at = completed ? 4 : status==='unknown' ? 3 : Math.max(0, steps.indexOf(step));
  const choosing=picker||(at===1&&(query||presentation==='step-wizard'||!hasEditableFields(action)));
  useEffect(()=>{onSelectionChange?.(choosing);return()=>onSelectionChange?.(false);},[choosing,onSelectionChange]);
  const editing=!choosing&&(at===2||(at===1&&presentation==='chat-sheet'&&hasEditableFields(action)));
  const phases=[{step:'target',text:L('選擇對象','Choose target','เลือกเป้าหมาย')},...(hasEditableFields(action)?[{step:'details',text:L('填寫內容','Enter details','กรอกรายละเอียด')}]:[]),query?{step:'result',text:L('查看結果','View result','ดูผลลัพธ์')}:{step:'review',text:L('核對送出','Review and confirm','ตรวจสอบและยืนยัน')}];
  const [stepEntering,setStepEntering]=useState(false);
  useEffect(()=>{setStepEntering(true);},[step,choosing,presentation]);
  return <section ref={editorRef} className={`guided-flow ${presentation} ${at===3?'guide-review':''} ${choosing?'guide-choosing':''}`} aria-label={L('作業單', 'Operation sheet', 'ใบงาน')}>
    {presentation==='step-wizard'&&at>0&&<nav className="operation-steps" aria-label={L('作業步驟','Operation steps','ขั้นตอนการทำงาน')}>{phases.map((phase,index)=><button type="button" key={phase.step} aria-current={(choosing?'target':step)===phase.step?'step':undefined} disabled={locked||completed||steps.indexOf(phase.step)>at} onClick={()=>{setPicker(phase.step==='target');setStep(phase.step);}}><b>{steps.indexOf(phase.step)<at?'✓':index+1}</b><span>{phase.text}</span></button>)}</nav>}
    {at!==3&&at!==4&&<div className="guide-phase"><h2>{at===0?L('選擇作業','Choose operation','เลือกงาน'):actionName(action==='schedule.save'&&newSchedule?'schedule.new':action)}</h2></div>}
    {at<3&&<p className="operation-sheet-status" role="status">{saveState==='saving'?L('保存中…','Saving…','กำลังบันทึก…'):dirty?L('尚未同步','Not synced','ยังไม่ซิงค์'):L('草稿 · 尚未送出','Draft · not submitted','ฉบับร่าง · ยังไม่ส่ง')}</p>}
    {selectionNotice&&<p role="status">{selectionNotice}</p>}
    {error && <div className="error-banner" role="alert"><span>{error}</span>{!guide && <button className="secondary" onClick={() => { setError(''); setReload(v => v + 1); }}>{L('重新載入作業單','Reload operation sheet','โหลดใบงานใหม่')}</button>}</div>}
    {editing && Boolean(guide?.missing.length) && <div id="missing-fields" role="status"><strong>{L('尚需補充','Still needed','ข้อมูลที่ยังขาด')}</strong><ul>{guide?.missing.map(key => <li key={key}><button type="button" className="text-button" onClick={() => {if(['execution_id','schedule_id','report_id'].includes(key)){setPicker(true);return;}document.getElementById(fieldId(key.replace(/^(details\[\d+\])\.part_no$/, '$1.mold_detail_id')))?.focus();}}>{missingText(key)}</button></li>)}</ul></div>}
    {['failed','conflict'].includes(saveState) && <div role="alert"><button className="secondary" onClick={() => void work(async () => {
      const value = await request<Guide>(`/api/conversations/${conversation.id}/guide`);
      if (comparable(value.args) === comparable(args) && value.action === action) { adopt(value); setSaveState('saved'); }
      else setConflict(value);
    })}>{L('讀取伺服器版本核對','Read server version','อ่านเวอร์ชันเซิร์ฟเวอร์')}</button>{conflict && <><Fields value={conflict.args}/><button className="secondary" disabled={!['execution_id','report_id','schedule_id'].every(key => String(conflict.args[key] ?? '') === String(args[key] ?? ''))} onClick={() => { versionRef.current = conflict.version; serverArgs.current = conflict.args; setGuide(conflict); setConflict(null); setSaveState('saved'); setError(''); }}>{L('核對後重新套用目前輸入','Reapply my input after review','ใช้ข้อมูลที่กรอกหลังตรวจสอบ')}</button><button className="secondary" onClick={() => {adopt(conflict);setConflict(null);setSaveState('saved');setError('');}}>{L('採用伺服器內容','Use server values','ใช้ข้อมูลเซิร์ฟเวอร์')}</button></>}</div>}
    <fieldset className={`guide-body ${stepEntering?'dual-enter':''}`} onAnimationEnd={event=>{if(event.target===event.currentTarget)setStepEntering(false);}} disabled={locked}>
    {at === 0 && <>{module === 'report' ? <><button className="primary" disabled={locked || !guide} onClick={() => void chooseAction('report.add')}>{actionName('report.add')}<ArrowRight size={18}/></button><details><summary>{L('更多操作','More operations','งานเพิ่มเติม')}</summary><div className="guide-action-grid">{['query','report.update','report.delete','report.cavities','report.complete'].map(value => <button key={value} className="secondary" disabled={locked || !guide} onClick={() => void chooseAction(value)}>{actionName(value)}</button>)}</div></details></> : <div className="guide-action-grid">{(module === 'schedule' ? ['query','schedule.new','schedule.save'] : ['query','mold.mount_start','mold.mount_finish','mold.unmount_start','mold.unmount_finish','mold.clear']).map(value => <button key={value} className="secondary" disabled={locked || !guide} onClick={() => void chooseAction(value)}>{actionName(value)}<ArrowRight size={18}/></button>)}</div>}</>}    {choosing && <><button type="button" className="text-button" onClick={()=>{setPicker(false);setPendingTarget(null);setCandidate(null);setReportCandidate(null);setStep(action&&hasEditableFields(action)?'details':hasTarget&&proposal?'review':'action');}}>{L('取消選取','Cancel selection','ยกเลิกการเลือก')}</button>{onAskSelection&&<button type="button" id="guide-selection-ai" className="secondary" onClick={onAskSelection}>{L('詢問 AI／補充條件','Ask AI / refine search','ถาม AI / เพิ่มเงื่อนไข')}</button>}<h2>{query ? L('查詢作業資料','Find operation records','ค้นหาข้อมูลการทำงาน') : L('選擇這次要操作的對象','Choose the record to work on','เลือกรายการที่จะดำเนินการ')}</h2>
      {action === 'schedule.save' && newSchedule ? <div className="new-schedule-target">{detailsForm(true)}</div> : <>
      <form hidden={!!pendingTarget} className="guide-fields" onSubmit={e => { e.preventDefault(); void work(async () => { await load(); }); }}>
        {(['equipment','date','wo'] as const).map((key,i) => <label className="guide-field" key={key}>{[L('設備','Machine','เครื่องจักร'),L('日期','Date','วันที่'),L('工單','Work order','ใบสั่งผลิต')][i]}<input id={`guide-search-${key}`} type={key === 'date' ? 'date' : 'text'} value={filters[key]} onInput={key === 'date' ? e => {const value=e.currentTarget.value;setFilters(v=>({...v,[key]:value}));} : undefined} onChange={e => setFilters(v => ({ ...v, [key]: e.target.value }))}/></label>)}
        <details className="guide-search-options"><summary>{L('更多查詢條件','More search options','ตัวเลือกการค้นหาเพิ่มเติม')}</summary>
        <label className="guide-field">{L('結束日期（選填）','End date (optional)','วันที่สิ้นสุด (ไม่บังคับ)')}<input type="date" value={endDate} onInput={e=>setEndDate(e.currentTarget.value)} onChange={e => setEndDate(e.target.value)}/></label>
        <label className="guide-field">{L('排序','Sort','เรียงลำดับ')}<select value={filters.sort} onChange={e => setFilters(v => ({ ...v, sort: e.target.value }))}><option value="">{L('原本順序','Default order','ลำดับเดิม')}</option><option value="EQP_NO">{L('設備：小到大','Machine: ascending','เครื่องจักร: น้อยไปมาก')}</option><option value="-EQP_NO">{L('設備：大到小','Machine: descending','เครื่องจักร: มากไปน้อย')}</option></select></label>
        {module === 'mold' && <label className="guide-field">{L('廠別','Factory','โรงงาน')}<select value={filters.fac} onChange={e => setFilters(v => ({ ...v, fac: e.target.value }))}><option value="">{L('全部','All','ทั้งหมด')}</option>{['fac1','fac2','fac3'].map((f,i) => <option key={f} value={f}>{L('廠','Factory','โรงงาน')} {i+1}</option>)}</select></label>}
        {module !== 'schedule' && <label className="guide-field">{L('範圍','Records','ขอบเขต')}<select value={filters.history} onChange={e => setFilters(v => ({ ...v, history: e.target.value }))}><option value="all">{L('全部','All','ทั้งหมด')}</option><option value="pending">{L('待開始','Pending','รอเริ่ม')}</option><option value="running">{L('進行中','Running','กำลังดำเนินการ')}</option><option value="history">{L('歷史','History','ประวัติ')}</option></select></label>}
        </details><button className="primary" disabled={locked} type="submit"><RefreshCw className={busy?'spin':undefined} size={18}/>{L('查詢','Search','ค้นหา')}</button>
      </form>
      <p hidden={!!pendingTarget}>{L('找到','Found','พบ')} {total} {L('筆，選擇符合現場的工單。','records. Choose the correct order.','รายการ เลือกใบสั่งผลิตที่ตรงกับหน้างาน')}</p>
      {!pendingTarget&&<RecordChoices records={choices} value={candidate} onSelect={setCandidate} identify={row=>String(row[EID]??row[SID])} disabled={locked} eligible={row=>canChooseRecord(module,action,query,row)} describe={row=>({primary:string(row.WO??row.WO_NO??row.EQP_NO),secondary:partDescription(row),context:[row.EQP_NO,row.SCHEDULE_START_TIME??row.REAL_CHECK_IN_TIME??row.SHIFT_DAY].filter(Boolean).join(' · ')})}/>}
      {!pendingTarget&&candidate&&<div className="candidate-apply"><span>{title(candidate)}</span><button type="button" className="primary" disabled={locked} onClick={()=>void chooseTarget(candidate)}>{query?L('查看選取資料','View selected record','ดูรายการที่เลือก'):L('帶入作業單','Use in operation sheet','ใช้ในใบงาน')}</button></div>}
      {!choices.length && <p>{L('沒有符合資料，請調整設備或日期再查詢。','No matching records. Change the machine or date.','ไม่พบข้อมูล โปรดเปลี่ยนเครื่องจักรหรือวันที่')}</p>}
      <div hidden={!!pendingTarget} className="guide-options"><button className="secondary" disabled={locked || page <= 1} onClick={() => void work(async () => { await load(page-1); })}>{L('上一頁','Previous page','หน้าก่อน')}</button><span>{page}</span><button className="secondary" disabled={locked || page*pageSize >= total} onClick={() => void work(async () => { await load(page+1); })}>{L('下一頁','Next page','หน้าถัดไป')}</button></div>
      {pendingTarget && <fieldset className="report-record-picker"><button type="button" className="text-button" onClick={()=>{setPendingTarget(null);setReportCandidate(null);}}>{L('返回工單','Back to orders','กลับไปใบสั่งผลิต')}</button><legend>{L('選擇單筆人工報工','Choose one production record','เลือกบันทึกผลผลิตหนึ่งรายการ')}</legend>
        <RecordChoices columns={[L('報工時間／數量','Report time / quantities','เวลา / จำนวนผลผลิต'),L('工單','Work order','ใบสั่งผลิต')]} records={selectedReport} value={reportCandidate} onSelect={setReportCandidate} identify={r=>string(r[RID])} disabled={locked} describe={r=>({primary:string(r.CREATE_TIME),secondary:`${L('良品','Good','ชิ้นงานดี')} ${r.OK_QTY} · ${L('不良','Defects','ของเสีย')} ${r.NG_QTY??0}`,context:string(pendingTarget.WO)})}/>
        {reportCandidate&&<div className="candidate-apply"><button type="button" className="primary" disabled={locked} onClick={()=>void chooseReport(reportCandidate)}>{L('帶入作業單','Use in operation sheet','ใช้ในใบงาน')}</button></div>}
        {!selectedReport.length&&<p>{L('這筆工單沒有人工報工紀錄。','This order has no manual production records.','ใบสั่งผลิตนี้ยังไม่มีบันทึกผลผลิต')}</p>}</fieldset>}
      </>}
      <div className="guide-navigation">{((action === 'schedule.save' && newSchedule) || query) && <button className="primary" disabled={locked || (query && !loadedQuery)} onClick={() => void work(async () => { if (query) { onReply({ data: { records } }); setStep('result'); } else {const value=await save('target',{...args,status:args.status??'DO',priority:args.priority??0});if(value.missing.some(key=>['equipment','part_no','mold_no','details'].some(prefix=>key.startsWith(prefix))))throw new Error(L('請先補齊設備、模具與工單分配。','Complete machine, mold and order allocations first.','กรอกเครื่องจักร แม่พิมพ์ และการจัดสรรใบสั่งผลิตก่อน'));setPicker(false);setStep('details');} })}>{L('下一步','Next','ถัดไป')}<ArrowRight size={18}/></button>}</div>
    </>}
    {editing && <form onSubmit={e => { e.preventDefault(); void work(async () => {
      if (!hasTarget) throw new Error(L('請先選擇工單。','Choose an order first.','โปรดเลือกใบสั่งผลิตก่อน'));
      if (['report.add','report.update'].includes(action) && (!defectChoice || (defectChoice === 'some' && !defects.length))) throw new Error(L('請明確選擇有無不良並填入明細。','Specify whether there are defects and enter the details.','โปรดระบุว่ามีของเสียหรือไม่และกรอกรายละเอียด'));
      const value = await save('details');
      if (!value.ready) { setStep('details'); throw new Error(L('資料還沒填齊，請完成必要欄位。','Some details are missing. Complete the required fields.','ข้อมูลยังไม่ครบ โปรดกรอกข้อมูลที่จำเป็น')); }
      await preview(value);
    }); }}><div className="sheet-target"><div><strong>{string(target?.WO??target?.WO_NO)||draftOrders||L('尚未選擇工單','No order selected','ยังไม่ได้เลือกใบสั่งผลิต')}</strong>{target?<><p>{partDescription(target)}</p><p>{[target.EQP_NO,target.TOL_NO,target.SCHEDULE_START_TIME??target.REAL_CHECK_IN_TIME??target.SHIFT_DAY].filter(Boolean).join(' · ')}</p></>:args.equipment?<p>{[args.equipment,args.mold_no,args.part_no,args.start_time].filter(Boolean).join(' · ')}</p>:<p>{L('請選擇本次作業對象','Choose the target for this operation','เลือกเป้าหมายสำหรับงานนี้')}</p>}</div>{(!(action==='schedule.save'&&newSchedule)||presentation==='step-wizard')&&<button type="button" className="secondary" onClick={()=>setPicker(true)}>{L('選擇／更換對象','Choose / change target','เลือก / เปลี่ยนเป้าหมาย')}</button>}</div>{detailsForm()}<div className="guide-navigation"><button className="secondary" type="button" disabled={locked} onClick={() => {setStep('target');setPicker(true);}}><ArrowLeft size={18}/>{L('上一步','Back','ย้อนกลับ')}</button><button className="primary" type="submit" disabled={locked}>{L('下一步：核對內容','Next: review changes','ถัดไป: ตรวจสอบข้อมูล')}<ArrowRight size={18}/></button></div></form>}
    {at === 3 && (!reviewActionsExternal||!proposal||status==='superseded') && <>{status !== 'unknown' && <button className="secondary" disabled={locked} onClick={() => setStep(hasEditableFields(action)?'details':'target')}><ArrowLeft size={18}/>{L('上一步：修改資料','Back: change details','ย้อนกลับ: แก้ไขข้อมูล')}</button>}</>}
    {at === 4 && <>{(!proposal||query)&&<h2>{query ? L('查詢完成','Search complete','ค้นหาเสร็จแล้ว') : status === 'cancelled' ? L('已取消，沒有寫入','Cancelled, no changes written','ยกเลิกแล้ว ไม่มีการบันทึก') : L('已完成並留下紀錄','Completed and recorded','ดำเนินการเสร็จและบันทึกแล้ว')}</h2>}<div className="guide-options"><button className="secondary" onClick={onAudit}>{L('查看紀錄','View history','ดูประวัติ')}</button><button className="primary" disabled={locked} onClick={() => void work(async () => { await save('action', {}, ''); setQuery(false); setRetainTarget(Boolean(target)); })}>{target?L('繼續此工單','Continue this order','ทำต่อในใบสั่งผลิตนี้'):L('選擇作業','Choose task','เลือกงาน')}</button><button className="secondary" onClick={onHome}>{L('回作業選擇','Choose another module','เลือกโมดูลอื่น')}</button></div></>}
    </fieldset>
    {busy && <p role="status">{L('正在核對資料…','Checking details…','กำลังตรวจสอบข้อมูล…')}</p>}
  </section>;
}
