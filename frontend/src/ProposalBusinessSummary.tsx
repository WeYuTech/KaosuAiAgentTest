import {mesDate,productionStatus} from './presentation';
import { t } from './i18n';
import { ArrowRight, CalendarDays, Factory, ClipboardList } from 'lucide-react';
import { display, type Proposal, type Row, type Workspace } from './api';

export function DetailedProposalBusinessSummary({ proposal, workspace }: { proposal: Proposal; workspace: Workspace }) {
  const { args, changes, target = {}, action } = proposal;
  const date = (value:unknown) => mesDate(value, proposal.business_timezone);
  const record = workspace.records.find(row =>
    (args.execution_id && String(row.WIP_OPI_WDOEACICO_HIST_SID) === String(args.execution_id)) ||
    (args.schedule_id && String(row.ZZ_KAOSU_PROD_SCHEDULE_SID) === String(args.schedule_id)) ||
    (args.report_id && Array.isArray(row.REPORTS) && row.REPORTS.some(report => String((report as Row).WIP_OPI_WDOEACICOOUTPUT_HIST_SID) === String(args.report_id))),
  );
  const equipment = target.equipment ?? record?.EQP_NO ?? args.equipment;
  const workOrder = target.work_order ?? record?.WO;
  const scheduleTime = args.start_time ?? record?.SCHEDULE_START_TIME;
  const executionTime = target.execution_time ?? record?.REAL_CHECK_IN_TIME ?? record?.CHECK_IN_TIME;
  const partNo = target.part_no ?? record?.PART_NO ?? args.part_no;
  const parts = Array.isArray(workspace.catalogs.parts) ? workspace.catalogs.parts as Row[] : [];
  const part = [partNo,target.part_spec ?? record?.PART_SPEC ?? parts.find(row=>row.PART_NO===partNo)?.PART_SPEC].filter(Boolean).join(' · ');
  const report = target.report_before ?? (Array.isArray(record?.REPORTS) ? (record.REPORTS as Row[]).find(r => String(r.WIP_OPI_WDOEACICOOUTPUT_HIST_SID) === String(args.report_id)) : undefined);
  const affected = [...new Set((target.affected_orders ?? []).map(order => typeof order === 'string' ? order : typeof order === 'object' && order ? display((order as Row).WO ?? (order as Row).work_order ?? (order as Row).wo ?? order) : display(order)))];
  const reasons = Array.isArray(workspace.catalogs.defect_reasons) ? workspace.catalogs.defect_reasons as Row[] : [];
  const defects = Array.isArray(args.defects) ? args.defects as { code: string; quantity: number }[] : [];
  const previousDefects=Array.isArray(report?.DEFECTS)?report.DEFECTS as Row[]:[];
  const visibleDefects=action==='report.update'?[...defects,...previousDefects.filter(row=>!defects.some(d=>d.code===row.NG_CODE)).map(row=>({code:String(row.NG_CODE),quantity:0}))]:defects;
  const findChange = (field: string) => changes.find(change => change.field === field);
  const nextTimes = changes.filter(change => change.field === 'REAL_CHECK_IN_TIME' && change.before !== change.after);
  const molds = Array.isArray(workspace.catalogs.molds) ? workspace.catalogs.molds as Row[] : [];
  const mold = molds.find(row => String(row.TOL_NO) === String(args.mold_no));
  const moldDetails = Array.isArray(mold?.DETAILS) ? mold.DETAILS as Row[] : [];
  const allocations = target.schedule_details ?? (Array.isArray(args.details) ? args.details as Row[] : []);
  const allocationLabel = (item: Row) => {
    const savedDetails = Array.isArray(record?.DETAILS) ? record.DETAILS as Row[] : [];
    const saved = item.detail_id ? savedDetails.find(row => String(row.ZZ_KAOSU_PROD_SCHEDULE_DETAIL_SID) === String(item.detail_id)) : undefined;
    const detailId = item.mold_detail_id ?? saved?.TOL_DETALS_SID;
    const candidates = moldDetails.filter(row => String(row.PART_NO) === String(item.part_no));
    const detail = detailId != null ? moldDetails.find(row => String(row.TOL_DETALS_SID) === String(detailId)) : candidates.length === 1 ? candidates[0] : undefined;
    const name = item.mold_detail_name ?? detail?.TOL_DETALS_NAME;
    const number = item.mold_detail_no ?? detail?.TOL_DETALS_NO;
    const identity = name && number ? `${display(name)}（${display(number)}）` : display(name ?? number ?? t("模具明細待核對"));
    return `${display(item.wo || item.part_no)} · ${identity}`;
  };
  const businessRow = (title: string, after: unknown, before?: unknown, unit = '') => <div className={`business-value ${before !== undefined && before !== null ? date(before)!==date(after) ? 'is-changed' : 'is-unchanged' : ''}`}><span>{title}</span><strong>{before !== undefined && before !== null && date(before)!==date(after) && <><span className="business-before">{date(before)}</span><ArrowRight size={14}/></>}<span className="business-after">{date(after)}{unit && <small>{unit}</small>}</span></strong></div>;

  return <div className="business-summary" tabIndex={action.startsWith('mold.')?0:undefined} aria-label={action.startsWith('mold.')?t('核對時間與連動影響'):undefined}>
    <div className="business-target">
      {Boolean(equipment) && <span><Factory size={16}/><span><small>{t("設備")}</small><strong>{display(equipment)}</strong></span></span>}
      {action!=='report.complete' && Boolean(workOrder) && <span><ClipboardList size={16}/><span><small>{t("工單")}</small><strong>{display(workOrder)}</strong></span></span>}
      {!['report.complete','report.delete'].includes(action) && Boolean(part) && <span><span><small>{t("品號／規格")}</small><strong>{part}</strong></span></span>}
      {!action.startsWith('mold.') && !['report.complete','report.delete'].includes(action) && Boolean(executionTime) && <span><span><small>{t("本次執行")}</small><strong>{date(executionTime)}</strong></span></span>}
      {Boolean(report?.CREATE_TIME)&&<span><span><small>{t('報工時間')}</small><strong>{date(report?.CREATE_TIME)}</strong></span></span>}
      {action!=='schedule.save' && Boolean(scheduleTime) && <span><CalendarDays size={16}/><span><small>{t("預計開始")}</small><strong>{date(scheduleTime)}</strong></span></span>}
    </div>
    {action === 'report.add' || action === 'report.update' ? <>
      <div className="business-quantities">{businessRow(t("人工良品"), args.ok, action === 'report.update' ? findChange('OK_QTY')?.before ?? report?.OK_QTY : undefined, t("件"))}{businessRow(t("不良合計"), defects.reduce((sum, item) => sum + Number(item.quantity), 0), action === 'report.update' ? findChange('NG_QTY')?.before ?? report?.NG_QTY : undefined, t("件"))}</div>
      {visibleDefects.length > 0 && <div className="business-defects"><span className="business-caption">{t("不良原因")}</span>{visibleDefects.map((defect, index) => {
        const reason = reasons.find(reason => reason.NG_CODE_NO === defect.code);
        const name = reason?.NG_CODE_NAME ?? reason?.NAME ?? t('原因名稱未提供');
        const previous = Array.isArray(report?.DEFECTS) ? (report.DEFECTS as Row[]).find(item => item.NG_CODE === defect.code)?.NG_CODE_QTY : undefined;
        return <div key={`${defect.code}-${index}`}>{businessRow(display(name), defect.quantity, action === 'report.update' ? previous : undefined, t("件"))}</div>;
      })}</div>}
      <p className="business-note">{t("以上為人工報工數量，與 IoT 推算產量分開記錄。")}</p>
    </> : null}
    {action === 'report.delete' && <div className="business-quantities">{businessRow(t("將刪除人工良品"), findChange('OK_QTY')?.before ?? report?.OK_QTY, undefined, t("件"))}{businessRow(t("將刪除不良數"), findChange('NG_QTY')?.before ?? report?.NG_QTY, undefined, t("件"))}</div>}
    {action === 'report.cavities' && <p>{t('模具明細')}：{[target.mold_detail_name,target.mold_detail_no].filter(Boolean).join(' · ')}</p>}
    {action === 'report.cavities' && businessRow(t("報工模穴數"), args.cavities, target.cavities_before ?? findChange('OPI_CAV')?.before, t("穴"))}
    {action === 'report.complete' && businessRow(t('完工狀態'),t('已完工'),findChange('COMPLETED')?.before==='Y'?t('已完工'):t('未完工'))}
    {action === 'report.complete' && target.next_schedule===null && <p className="business-note">{t('無下一張排程')}</p>}
    {action === 'report.complete' && findChange('COMPLETED_TIME') && businessRow(t("完工時間"), findChange('COMPLETED_TIME')?.after)}
    {action.startsWith('mold.') && Object.entries({ ZZ_MODLE_UPLOAD_START: t("開始上模時間"), ZZ_MODLE_UPLOAD_END: t("完成上模時間"), ZZ_MODLE_REMOVE_START: t("開始下模時間"), ZZ_MODLE_REMOVE_END: t("完成下模時間") }).map(([field, title]) => {
      const change = findChange(field);
      return change ? <div key={field}>{businessRow(title, change.after === null ? t("清除時間") : change.after, change.before)}</div> : null;
    })}
    {action === 'schedule.save' && <>
      <h3>{t('基本資料')}</h3>
      {record&&args.schedule_id&&args.equipment!==record.EQP_NO&&businessRow(t("設備"),args.equipment,record.EQP_NO)}
      {businessRow(t("模具"), args.mold_no,args.schedule_id?record?.TOL_NO:undefined)}
      {businessRow(t('生產狀態'),productionStatus(args.status),findChange('PRODUCTION_STATUS')?.before!=null?productionStatus(findChange('PRODUCTION_STATUS')?.before):undefined)}{businessRow(t('優先序'),args.priority,findChange('PRIORITY')?.before)}
      {businessRow(t("排程日期"), findChange('SCHEDULE_DATE')?.after ?? record?.SCHEDULE_DATE,findChange('SCHEDULE_DATE')?.before)}
      <h3>{t("時間與產量")}</h3>{businessRow(t("預計開始"),findChange('SCHEDULE_START_TIME')?.after??record?.SCHEDULE_START_TIME??args.start_time,findChange('SCHEDULE_START_TIME')?.before)}
      {businessRow(t("預計結束"), findChange('SCHEDULE_END_TIME')?.after ?? record?.SCHEDULE_END_TIME,findChange('SCHEDULE_END_TIME')?.before)}
      <div className="business-quantities">{businessRow(t("週期"), args.cycle_seconds, findChange('SCHEDULE_CYCLE_TIME')?.before, t("秒"))}{businessRow(t("目標模次"), args.target_shots, findChange('TARGET_SHOT')?.before, t("模"))}</div>
      {allocations.length > 0 && <div className="business-defects"><h3>{t("工單與模具明細分配")}</h3>{allocations.map((item, index) => {const previous=item.previous as Row|undefined;return <div key={index}>{previous&&previous.wo!==item.wo&&businessRow(t('工單分配'),item.wo||t('未分配工單'),previous.wo||t('未分配工單'))}{businessRow(allocationLabel(item), item.cavities, previous?.cavities, t("穴"))}{businessRow(t("目標件數"), Number(item.cavities) * Number(args.target_shots), previous?.target_pcs, t("件"))}<small>{t("目標件數＝模次×穴數")}：{args.target_shots as number} × {item.cavities as number}</small></div>;})}</div>}
    </>}
    {['mold.clear','mold.unmount_finish'].includes(action) && ['CHECK_IN_TIME','CHECK_OUT_TIME','COMPLETED_TIME','COMPLETED'].map(field => {
      const change = findChange(field); if (!change) return null;
      return <div key={field}>{businessRow(t(field === 'CHECK_IN_TIME' ? '進站時間' : field === 'CHECK_OUT_TIME' ? '出站時間' : field==='COMPLETED_TIME'?'完工時間':'完工狀態'), field==='COMPLETED'?t(change.after==='Y'?'已完工':'未完工'):change.after === null ? t('清除時間') : change.after, field==='COMPLETED'?t(change.before==='Y'?'已完工':'未完工'):change.before)}</div>;
    })}
    {(action === 'report.complete' || action === 'mold.clear' || action === 'mold.unmount_finish') && <div className="business-impact"><strong>{t("影響工單")}</strong>{affected.length ? <ul>{affected.map(order => <li key={order}>{order}</li>)}</ul> : workOrder ? <p>{display(workOrder)}</p> : <p>{t("請核對上方作業對象與摘要。")}</p>}{action === 'report.complete' && <p>{t("同一排程的所有工單會一併完工。")}</p>}{action === 'mold.clear' && <p>{t("會清除這張排程的上下模與進出站時間，並取消完工。請確認現場狀態。")}</p>}</div>}
    {action==='report.complete' && target.next_schedule && <div className="business-impact"><strong>{t('連動作業')}</strong><p>{target.next_schedule.orders.join(' · ')}</p><p>{t('下一張排程的實際開始時間會一併更新為：')}{date(target.next_schedule.start_time)}</p></div>}
    {action!=='report.complete' && nextTimes.length > 0 && <div className="business-impact"><strong>{t("連動作業")}</strong><p>{t("下一張排程的實際開始時間會一併更新為：")}{date(nextTimes[0].after)}</p></div>}

    {args.comment !== undefined && (String(args.comment).trim() || action==='schedule.save'&&findChange('COMMENT')) && businessRow(t("備註"), args.comment || t("未填寫"),action==='schedule.save'?findChange('COMMENT')?.before:undefined)}
  </div>;
}

