import {type Row,display} from './api';
import {t} from './i18n';
export const money=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)?`US$${value.toFixed(2)}`:t('尚未取得用量');
export const budgetCaption=(value:Row|null)=>value&&typeof value.spent_usd==='number'&&Number.isFinite(value.spent_usd)&&typeof value.limit_usd==='number'&&Number.isFinite(value.limit_usd)?`${money(value.spent_usd)} / ${money(value.limit_usd)}`:t('尚未取得用量');
/** 費用依原帳本欄位呈現，不重算或重複加總未知預留。 */
export function BudgetSummary({value}:{value:Row}){return <section className="budget-summary"><h3>{t('累計模型費用')}</h3><dl className="management-summary">{[['spent_usd','已使用'],['reserved_usd','已預留'],['limit_usd','累計上限'],['remaining_usd','剩餘額度']].filter(([key])=>Object.hasOwn(value,key)).map(([key,title])=><div key={key}><dt>{t(title)}</dt><dd>{money(value[key])}</dd></div>)}</dl><details><summary>{t('費用明細')}</summary><dl className="management-summary">{[['calls','模型呼叫次數'],['unknown_calls','未知用量呼叫次數']].filter(([key])=>Object.hasOwn(value,key)).map(([key,title])=><div key={key}><dt>{t(title)}</dt><dd>{display(value[key])}</dd></div>)}</dl><p>{t('累計帳本包含全部模型用量；未知用量保留預留，不重複加總。')}</p></details></section>;}
