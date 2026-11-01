import { defaultUrlTransform } from 'react-markdown';
export function safeLink(url: string) {
  const safe = defaultUrlTransform(url);
  if (!safe || /[\u0000-\u0020\\]/.test(safe)) return undefined;
  try {
    const parsed = new URL(safe, 'https://mes.invalid/');
    return ['http:', 'https:'].includes(parsed.protocol) ? safe : undefined;
  } catch {
    return undefined;
  }
}
