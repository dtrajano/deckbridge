import assert from 'node:assert/strict';
import test from 'node:test';
import { runtimeSettingsFromJsonl } from '../src/sessionRuntime';

test('reads the latest model and collaboration mode from Codex JSONL', () => {
  const value = [
    JSON.stringify({ payload: { collaboration_mode_kind: 'default', model: 'old' } }),
    JSON.stringify({ payload: { collaboration_mode: { mode: 'plan' }, model: 'gpt-6.1-sol' } })
  ].join('\n');
  assert.deepEqual(runtimeSettingsFromJsonl(value), { mode: 'plan', model: 'gpt-6.1-sol' });
});

test('accepts harness permission modes and ignores malformed lines', () => {
  assert.deepEqual(runtimeSettingsFromJsonl('bad\n{"payload":{"permission_mode":"plan"}}'), { mode: 'plan' });
});
