import { useSyncExternalStore } from 'react';
import { translations } from './translations.ts';

export type Locale = 'zh-TW' | 'en' | 'th';
export const locales: Locale[] = ['zh-TW', 'en', 'th'];
export const isLocale = (value: unknown): value is Locale => locales.includes(value as Locale);
const key = 'kaosu-assistant:locale';
const listeners = new Set<() => void>();
let locale: Locale = 'zh-TW';
try { const saved = globalThis.localStorage?.getItem(key); if (isLocale(saved)) locale = saved; } catch { /* 禁用儲存時使用預設值。 */ }
export const getLocale = () => locale;
export function setLocale(next: Locale) {
  if (!isLocale(next) || next === locale) return;
  locale = next;
  try { globalThis.localStorage?.setItem(key, next); } catch { /* 偏好不影響操作。 */ }
  for (const listener of listeners) listener();
}
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const reverse = new Map(Object.entries(translations).flatMap(([zh, values]) => values.map(value => [value, zh] as const)));
export function t(key: string, params: Record<string | number, unknown> = {}, language: Locale = locale): string {
  const canonical = translations[key] ? key : reverse.get(key) ?? key;
  const message = language === 'zh-TW' ? canonical : translations[canonical]?.[language === 'en' ? 0 : 1] ?? key;
  return message.replace(/\{(\w+)\}/g, (match, name) => Object.hasOwn(params, name) ? String(params[name] ?? '') : match);
}
export const translateText = (text: string) => t(text);
export function useLocale() {
  const value = useSyncExternalStore(subscribe, getLocale, getLocale);
  return { locale: value, setLocale, t };
}
