import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCommandEnvironment } from '../src/environment';

test('adds common macOS command locations before the inherited PATH', () => {
  const env = buildCommandEnvironment({ PATH: '/usr/bin:/bin' }, '/Users/example', [], 'darwin');
  assert.equal(env.PATH, '/Users/example/.local/bin:/Users/example/bin:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin');
});

test('adds configured paths first, expands home, and removes duplicates', () => {
  const env = buildCommandEnvironment(
    { PATH: '/opt/homebrew/bin:/usr/bin' },
    '/Users/example',
    ['~/tools/bin', '/custom/bin', '/opt/homebrew/bin'],
    'darwin'
  );
  assert.equal(env.PATH, '/Users/example/tools/bin:/custom/bin:/opt/homebrew/bin:/Users/example/.local/bin:/Users/example/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin');
});

test('preserves unrelated environment variables', () => {
  const env = buildCommandEnvironment({ PATH: '/usr/bin', AGENT_PROFILE: 'work' }, '/home/example', [], 'linux');
  assert.equal(env.AGENT_PROFILE, 'work');
  assert.equal(env.PATH, '/home/example/.local/bin:/home/example/bin:/usr/local/bin:/usr/bin');
});
