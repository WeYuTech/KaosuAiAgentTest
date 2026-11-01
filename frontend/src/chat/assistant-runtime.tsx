import { useEffect, useRef, type ReactNode } from 'react';
import { AssistantRuntimeProvider, useExternalStoreRuntime, type ExternalStoreAdapter, type ThreadMessageLike, type AppendMessage } from '@assistant-ui/react';
import type { ChatEntry } from '../ConversationHistory';
import type {PresentedMessage} from './message-presentation';
import type { Message } from '../api';

/** 來源 294bc02d 的 external-store adapter；MES 狀態與請求仍由 App 持有。 */
export interface HistoryProjection {records:ChatEntry[];loading:boolean;actor?:string;select:(id:string)=>Promise<void>;create:()=>Promise<void>}
export interface AssistantProjection {
  history?:HistoryProjection;
  conversationId: string | null;
  messages: readonly Message[];
  draft: string;
  busy: boolean;
  disabled: boolean;
  sendDisabled: boolean;
  onSend: (text: string) => Promise<void> | void;
}
export function convertMessage(message: PresentedMessage, index: number, conversationId: string | null): ThreadMessageLike {
  const role = message.role === 'user' ? 'user' : 'assistant';
  return { id: message.uiId ?? `${conversationId ?? 'new'}:${index}:${role}`, role,
    content: [{type: 'text', text: message.content}],
    ...(role === 'assistant' ? {status: {type: 'complete' as const, reason: 'stop' as const}} : {}),
    metadata: {custom: {mesMessage: message, conversationId}},
  };
}
export function submittedText(message: AppendMessage): string | null {
  if (message.role !== 'user' || message.attachments?.length || message.content.some(part => part.type !== 'text')) return null;
  const text = message.content.map(part => part.type === 'text' ? part.text : '').join('');
  return text.trim() ? text : null;
}
export function createAssistantAdapter(state: AssistantProjection, latest: () => AssistantProjection, claim: (action: () => Promise<void> | void) => Promise<void>): ExternalStoreAdapter<Message> {
  return {
    messages: state.messages,
    convertMessage: (message, index) => convertMessage(message, index, state.conversationId),
    isRunning: state.busy, isDisabled: state.disabled, isSendDisabled: state.sendDisabled,
    unstable_persistsHistory: true, unstable_capabilities: {copy: true},
    adapters: state.history ? {threadList: {
      ...(state.conversationId?{threadId:state.conversationId}:{}),isLoading:state.history.loading,
      threads:state.history.records.map(entry=>({id:entry.id,remoteId:entry.id,title:entry.title,status:'regular',custom:{mesConversation:entry}})),
      onSwitchToThread:async id=>{await latest().history?.select(id);},
      onSwitchToNewThread:async()=>{await latest().history?.create();},
    }} : undefined,
    // 無 retry／edit／cancel：停止 UI 不等於取消 MES 操作。
    onNew: async message => {
      const current = latest(), text = submittedText(message);
      if (current.conversationId !== state.conversationId || current.busy || current.disabled || current.sendDisabled || text === null) return;
      await claim(() => current.onSend(text));
    },
  };
}
export function MesAssistantProvider({state, children}: {state: AssistantProjection; children: ReactNode}) {
  const current = useRef(state); current.current = state;
  const sending = useRef(false);
  const runtime = useExternalStoreRuntime(createAssistantAdapter(state, () => current.current, async action => {
    if (sending.current) return;
    sending.current = true;
    try { await action(); } finally { sending.current = false; }
  }));
  useEffect(() => {
    const composer = runtime.thread.composer;
    if (composer.getState().text !== state.draft) composer.setText(state.draft);
  }, [runtime, state.draft, state.conversationId]);
  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>;
}
