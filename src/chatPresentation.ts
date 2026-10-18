import { AgentDeckSession } from './types';

export const ACTIVITY_INDICATOR_CLASS = 'agent-activity-indicator';

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
