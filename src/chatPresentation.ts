import { AgentDeckSession } from './types';

export const ACTIVITY_INDICATOR_CLASS = 'agent-activity-indicator';
export const ACTIVITY_INDICATOR_FLOATING_CLASS = `${ACTIVITY_INDICATOR_CLASS} floating`;
export const THINKING_TIMEOUT_MS = 45_000;

export interface ChatHeaderModel {
  title: string;
  status: string;
}

export interface ChatMetadataModel {
  tool: string;
  model?: string;
  sessionId: string;
}

export function chatHeaderModel(session: AgentDeckSession): ChatHeaderModel {
  return {
    title: session.title.trim() || session.id,
    status: session.substate || session.status
  };
}

export function chatMetadataModel(session: AgentDeckSession): ChatMetadataModel {
  return {
    tool: session.tool,
    model: session.model,
    sessionId: session.id
  };
}

export function sessionClipboardText(session: AgentDeckSession): string {
  return session.id;
}

export function sessionCopiedMessage(): string {
  return 'ID da sessão copiado para a área de transferência';
}

export function shortSessionId(value: string): string {
  return value.length > 12 ? `${value.slice(0, 8)}…` : value;
}

export function shouldPinChatChrome(sidebar: boolean): boolean {
  return sidebar;
}

export function shouldShowChatTabs(tabCount: number): boolean {
  return tabCount > 1;
}

export function shouldFollowLiveChatScroll(scrollTop: number, viewportHeight: number, contentHeight: number, threshold = 96): boolean {
  return contentHeight - (scrollTop + viewportHeight) <= threshold;
}

export function scrollTopAfterPrepend(previousScrollTop: number, previousContentHeight: number, nextContentHeight: number): number {
  return Math.max(0, previousScrollTop + Math.max(0, nextContentHeight - previousContentHeight));
}

export function responsiveChatCss(): string {
  return chatMessageCss() + '@media (max-width:560px){.topbar{flex-wrap:wrap;overflow-x:visible;padding:6px}.topbar .spacer{display:none}.topbar button{flex:1 1 auto;min-width:0}.metadata{padding-left:10px;padding-right:10px}.badge{max-width:100%;overflow:hidden;text-overflow:ellipsis}.session-id-button{min-width:0}.messages{padding-left:10px;padding-right:10px}.delivery-status{margin-left:10px;margin-right:10px}.composer{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:end;padding:8px 10px 10px}.composer textarea{box-sizing:border-box;min-width:0;width:100%}.composer button{min-width:64px}}@media (max-width:360px){.composer{grid-template-columns:1fr}.composer button{width:100%}.completion-list{left:10px;right:10px}}';
}

export function chatMessageCss(): string {
  return '.messages,.row,.body{min-width:0;max-width:100%;box-sizing:border-box}.row{overflow:hidden}.body{overflow-wrap:anywhere;word-break:break-word}.body h1,.body h2,.body h3,.body code{overflow-wrap:anywhere;word-break:break-word}.body pre{max-width:100%;box-sizing:border-box;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word}';
}

export function showOlderMessagesControl(): boolean {
  return false;
}
