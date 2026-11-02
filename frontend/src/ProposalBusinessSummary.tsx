import { t } from './i18n';
import { ArrowRight, CalendarDays, Factory, ClipboardList } from 'lucide-react';
import { display, type Proposal, type Row, type Workspace } from './api';

export function ProposalBusinessSummary({ proposal, workspace }: { proposal: Proposal; workspace: Workspace }) {
  const { args, changes, target = {}, action } = proposal;
  const record = workspace.records.find(row =>
    (args.execution_id && String(row.WIP_OPI_WDOEACICO_HIST_SID) === String(args.execution_id)) ||
    (args.schedule_id && String(row.ZZ_KAOSU_PROD_SCHEDULE_SID) === String(args.schedule_id)) ||
    (args.report_id && Array.isArray(row.REPORTS) && row.REPORTS.some(report => String((report as Row).WIP_OPI_WDOEACICOOUTPUT_HIST_SID) === String(args.report_id))),
  );
  const equipment = target.equipment ?? record?.EQP_NO ?? args.equipment;
  const workOrder = target.work_order ?? record?.WO;
  const scheduleTime = args.start_time ?? record?.SCHEDULE_START_TIME;
  const executionTime = target.execution_time ?? record?.REAL_CHECK_IN_TIME ?? record?.CHECK_IN_TIME;
  const partNo = target.part_no ?? record?.PART_NO;
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
  const businessRow = (title: string, after: unknown, before?: unknown, unit = '') => <div className="business-value"><span>{title}</span><strong>{before !== undefined && before !== null && display(before)!==display(after) && <><span className="business-before">{display(before)}</span><ArrowRight size={14}/></>}<span className="business-after">{display(after)}{unit && <small>{unit}</small>}</span></strong></div>;

  return <div className="business-summary">
    <div className="business-target">
      {Boolean(equipment) && <span><Factory size={16}/><span><small>{t("設備")}</small><strong>{display(equipment)}</strong></span></span>}
      {Boolean(workOrder) && <span><ClipboardList size={16}/><span><small>{t("工單")}</small><strong>{display(workOrder)}</strong></span></span>}
      {Boolean(part) && <span><span><small>{t("品號／規格")}</small><strong>{part}</strong></span></span>}
      {Boolean(executionTime) && <span><span><small>{t("本次執行")}</small><strong>{display(executionTime)}</strong></span></span>}
      {Boolean(report?.CREATE_TIME)&&<span><span><small>{t('報工時間')}</small><strong>{display(report?.CREATE_TIME)}</strong></span></span>}
      {Boolean(scheduleTime) && <span><CalendarDays size={16}/><span><small>{t("預計開始")}</small><strong>{display(scheduleTime)}</strong></span></span>}
    </div>
    {action === 'report.add' || action === 'report.update' ? <>
      <div className="business-quantities">{businessRow(t("人工良品"), args.ok, action === 'report.update' ? findChange('OK_QTY')?.before ?? report?.OK_QTY : undefined, t("件"))}{businessRow(t("不良合計"), defects.reduce((sum, item) => sum + Number(item.quantity), 0), action === 'report.update' ? findChange('NG_QTY')?.before ?? report?.NG_QTY : undefined, t("件"))}</div>
      {visibleDefects.length > 0 && <div className="business-defects"><span className="business-caption">{t("不良原因")}</span>{visibleDefects.map((defect, index) => {
        const reason = reasons.find(reason => reason.NG_CODE_NO === defect.code);
        const name = reason?.NG_CODE_NAME ?? reason?.NAME ?? defect.code;
        const previous = Array.isArray(report?.DEFECTS) ? (report.DEFECTS as Row[]).find(item => item.NG_CODE === defect.code)?.NG_CODE_QTY : undefined;
        return <div key={`${defect.code}-${index}`}>{businessRow(display(name), defect.quantity, action === 'report.update' ? previous : undefined, t("件"))}</div>;
      })}</div>}
      <p className="business-note">{t("以上為人工報工數量，與 IoT 推算產量分開記錄。")}</p>
    </> : null}
    {action === 'report.delete' && <div className="business-quantities">{businessRow(t("將刪除人工良品"), findChange('OK_QTY')?.before ?? report?.OK_QTY, undefined, t("件"))}{businessRow(t("將刪除不良數"), findChange('NG_QTY')?.before ?? report?.NG_QTY, undefined, t("件"))}</div>}
    {action === 'report.cavities' && businessRow(t("報工模穴數"), args.cavities, findChange('OPI_CAV')?.before, t("穴"))}
    {action === 'report.complete' && findChange('COMPLETED_TIME') && businessRow(t("完工時間"), findChange('COMPLETED_TIME')?.after)}
    {action.startsWith('mold.') && Object.entries({ ZZ_MODLE_UPLOAD_START: t("開始上模時間"), ZZ_MODLE_UPLOAD_END: t("完成上模時間"), ZZ_MODLE_REMOVE_START: t("開始下模時間"), ZZ_MODLE_REMOVE_END: t("完成下模時間") }).map(([field, title]) => {
      const change = findChange(field);
      return change ? <div key={field}>{businessRow(title, change.after === null ? t("清除時間") : change.after, change.before)}</div> : null;
    })}
    {action === 'schedule.save' && <>
      {businessRow(t("排程日期"), findChange('SCHEDULE_DATE')?.after ?? record?.SCHEDULE_DATE)}
      {businessRow(t("預計結束"), findChange('SCHEDULE_END_TIME')?.after ?? record?.SCHEDULE_END_TIME)}
      {businessRow(t("模具"), args.mold_no)}
      <div className="business-quantities">{businessRow(t("週期"), args.cycle_seconds, findChange('SCHEDULE_CYCLE_TIME')?.before, t("秒"))}{businessRow(t("目標模次"), args.target_shots, findChange('TARGET_SHOT')?.before, t("模"))}</div>
      {allocations.length > 0 && <div className="business-defects"><span className="business-caption">{t("工單與模具明細分配")}</span>{allocations.map((item, index) => {const previous=item.previous as Row|undefined;return <div key={index}>{previous&&previous.wo!==item.wo&&businessRow(t('工單分配'),item.wo||t('未分配工單'),previous.wo||t('未分配工單'))}{businessRow(allocationLabel(item), item.cavities, previous?.cavities, t("穴"))}{businessRow(t("目標件數"), Number(item.cavities) * Number(args.target_shots), previous?.target_pcs, t("件"))}</div>;})}</div>}
    </>}
    {(action === 'report.complete' || action === 'report.delete' || action === 'mold.clear' || action === 'mold.unmount_finish') && <div className="business-impact"><strong>{t("影響工單")}</strong>{affected.length ? <ul>{affected.map(order => <li key={order}>{order}</li>)}</ul> : workOrder ? <p>{display(workOrder)}</p> : <p>{t("請核對上方作業對象與摘要。")}</p>}{action === 'report.complete' && <p>{t("同一排程的所有工單會一併完工。")}</p>}{action === 'mold.clear' && <p>{t("會清除這張排程的上下模時間，請確認現場狀態。")}</p>}</div>}
    {nextTimes.length > 0 && <div className="business-impact"><strong>{t("連動作業")}</strong><p>{t("下一張排程的實際開始時間會一併更新為：")}{display(nextTimes[0].after)}</p></div>}
    {['mold.clear','mold.unmount_finish'].includes(action) && ['CHECK_IN_TIME','CHECK_OUT_TIME','COMPLETED'].map(field => {
      const change = findChange(field); if (!change) return null;
      return <div key={field}>{businessRow(t(field === 'CHECK_IN_TIME' ? '進站時間' : field === 'CHECK_OUT_TIME' ? '出站時間' : '完工狀態'), change.after === null ? t('清除時間') : change.after, change.before)}</div>;
    })}
    {args.comment !== undefined && String(args.comment).trim() && businessRow(t("備註"), args.comment)}
  </div>;
}
