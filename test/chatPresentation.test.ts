import assert from 'node:assert/strict';
import test from 'node:test';
import { ACTIVITY_INDICATOR_CLASS, chatHeaderModel, chatMetadataModel, sessionClipboardText, sessionCopiedMessage, shortSessionId, shouldPinChatChrome, shouldShowChatTabs } from '../src/chatPresentation';
import { AgentDeckSession } from '../src/types';

const base: AgentDeckSession = {
  id: '1234567890abcdef',
  title: 'Context percentage in DeckBridge',
  status: 'running',
  substate: 'working',
  path: '/workspace',
  group: 'work',
  tool: 'codex',
  model: 'gpt-6.1-sol',
  raw: {}
};

test('builds a readable chat heading independently from metadata chips', () => {
  assert.deepEqual(chatHeaderModel(base), {
    title: 'Context percentage in DeckBridge',
    status: 'working'
  });
  assert.deepEqual(chatMetadataModel(base), {
    tool: 'codex',
    model: 'gpt-6.1-sol',
    sessionId: '1234567890abcdef'
  });
});

test('keeps the complete Agent Deck session id for display and clipboard', () => {
  assert.equal(chatMetadataModel(base).sessionId, base.id);
  assert.equal(sessionClipboardText(base), base.id);
  assert.equal(sessionCopiedMessage(), 'ID da sessão copiado para a área de transferência');
});

test('falls back to the session id when the title is blank', () => {
  assert.equal(chatHeaderModel({ ...base, title: '  ' }).title, base.id);
  assert.equal(shortSessionId('short-id'), 'short-id');
});

test('keeps chat navigation and metadata visible in the sidebar', () => {
  assert.equal(shouldPinChatChrome(true), true);
  assert.equal(shouldPinChatChrome(false), false);
});

test('shows the chat switcher only when multiple conversations are open', () => {
  assert.equal(shouldShowChatTabs(0), false);
  assert.equal(shouldShowChatTabs(1), false);
  assert.equal(shouldShowChatTabs(2), true);
});

test('keeps the floating activity indicator isolated from Agent Deck row kinds', () => {
  assert.notEqual(ACTIVITY_INDICATOR_CLASS, 'thinking');
  assert.notEqual(ACTIVITY_INDICATOR_CLASS, 'assistant');
  assert.notEqual(ACTIVITY_INDICATOR_CLASS, 'turn_end');
});
