import assert from 'node:assert/strict';
import test from 'node:test';
import { chatCommandCompletions, parseSkillCompletions } from '../src/chatCompletions';

test('returns commands specific to each chat harness', () => {
  assert.ok(chatCommandCompletions('codex').some((item) => item.value === '/review'));
  assert.ok(chatCommandCompletions('claude').some((item) => item.value === '/context'));
  assert.deepEqual(chatCommandCompletions('unknown').map((item) => item.value), ['/help']);
});

test('marks model completion as an interactive command', () => {
  for (const tool of ['codex', 'claude', 'gemini', 'cursor']) {
    assert.equal(chatCommandCompletions(tool).find((item) => item.value === '/model')?.action, 'chooseModel');
  }
  assert.equal(chatCommandCompletions('codex').find((item) => item.value === '/status')?.action, undefined);
});

test('parses and deduplicates Agent Deck skill discovery output', () => {
  assert.deepEqual(parseSkillCompletions({ skills: [
    { name: 'use-railway', description: 'Operate Railway' },
    { name: 'use-railway' },
    { name: 'documents', description: '' }
  ] }), [
    { value: '$use-railway', label: 'use-railway', description: 'Operate Railway', kind: 'skill' },
    { value: '$documents', label: 'documents', description: 'Use the documents skill', kind: 'skill' }
  ]);
  assert.deepEqual(parseSkillCompletions({}), []);
});
