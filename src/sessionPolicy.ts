export function canSendToSession(status: string): boolean {
  return !['not-started', 'stopped', 'error'].includes(status.toLowerCase());
}

export function isSessionActive(status: string): boolean {
  return canSendToSession(status);
}

export function canStopSession(status: string): boolean {
  return canSendToSession(status);
}

export type SessionIndicatorTone = 'active' | 'not-started' | 'stopped' | 'error';

export function sessionIndicatorTone(status: string): SessionIndicatorTone {
  const normalized = status.toLowerCase();
  if (normalized === 'error') return 'error';
  if (normalized === 'not-started') return 'not-started';
  if (normalized === 'stopped') return 'stopped';
  return 'active';
}

export interface SessionTreeIndicator {
  icon: string;
  color: string;
  label: string;
}

export function sessionTreeIndicator(status: string): SessionTreeIndicator {
  switch (status.toLowerCase()) {
    case 'running': return { icon: 'sync~spin', color: 'charts.green', label: 'Pensando · em andamento' };
    case 'waiting': return { icon: 'bell-dot-filled', color: 'charts.yellow', label: 'Aguardando interação' };
    case 'error': return { icon: 'error', color: 'charts.red', label: 'Erro' };
    case 'not-started': return { icon: 'circle-outline', color: 'charts.blue', label: 'Não iniciado' };
    case 'stopped': return { icon: 'circle-slash', color: 'disabledForeground', label: 'Fechado' };
    case 'idle': return { icon: 'circle-filled', color: 'disabledForeground', label: 'Parado' };
    default: return { icon: 'question', color: 'disabledForeground', label: 'Estado desconhecido' };
  }
}

export function shouldAutoStartSession(status: string, enabled: boolean): boolean {
  return enabled && !canSendToSession(status);
}

export function shouldStartAfterRuntimeProbe(status: string, enabled: boolean, runtimeAlive: boolean): boolean {
  return shouldAutoStartSession(status, enabled) && !runtimeAlive;
}

export function isThinkingStatus(status: string | undefined, running: boolean | undefined, verb?: string): boolean {
  void status;
  void running;
  return Boolean(verb?.trim());
}

export function buildSendArgs(sessionId: string, message: string, immediate = false, imagePaths: readonly string[] = []): string[] {
  return ['session', 'send', sessionId, message, '--json', ...(immediate ? ['--no-wait'] : []), ...imagePaths.flatMap((imagePath) => ['--image', imagePath])];
}

export function expectsTranscriptResponse(message: string): boolean {
  return !message.trimStart().startsWith('/');
}

export function shouldSendImmediately(message: string, agentRuntimeAlive: boolean): boolean {
  return agentRuntimeAlive || !expectsTranscriptResponse(message);
}

export function sendReceiptLabel(receipt: Record<string, unknown>): string {
  const verdict = firstString(receipt, 'verdict', 'state', 'outcome');
  if (verdict) return `Message ${verdict}`;
  const sendId = firstString(receipt, 'send_id', 'id');
  return sendId ? `Message accepted (${sendId.slice(0, 8)})` : 'Message accepted';
}

function firstString(value: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) if (typeof value[key] === 'string' && value[key]) return value[key] as string;
  return undefined;
}