/** 核對頁的業務投影；全部數值仍取自伺服器 proposal，完整資料保留在異動明細。 */
export function ProposalBusinessSummary({proposal,workspace}:{proposal:Proposal;workspace:Workspace}) {
 const {action,args,target={},changes}=proposal;
 const record=workspace.records.find(r=>(args.execution_id&&String(r.WIP_OPI_WDOEACICO_HIST_SID)===String(args.execution_id))||(args.schedule_id&&String(r.ZZ_KAOSU_PROD_SCHEDULE_SID)===String(args.schedule_id))||(args.report_id&&Array.isArray(r.REPORTS)&&(r.REPORTS as Row[]).some(x=>String(x.WIP_OPI_WDOEACICOOUTPUT_HIST_SID)===String(args.report_id))));
 const report=target.report_before??(Array.isArray(record?.REPORTS)?(record.REPORTS as Row[]).find(r=>String(r.WIP_OPI_WDOEACICOOUTPUT_HIST_SID)===String(args.report_id)):undefined);
 const before=(field:string)=>changes.find(c=>c.field===field)?.before;
 const after=(field:string)=>changes.find(c=>c.field===field)?.after;
 const reasons=Array.isArray(workspace.catalogs.defect_reasons)?workspace.catalogs.defect_reasons as Row[]:[];
 const defects=Array.isArray(args.defects)?args.defects as Row[]:[];
 const unit=(value:unknown,name='件')=>`${display(value)} ${t(name)}`;
 const rows:{label:string;value:unknown;before?:unknown}[]=[];
 const add=(label:string,value:unknown,previous?:unknown)=>rows.push({label:t(label),value,before:previous});
 const date=(v:unknown)=>mesDate(v,proposal.business_timezone);
 const compactDate=(v:unknown)=>date(v).replace(/^\d{4}-(\d{2})-(\d{2}) (\d{2}:\d{2})(?::\d{2})?$/, '$1/$2 $3');
 if(['report.update','report.delete'].includes(action)){add('報工紀錄',report?.REPORT_NO??t('單筆人工報工'));add('報工時間',compactDate(report?.CREATE_TIME));}
 if(['report.add','report.update'].includes(action)){
  add('人工良品',unit(args.ok),action==='report.update'?unit(before('OK_QTY')??report?.OK_QTY):undefined);
  add('不良合計',unit(defects.reduce((n,d)=>n+Number(d.quantity),0)),action==='report.update'?unit(before('NG_QTY')??report?.NG_QTY):undefined);
  const defectText=(items:Row[])=>items.length?items.map(d=>`${display(reasons.find(r=>r.NG_CODE_NO===(d.code??d.NG_CODE))?.NG_CODE_NAME??t('原因名稱未提供'))} ${unit(d.quantity??d.NG_CODE_QTY)}`).join('、'):t('無');
  add('不良原因',defectText(defects),action==='report.update'&&Array.isArray(report?.DEFECTS)?defectText(report.DEFECTS as Row[]):undefined);
 }else if(action==='report.delete'){add('將刪除良品',unit(before('OK_QTY')??report?.OK_QTY));add('將刪除不良',unit(before('NG_QTY')??report?.NG_QTY));}
 else if(action==='report.cavities')add('模穴數',unit(args.cavities,'穴'),unit(target.cavities_before??before('OPI_CAV')??record?.OPI_CAV,'穴'));
 else if(action==='report.complete'){
  add('影響工單',(target.affected_orders??[]).map(o=>typeof o==='string'?o:display((o as Row).WO??(o as Row).wo)).join('、'));
  add('排程狀態',after('COMPLETED')==='Y'?t('完工'):after('COMPLETED')==='N'?t('未完工'):t('依伺服器預覽確認'),before('COMPLETED')==='Y'?t('完工'):record?.PRODUCTION_STATUS==='RUN'?t('生產中'):before('COMPLETED')==='N'?t('未完工'):undefined);add('下一排程時間',target.next_schedule?date(target.next_schedule.start_time):target.next_schedule===null?t('無下一張排程'):t('依伺服器預覽確認'));
 }else if(action==='schedule.save'){
  add('設備',args.equipment);add('模具',args.mold_no);add('開始時間（MES）',date(after('SCHEDULE_START_TIME')??args.start_time).replace(/:00$/,''),args.schedule_id?date(before('SCHEDULE_START_TIME')).replace(/:00$/,''):undefined);
  add('預計結束（MES）',compactDate(after('SCHEDULE_END_TIME')??record?.SCHEDULE_END_TIME));add('週期',unit(args.cycle_seconds,'秒'),args.schedule_id?unit(before('SCHEDULE_CYCLE_TIME'),'秒'):undefined);add('目標模次',unit(args.target_shots,'模'));add('生產狀態',['DO','TRY','RUN'].includes(String(args.status))?`${productionStatus(args.status)}（${args.status}）`:productionStatus(args.status));
  const details=target.schedule_details??(Array.isArray(args.details)?args.details as Row[]:[]);
  const molds=Array.isArray(workspace.catalogs.molds)?workspace.catalogs.molds as Row[]:[];const mold=molds.find(m=>m.TOL_NO===args.mold_no);const catalog=Array.isArray(mold?.DETAILS)?mold.DETAILS as Row[]:[];
  details.forEach(d=>{const detail=catalog.find(m=>String(m.TOL_DETALS_SID)===String(d.mold_detail_id));add([d.mold_detail_no??detail?.TOL_DETALS_NO,d.part_no].filter(Boolean).join(' · '),d.wo||t('未分配工單'));add('模穴數',unit(d.cavities,'穴'),d.previous?unit((d.previous as Row).cavities,'穴'):undefined);add('目標件數',unit(Number(d.cavities)*Number(args.target_shots)));});
  if(Number(args.priority))add('優先序',args.priority);
 }else if(action.startsWith('mold.')){
  add('本次動作',t(({'mold.mount_start':'上模開始','mold.mount_finish':'上模完成','mold.unmount_start':'下模開始','mold.unmount_finish':'下模完成','mold.clear':'清除換模紀錄'} as Record<string,string>)[action]));add('模具',record?.TOL_NO);
  const names:Record<string,string>={ZZ_MODLE_UPLOAD_START:'開始上模',ZZ_MODLE_UPLOAD_END:'完成上模',ZZ_MODLE_REMOVE_START:'開始下模',ZZ_MODLE_REMOVE_END:'完成下模時間',CHECK_IN_TIME:'進站時間',CHECK_OUT_TIME:'出站時間',COMPLETED_TIME:'完工時間',COMPLETED:'完工狀態'};
  for(const [field,name] of Object.entries(names)){const c=changes.find(c=>c.field===field);if(c)add(action==='mold.clear'&&field==='ZZ_MODLE_REMOVE_END'?'完成下模':name,field==='COMPLETED'?t(c.after==='Y'?'已完工':'未完工'):c.after===null?t('清除'):compactDate(c.after),c.before==null?undefined:field==='COMPLETED'?t(c.before==='Y'?'已完工':'未完工'):compactDate(c.before));}
  add('影響工單',(target.affected_orders??[]).map(o=>typeof o==='string'?o:display((o as Row).WO??(o as Row).wo)).join('、'));
 }
 if(String(args.comment??'').trim())add('備註',args.comment);
 const equipment=target.equipment??record?.EQP_NO??args.equipment,order=target.work_order??record?.WO;
 const part=[target.part_no??record?.PART_NO??args.part_no,target.part_spec??record?.PART_SPEC].filter(Boolean).join(' ');
 return <div className="reference-business-summary"><div className="sheet-target"><span className="sheet-target-mark"><Factory size={18}/></span><div><strong>{[equipment,order].filter(Boolean).join(' · ')}</strong><small>{part}</small></div></div><div className="reference-review">{rows.map((r,i)=><div className="reference-review-row" key={i}><span>{r.label}</span><span className="reference-review-value">{r.before!==undefined&&String(r.before)!==String(r.value)&&<><del>{display(r.before)}</del><ArrowRight size={18}/></>}<strong>{display(r.value)}</strong></span></div>)}</div></div>;
}
