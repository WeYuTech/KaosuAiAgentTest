import {reapplyDraft,sameDraftTarget} from './draft-merge';
import {mesDate,productionStatus} from './presentation';
import {OperationDialog} from './OperationDialog';
import {MoldStages,moldStageAvailability} from './MoldStages';
import {RecordChoices} from './RecordChoices';
import {queryCriteria} from './query-context';
import {CandidateCombobox as CandidateSelect} from './CandidateCombobox';
import React, { useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ClipboardList, RefreshCw,LoaderCircle, Search, ChevronLeft, ChevronRight, Sparkles, X, Plus, Factory, Repeat2 } from 'lucide-react';
import { api, ApiError, display, label, type Conversation, type Module, type Proposal, type Reply, type Row, type Workspace } from './api';
import { Fields } from './DataView';
import { useLocale } from './i18n';
import { reportDraft, canChooseRecord, mountCandidates } from './guided-records';
import './guided.css';
import type {OperationMode} from './operation-mode';

export interface Guide { version: number; action: string; intent?: 'create' | 'update' | null; args: Row; step: string; missing: string[]; ready: boolean; proposal?: Proposal | null }
export interface GuideHandle { openTarget:()=>void; backToEdit: () => void; reviewAgain: () => Promise<void>; flush: () => Promise<void>; focusField: (key: string) => void; beginReport: (record: Row) => Promise<void>; selectTarget: (record:Row) => Promise<void> }
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
export function GuidedFlow({ presentation='chat-sheet', reviewActionsExternal=false, selectionAI=false, selectionReply='', onSelectionPortal, onPresentationChange, onQuery, onSelectionChange, onAskSelection, onPresentationBusyChange, apiRequest = api, ref, onBusyChange, onWorkChange, onContextChange, onSnapshot, onAccessDenied, beforeTargetChange, conversation, module, workspace, selected, signal, proposal, status, disabled, date, onReply, onAudit, onHome }: {
  selectionAI?:boolean;selectionReply?:string;onSelectionPortal?:(element:HTMLDivElement|null)=>void;onPresentationChange?:(mode:OperationMode)=>void;
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
  const guideLoadError=useRef('');
  const [validationAttempted,setValidationAttempted]=useState(false);
  const [reload, setReload] = useState(0);
  const [saveState, setSaveStateValue] = useState<'saved'|'saving'|'failed'|'conflict'|'invalid'>('saved');
  const saveStateRef = useRef(saveState);
  const setSaveState = (value: typeof saveState) => { saveStateRef.current = value; setSaveStateValue(value); };
  useEffect(() => { if (saveStateRef.current === 'invalid') { setSaveState('saved'); setError(''); } }, [args]);
  const [conflict, setConflict] = useState<Guide | null>(null);
  const recoveryKey=`kaosu-guide-input:${conversation.actor_id??''}:${conversation.id}`;
  const recoveryRead=useRef(false);
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
  const [lookupBusy,setLookupBusy]=useState(false),[lookupError,setLookupError]=useState('');
  const [lookupDirty,setLookupDirty]=useState(false);
  function changeFilters(update:React.SetStateAction<typeof filters>){setFilters(update);setLookupDirty(true);if(candidate||reportCandidate)setSelectionNotice(L('查詢條件已更新，請重新選取；原作業內容保留。','Search updated. Select again; your operation is retained.','อัปเดตเงื่อนไขแล้ว โปรดเลือกใหม่'));setCandidate(null);setReportCandidate(null);}
  const parentScroll=useRef(0),pickerTrigger=useRef<HTMLElement|null>(null);
  const pickerTable=useRef<HTMLDivElement>(null);
  const [selectionNotice,setSelectionNotice]=useState('');

  const [pendingTarget, setPendingTarget] = useState<Row | null>(null);
  const [reportCandidate,setReportCandidate]=useState<Row|null>(null);
  const [reportSearch,setReportSearch]=useState('');
  const [reportPage,setReportPage]=useState(1);
  const candidateCriteria=useRef('');
  const [retainTarget, setRetainTarget] = useState(false);
  useEffect(()=>{if(pendingTarget)editorRef.current?.querySelector<HTMLElement>('.report-record-picker button')?.focus();else if(picker)editorRef.current?.querySelector<HTMLElement>('.guide-body input')?.focus();},[pendingTarget,picker]);
  const versionRef = useRef(0);
  const queueRef = useRef(Promise.resolve());
  const locked = disabled || busy || ['unknown'].includes(status);
  const dirty = Boolean(guide && ['details','target'].includes(step) && action && comparable(args) !== comparable(guide.args));
  useEffect(()=>{
    if(!recoveryRead.current||!guide)return;
    try{if(dirty||['failed','conflict','invalid'].includes(saveState))sessionStorage.setItem(recoveryKey,JSON.stringify({action,args,base:serverArgs.current,version:versionRef.current,at:Date.now()}));else sessionStorage.removeItem(recoveryKey);}catch{/* 儲存不可用時仍維持目前畫面。 */}
  },[args,guide,dirty,saveState,recoveryKey]);

  useEffect(() => { onSnapshot?.({ ...args, action, _view_step:step, _started:step!=='action' || query, _stage_label:status==='unknown'?L('結果待核對','Verify result','ตรวจสอบผลลัพธ์'):status==='succeeded'?L('已完成','Completed','เสร็จแล้ว'):status==='cancelled'?L('已取消','Cancelled','ยกเลิกแล้ว'):[L('選作業','Choose task','เลือกงาน'),L('選擇對象','Choose target','เลือกเป้าหมาย'),L('填寫資料','Enter details','กรอกข้อมูล'),L('核對與確認','Review and confirm','ตรวจสอบและยืนยัน'),L('查看結果','View result','ดูผลลัพธ์')][Math.max(0,steps.indexOf(step))], _missing:(guide?.missing??[]).map(key=>({key,text:missingText(key)})), draft_save_state: saveState === 'saving' ? L('正在儲存草稿…','Saving draft…','กำลังบันทึกฉบับร่าง…') : saveState === 'invalid' ? L('資料需修正，輸入仍保留','Correct the details; input retained','โปรดแก้ไขข้อมูล เก็บข้อมูลที่กรอกไว้แล้ว') : saveState === 'failed' || saveState === 'conflict' ? L('儲存失敗','Save failed','บันทึกไม่สำเร็จ') : dirty ? L('尚未同步','Not synced','ยังไม่ซิงค์') : L('已保存','Saved','บันทึกแล้ว') }); }, [args, action, saveState, dirty, locale, onSnapshot, guide, step, query, status]);
  useEffect(()=>{onPresentationBusyChange?.(busy||candidateBusy||lookupBusy||saveState==='saving'||!guide&&!error);},[busy,candidateBusy,lookupBusy,saveState,guide,error,onPresentationBusyChange]);
  useEffect(() => { onBusyChange?.(busy || dirty || saveState === 'saving' || (!guide && !error)); }, [busy, dirty, saveState, guide, error, onBusyChange]);
  useEffect(() => () => { onWorkChange?.(false); }, [onWorkChange]);
  useEffect(() => () => { onBusyChange?.(false); }, [onBusyChange]);
  useImperativeHandle(ref, () => ({ openTarget:openPicker, reviewAgain: async()=>{if(!locked&&guide)await work(()=>preview(guide));}, backToEdit: () => {if(!locked)setStep(hasEditableFields(action)?'details':'target');}, selectTarget: async record=>{if(locked)return;await work(async()=>{if(action){await applyTarget(record,action);}else{setTarget(record);setRetainTarget(true);setPicker(false);}});}, focusField: key => { const field=editorRef.current?.querySelector<HTMLElement>(`#${fieldId(key.replace(/^(details\[\d+\])\.part_no$/, '$1.mold_detail_id'))}`); (field ?? editorRef.current?.querySelector<HTMLElement>('input, select, button'))?.focus(); }, beginReport: async record => {
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
    mesDate(row.REAL_CHECK_IN_TIME ?? row.SCHEDULE_START_TIME ?? row.CHECK_IN_TIME ?? row.CREATE_TIME ?? row.SHIFT_DAY),
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
    request<Guide>(`/api/conversations/${conversation.id}/guide`).then(value => { if(live&&guideLoadError.current){const previous=guideLoadError.current;guideLoadError.current='';setError(error=>error===previous?'':error);} if (live && (!guide || value.version !== versionRef.current)) {
      adopt(value);
      if(!recoveryRead.current){recoveryRead.current=true;try{const raw=sessionStorage.getItem(recoveryKey);const saved=raw?JSON.parse(raw):null;
        if(saved&&Date.now()-saved.at<86400000&&saved.action===value.action&&saved.args&&typeof saved.args==='object'&&comparable(saved.args)!==comparable(value.args)&&value.proposal?.status!=='unknown'){
          setArgs(saved.args);serverArgs.current=saved.base??value.args;setConflict(value);setSaveState('conflict');setStep('details');setError(L('已保留上次未儲存的輸入，請與最新內容核對。','Unsaved input retained. Compare it with the latest values.','เก็บข้อมูลที่ยังไม่บันทึกไว้ โปรดเทียบกับข้อมูลล่าสุด'));
        }
      }catch{/* 無效的本機副本不取代可信草稿。 */}}
    } }).catch(e => { if (live) { if(e instanceof ApiError && [401,403].includes(e.status)) onAccessDenied?.(); else {guideLoadError.current=String(e.message);setError(guideLoadError.current);} } });
    return () => { live = false; };
  }, [conversation.id, signal, status, disabled, busy, dirty, saveState, reload]);
  useEffect(() => {
    setRecords(workspace.records); setCatalogs(workspace.catalogs); setTotal(workspace.total ?? workspace.records.length);setPage(workspace.page??1);
    const context=workspace.query_context;
    if(context){const f=context.filters;const dates=String(f.date??'').split('~');setLookupDirty(false);setFilters({equipment:String(f.equipment??''),date:dates[0],wo:String(f.wo??''),history:String(f.history??'all'),search:String(f.search??''),fac:String(f.factory??''),sort:String(f.sort??'')});setEndDate(dates[1]??'');
      const signature=queryCriteria(f);
      if((candidate||reportCandidate)&&candidateCriteria.current&&candidateCriteria.current!==signature){setCandidate(null);setPendingTarget(null);setReportCandidate(null);setSelectionNotice(L('查詢條件已更新，請重新選取；原作業內容保留。','Search updated. Select again; your operation is retained.','อัปเดตเงื่อนไขแล้ว โปรดเลือกใหม่ เก็บใบงานเดิมไว้แล้ว'));}
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
        if(e instanceof ApiError&&e.status===422)setValidationAttempted(true);
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
      if (module === 'mold' && value !== 'query' && !kept) {
        const history = value === 'mold.mount_start' ? 'pending' : value === 'mold.clear' ? 'history' : 'running';
        setFilters(v => ({ ...v, history })); await load(1, { history });
      }
      const next = await save('target', { execution_id: null, report_id: null, schedule_id: null, ...(value === 'schedule.new' ? { status: 'DO', priority: 0 } : {}) }, value === 'query' ? '' : chosen, false, chosen === 'schedule.save' ? value === 'schedule.new' ? 'create' : 'update' : null);
      setNewSchedule(value === 'schedule.new');
      if (kept && chosen!=='query' && value!=='schedule.new' && canChooseRecord(module,chosen,false,kept)) await applyTarget(kept,chosen);
      setRetainTarget(false);
      if(value!=='schedule.new'&&!kept){setPicker(true);if(module!=='mold')await load();}
    });
  }
  async function load(nextPage = 1, extra: Row = {}) {
    const generation = ++readGeneration.current;
    const params = new URLSearchParams({ module, page: String(nextPage), page_size: String(pageSize) });
    for (const [key, value] of Object.entries({ ...workspace.query_context?.filters, ...filters, factory:filters.fac, date: endDate && filters.date ? `${filters.date}~${endDate}` : filters.date, ...extra, page:nextPage, page_size:pageSize })) if (key!=='fac' && value !== '' && value != null) params.set(key, String(value));
    setLookupBusy(true);setLookupError('');setLookupDirty(false);
    try {
    const signature=queryCriteria(Object.fromEntries([...params.entries()].filter(([key])=>key!=='module')));
    if((candidate||reportCandidate)&&candidateCriteria.current&&candidateCriteria.current!==signature){setCandidate(null);setPendingTarget(null);setReportCandidate(null);setSelectionNotice(L('查詢條件已更新，請重新選取；原作業內容保留。','Search updated. Select again; your operation is retained.','อัปเดตเงื่อนไขแล้ว โปรดเลือกใหม่'));}
    candidateCriteria.current=signature;
    const result = onQuery ? await onQuery(Object.fromEntries([...params.entries()].filter(([key])=>key!=='module'))) : await request<Workspace>(`/api/workspace?${params}`);
    if (generation !== readGeneration.current) return result;
    setRecords(result.records); setTotal(result.total ?? result.records.length); setPage(nextPage);
    setCatalogs(previous => ({ ...previous, ...result.catalogs })); setLoadedQuery(true);
    return result;
    }catch(e){if(generation===readGeneration.current)setLookupError(e instanceof Error?e.message:String(e));return undefined;}finally{if(generation===readGeneration.current)setLookupBusy(false);}
  }
  function hasEditableFields(value:string){return ['schedule.save','report.add','report.update','report.cavities'].includes(value);}
  async function preview(value:Guide){
    if(!value.ready)throw new Error(L('資料還沒填齊，請完成必要欄位。','Some details are missing.','ข้อมูลยังไม่ครบ'));
    if(proposal?.status==='pending' && !status && !proposal.local_rejection && proposal.action===value.action && value.proposal?.id===proposal.id && Date.parse(proposal.expires_at)>Date.now() && comparable(proposal.args)===comparable(value.args)) {setStep('review');return;}
    const reply=await request<Reply>(`/api/conversations/${conversation.id}/proposals`,{version:value.version,action:value.action,args:value.args});
    adopt(await request<Guide>(`/api/conversations/${conversation.id}/guide`));onReply(reply);setStep('review');
  }
  async function chooseTarget(record: Row) {
    if(module==='mold'&&!action&&!query){setTarget(record);setRetainTarget(true);setPicker(false);setStep('action');return;}
    if(['report.update','report.delete'].includes(action)){parentScroll.current=pickerTable.current?.scrollTop??0;setPendingTarget(record);setReportCandidate(null);setReportSearch('');setReportPage(1);return;}
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
  function field(key: string, text: string, type = 'text', minimum = 0, unit = '') {
    const value=string(args[key]);
    const required=!['comment','priority'].includes(key);
    const invalid=validationAttempted && ((required&&!value.trim()) || (type==='number'&&value!==''&&(!/^\d+$/.test(value)||!Number.isSafeInteger(Number(value))||Number(value)<minimum||Number(value)>2147483647)));
    const hint=invalid ? type==='number'?L(`請填入 ${minimum}～2147483647 的整數。`,`Enter an integer from ${minimum} to 2147483647.`,`กรอกจำนวนเต็ม ${minimum} ถึง 2147483647`):L('請填寫此欄位。','Complete this field.','กรอกข้อมูลนี้') : '';
    return <label className="guide-field">{text}<span className="guide-input-unit"><input id={`guide-${key}`} aria-invalid={invalid||Boolean(error && guide?.missing.includes(key))} required={required} type={type==='number'?'text':type} inputMode={type==='number'?'decimal':undefined} data-minimum={type==='number'?minimum:undefined}
      aria-describedby={hint?`guide-${key}-error`:guide?.missing.includes(key)?'missing-fields':undefined}
      value={type === 'datetime-local' ? value.replace(' ', 'T').slice(0, 16) : value}
      onInput={type === 'datetime-local' ? e => { const value = e.currentTarget.value; setArgs(v => ({ ...v, [key]: value })); } : undefined}
      onChange={e => setArgs(v => ({ ...v, [key]: e.target.value }))}/>{unit&&<span>{unit}</span>}</span>{hint&&<small className="field-error" id={`guide-${key}-error`}>{hint}</small>}</label>;
  }
  function select(key: string, text: string, options: { value: string; name: string }[], change?: (value: string) => void) {
    return <label className="guide-field">{text}<select id={fieldId(key)} required value={string(args[key])} onChange={e => change ? change(e.target.value) : setArgs(v => ({ ...v, [key]: e.target.value }))}>
      <option value="">{L('請選擇', 'Please select', 'โปรดเลือก')}</option>{options.map(o => <option key={o.value} value={o.value}>{o.name}</option>)}
    </select></label>;
  }
  function detailsForm(targetOnly=false) {
    if (action === 'schedule.save') return <div className="schedule-entry-fields">
      <div className="schedule-basics">        <CandidateSelect id="guide-equipment" kind="equipment" title={L('設備','Machine','เครื่องจักร')} value={string(args.equipment)} request={request} onBusy={setCandidateBusy} choose={row=>setArgs(v=>({...v,equipment:row.EQP_NO,details:[]}))}/>
        <CandidateSelect id="guide-mold_no" kind="molds" title={L('模具','Mold','แม่พิมพ์')} part={string(args.part_no)} value={string(args.mold_no)} request={request} onBusy={setCandidateBusy} choose={row=>{
          setArgs(v=>({...v,mold_no:row.TOL_NO,details:[]}));void work(async()=>{const value=await request<Workspace>(`/api/workspace?module=schedule&catalog=molds&part_no=${encodeURIComponent(string(args.part_no))}&mold_no=${encodeURIComponent(string(row.TOL_NO))}`);setCatalogs(previous=>({...previous,...value.catalogs}));});
        }}/>        <CandidateSelect id="guide-part_no" kind="parts" title={L('品號／規格','Part / specification','รหัสชิ้นงาน / ข้อมูลจำเพาะ')} value={string(args.part_no)} request={request} onBusy={setCandidateBusy} choose={row=>{setArgs(v=>({...v,part_no:row.PART_NO,mold_no:null,details:[]}));}}/>
</div>
      {!targetOnly&&<div className="schedule-timing">{field('start_time',L('開始時間（MES）','Start (MES)','เวลาเริ่ม (MES)'),'datetime-local')}{field('cycle_seconds',L('週期','Cycle','รอบ'),'number',1,L('秒','seconds','วินาที'))}{field('target_shots',L('目標模次','Target shots','จำนวนรอบเป้าหมาย'),'number')}{select('status',L('狀態','Status','สถานะ'),['DO','TRY','RUN'].map(value=>({value,name:productionStatus(value)})))}</div>}
      <div className="schedule-allocations"><div className="defect-heading"><span>{L('工單分配','Order allocation','การจัดสรรใบสั่งผลิต')}</span><small>{details.length} {L('筆明細','details','รายการ')}</small></div>{details.map((d, i) => <fieldset className="guide-detail schedule-allocation" key={i}>
        <legend className="sr-only">{L('工單與模穴','Order and cavities','ใบสั่งผลิตและจำนวนโพรง')} {i+1}</legend>
        <label className="guide-field">{L('模具明細／品號', 'Mold detail / Part', 'รายละเอียดแม่พิมพ์ / รหัสชิ้นงาน')}<select id={fieldId(`details[${i}].mold_detail_id`)} aria-describedby="missing-fields" required value={string(d.mold_detail_id)} onChange={e => {
          const chosen = moldDetails.find(m => string(m.TOL_DETALS_SID) === e.target.value);
          setArgs(v => ({ ...v, part_no: i === 0 ? chosen?.PART_NO : v.part_no, details: details.map((r, j) => i === j ? { ...r, mold_detail_id: e.target.value, part_no: chosen?.PART_NO, wo: '', cavities: null } : r) }));
        }}><option value="">{L('請選擇', 'Please select', 'โปรดเลือก')}</option>{moldDetails.map(m => <option disabled={details.some((other,j)=>j!==i&&string(other.mold_detail_id)===string(m.TOL_DETALS_SID))} key={string(m.TOL_DETALS_SID)} value={string(m.TOL_DETALS_SID)}>{[m.TOL_DETALS_NO, m.TOL_DETALS_NAME, m.PART_NO].filter(Boolean).join(' · ')}</option>)}</select></label>
        <CandidateSelect id={fieldId(`details[${i}].wo`)} kind="work_orders" title={L('工單','Work order','ใบสั่งผลิต')} part={string(d.part_no)} value={string(d.wo)} request={request} onBusy={setCandidateBusy} choose={row=>setArgs(v=>({...v,details:details.map((r,j)=>j===i?{...r,wo:row.WO}:r)}))}/>

        <label className="guide-field">{L('穴數', 'Cavities', 'จำนวนโพรง')}<input id={fieldId(`details[${i}].cavities`)} aria-describedby="missing-fields" type="text" inputMode="decimal" data-minimum={0} aria-invalid={validationAttempted&&(!/^\d+$/.test(string(d.cavities))||Number(d.cavities)>2147483647)} required min={0} max={2147483647} step={1} value={string(d.cavities)} onChange={e => setArgs(v => ({ ...v, details: details.map((r, j) => j === i ? { ...r, cavities: e.target.value } : r) }))}/>{validationAttempted&&(!/^\d+$/.test(string(d.cavities))||Number(d.cavities)>2147483647)&&<small className="field-error">{L('請填入零或正整數。','Enter zero or a positive integer.','กรอกศูนย์หรือจำนวนเต็มบวก')}</small>}</label>
        <button type="button" className="secondary" onClick={() => setArgs(v => ({ ...v, details: details.filter((_, j) => j !== i) }))}>{L('移除此列', 'Remove row', 'ลบรายการนี้')}</button>
      </fieldset>)}
      <button type="button" className="secondary" disabled={!args.mold_no||details.length>=moldDetails.length} onClick={() => setArgs(v => ({ ...v, details: [...details, {}] }))}><Plus size={18}/>{L('新增工單明細', 'Add order detail', 'เพิ่มรายละเอียดใบสั่งผลิต')}</button></div>
      {!targetOnly&&<details className="schedule-advanced"><summary>{L('進階設定','Advanced settings','การตั้งค่าขั้นสูง')}</summary>{field('priority',L('優先序','Priority','ลำดับความสำคัญ'),'number')}{field('comment',L('備註','Note','หมายเหตุ'))}</details>}
    </div>;
    if (action === 'report.add' || action === 'report.update') return <div className="report-entry-fields">
      {field('ok', L('良品數量', 'Good quantity', 'จำนวนชิ้นงานดี'), 'number', 0, L('件','units','ชิ้น'))}
      <div id="guide-defects" tabIndex={-1} aria-invalid={validationAttempted&&(!defectChoice||defectChoice==='some'&&!defects.length)}><div className="defect-heading"><span>{L('不良品','Defects','ของเสีย')}</span><small>{L('合計','Total','รวม')} {defects.reduce((sum,d)=>sum+(Number(d.quantity)||0),0)} {L('件','units','ชิ้น')}</small></div>
      {validationAttempted&&(!defectChoice||defectChoice==='some'&&!defects.length)&&<small className="field-error">{L('請選擇有無不良品，並補齊明細。','Choose whether there are defects and complete details.','ระบุว่ามีของเสียหรือไม่และกรอกรายละเอียด')}</small>}
      {defectChoice === 'some' && defects.map((d, i) => <div className="guide-defect" key={i}>
        <label className="guide-field"><span className={i?'sr-only':''}>{L('原因', 'Reason', 'สาเหตุ')}</span><select aria-invalid={validationAttempted&&!d.code} id={fieldId(`defects[${i}].code`)} aria-describedby="missing-fields" required value={string(d.code)} onChange={e => setArgs(v => ({ ...v, defects: defects.map((r, j) => j === i ? { ...r, code: e.target.value } : r) }))}><option value="">{L('請選擇', 'Please select', 'โปรดเลือก')}</option>{catalog('defect_reasons').map(r => <option key={string(r.NG_CODE_NO)} value={string(r.NG_CODE_NO)}>{string(r.NG_CODE_NAME)||L('原因名稱未提供','Reason name unavailable','ไม่มีชื่อสาเหตุ')}</option>)}</select>{validationAttempted&&!d.code&&<small className="field-error">{L('請選擇不良原因。','Choose a defect reason.','เลือกสาเหตุของเสีย')}</small>}</label>
        <label className="guide-field"><span className={i?'sr-only':''}>{L('數量', 'Quantity', 'จำนวน')}</span><input id={fieldId(`defects[${i}].quantity`)} aria-describedby="missing-fields" type="text" inputMode="decimal" data-minimum={1} aria-invalid={validationAttempted&&(!/^\d+$/.test(string(d.quantity))||Number(d.quantity)<1||Number(d.quantity)>2147483647)} required min={1} max={2147483647} step={1} value={string(d.quantity)} onChange={e => setArgs(v => ({ ...v, defects: defects.map((r, j) => j === i ? { ...r, quantity: e.target.value } : r) }))}/>{validationAttempted&&(!/^\d+$/.test(string(d.quantity))||Number(d.quantity)<1||Number(d.quantity)>2147483647)&&<small className="field-error">{L('請填入大於零的整數。','Enter a positive integer.','กรอกจำนวนเต็มที่มากกว่าศูนย์')}</small>}</label>
        <button type="button" className="icon-button defect-remove" aria-label={L('移除此原因','Remove this reason','ลบสาเหตุนี้')} onClick={() => setArgs(v => ({ ...v, defects: defects.filter((_, j) => j !== i) }))}><X size={18}/></button>
      </div>)}
      <div className="defect-tools"><button type="button" className="secondary" onClick={() => {setDefectChoice('some');setArgs(v => ({ ...v, defects: [...defects, {}] }));}}><Plus size={16}/>{L('新增原因', 'Add reason', 'เพิ่มสาเหตุ')}</button>
      <label className="no-defects"><input type="checkbox" checked={defectChoice==='none'} onChange={e=>{setDefectChoice(e.target.checked?'none':'some');setArgs(v=>({...v,defects:e.target.checked?[]:[{}]}));}}/>{L('沒有不良品', 'No defects', 'ไม่มีชิ้นงานเสีย')}</label></div></div>
      <details className="optional-note"><summary>{L('備註（選填）', 'Note (optional)', 'หมายเหตุ (ไม่บังคับ)')}</summary><label className="guide-field"><span className="sr-only">{L('備註','Note','หมายเหตุ')}</span><textarea id="guide-comment" value={string(args.comment)} onChange={e => setArgs(v => ({ ...v, comment: e.target.value }))}/></label></details>
    </div>;
    if (action === 'report.cavities') return <div className="cavities-fields">{field('cavities',L('模穴數','Cavities','จำนวนโพรง'),'number',0,L('穴','cavities','โพรง'))}<small>{L('目前','Current','ปัจจุบัน')} {display(target?.OPI_CAV)} {L('穴','cavities','โพรง')}</small></div>;
    return <div className="guide-operation-note"><ClipboardList size={24}/><p>{L('下一步會列出實際影響，核對並同意後才執行。', 'Next, review the actual impact. Execution requires your confirmation.', 'ขั้นตอนถัดไปจะแสดงผลกระทบ กรุณาตรวจสอบและยืนยันก่อนดำเนินการ')}</p></div>;
  }
  const selectedReport = pendingTarget ? rows(pendingTarget.REPORTS) : reportRows;
  const filteredReports=selectedReport.filter(row=>!reportSearch||[row.REPORT_NO,row.CREATE_TIME,row.OK_QTY,row.NG_QTY].some(value=>String(value??'').includes(reportSearch)));
  const shownReports=filteredReports.slice((reportPage-1)*pageSize,reportPage*pageSize);
  const completed = ['succeeded', 'cancelled'].includes(status);
  useEffect(()=>{if(status==='succeeded'||status==='unknown') editorRef.current?.closest('.operation-primary')?.scrollTo({top:0});},[status]);
  const at = completed ? 4 : status==='unknown' ? 3 : Math.max(0, steps.indexOf(step));
  const choosing=picker||(at===1&&query);
  useEffect(()=>{onSelectionChange?.(choosing);return()=>onSelectionChange?.(false);},[choosing,onSelectionChange]);
  const modalPicker=choosing&&!(action==='schedule.save'&&newSchedule);
  function closePicker(){readGeneration.current++;setLookupBusy(false);setLookupError('');setSelectionNotice('');setPicker(false);setPendingTarget(null);setCandidate(null);setReportCandidate(null);setStep(action&&hasEditableFields(action)?'details':hasTarget&&proposal?'review':'action');}
  function openPicker(){
    pickerTrigger.current=document.activeElement as HTMLElement;
    setSelectionNotice('');setPicker(true);
    const equipment=string(target?.EQP_NO??args.equipment??selected?.EQP_NO);
    const contextDate=string(target?.SCHEDULE_DATE??target?.SCHEDULE_START_TIME??target?.SHIFT_DAY??target?.REAL_CHECK_IN_TIME??target?.CHECK_IN_TIME??args.start_time??date).slice(0,10);
    if((equipment&&equipment!==filters.equipment)||(contextDate&&(contextDate!==filters.date||endDate))){const next={...filters,...(equipment?{equipment}:{}),...(contextDate?{date:contextDate}:{})};setFilters(next);if(contextDate)setEndDate('');void load(1,next).catch(()=>{});}
  }
  function returnOrders(){setPendingTarget(null);setReportCandidate(null);requestAnimationFrame(()=>{if(pickerTable.current)pickerTable.current.scrollTop=parentScroll.current;});}
  const editing=!choosing&&(at===2||(hasTarget&&at===1&&presentation==='chat-sheet'&&hasEditableFields(action)));
  const phases=[{step:'target',text:L('選擇對象','Choose target','เลือกเป้าหมาย')},...(hasEditableFields(action)?[{step:'details',text:L('填寫內容','Enter details','กรอกรายละเอียด')}]:[]),query?{step:'result',text:L('查看結果','View result','ดูผลลัพธ์')}:{step:'review',text:L('核對送出','Review and confirm','ตรวจสอบและยืนยัน')}];
  const [stepEntering,setStepEntering]=useState(false);
  useEffect(()=>{setStepEntering(true);},[step,choosing,presentation]);
  return <section ref={editorRef} className={`guided-flow ${presentation} ${at===3?'guide-review':''} ${choosing?'guide-choosing':''}`} aria-label={L('作業單', 'Operation sheet', 'ใบงาน')}>
    {presentation==='step-wizard'&&at>0&&<nav className="operation-steps" aria-label={L('作業步驟','Operation steps','ขั้นตอนการทำงาน')}>{phases.map((phase,index)=><button type="button" key={phase.step} aria-current={(choosing?'target':step)===phase.step?'step':undefined} disabled={locked||completed||steps.indexOf(phase.step)>at} onClick={()=>{setPicker(phase.step==='target');setStep(phase.step);}}><b>{steps.indexOf(phase.step)<at?<Check size={13}/>:index+1}</b><span>{phase.text}</span></button>)}</nav>}
    {at!==3&&at!==4&&<div className="guide-phase"><h2>{at===0?module==='mold'?L('模具作業','Mold operation','งานแม่พิมพ์'):L('選擇作業','Choose operation','เลือกงาน'):action==='schedule.save'?newSchedule?L('新增生產排程','New production schedule','เพิ่มแผนการผลิต'):L('修改生產排程','Edit production schedule','แก้ไขแผนการผลิต'):action==='report.cavities'?L('調整模穴數','Adjust cavities','ปรับจำนวนโพรง'):action==='report.add'?L('新增人工報工','Record production','บันทึกผลผลิต'):actionName(action==='schedule.save'&&newSchedule?'schedule.new':action)}</h2></div>}

    
    {error && <div className="error-banner" role="alert"><span>{error}</span>{!guide && <button className="secondary" onClick={() => { setError(''); setReload(v => v + 1); }}>{L('重新載入作業單','Reload operation sheet','โหลดใบงานใหม่')}</button>}</div>}
    {editing && Boolean(guide?.missing.length) && <div id="missing-fields" role="status"><strong>{L('尚需補充','Still needed','ข้อมูลที่ยังขาด')}</strong><ul>{guide?.missing.map(key => <li key={key}><button type="button" className="text-button" onClick={() => {if(['execution_id','schedule_id','report_id'].includes(key)){setPicker(true);return;}document.getElementById(fieldId(key.replace(/^(details\[\d+\])\.part_no$/, '$1.mold_detail_id')))?.focus();}}>{missingText(key)}</button></li>)}</ul></div>}
    {['failed','conflict'].includes(saveState) && <div className="draft-recovery" role="alert"><p>{saveState==='conflict'?L('資料已由另一個操作更新，請先比較版本。','Another operation changed this draft. Compare versions first.','ข้อมูลถูกแก้ไข โปรดเปรียบเทียบเวอร์ชัน'):L('儲存未完成，輸入仍保留。重試前會先核對最新版本。','Save did not complete. Your input is retained; retry checks the latest version.','บันทึกไม่สำเร็จ เก็บข้อมูลไว้แล้ว ตรวจสอบเวอร์ชันก่อนลองใหม่')}</p>{!conflict&&<button className="secondary" disabled={busy||disabled} onClick={() => void work(async () => {
      const value = await request<Guide>(`/api/conversations/${conversation.id}/guide`);
      if (comparable(value.args) === comparable(args) && value.action === action) { adopt(value); setSaveState('saved'); }
      else if(saveState==='failed'&&value.action===action&&value.version===versionRef.current&&comparable(value.args)===comparable(serverArgs.current)){serverGuide.current=value;setGuide(value);setSaveState('saved');setError('');}
      else {setConflict(value);setSaveState('conflict');}
    })}>{saveState==='failed'?L('重試儲存','Retry saving','ลองบันทึกอีกครั้ง'):L('讀取伺服器版本核對','Read server version','อ่านเวอร์ชันเซิร์ฟเวอร์')}</button>}{conflict && <><div className="draft-comparison"><section><h3>{L('你的修改','Your edits','การแก้ไขของคุณ')}</h3><Fields value={Object.fromEntries([...new Set([...Object.keys(args),...Object.keys(conflict.args)])].sort().map(key=>[key,args[key]??null]))}/></section><section><h3>{L('最新內容','Latest values','ข้อมูลล่าสุด')}</h3><Fields value={Object.fromEntries([...new Set([...Object.keys(args),...Object.keys(conflict.args)])].sort().map(key=>[key,conflict.args[key]??null]))}/></section></div><button className="secondary" disabled={busy||disabled||!sameDraftTarget(action,conflict.action,args,conflict.args)} onClick={() => {
      const next=reapplyDraft(serverArgs.current,args,conflict.args);
      versionRef.current=conflict.version;serverArgs.current=conflict.args;serverGuide.current=conflict;
      setGuide(conflict);setArgs(next);setConflict(null);setSaveState('saved');setError('');setStep('details');onReply({proposal:null});
    }}>{L('在最新內容重套我的修改，再核對','Reapply my edits on latest and review','ใช้การแก้ไขกับข้อมูลล่าสุดแล้วตรวจสอบ')}</button><button className="secondary" disabled={busy||disabled} onClick={() => {adopt(conflict);setConflict(null);setSaveState('saved');setError('');}}>{L('採用伺服器內容','Use server values','ใช้ข้อมูลเซิร์ฟเวอร์')}</button></>}</div>}
    <fieldset className={`guide-body ${stepEntering?'dual-enter':''}`} onAnimationEnd={event=>{if(event.target===event.currentTarget)setStepEntering(false);}} disabled={locked}>
    {at === 0 && <>{module === 'report' ? <><button className="primary" disabled={locked || !guide} onClick={() => void chooseAction('report.add')}>{actionName('report.add')}<ArrowRight size={18}/></button><details><summary>{L('更多操作','More operations','งานเพิ่มเติม')}</summary><div className="guide-action-grid">{['query','report.update','report.delete','report.cavities','report.complete'].map(value => <button key={value} className="secondary" disabled={locked || !guide} onClick={() => void chooseAction(value)}>{actionName(value)}</button>)}</div></details></> : module==='mold'?<><MoldStages record={target} disabled={locked||!guide} choose={value=>void chooseAction(value)} select={openPicker}/><button type="button" className="text-button" onClick={()=>void chooseAction('query')}>{L('查詢歷史','View history','ดูประวัติ')}</button></> : <div className="guide-action-grid">{(module === 'schedule' ? ['query','schedule.new','schedule.save'] : ['query','mold.mount_start','mold.mount_finish','mold.unmount_start','mold.unmount_finish','mold.clear']).map(value => <button key={value} className="secondary" disabled={locked || !guide} onClick={() => void chooseAction(value)}>{actionName(value)}<ArrowRight size={18}/></button>)}</div>}</>}{choosing&&action==='schedule.save'&&newSchedule&&<><div className="new-schedule-target">{detailsForm(true)}</div><div className="guide-navigation"><button type="button" onClick={closePicker}>{L('取消選取','Cancel selection','ยกเลิกการเลือก')}</button><button type="button" className="primary" disabled={locked} onClick={()=>void work(async()=>{const value=await save('target',{...args,status:args.status??'DO',priority:args.priority??0});if(value.missing.some(key=>['equipment','part_no','mold_no','details'].some(prefix=>key.startsWith(prefix))))throw new Error(L('請先補齊設備、模具與工單分配。','Complete target details.','กรอกข้อมูลเป้าหมาย'));setPicker(false);setStep('details');})}>{L('下一步','Next','ถัดไป')}</button></div></>}
    {!hasTarget&&at===1&&<div className="picker-underlay"><ClipboardList size={25}/><h3>{L('選擇要操作的工單','Choose an order','เลือกใบสั่งผลิตที่จะดำเนินการ')}</h3><p>{L('搜尋設備或工單，確認後再帶入。','Search by machine or order, then apply.','ค้นหาเครื่องจักรหรือใบสั่งผลิตแล้วนำไปใช้')}</p><button type="button" className="primary" onClick={openPicker}><Search size={18}/>{L('選擇工單','Choose order','เลือกใบสั่งผลิต')}</button></div>}
    {module==='mold'&&at===0&&target&&<div className="guide-navigation"><small className="operation-sheet-status">{L('草稿已儲存','Draft saved','บันทึกฉบับร่างแล้ว')}</small><button className="primary" disabled={locked||!target.NEXT_ACTION||!moldStageAvailability(target,string(target.NEXT_ACTION)).allowed} onClick={()=>void chooseAction(string(target.NEXT_ACTION))}>{L('核對內容','Review','ตรวจสอบข้อมูล')}</button></div>}
    {!hasTarget&&at===1&&!editing&&<div className="guide-navigation"><small className="operation-sheet-status">{L('先選擇作業對象','Select the target first','เลือกเป้าหมายก่อน')}</small><button type="button" className="primary" disabled>{L('下一步','Next','ถัดไป')}</button></div>}
    {modalPicker&&<OperationDialog title={pendingTarget?L('選擇一筆報工','Choose one production record','เลือกบันทึกผลผลิตหนึ่งรายการ'):L('選擇工單','Choose order','เลือกใบสั่งผลิต')} className="target-picker-dialog" close={closePicker} returnFocus={()=>pickerTrigger.current} beforeFooter={selectionAI&&<div className="picker-ai"><p>{selectionNotice||selectionReply||L('可用設備、工單或品號搜尋。先查看明細，再按「帶入作業」。','Search by machine, order or part. View details, then apply.','ค้นหาด้วยเครื่องจักร ใบสั่งผลิต หรือรหัสชิ้นงาน ดูรายละเอียดก่อนนำไปใช้')}</p><div ref={onSelectionPortal}/></div>} footer={<>


      <div className="picker-selection" hidden={lookupBusy||!!lookupError}><span>{pendingTarget?reportCandidate?<>{L('已選擇','Selected','เลือกแล้ว')}<strong>{string(reportCandidate.REPORT_NO??reportCandidate.CREATE_TIME)}</strong></>:L('尚未選擇資料','No selection','ยังไม่ได้เลือก'):candidate?<>{L('已選擇','Selected','เลือกแล้ว')}<strong>{string(candidate.WO??candidate.WO_NO??candidate.EQP_NO)}</strong></>:L('尚未選擇資料','No selection','ยังไม่ได้เลือก')}</span>{selectionNotice&&!selectionAI&&<p role="status">{selectionNotice}</p>}</div>
      <div className="picker-actions">{!lookupBusy&&!lookupError&&onAskSelection&&<button type="button" id="guide-selection-ai" aria-expanded={selectionAI} onClick={onAskSelection}><Sparkles size={18}/>{L('詢問 AI','Ask AI','ถาม AI')}</button>}<button type="button" onClick={closePicker}>{L('取消選取','Cancel selection','ยกเลิกการเลือก')}</button><button type="button" hidden={lookupBusy||!!lookupError} className="primary" disabled={locked||lookupBusy||lookupDirty||!!lookupError||!(pendingTarget?reportCandidate:candidate)} onClick={()=>{if(pendingTarget&&reportCandidate)void chooseReport(reportCandidate);else if(candidate)void chooseTarget(candidate);}}>{pendingTarget?L('帶入這筆報工','Use this production record','ใช้บันทึกผลผลิตนี้'):!['report.update','report.delete'].includes(action)?L('帶入作業','Use in operation sheet','ใช้ในใบงาน'):L('選擇報工紀錄','Choose production record','เลือกบันทึกผลผลิต')}</button></div>
    </>}>
      <form hidden={!!pendingTarget||lookupBusy||!!lookupError} className="guide-fields compact-picker-filters reference-picker-filters" onSubmit={e => { e.preventDefault(); void load(); }}>
        <label className="guide-field">{L('搜尋','Search','ค้นหา')}<input type="search" aria-label={L('搜尋工單或品號','Search order or part','ค้นหาใบสั่งผลิตหรือชิ้นงาน')} placeholder={L('工單或品號','Order or part','ใบสั่งผลิตหรือชิ้นงาน')} value={filters.search} onChange={e=>changeFilters(v=>({...v,search:e.target.value}))}/></label>
        <label className="guide-field">{L('設備','Machine','เครื่องจักร')}<select id="guide-search-equipment" value={filters.equipment} onChange={e=>changeFilters(v=>({...v,equipment:e.target.value}))}><option value="">{L('全部設備','All machines','เครื่องจักรทั้งหมด')}</option>{[...new Set([...rows(catalogs.equipment).map(row=>string(row.EQP_NO)),...records.map(row=>string(row.EQP_NO)),filters.equipment].filter(Boolean))].map(value=><option key={value} value={value}>{value}</option>)}</select></label>

        <label className="guide-field">{L('日期','Date','วันที่')}<input id="guide-search-date" type="date" value={filters.date} onChange={e=>changeFilters(v=>({...v,date:e.target.value}))}/></label>
        <button disabled={locked||lookupBusy} type="submit"><Search size={18}/>{L('搜尋','Search','ค้นหา')}</button>

      </form>
      <form onSubmit={e=>{e.preventDefault();void load();}} className="picker-extra-options" hidden={!!pendingTarget||lookupBusy||!!lookupError}>        <details className="guide-search-options"><summary>{L('更多查詢條件','More search options','ตัวเลือกการค้นหาเพิ่มเติม')}</summary>
        <label className="guide-field">{L('工單','Work order','ใบสั่งผลิต')}<input id="guide-search-wo" value={filters.wo} onChange={e=>changeFilters(v=>({...v,wo:e.target.value}))}/></label>
        <label className="guide-field">{L('結束日期（選填）','End date (optional)','วันที่สิ้นสุด (ไม่บังคับ)')}<input type="date" value={endDate} onInput={e=>{setEndDate(e.currentTarget.value);changeFilters(v=>v);}} onChange={e=>{setEndDate(e.target.value);changeFilters(v=>v);}}/></label>
        <label className="guide-field">{L('排序','Sort','เรียงลำดับ')}<select value={filters.sort} onChange={e => changeFilters(v => ({ ...v, sort: e.target.value }))}><option value="">{L('原本順序','Default order','ลำดับเดิม')}</option><option value="EQP_NO">{L('設備：小到大','Machine: ascending','เครื่องจักร: น้อยไปมาก')}</option><option value="-EQP_NO">{L('設備：大到小','Machine: descending','เครื่องจักร: มากไปน้อย')}</option></select></label>
        {module === 'mold' && <label className="guide-field">{L('廠別','Factory','โรงงาน')}<select value={filters.fac} onChange={e => changeFilters(v => ({ ...v, fac: e.target.value }))}><option value="">{L('全部','All','ทั้งหมด')}</option>{['fac1','fac2','fac3'].map((f,i) => <option key={f} value={f}>{L('廠','Factory','โรงงาน')} {i+1}</option>)}</select></label>}
        {module !== 'schedule' && <label className="guide-field">{L('範圍','Records','ขอบเขต')}<select value={filters.history} onChange={e => changeFilters(v => ({ ...v, history: e.target.value }))}><option value="all">{L('全部','All','ทั้งหมด')}</option><option value="pending">{L('待開始','Pending','รอเริ่ม')}</option><option value="running">{L('進行中','Running','กำลังดำเนินการ')}</option><option value="history">{L('歷史','History','ประวัติ')}</option></select></label>}
        </details></form>
      <div className="picker-results" ref={pickerTable} hidden={!!pendingTarget}>
        {lookupBusy&&<div className="request-progress"><p role="status"><LoaderCircle className="spin" size={18}/>{L('正在查詢工單…','Loading orders…','กำลังค้นหาใบสั่งผลิต…')}</p><div className="request-skeleton" aria-hidden="true"><span/><span/><span/></div></div>}
        {lookupError&&<div role="alert" className="picker-status picker-failure"><div className="picker-failure-notice"><strong>{L('工單暫時無法載入','Unable to load orders','ไม่สามารถโหลดใบสั่งผลิต')}</strong><small>{lookupError}</small></div><button type="button" className="secondary" disabled={locked||lookupBusy} onClick={()=>void load().catch(()=>{})}>{L('重新查詢','Retry search','ค้นหาอีกครั้ง')}</button></div>}
        {choices.length>0&&!lookupBusy&&!lookupError&&<div className={lookupBusy||lookupError?'picker-stale':''} aria-busy={lookupBusy}><RecordChoices footer={!pendingTarget&&total>0&&!lookupBusy&&!lookupError&&<div className="picker-pagination"><span>{`${(page-1)*pageSize+1}–${Math.min(page*pageSize,total)}／${total} ${L('筆','records','รายการ')}`}</span><div><button type="button" aria-label={L('上一頁','Previous page','หน้าก่อน')} disabled={locked||page<=1} onClick={()=>void load(page-1)}><ChevronLeft size={18}/></button><span>{page}／{Math.max(1,Math.ceil(total/pageSize))}</span><button type="button" aria-label={L('下一頁','Next page','หน้าถัดไป')} disabled={locked||page*pageSize>=total} onClick={()=>void load(page+1)}><ChevronRight size={18}/></button></div></div>} compact records={choices} value={candidate} onSelect={row=>{setCandidate(row);setSelectionNotice('');}} identify={row=>String(row[EID]??row[SID])} disabled={locked||lookupBusy||!!lookupError} eligible={row=>!action||query||(module==='mold'?moldStageAvailability(row,action).allowed:canChooseRecord(module,action,query,row))} describe={row=>({primary:string(row.WO??row.WO_NO??row.EQP_NO),secondary:[row.PART_NO,row.PART_SPEC].filter(Boolean).join(' ')||string(row.TOL_NO),context:string(row.EQP_NO)})}/></div>}
        {!choices.length&&!lookupBusy&&!lookupError&&<div className="picker-status picker-empty"><Search size={25}/><h3>{L('沒有符合的資料','No matching records','ไม่พบข้อมูลที่ตรงกัน')}</h3><p>{L('試試其他工單或放寬設備範圍。','Try another order or broaden the machine range.','ลองใบสั่งผลิตอื่นหรือเพิ่มขอบเขตเครื่องจักร')}</p><button type="button" onClick={()=>{const next={...filters,equipment:'',date:'',wo:'',search:''};changeFilters(()=>next);setEndDate('');void load(1,next).catch(()=>{});}}>{L('清除篩選','Clear filters','ล้างตัวกรอง')}</button></div>}


      </div>
      {pendingTarget && <fieldset className="report-record-picker"><div className="report-picker-context"><button type="button" className="secondary" onClick={returnOrders}><ArrowLeft size={16}/>{L('返回工單','Back to orders','กลับไปใบสั่งผลิต')}</button><strong>{[pendingTarget.EQP_NO,pendingTarget.WO].filter(Boolean).join(' · ')}</strong></div>
        <form className="reference-picker-filters" onSubmit={e=>{e.preventDefault();setReportPage(1);}}><label className="guide-field">{L('搜尋','Search','ค้นหา')}<input type="search" placeholder={L('搜尋報工紀錄','Search reports','ค้นหาบันทึกผลผลิต')} value={reportSearch} onChange={e=>{setReportSearch(e.target.value);setReportPage(1);setReportCandidate(null);}}/></label><label className="guide-field">{L('設備','Machine','เครื่องจักร')}<input value={string(pendingTarget.EQP_NO)} readOnly/></label><label className="guide-field">{L('日期','Date','วันที่')}<input value={filters.date} type="date" readOnly/></label><button type="submit"><Search size={18}/>{L('搜尋','Search','ค้นหา')}</button></form>
        <RecordChoices footer={filteredReports.length>0&&<div className="picker-pagination"><span>{(reportPage-1)*pageSize+1}–{Math.min(reportPage*pageSize,filteredReports.length)}／{filteredReports.length} {L('筆','records','รายการ')}</span><div><button type="button" aria-label={L('上一頁','Previous page','หน้าก่อน')} disabled={reportPage<=1} onClick={()=>setReportPage(p=>p-1)}><ChevronLeft size={18}/></button><span>{reportPage}／{Math.ceil(filteredReports.length/pageSize)}</span><button type="button" aria-label={L('下一頁','Next page','หน้าถัดไป')} disabled={reportPage*pageSize>=filteredReports.length} onClick={()=>setReportPage(p=>p+1)}><ChevronRight size={18}/></button></div></div>} compact report columns={[L('報工紀錄','Report time / quantities','เวลา / จำนวนผลผลิต'),L('工單','Work order','ใบสั่งผลิต')]} records={shownReports} value={reportCandidate} onSelect={row=>{setReportCandidate(row);setSelectionNotice('');}} identify={r=>string(r[RID])} disabled={locked} describe={r=>({primary:string(r.REPORT_NO??r.CREATE_TIME),secondary:r.REPORT_NO?mesDate(r.CREATE_TIME):`${L('良品','Good','ชิ้นงานดี')} ${r.OK_QTY} · ${L('不良','Defects','ของเสีย')} ${r.NG_QTY??0}`,context:string(pendingTarget.WO)})}/>

        {!filteredReports.length&&<p>{L('這筆工單沒有人工報工紀錄。','This order has no manual production records.','ใบสั่งผลิตนี้ยังไม่มีบันทึกผลผลิต')}</p>}</fieldset>}
    </OperationDialog>}
    {editing && <form noValidate onSubmit={e => { e.preventDefault();setValidationAttempted(true);
      const invalid=Array.from(e.currentTarget.querySelectorAll<HTMLInputElement>('input,select')).find(input=>!input.checkValidity() || input.dataset.minimum!==undefined && input.value!=='' && (!/^\d+$/.test(input.value)||!Number.isSafeInteger(Number(input.value))||Number(input.value)<Number(input.dataset.minimum)||Number(input.value)>2147483647));
      if(invalid){invalid.focus();return;} if(['report.add','report.update'].includes(action)&&(!defectChoice||defectChoice==='some'&&!defects.length)){document.getElementById('guide-defects')?.focus();return;} void work(async () => {
      if (!hasTarget) throw new Error(L('請先選擇工單。','Choose an order first.','โปรดเลือกใบสั่งผลิตก่อน'));
      if (['report.add','report.update'].includes(action) && (!defectChoice || (defectChoice === 'some' && !defects.length))) throw new Error(L('請明確選擇有無不良並填入明細。','Specify whether there are defects and enter the details.','โปรดระบุว่ามีของเสียหรือไม่และกรอกรายละเอียด'));
      const value = await save('details');
      if (!value.ready) { setStep('details'); throw new Error(L('資料還沒填齊，請完成必要欄位。','Some details are missing. Complete the required fields.','ข้อมูลยังไม่ครบ โปรดกรอกข้อมูลที่จำเป็น')); }
      await preview(value);
    }); }}><div className="sheet-target" key={target?title(target):contextTitle} role="status" aria-live="polite"><span className="sheet-target-mark"><Factory size={18}/></span><div><strong>{[target?.EQP_NO??args.equipment,target?.WO??target?.WO_NO??draftOrders].filter(Boolean).join(' · ')||L('尚未選擇工單','No order selected','ยังไม่ได้เลือกใบสั่งผลิต')}</strong><small>{target?[target.PART_NO,target.PART_SPEC].filter(Boolean).join(' ')||partDescription(target):string(args.part_no)}</small></div>{<button type="button" className="icon-button" aria-label={L('更換作業對象','Change target','เปลี่ยนเป้าหมาย')} onClick={openPicker}><Repeat2 size={18}/></button>}</div>{detailsForm()}<div className="guide-navigation"><small className="operation-sheet-status" role="status">{saveState==='failed'||saveState==='conflict'?L('儲存未完成','Not saved','ยังไม่บันทึก'):saveState==='invalid'?L('資料需修正','Needs correction','ต้องแก้ไขข้อมูล'):saveState==='saving'?L('保存中…','Saving…','กำลังบันทึก…'):dirty?L('尚未同步','Not synced','ยังไม่ซิงค์'):L('草稿已儲存','Draft saved','บันทึกฉบับร่างแล้ว')}</small><button className="primary" type="submit" disabled={locked||['failed','conflict'].includes(saveState)}>{presentation==='step-wizard'?L('下一步','Next','ถัดไป'):L('核對內容','Review','ตรวจสอบข้อมูล')}</button></div></form>}
    {at === 3 && (!reviewActionsExternal||!proposal||status==='superseded') && <>{status !== 'unknown' && <button className="secondary" disabled={locked} onClick={() => setStep(hasEditableFields(action)?'details':'target')}><ArrowLeft size={18}/>{L('上一步：修改資料','Back: change details','ย้อนกลับ: แก้ไขข้อมูล')}</button>}</>}
    {at === 4 && <>{(!proposal||query)&&<h2>{query ? L('查詢完成','Search complete','ค้นหาเสร็จแล้ว') : status === 'cancelled' ? L('已取消，沒有寫入','Cancelled, no changes written','ยกเลิกแล้ว ไม่มีการบันทึก') : L('已完成並留下紀錄','Completed and recorded','ดำเนินการเสร็จและบันทึกแล้ว')}</h2>}<div className="guide-options"><button className="secondary" onClick={onAudit}>{L('查看紀錄','View history','ดูประวัติ')}</button><button className="primary" disabled={locked} onClick={() => void work(async () => { await save('action', {}, ''); setQuery(false); setRetainTarget(Boolean(target)); })}>{target?L('繼續此工單','Continue this order','ทำต่อในใบสั่งผลิตนี้'):L('選擇作業','Choose task','เลือกงาน')}</button><button className="secondary" onClick={onHome}>{L('回作業選擇','Choose another module','เลือกโมดูลอื่น')}</button></div></>}
    </fieldset>
    {busy && !completed && <p role="status">{L('正在核對資料…','Checking details…','กำลังตรวจสอบข้อมูล…')}</p>}
  </section>;
}
