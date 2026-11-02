import {t} from './i18n';
/** 無時區的 MES 字串已是 UTC+07，不依瀏覽器時區位移。 */
export function mesDate(value: unknown): string {
  if(value == null || value === '') return '—';
  const text=String(value);
  if(!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(text)) return text;
  if(/(?:Z|[+-]\d{2}:\d{2})$/.test(text)) {
    const date=new Date(text);
    if(!Number.isNaN(date.getTime())) return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(date);
  }
  return text.replace('T',' ').slice(0,19).padEnd(19,':00');
}
export function productionStatus(value: unknown) {
  return ({TRY:t('試模'),DO:t('量產'),RUN:t('執行中')} as Record<string,string>)[String(value)] ?? t('未提供狀態');
}
