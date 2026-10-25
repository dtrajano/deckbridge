export interface OptimisticMessage {
  id: string;
  kind: 'user';
  ts: string;
  body: string;
  pending: true;
}

export function optimisticMessage(text: string, id: string, timestamp = new Date().toISOString()): OptimisticMessage {
  return { id, kind: 'user', ts: timestamp, body: text, pending: true };
}

export function matchesPendingMessage(row: { kind?: string; body?: string }, pending: OptimisticMessage): boolean {
  return row.kind === 'user' && row.body === pending.body;
}
