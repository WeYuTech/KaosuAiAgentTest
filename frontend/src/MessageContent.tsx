import Markdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';

function safeLink(url: string) {
  const safe = defaultUrlTransform(url);
  if (!safe || /[\u0000-\u0020\\]/.test(safe)) return undefined;
  try {
    const parsed = new URL(safe, 'https://mes.invalid/');
    return ['http:', 'https:'].includes(parsed.protocol) ? safe : undefined;
  } catch {
    return undefined;
  }
}

export function MessageContent({ role, content }: { role: string; content: string }) {
  if (role !== 'assistant') return <div className="message-body">{content}</div>;
  return <div className="message-body markdown-message"><Markdown
    remarkPlugins={[remarkGfm, remarkBreaks]}
    skipHtml
    urlTransform={(url, key) => key === 'href' ? safeLink(url) : undefined}
    components={{
      a: ({ href, children }) => href ? <a href={href} target="_blank" rel="noopener noreferrer nofollow">{children}</a> : <span>{children}</span>,
      img: ({ alt }) => <span className="markdown-image-note">圖片：{alt || '未提供說明'}</span>,
      table: ({ children }) => <div className="markdown-table" role="region" aria-label="助理回覆表格" tabIndex={0}><table>{children}</table></div>,
    }}
  >{content}</Markdown></div>;
}
