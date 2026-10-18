import assert from 'node:assert/strict';
import test from 'node:test';
import { modelChoices, modelCommand } from '../src/modelSelection';

test('offers adapter-specific models and keeps the current model first', () => {
  assert.equal(modelChoices('claude', 'custom')[0], 'custom');
  assert.ok(modelChoices('codex').includes('gpt-6.1-sol'));
});

test('builds a safe single-line model slash command', () => {
  assert.equal(modelCommand(' opus '), '/model opus');
  assert.throws(() => modelCommand('bad\n/model'), /single non-empty line/);
});
