import assert from 'node:assert/strict';
import test from 'node:test';
import { buildContextArgs, contextIndicatorModel, contextOverviewModel, contextPercentage } from '../src/contextUsage';

test('reads direct and nested context percentages from Agent Deck status data', () => {
  assert.equal(contextPercentage({ context_percent: 42 }), 42);
  assert.equal(contextPercentage({ facts: { context_pct: '63.5' } }), 63.5);
  assert.equal(contextPercentage({ usage: { percentage: 18 } }), 18);
  assert.equal(contextPercentage({ totals: { window_percent: 8.60139318885449 } }), 8.6);
});

test('builds the Agent Deck context overview command', () => {
  assert.deepEqual(buildContextArgs('session-1'), ['session', 'context', 'session-1', '--tab', 'overview', '--json']);
});

test('calculates context percentage from token usage and capacity', () => {
  assert.equal(contextPercentage({ tokens: { context_tokens: 50_000, context_window: 200_000 } }), 25);
  assert.equal(contextPercentage({ context: { used: 90, capacity: 120 } }), 75);
});

test('reads a context percentage embedded in footer facts', () => {
  assert.equal(contextPercentage({ facts: { footer: 'gpt-6.1 · ctx 37% · main' } }), 37);
});

test('returns undefined when Agent Deck has no context measurement', () => {
  assert.equal(contextPercentage({ running: false, session_status: 'waiting' }), undefined);
  assert.equal(contextPercentage(undefined), undefined);
});

test('builds context ring labels, tooltip and attention tones', () => {
  assert.deepEqual(contextIndicatorModel(8.6), {
    percent: 8.6,
    label: 'ctx 8.6%',
    tone: 'normal',
    tooltip: 'Context healthy: 8.6% used, 91.4% remaining.'
  });
  assert.equal(contextIndicatorModel(70).tone, 'warning');
  assert.equal(contextIndicatorModel(90).tone, 'critical');
});

test('clamps invalid context ring percentages to its visual range', () => {
  assert.equal(contextIndicatorModel(-4).percent, 0);
  assert.equal(contextIndicatorModel(104).percent, 100);
});

test('builds a categorized Codex context overview with provenance and warnings', () => {
  const model = contextOverviewModel({
    totals: { fixed: { tokens: 22_226 }, potential: { tokens: 146_235 }, window_percent: 8.6 },
    report: {
      adapter: 'codex',
      window: { tokens: 258_400 },
      anchor: { tokens: { provenance: 'provider-measured' } },
      categories: [{ title: 'AGENTS.md', items: [{ load: { actual: { tokens: 800, provenance: 'estimated' } } }] }],
      caveats: [{ severity: 'bug', message: 'Reconciliation failed' }, { severity: 'info', message: 'Cache is normal' }]
    }
  }, 'codex');
  assert.equal(model?.tooltip, 'codex · overhead inicial: 8.6% · provider-measured. Clique para ver detalhes.');
  assert.deepEqual(model?.categories, [{ title: 'AGENTS.md', tokens: 800, measurement: 'estimated' }]);
  assert.deepEqual(model?.warnings, ['Reconciliation failed']);
  assert.equal(model?.potentialTokens, 146_235);
});

test('preserves adapter-specific unavailable categories instead of inventing zeroes', () => {
  const model = contextOverviewModel({
    totals: { window_percent: 12 },
    report: { adapter: 'claude', categories: [{ title: 'system prompt', items: [] }] }
  }, 'claude');
  assert.deepEqual(model?.categories, [{ title: 'system prompt', tokens: undefined, measurement: 'unavailable' }]);
  assert.equal(model?.adapter, 'claude');
});
