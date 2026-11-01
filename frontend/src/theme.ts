import { useEffect, useSyncExternalStore } from 'react';
export type Theme = 'light' | 'dark' | 'navy' | 'system';
export const isTheme = (value: unknown): value is Theme => ['light', 'dark', 'navy', 'system'].includes(value as string);
let theme: Theme = 'system';
try { const saved = globalThis.localStorage?.getItem('kaosu-assistant:theme'); if (isTheme(saved)) theme = saved; } catch { /* 預設跟隨系統。 */ }
const listeners = new Set<() => void>();
const notify = () => { for (const listener of listeners) listener(); };
export const getTheme = () => theme;
export function setTheme(next: Theme) {
  if (!isTheme(next) || next === theme) return;
  theme = next;
  try { globalThis.localStorage?.setItem('kaosu-assistant:theme', next); } catch { /* 偏好儲存失敗不阻擋操作。 */ }
  notify();
}
export function resolveTheme(value: Theme, systemDark = false): 'light' | 'dark' | 'navy' { return value === 'system' ? systemDark ? 'dark' : 'light' : value; }
const getResolved = () => resolveTheme(theme, typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches);
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  const media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
  media?.addEventListener('change', listener);
  return () => { listeners.delete(listener); media?.removeEventListener('change', listener); };
};
export function useTheme() {
  const value = useSyncExternalStore(subscribe, getTheme, () => 'system' as Theme);
  const resolvedTheme = useSyncExternalStore(subscribe, getResolved, () => 'light' as const);
  useEffect(() => {
    const root = document.getElementById('mes-ai-chat-root');
    root?.classList.toggle('dark', resolvedTheme !== 'light');
    if (root) root.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme = resolvedTheme === 'light' ? 'light' : 'dark';
  }, [resolvedTheme]);
  return { theme: value, setTheme, resolvedTheme };
}
