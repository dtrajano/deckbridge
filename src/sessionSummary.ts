import { AgentDeckSession } from './types';

export interface SessionSummary {
  total: number;
  counts: Record<string, number>;
  label: string;
}

export function summarizeSessions(sessions: readonly AgentDeckSession[]): SessionSummary {
  const counts: Record<string, number> = {};
  for (const session of sessions) {
    const status = session.status.toLowerCase();
    counts[status] = (counts[status] ?? 0) + 1;
  }
  const order = ['running', 'waiting', 'idle', 'not-started', 'stopped', 'error'];
  const parts = order.filter((status) => counts[status]).map((status) => `${counts[status]} ${displayStatus(status)}`);
  for (const status of Object.keys(counts).sort()) {
    if (!order.includes(status)) parts.push(`${counts[status]} ${displayStatus(status)}`);
  }
  return { total: sessions.length, counts, label: parts.join(' · ') || 'No sessions' };
}

export function displayStatus(status: string): string {
  return status === 'not-started' ? 'not started' : status;
}
