import assert from 'node:assert/strict';
import test from 'node:test';
import { assessSwitch } from '../src/switchPolicy';

test('blocks switch plans that Agent Deck cannot execute yet', () => {
  assert.deepEqual(assessSwitch({
    capability: 'transcript-tail',
    execution: 'planned',
    fidelity_inclusions: ['messages', 'metadata'],
    fidelity_exclusions: ['tool state']
  }), {
    capability: 'transcript-tail',
    execution: 'planned',
    fidelity: '2 context guarantees, 1 exclusions',
    allowed: false
  });
});

test('allows supported native switches', () => {
  assert.deepEqual(assessSwitch({
    capability: 'native-resume', execution: 'supported', fidelity: 'exact conversation copy'
  }), {
    capability: 'native-resume',
    execution: 'supported',
    fidelity: 'exact conversation copy',
    allowed: true
  });
});

test('blocks unsupported capability even with an unexpected execution label', () => {
  const result = assessSwitch({ capability_level: 'unsupported', execution_status: 'unknown' });
  assert.equal(result.allowed, false);
  assert.equal(result.fidelity, 'bounded context handoff');
});
