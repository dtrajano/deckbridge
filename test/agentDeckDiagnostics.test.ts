import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnoseAgentDeckError } from '../src/agentDeckDiagnostics';

test('classifies readonly Agent Deck storage as an actionable diagnostic', () => {
  const diagnostic = diagnoseAgentDeckError('failed to initialize storage: attempt to write a readonly database (8)');
  assert.equal(diagnostic.kind, 'readonly-storage');
  assert.match(diagnostic.title, /gravar/);
  assert.match(diagnostic.detail, /não apaga/i);
});

test('classifies missing Agent Deck executable', () => {
  assert.equal(diagnoseAgentDeckError('spawn agent-deck ENOENT').kind, 'missing-executable');
});

test('preserves unknown Agent Deck errors', () => {
  const diagnostic = diagnoseAgentDeckError('target session is not running');
  assert.equal(diagnostic.kind, 'generic');
  assert.equal(diagnostic.detail, 'target session is not running');
});
