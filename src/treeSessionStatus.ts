import { AgentDeckSession } from './types';
import { TmuxRuntimeState } from './runtimeDetection';

export function mergeTreeSessionStatus(
  listed: AgentDeckSession,
  details: AgentDeckSession | undefined,
  runtime: TmuxRuntimeState | undefined
): AgentDeckSession {
  const merged: AgentDeckSession = details
    ? { ...listed, ...details, raw: { ...listed.raw, ...details.raw } }
    : listed;
  if (!runtime?.agentRunning) return merged;
  const reported = merged.status.toLowerCase();
  return { ...merged, status: ['running', 'waiting', 'idle'].includes(reported) ? merged.status : 'running', statusSource: 'tmux process' };
}
