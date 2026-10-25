import assert from 'node:assert/strict';
import test from 'node:test';
import { matchesPendingMessage, optimisticMessage } from '../src/optimisticMessage';

test('creates a user message immediately while delivery is pending', () => {
  assert.deepEqual(optimisticMessage('Olá Agent Deck', 'pending-1', '2026-10-19T12:00:00.000Z'), {
    id: 'pending-1',
    kind: 'user',
    ts: '2026-10-19T12:00:00.000Z',
    body: 'Olá Agent Deck',
    pending: true
  });
});

test('reconciles an optimistic message with the transcript row by content', () => {
  const pending = optimisticMessage('/status', 'pending-2', '2026-10-19T12:00:00.000Z');
  assert.equal(matchesPendingMessage({ kind: 'user', body: '/status' }, pending), true);
  assert.equal(matchesPendingMessage({ kind: 'assistant', body: '/status' }, pending), false);
  assert.equal(matchesPendingMessage({ kind: 'user', body: 'different' }, pending), false);
});
