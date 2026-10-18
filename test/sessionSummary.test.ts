import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeSessions } from '../src/sessionSummary';
import { AgentDeckSession } from '../src/types';

const session = (status: string): AgentDeckSession => ({
  id: `${status}-${Math.random()}`,
  title: status,
  status,
  path: '/workspace',
  group: 'work',
  tool: 'codex',
  raw: {}
});

test('summarizes sessions in a stable status order', () => {
  const summary = summarizeSessions([
    session('error'), session('waiting'), session('error'), session('not-started'), session('running')
  ]);

  assert.equal(summary.total, 5);
  assert.deepEqual(summary.counts, { error: 2, waiting: 1, 'not-started': 1, running: 1 });
  assert.equal(summary.label, '1 running · 1 waiting · 1 not started · 2 error');
});

test('describes an empty session collection', () => {
  assert.equal(summarizeSessions([]).label, 'No sessions');
});
