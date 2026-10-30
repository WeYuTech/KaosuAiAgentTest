import React, { useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ClipboardList, RefreshCw } from 'lucide-react';
import { api, display, type Conversation, type Module, type Proposal, type Reply, type Row, type Workspace } from './api';
import { useLocale } from './i18n';
import { reportDraft, canChooseRecord, mountCandidates } from './guided-records';
import './guided.css';

export interface Guide { version: number; action: string; intent?: 'create' | 'update' | null; args: Row; step: string; missing: string[]; ready: boolean; proposal?: Proposal | null }
export interface GuideHandle { flush: () => Promise<void> }
const SID = 'ZZ_KAOSU_PROD_SCHEDULE_SID';
const EID = 'WIP_OPI_WDOEACICO_HIST_SID';
const RID = 'WIP_OPI_WDOEACICOOUTPUT_HIST_SID';
const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : [];
const string = (value: unknown) => value == null ? '' : String(value);
const comparable = (value: Row) => JSON.stringify(Object.fromEntries(Object.entries(value).filter(([,v]) => v !== null && v !== '').sort(([a],[b]) => a.localeCompare(b))));
const steps = ['action', 'target', 'details', 'review', 'result'];

/** 步驟與自然語言共用後端草稿；此元件只準備確認卡，不執行業務寫入。 */
export function GuidedFlow({ ref, onBusyChange, onWorkChange, onContextChange, conversation, module, workspace, selected, signal, proposal, status, disabled, date, onReply, onAudit, onHome }: {
  ref?: React.Ref<GuideHandle>; onBusyChange?: (busy: boolean) => void; onWorkChange?: (busy: boolean) => void; onContextChange?: (context: string) => void;
  conversation: Conversation; module: Module; workspace: Workspace; selected: Row | null; signal: number;
  proposal: Proposal | null; status: string; disabled: boolean; date: string | null;
  onReply: (reply: Reply) => void; onAudit: () => void; onHome: () => void;
}) {
  const { locale } = useLocale();
  const L = (zh: string, en: string, th: string) => locale === 'en' ? en : locale === 'th' ? th : zh;
  const [guide, setGuide] = useState<Guide | null>(null);
  const [args, setArgs] = useState<Row>({});
  const [step, setStep] = useState('action');
  const [action, setAction] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [records, setRecords] = useState<Row[]>(workspace.records);
  const [catalogs, setCatalogs] = useState<Row>(workspace.catalogs);
  const [filters, setFilters] = useState({ equipment: '', date: date ?? '', wo: '', history: 'all', search: '', fac: '', sort: '' });
  const [endDate, setEndDate] = useState('');
  const [total, setTotal] = useState(workspace.total ?? workspace.records.length);
  const [page, setPage] = useState(1);
  const [target, setTarget] = useState<Row | null>(selected);
  const [query, setQuery] = useState(false);
  const [loadedQuery, setLoadedQuery] = useState(false);
  const [newSchedule, setNewSchedule] = useState(true);
  const [defectChoice, setDefectChoice] = useState<'none' | 'some' | ''>('');
  const [pendingTarget, setPendingTarget] = useState<Row | null>(null);
  const [retainTarget, setRetainTarget] = useState(false);
  const versionRef = useRef(0);
  const queueRef = useRef(Promise.resolve());
  const locked = disabled || busy || ['unknown'].includes(status);
  const dirty = Boolean(guide && step === 'details' && action && comparable(args) !== comparable(guide.args));
  useEffect(() => { onBusyChange?.(busy || dirty || (!guide && !error)); }, [busy, dirty, guide, error, onBusyChange]);
  useEffect(() => () => { onWorkChange?.(false); }, [onWorkChange]);
  useEffect(() => () => { onBusyChange?.(false); }, [onBusyChange]);
  useImperativeHandle(ref, () => ({ flush: async () => {
    if (busy) throw new Error(L('作業單正在處理，請稍候。','The operation sheet is busy. Please wait.','ใบงานกำลังดำเนินการ โปรดรอสักครู่'));
    if (!guide) throw new Error(L('請先重新載入作業單。','Reload the operation sheet first.','โปรดโหลดใบงานใหม่ก่อน'));
    await queueRef.current;
    if (dirty) await save('details', args, action, true);
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
    versionRef.current = value.version;
    setGuide(value); setArgs(value.args ?? {}); setStep(value.step || 'action'); setAction(value.action || '');
    setNewSchedule(value.intent === 'create' || (value.intent == null && value.step !== 'target' && !value.args?.schedule_id));
    setQuery(!value.action && value.step !== 'action');
    if (Array.isArray(value.args?.defects)) setDefectChoice(value.args.defects.length ? 'some' : 'none');
    if (value.proposal && (!proposal || proposal.id !== value.proposal.id || (status || proposal.status) !== value.proposal.status)) onReply({ proposal: value.proposal });
  }
  useEffect(() => {
    if ((disabled || busy || dirty) && guide) return;
    let live = true;
    api<Guide>(`/api/conversations/${conversation.id}/guide`).then(value => { if (live) adopt(value); }).catch(e => { if (live) setError(String(e.message)); });
    return () => { live = false; };
  }, [conversation.id, signal, status, disabled, busy, dirty, reload]);
  useEffect(() => { setRecords(workspace.records); setCatalogs(workspace.catalogs); setTotal(workspace.total ?? workspace.records.length); }, [workspace]);
  useEffect(() => { setTarget(selected); }, [selected]);

  async function work(fn: () => Promise<void>) {
    setBusy(true); onWorkChange?.(true); onBusyChange?.(true); setError('');
    try { await fn(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); onWorkChange?.(false); }
  }
  async function save(next: string, patch = args, chosen = action, quiet = false, intent = guide?.intent): Promise<Guide> {
    if (!guide) throw new Error(L('請稍候，正在載入步驟。', 'Please wait for the steps to load.', 'โปรดรอสักครู่ กำลังโหลดขั้นตอน'));
    const job = queueRef.current.then(async () => {
      const value = await api<Guide>(`/api/conversations/${conversation.id}/guide`, { version: versionRef.current, action: chosen, args: patch, step: next, intent: chosen === 'schedule.save' ? intent : null });
      versionRef.current = value.version;
      if (quiet) setGuide(value); else adopt(value);
      return value;
    });
    queueRef.current = job.then(() => {}, () => {});
    return job;
  }
  useEffect(() => {
    if (!guide || step !== 'details' || !action || busy || disabled || comparable(args) === comparable(guide.args)) return;
    const timer = setTimeout(() => { void save('details', args, action, true).catch(e => setError(String(e.message))); }, 650);
    return () => clearTimeout(timer);
  }, [args, guide, step, action, busy, disabled]);
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
    void api<Workspace>(`/api/workspace?${params}`).then(value => { if (active && value.records.length === 1) setTarget(value.records[0]); }).catch(() => {});
    return () => { active = false; };
  }, [args.execution_id, args.schedule_id, args.report_id, records, proposal?.id]);
  async function chooseAction(value: string) {
    await work(async () => {
      const kept = retainTarget ? target : selected;
      setTarget(kept); setQuery(value === 'query'); setLoadedQuery(false); setDefectChoice('');
      const chosen = value === 'schedule.new' ? 'schedule.save' : value;
      setNewSchedule(value === 'schedule.new');
      if (module === 'mold' && value !== 'query') {
        const history = value === 'mold.mount_start' ? 'pending' : value === 'mold.clear' ? 'history' : 'running';
        setFilters(v => ({ ...v, history })); await load(1, { history });
      }
      const next = await save(value === 'schedule.new' ? 'details' : 'target', { execution_id: null, report_id: null, schedule_id: null, ...(value === 'schedule.new' ? { status: 'DO', priority: 0 } : {}) }, value === 'query' ? '' : chosen, false, chosen === 'schedule.save' ? value === 'schedule.new' ? 'create' : 'update' : null);
      setNewSchedule(value === 'schedule.new');
      if (retainTarget && kept && ['report.add','report.cavities','report.complete'].includes(chosen)) {
        const params = chosen === 'report.complete' ? { schedule_id: kept[SID] } : { execution_id: kept[EID], ...(chosen === 'report.cavities' ? { cavities: kept.OPI_CAV } : {}) };
        const restored = await api<Guide>(`/api/conversations/${conversation.id}/guide`, { version: next.version, action: chosen, args: params, step: 'details' }); adopt(restored);
      }
      setRetainTarget(false);
    });
  }
  async function load(nextPage = 1, extra: Row = {}) {
    const params = new URLSearchParams({ module, page: String(nextPage), page_size: '20' });
    for (const [key, value] of Object.entries({ ...filters, date: endDate && filters.date ? `${filters.date}~${endDate}` : filters.date, ...extra })) if (value !== '' && value != null) params.set(key, String(value));
    const result = await api<Workspace>(`/api/workspace?${params}`);
    setRecords(result.records); setTotal(result.total ?? result.records.length); setPage(nextPage);
    setCatalogs(previous => ({ ...previous, ...result.catalogs })); setLoadedQuery(true);
    return result;
  }
  async function chooseTarget(record: Row) {
    if (query) { setTarget(record); onReply({ data: { records: [record] } }); setStep('result'); return; }
    await work(async () => {
      setTarget(record); setPendingTarget(null);
      let next: Row;
      if (action === 'schedule.save') {
        const exact = await api<Workspace>(`/api/workspace?module=schedule&schedule_id=${encodeURIComponent(string(record[SID]))}`);
        const source = exact.records[0];
        if (!source) throw new Error(L('資料已改變，請重新查詢。', 'Record changed. Search again.', 'ข้อมูลเปลี่ยนแล้ว โปรดค้นหาอีกครั้ง'));
        setCatalogs(previous => ({ ...previous, ...exact.catalogs }));
        const orders = rows(exact.catalogs.work_orders);
        next = { schedule_id: source[SID], equipment: source.EQP_NO, mold_no: source.TOL_NO, part_no: rows(source.DETAILS)[0]?.PART_NO,
          start_time: source.SCHEDULE_START_TIME, cycle_seconds: source.SCHEDULE_CYCLE_TIME, target_shots: source.TARGET_SHOT,
          status: source.PRODUCTION_STATUS, priority: source.PRIORITY, comment: source.COMMENT ?? '',
          details: rows(source.DETAILS).map(d => ({ detail_id: d.ZZ_KAOSU_PROD_SCHEDULE_DETAIL_SID, mold_detail_id: d.TOL_DETALS_SID,
            part_no: d.PART_NO, wo: d.WO ?? orders.find(w => string(w.WO_SID) === string(d.WO_SID))?.WO ?? '', cavities: d.SCHEDULE_CUR_CAV })) };
      } else if (['report.update', 'report.delete'].includes(action)) {
        setPendingTarget(record); return;
      } else if (action === 'report.add' || action === 'report.cavities') {
        next = { execution_id: record[EID] };
        if (action === 'report.cavities') next.cavities = record.OPI_CAV;
      } else next = { schedule_id: record[SID] };
      await save('details', next);
    });
  }
  async function chooseReport(record: Row) {
    await work(async () => {
      const next = reportDraft(record, action);
      await save('details', next);
    });
  }
  function field(key: string, text: string, type = 'text', minimum = 0) {
    return <label className="guide-field">{text}<input required={!['comment','priority'].includes(key)} type={type} min={type === 'number' ? minimum : undefined} step={type === 'number' ? '1' : undefined}
      value={type === 'datetime-local' ? string(args[key]).replace(' ', 'T').slice(0, 16) : string(args[key])}
      onInput={type === 'datetime-local' ? e => { const value = e.currentTarget.value; setArgs(v => ({ ...v, [key]: value })); } : undefined}
      onChange={e => setArgs(v => ({ ...v, [key]: type === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value }))}/></label>;
  }
  function select(key: string, text: string, options: { value: string; name: string }[], change?: (value: string) => void) {
    return <label className="guide-field">{text}<select required value={string(args[key])} onChange={e => change ? change(e.target.value) : setArgs(v => ({ ...v, [key]: e.target.value }))}>
      <option value="">{L('請選擇', 'Please select', 'โปรดเลือก')}</option>{options.map(o => <option key={o.value} value={o.value}>{o.name}</option>)}
    </select></label>;
  }
  function detailsForm() {
    if (action === 'schedule.save') return <>
      <div className="guide-fields">
        {select('equipment', L('設備', 'Machine', 'เครื่องจักร'), catalog('equipment').map(r => ({ value: string(r.EQP_NO), name: string(r.EQP_NO) })))}
        <label className="guide-field">{L('搜尋品號／規格', 'Find part / specification', 'ค้นหารหัสชิ้นงาน / ข้อมูลจำเพาะ')}<input value={filters.search} onChange={e => setFilters(v => ({ ...v, search: e.target.value }))}/><button type="button" className="secondary" onClick={() => void work(async () => {
          const result = await api<Workspace>(`/api/workspace?module=schedule&catalog=parts&search=${encodeURIComponent(filters.search)}`); setCatalogs(previous => ({ ...previous, parts: result.catalogs.parts }));
        })}>{L('搜尋品號', 'Find parts', 'ค้นหาชิ้นงาน')}</button></label>
        {select('part_no', L('品號', 'Part number', 'รหัสชิ้นงาน'), catalog('parts').map(r => ({ value: string(r.PART_NO), name: [r.PART_NO, r.PART_SPEC].filter(Boolean).join(' · ') })), value => {
          setArgs(v => ({ ...v, part_no: value, mold_no: null, details: [] }));
          void work(async () => { const result = await api<Workspace>(`/api/workspace?module=schedule&catalog=molds&part_no=${encodeURIComponent(value)}`); setCatalogs(previous => ({ ...previous, ...result.catalogs })); });
        })}
        {select('mold_no', L('模具', 'Mold', 'แม่พิมพ์'), catalog('molds').map(r => ({ value: string(r.TOL_NO), name: [r.TOL_NO, r.TOL_NAME].filter(Boolean).join(' · ') })), value => {
          setArgs(v => ({ ...v, mold_no: value, details: [] }));
          void work(async () => { const result = await api<Workspace>(`/api/workspace?module=schedule&catalog=molds&mold_no=${encodeURIComponent(value)}`); setCatalogs(previous => ({ ...previous, ...result.catalogs })); });
        })}
      </div>
      <p>{L('選擇模具的各組模穴，再分配工單與穴數。', 'Choose each mold detail, then assign an order and cavities.', 'เลือกแต่ละชุดโพรงแม่พิมพ์ แล้วกำหนดใบสั่งผลิตและจำนวนโพรง')}</p>
      {details.map((d, i) => <fieldset className="guide-detail" key={i}>
        <legend>{L('工單與模穴', 'Order and cavities', 'ใบสั่งผลิตและจำนวนโพรง')} {i + 1}</legend>
        <label className="guide-field">{L('模具明細／品號', 'Mold detail / Part', 'รายละเอียดแม่พิมพ์ / รหัสชิ้นงาน')}<select required value={string(d.mold_detail_id)} onChange={e => {
          const chosen = moldDetails.find(m => string(m.TOL_DETALS_SID) === e.target.value);
          setArgs(v => ({ ...v, part_no: i === 0 ? chosen?.PART_NO : v.part_no, details: details.map((r, j) => i === j ? { ...r, mold_detail_id: e.target.value, part_no: chosen?.PART_NO, wo: '', cavities: null } : r) }));
        }}><option value="">{L('請選擇', 'Please select', 'โปรดเลือก')}</option>{moldDetails.map(m => <option key={string(m.TOL_DETALS_SID)} value={string(m.TOL_DETALS_SID)}>{[m.TOL_DETALS_NO, m.TOL_DETALS_NAME, m.PART_NO].filter(Boolean).join(' · ')}</option>)}</select></label>
        <label className="guide-field">{L('工單', 'Work order', 'ใบสั่งผลิต')}<select value={string(d.wo)} onChange={e => setArgs(v => ({ ...v, details: details.map((r, j) => j === i ? { ...r, wo: e.target.value } : r) }))}>
          <option value="">{L('未分配工單（僅限0穴）', 'Unassigned (zero cavities only)', 'ไม่กำหนดใบสั่งผลิต (เฉพาะ 0 โพรง)')}</option>
          {catalog('work_orders').filter(w => w.PART_NO === d.part_no).map(w => <option key={string(w.WO_SID ?? w.WO)} value={string(w.WO)}>{string(w.WO)}</option>)}</select></label>
        <label className="guide-field">{L('模穴數', 'Cavities', 'จำนวนโพรง')}<input type="number" required min={0} step={1} value={string(d.cavities)} onChange={e => setArgs(v => ({ ...v, details: details.map((r, j) => j === i ? { ...r, cavities: e.target.value === '' ? null : Number(e.target.value) } : r) }))}/></label>
        <button type="button" className="secondary" onClick={() => setArgs(v => ({ ...v, details: details.filter((_, j) => j !== i) }))}>{L('移除此列', 'Remove row', 'ลบรายการนี้')}</button>
      </fieldset>)}
      <button type="button" className="secondary" disabled={!args.mold_no} onClick={() => setArgs(v => ({ ...v, details: [...details, {}] }))}>+ {L('加入工單／模穴', 'Add order / cavities', 'เพิ่มใบสั่งผลิต / โพรง')}</button>
      <div className="guide-fields">{field('start_time', L('開始時間（MES時間）', 'Start (MES time)', 'เวลาเริ่ม (เวลา MES)'), 'datetime-local')}{field('cycle_seconds', L('週期（秒）', 'Cycle (seconds)', 'รอบการผลิต (วินาที)'), 'number', 1)}{field('target_shots', L('目標模次', 'Target shots', 'จำนวนรอบเป้าหมาย'), 'number')}</div>
      <details><summary>{L('進階設定：狀態、優先序、備註', 'More: status, priority and note', 'เพิ่มเติม: สถานะ ลำดับ และหมายเหตุ')}</summary>
        {select('status', L('生產狀態', 'Production status', 'สถานะการผลิต'), ['TRY','DO','RUN'].map(value => ({ value, name: value })))}
        {field('priority', L('優先序', 'Priority', 'ลำดับความสำคัญ'), 'number')}
        {field('comment', L('備註', 'Note', 'หมายเหตุ'))}
      </details>
    </>;
    if (action === 'report.add' || action === 'report.update') return <>
      {field('ok', L('這一筆人工良品數量', 'Good units in this record', 'จำนวนชิ้นงานดีในรายการนี้'), 'number')}
      <fieldset><legend>{L('有不良品嗎？', 'Any defects?', 'มีชิ้นงานเสียหรือไม่?')}</legend><div className="guide-options">
        <button type="button" aria-pressed={defectChoice === 'none'} className="secondary" onClick={() => { setDefectChoice('none'); setArgs(v => ({ ...v, defects: [] })); }}>{L('沒有不良品', 'No defects', 'ไม่มีชิ้นงานเสีย')}</button>
        <button type="button" aria-pressed={defectChoice === 'some'} className="secondary" onClick={() => { setDefectChoice('some'); if (!defects.length) setArgs(v => ({ ...v, defects: [{}] })); }}>{L('有，選原因與數量', 'Yes, add reason and quantity', 'มี ระบุสาเหตุและจำนวน')}</button>
      </div></fieldset>
      {defectChoice === 'some' && defects.map((d, i) => <div className="guide-defect" key={i}>
        <label className="guide-field">{L('不良原因', 'Defect reason', 'สาเหตุของเสีย')}<select required value={string(d.code)} onChange={e => setArgs(v => ({ ...v, defects: defects.map((r, j) => j === i ? { ...r, code: e.target.value } : r) }))}><option value="">{L('請選擇', 'Please select', 'โปรดเลือก')}</option>{catalog('defect_reasons').map(r => <option key={string(r.NG_CODE_NO)} value={string(r.NG_CODE_NO)}>{[r.NG_CODE_NO, r.NG_CODE_NAME].filter(Boolean).join(' · ')}</option>)}</select></label>
        <label className="guide-field">{L('不良數量', 'Defect quantity', 'จำนวนชิ้นงานเสีย')}<input type="number" required min={1} step={1} value={string(d.quantity)} onChange={e => setArgs(v => ({ ...v, defects: defects.map((r, j) => j === i ? { ...r, quantity: e.target.value === '' ? null : Number(e.target.value) } : r) }))}/></label>
        <button type="button" className="secondary" onClick={() => setArgs(v => ({ ...v, defects: defects.filter((_, j) => j !== i) }))}>{L('移除', 'Remove', 'ลบ')}</button>
      </div>)}
      {defectChoice === 'some' && <button type="button" className="secondary" onClick={() => setArgs(v => ({ ...v, defects: [...defects, {}] }))}>+ {L('另一個原因', 'Another reason', 'เพิ่มสาเหตุ')}</button>}
      <label className="guide-field">{L('備註（選填）', 'Note (optional)', 'หมายเหตุ (ไม่บังคับ)')}<input value={string(args.comment)} onChange={e => setArgs(v => ({ ...v, comment: e.target.value }))}/></label>
    </>;
    if (action === 'report.cavities') return field('cavities', L('實際報工模穴數', 'Actual reporting cavities', 'จำนวนโพรงที่ใช้รายงาน'), 'number');
    return <div className="guide-operation-note"><ClipboardList size={24}/><p>{L('下一步會列出實際影響，核對並同意後才執行。', 'Next, review the actual impact. Execution requires your confirmation.', 'ขั้นตอนถัดไปจะแสดงผลกระทบ กรุณาตรวจสอบและยืนยันก่อนดำเนินการ')}</p></div>;
  }
  const selectedReport = pendingTarget ? rows(pendingTarget.REPORTS) : reportRows;
  const completed = ['succeeded', 'cancelled'].includes(status);
  const at = completed && step === 'review' ? 4 : proposal && ['pending','unknown'].includes(status || 'pending') ? 3 : Math.max(0, steps.indexOf(step));
  return <section className="guided-flow" aria-label={L('作業單', 'Operation sheet', 'ใบงาน')}>
    <div className="operation-sheet-status" role="status">{dirty || busy ? L('正在儲存草稿…','Saving draft…','กำลังบันทึกฉบับร่าง…') : at === 3 ? L('待核對','Ready for review','รอตรวจสอบ') : at === 4 ? L('作業結果','Result','ผลลัพธ์') : L('草稿 · 尚未送出','Draft · not submitted','ฉบับร่าง · ยังไม่ส่ง')}</div>
    {!onContextChange && <div className="guide-context"><strong>{L('目前作業','Current task','งานปัจจุบัน')}</strong><span>{contextTitle}</span></div>}
    {error && <div className="error-banner" role="alert"><span>{error}</span>{!guide && <button className="secondary" onClick={() => { setError(''); setReload(v => v + 1); }}>{L('重新載入作業單','Reload operation sheet','โหลดใบงานใหม่')}</button>}</div>}
    <fieldset className="guide-body" disabled={locked}>
    {at === 0 && <><h2>{L('你要做什麼？','What would you like to do?','คุณต้องการทำอะไร?')}</h2><div className="guide-action-grid">{['query', ...(module === 'schedule' ? ['schedule.new','schedule.save'] : module === 'report' ? ['report.add','report.update','report.delete','report.cavities','report.complete'] : ['mold.mount_start','mold.mount_finish','mold.unmount_start','mold.unmount_finish','mold.clear'])].map(value => <button key={value} className="secondary" disabled={locked || !guide} onClick={() => void chooseAction(value)}>{actionName(value)}<ArrowRight size={18}/></button>)}</div></>}
    {at === 1 && <><h2>{query ? L('查詢作業資料','Find operation records','ค้นหาข้อมูลการทำงาน') : L('選擇這次要操作的對象','Choose the record to work on','เลือกรายการที่จะดำเนินการ')}</h2>
      {action === 'schedule.save' && newSchedule ? <p>{L('新增排程，下一步選設備、模具與工單。','Create a new schedule. Choose the machine, mold and order next.','เพิ่มแผนใหม่ ขั้นตอนถัดไปเลือกเครื่องจักร แม่พิมพ์ และใบสั่งผลิต')}</p> : <>
      <form className="guide-fields" onSubmit={e => { e.preventDefault(); void work(async () => { await load(); }); }}>
        {(['equipment','date','wo'] as const).map((key,i) => <label className="guide-field" key={key}>{[L('設備','Machine','เครื่องจักร'),L('日期','Date','วันที่'),L('工單','Work order','ใบสั่งผลิต')][i]}<input type={key === 'date' ? 'date' : 'text'} value={filters[key]} onChange={e => setFilters(v => ({ ...v, [key]: e.target.value }))}/></label>)}
        <details className="guide-search-options"><summary>{L('更多查詢條件','More search options','ตัวเลือกการค้นหาเพิ่มเติม')}</summary>
        <label className="guide-field">{L('結束日期（選填）','End date (optional)','วันที่สิ้นสุด (ไม่บังคับ)')}<input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}/></label>
        <label className="guide-field">{L('排序','Sort','เรียงลำดับ')}<select value={filters.sort} onChange={e => setFilters(v => ({ ...v, sort: e.target.value }))}><option value="">{L('原本順序','Default order','ลำดับเดิม')}</option><option value="EQP_NO">{L('設備：小到大','Machine: ascending','เครื่องจักร: น้อยไปมาก')}</option><option value="-EQP_NO">{L('設備：大到小','Machine: descending','เครื่องจักร: มากไปน้อย')}</option></select></label>
        {module === 'mold' && <label className="guide-field">{L('廠別','Factory','โรงงาน')}<select value={filters.fac} onChange={e => setFilters(v => ({ ...v, fac: e.target.value }))}><option value="">{L('全部','All','ทั้งหมด')}</option>{['fac1','fac2','fac3'].map((f,i) => <option key={f} value={f}>{L('廠','Factory','โรงงาน')} {i+1}</option>)}</select></label>}
        {module !== 'schedule' && <label className="guide-field">{L('範圍','Records','ขอบเขต')}<select value={filters.history} onChange={e => setFilters(v => ({ ...v, history: e.target.value }))}><option value="all">{L('全部','All','ทั้งหมด')}</option><option value="pending">{L('待開始','Pending','รอเริ่ม')}</option><option value="running">{L('進行中','Running','กำลังดำเนินการ')}</option><option value="history">{L('歷史','History','ประวัติ')}</option></select></label>}
        </details><button className="primary" disabled={locked} type="submit"><RefreshCw size={18}/>{L('查詢','Search','ค้นหา')}</button>
      </form>
      <p>{L('找到','Found','พบ')} {total} {L('筆，選擇符合現場的工單。','records. Choose the correct order.','รายการ เลือกใบสั่งผลิตที่ตรงกับหน้างาน')}</p>
      <div className="guide-records">{choices.map((record,i) => <button className="guide-record secondary" type="button" key={i} disabled={locked || !canChooseRecord(module, action, query, record)} onClick={() => void chooseTarget(record)}><strong>{title(record) || L('作業資料','Operation record','ข้อมูลการทำงาน')}</strong><span>{[record.PART_NO, record.ITEM_SPEC, record.OPI_CAV != null ? `${L('模穴','Cavities','โพรง')}: ${record.OPI_CAV}` : null].filter(Boolean).join(' · ')}</span>{module === 'mold' && record.NEXT_ACTION ? <span>{L('下一階段','Next stage','ขั้นตอนถัดไป')}: {actionName(string(record.NEXT_ACTION))}</span> : null}</button>)}</div>
      {!choices.length && <p>{L('沒有符合資料，請調整設備或日期再查詢。','No matching records. Change the machine or date.','ไม่พบข้อมูล โปรดเปลี่ยนเครื่องจักรหรือวันที่')}</p>}
      <div className="guide-options"><button className="secondary" disabled={locked || page <= 1} onClick={() => void work(async () => { await load(page-1); })}>{L('上一頁','Previous page','หน้าก่อน')}</button><span>{page}</span><button className="secondary" disabled={locked || page*20 >= total} onClick={() => void work(async () => { await load(page+1); })}>{L('下一頁','Next page','หน้าถัดไป')}</button></div>
      {pendingTarget && <fieldset><legend>{L('選擇單筆人工報工','Choose one production record','เลือกบันทึกผลผลิตหนึ่งรายการ')}</legend>{selectedReport.map((r,i) => <button className="secondary guide-record" key={i} disabled={locked} onClick={() => void chooseReport(r)}>{[r.CREATE_TIME, `${L('良品','Good','ชิ้นงานดี')}: ${r.OK_QTY}`, `${L('不良','Defects','ของเสีย')}: ${r.NG_QTY ?? rows(r.DEFECTS).reduce((n,d) => n + Number(d.NG_CODE_QTY ?? 0),0)}`].join(' · ')}</button>)}{!selectedReport.length && <p>{L('這筆工單沒有人工報工紀錄。','This order has no manual production records.','ใบสั่งผลิตนี้ยังไม่มีบันทึกผลผลิต')}</p>}</fieldset>}
      </>}
      <div className="guide-navigation"><button className="secondary" disabled={locked} onClick={() => void work(async () => { await save('action'); setQuery(false); })}><ArrowLeft size={18}/>{L('上一步','Back','ย้อนกลับ')}</button>{((action === 'schedule.save' && newSchedule) || query) && <button className="primary" disabled={locked || (query && !loadedQuery)} onClick={() => void work(async () => { if (query) { onReply({ data: { records } }); setStep('result'); } else await save('details', { ...args, status: args.status ?? 'DO', priority: args.priority ?? 0 }); })}>{L('下一步','Next','ถัดไป')}<ArrowRight size={18}/></button>}</div>
    </>}
    {at === 2 && <form onSubmit={e => { e.preventDefault(); void work(async () => {
      if (!hasTarget) throw new Error(L('請先選擇工單。','Choose an order first.','โปรดเลือกใบสั่งผลิตก่อน'));
      if (['report.add','report.update'].includes(action) && (!defectChoice || (defectChoice === 'some' && !defects.length))) throw new Error(L('請明確選擇有無不良並填入明細。','Specify whether there are defects and enter the details.','โปรดระบุว่ามีของเสียหรือไม่และกรอกรายละเอียด'));
      const value = await save('details');
      if (!value.ready) { setStep('details'); throw new Error(L('資料還沒填齊，請完成必要欄位。','Some details are missing. Complete the required fields.','ข้อมูลยังไม่ครบ โปรดกรอกข้อมูลที่จำเป็น')); }
      const reply = await api<Reply>(`/api/conversations/${conversation.id}/proposals`, { version: value.version, action: value.action, args: value.args });
      adopt(await api<Guide>(`/api/conversations/${conversation.id}/guide`)); onReply(reply); setStep('review');
    }); }}><h2>{actionName(action === 'schedule.save' && newSchedule ? 'schedule.new' : action)}</h2>{detailsForm()}<div className="guide-navigation"><button className="secondary" type="button" disabled={locked} onClick={() => void work(async () => { await save('target'); })}><ArrowLeft size={18}/>{L('上一步','Back','ย้อนกลับ')}</button><button className="primary" type="submit" disabled={locked}>{L('下一步：核對內容','Next: review changes','ถัดไป: ตรวจสอบข้อมูล')}<ArrowRight size={18}/></button></div></form>}
    {at === 3 && <><h2>{L('請核對下方確認卡','Review the confirmation card below','โปรดตรวจสอบบัตรยืนยันด้านล่าง')}</h2><p>{L('資料正確後，再按確認卡的同意按鈕。需要修改時可回上一步，或直接用自然語言說明。','Approve using the card only after checking the details. Go back or describe any changes.','เมื่อข้อมูลถูกต้องแล้วจึงกดยืนยันในบัตร หากต้องการแก้ไขให้ย้อนกลับหรือพิมพ์บอกผู้ช่วย')}</p>{status !== 'unknown' && <button className="secondary" disabled={locked} onClick={() => void work(async () => { await save('details'); onReply({ proposal: { ...proposal!, status: 'superseded' } }); })}><ArrowLeft size={18}/>{L('上一步：修改資料','Back: change details','ย้อนกลับ: แก้ไขข้อมูล')}</button>}</>}
    {at === 4 && <><h2>{query ? L('查詢完成','Search complete','ค้นหาเสร็จแล้ว') : status === 'cancelled' ? L('已取消，沒有寫入','Cancelled, no changes written','ยกเลิกแล้ว ไม่มีการบันทึก') : L('已完成並留下紀錄','Completed and recorded','ดำเนินการเสร็จและบันทึกแล้ว')}</h2><div className="guide-options"><button className="secondary" onClick={onAudit}>{L('查看紀錄','View history','ดูประวัติ')}</button><button className="primary" disabled={locked} onClick={() => void work(async () => { await save('action', {}, ''); setQuery(false); setRetainTarget(true); })}>{L('同工單再做一筆','Another task for this order','ทำรายการใหม่ในใบสั่งผลิตเดิม')}</button><button className="secondary" onClick={onHome}>{L('回作業選擇','Choose another module','เลือกโมดูลอื่น')}</button></div></>}
    </fieldset>
    {busy && <p role="status">{L('正在核對資料…','Checking details…','กำลังตรวจสอบข้อมูล…')}</p>}
  </section>;
}
