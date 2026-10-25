import assert from 'node:assert/strict';
import test from 'node:test';
import { isTargetNotRunningError, sendWithTargetRecovery } from '../src/sendRecovery';

test('recognizes target-not-running errors from Agent Deck', () => {
  assert.equal(isTargetNotRunningError(new Error('send abc failed: target not running')), true);
  assert.equal(isTargetNotRunningError('target_not_running'), true);
  assert.equal(isTargetNotRunningError(new Error('permission denied')), false);
});

test('starts the target and retries exactly once after target-not-running', async () => {
  const calls: string[] = [];
  let attempts = 0;
  const result = await sendWithTargetRecovery(
    async () => {
      calls.push('send');
      attempts += 1;
      if (attempts === 1) throw new Error('target not running');
      return 'delivered';
    },
    async () => { calls.push('start'); },
    async () => { calls.push('starting'); },
    async () => { calls.push('started'); }
  );
  assert.equal(result, 'delivered');
  assert.deepEqual(calls, ['send', 'starting', 'start', 'started', 'send']);
});

test('does not start or retry unrelated send failures', async () => {
  const calls: string[] = [];
  await assert.rejects(
    sendWithTargetRecovery(
      async () => { calls.push('send'); throw new Error('network unavailable'); },
      async () => { calls.push('start'); },
      async () => { calls.push('starting'); },
      async () => { calls.push('started'); }
    ),
    /network unavailable/
  );
  assert.deepEqual(calls, ['send']);
});
