import { TextMessagePartProvider } from '@assistant-ui/react';
import { MarkdownText } from './components/assistant-ui/elements/markdown-text';
/** 一般資料與 Thread 訊息使用同一份安全 Markdown 元件。 */
export function MessageContent({role, content}: {role: string; content: string}) {
  if (role !== 'assistant') return <div className="message-body">{content}</div>;
  return <div className="message-body markdown-message"><TextMessagePartProvider text={content}><MarkdownText/></TextMessagePartProvider></div>;
}
/** 首頁交接紀錄：助理回覆與聊天室同樣排版，使用者原句維持純文字。 */
export function EntryMessageBody({role, content}: {role: string; content: string}) {
  return role === 'assistant' ? <MessageContent role={role} content={content}/> : <p>{content}</p>;
}
