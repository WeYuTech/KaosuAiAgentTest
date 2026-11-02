import { TextMessagePartProvider } from '@assistant-ui/react';
import { MarkdownText } from './components/assistant-ui/elements/markdown-text';
/** 一般資料與 Thread 訊息使用同一份安全 Markdown 元件。 */
export function MessageContent({role, content}: {role: string; content: string}) {
  if (role !== 'assistant') return <div className="message-body">{content}</div>;
  return <div className="message-body markdown-message"><TextMessagePartProvider text={content}><MarkdownText/></TextMessagePartProvider></div>;
}
