import assert from 'node:assert/strict';
import test from 'node:test';
import { LatestSerialTask } from '../src/latestSerialTask';

test('runs asynchronous view work one at a time', async () => {
  const queue = new LatestSerialTask();
  const events: string[] = [];
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => { release = resolve; });

  const first = queue.run(async () => {
    events.push('first:start');
    await blocked;
    events.push('first:end');
  });
  await Promise.resolve();
  const second = queue.run(async () => { events.push('second'); });

  assert.deepEqual(events, ['first:start']);
  release();
  await Promise.all([first, second]);
  assert.deepEqual(events, ['first:start', 'first:end', 'second']);
});

test('skips stale queued view work in favor of the latest request', async () => {
  const queue = new LatestSerialTask();
  const events: string[] = [];
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => { release = resolve; });

  const first = queue.run(async () => { await blocked; events.push('first'); });
  await Promise.resolve();
  const stale = queue.run(async () => { events.push('stale'); });
  const latest = queue.run(async () => { events.push('latest'); });
  release();
  await Promise.all([first, stale, latest]);

  assert.deepEqual(events, ['first', 'latest']);
});
