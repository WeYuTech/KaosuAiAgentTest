import {t} from './i18n';
let businessTimezone: string | undefined;
/** 由健康檢查提供業務時區；未取得設定時保留來源，不猜測時區。 */
export function setBusinessTimezone(value: string | undefined) { businessTimezone = value; }
/** 無時區的 MES 字串已是業務當地時間，不依瀏覽器時區位移。 */
export function mesDate(value: unknown, timezone = businessTimezone): string {
  if(value == null || value === '') return '—';
  const text=String(value);
  if(!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(text)) return text;
  if(/(?:Z|[+-]\d{2}:\d{2})$/.test(text)) {
    const date=new Date(text);
    const offset = /^UTC([+-])(\d{2}):(\d{2})$/.exec(timezone ?? '');
    if(!Number.isNaN(date.getTime()) && offset) {
      const minutes = (Number(offset[2])*60+Number(offset[3]))*(offset[1]==='-'?-1:1);
      return new Date(date.getTime()+minutes*60000).toISOString().slice(0,19).replace('T',' ');
    }
    return text;
  }
  const local = text.replace('T',' ').slice(0,19);
  return local.length === 16 ? `${local}:00` : local;
}
export function productionStatus(value: unknown) {
  return ({TRY:t('試模'),DO:t('量產'),RUN:t('執行中')} as Record<string,string>)[String(value)] ?? (value == null || value === '' ? t('未提供狀態') : `${String(value)}（${t('未知狀態')}）`);
}
