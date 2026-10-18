import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSendQueue, queueButtonLabel } from '../src/sendQueue';

test('normalizes queued sends and only allows pending entries to be cancelled', () => {
  assert.deepEqual(parseSendQueue({ queue: [
    { id: 'q1', text_preview: 'first command', enqueued_at: '2026-10-18T19:03:48Z', state: 'queued' },
    { id: 'q2', text_preview: '/status', state: 'typed' },
    { id: 'q3', text_preview: 'done', state: 'landed' }
  ] }), {
    pendingCount: 1,
    items: [
      { id: 'q1', preview: 'first command', enqueuedAt: '2026-10-18T19:03:48Z', state: 'queued', cancellable: true },
      { id: 'q2', preview: '/status', enqueuedAt: undefined, state: 'typed', cancellable: false },
      { id: 'q3', preview: 'done', enqueuedAt: undefined, state: 'landed', cancellable: false }
    ]
  });
});

test('ignores malformed queue entries and unsupported responses', () => {
  assert.deepEqual(parseSendQueue({ queue: [null, { state: 'queued' }, { id: 'ok' }] }), {
    pendingCount: 0,
    items: [{ id: 'ok', preview: '', state: 'unknown', enqueuedAt: undefined, cancellable: false }]
  });
  assert.deepEqual(parseSendQueue(null), { items: [], pendingCount: 0 });
});

test('shows pending count in the always-visible queue button', () => {
  assert.equal(queueButtonLabel(0), '☷ Fila');
  assert.equal(queueButtonLabel(2), '☷ Fila (2)');
});
