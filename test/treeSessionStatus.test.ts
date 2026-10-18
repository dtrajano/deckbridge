import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeTreeSessionStatus } from '../src/treeSessionStatus';
import { AgentDeckSession } from '../src/types';

const session = (status: string, extra: Partial<AgentDeckSession> = {}): AgentDeckSession => ({
  id: 'deck-id', title: 'Chat', status, path: '/repo', group: 'work', tool: 'codex', raw: {}, ...extra
});

test('uses detailed Agent Deck status when no agent process is alive', () => {
  const merged = mergeTreeSessionStatus(session('not-started'), session('stopped', { tmuxSession: 'agentdeck_chat' }), {
    state: 'not-running', attachedClients: 0, agentRunning: false
  });
  assert.equal(merged.status, 'stopped');
  assert.equal(merged.tmuxSession, 'agentdeck_chat');
});

test('overrides stale error status when the tmux agent process is alive', () => {
  const merged = mergeTreeSessionStatus(session('not-started'), session('error', { substate: 'unknown-exit' }), {
    state: 'detached', attachedClients: 0, windows: 1, panePid: 42, agentRunning: true
  });
  assert.equal(merged.status, 'running');
  assert.equal(merged.statusSource, 'tmux process');
});

test('preserves live waiting and idle states reported by Agent Deck', () => {
  const runtime = { state: 'attached' as const, attachedClients: 1, windows: 1, panePid: 42, agentRunning: true };
  assert.equal(mergeTreeSessionStatus(session('waiting'), undefined, runtime).status, 'waiting');
  assert.equal(mergeTreeSessionStatus(session('idle'), undefined, runtime).status, 'idle');
});
