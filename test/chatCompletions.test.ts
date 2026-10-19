import assert from 'node:assert/strict';
import test from 'node:test';
import { chatCommandCompletions, completionToken, filterChatCompletions, parseSkillCompletions } from '../src/chatCompletions';

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

test('keeps requested Codex workflow commands available while typing', () => {
  const commands = chatCommandCompletions('codex').map((item) => item.value);
  assert.ok(commands.includes('/plan'));
  assert.ok(commands.includes('/ask'));
  assert.ok(commands.includes('/debug'));
});

test('tracks the active slash or skill token as the user continues typing', () => {
  assert.equal(completionToken('/'), '/');
  assert.equal(completionToken('/mo'), '/mo');
  assert.equal(completionToken('please /pla'), '/pla');
  assert.equal(completionToken('/model gpt'), undefined);
  assert.equal(completionToken('$use-rail'), '$use-rail');
});

test('filters continuously and ranks command prefixes first', () => {
  const commands = chatCommandCompletions('codex');
  assert.deepEqual(filterChatCompletions(commands, '/pla').map((item) => item.value), ['/plan']);
  assert.deepEqual(filterChatCompletions(commands, '/deb').map((item) => item.value), ['/debug']);
  assert.deepEqual(filterChatCompletions(commands, '/missing'), []);
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
