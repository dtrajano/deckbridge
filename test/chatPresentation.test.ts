import assert from 'node:assert/strict';
import test from 'node:test';
import { ACTIVITY_INDICATOR_CLASS, ACTIVITY_INDICATOR_FLOATING_CLASS, THINKING_TIMEOUT_MS, chatHeaderModel, chatMessageCss, chatMetadataModel, responsiveChatCss, scrollTopAfterPrepend, sessionClipboardText, sessionCopiedMessage, shortSessionId, shouldFollowLiveChatScroll, shouldPinChatChrome, shouldShowChatTabs, showOlderMessagesControl } from '../src/chatPresentation';
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

test('follows live chat output only when the reader is near the bottom', () => {
  assert.equal(shouldFollowLiveChatScroll(900, 500, 1_420), true);
  assert.equal(shouldFollowLiveChatScroll(700, 500, 1_420), false);
  assert.equal(shouldFollowLiveChatScroll(700, 500, 1_420, 220), true);
});

test('preserves the reader position when older messages are prepended', () => {
  assert.equal(scrollTopAfterPrepend(320, 1_000, 1_450), 770);
  assert.equal(scrollTopAfterPrepend(0, 1_000, 1_450), 450);
  assert.equal(scrollTopAfterPrepend(320, 1_450, 1_000), 320);
});

test('provides compact chat rules for narrow sidebar widths', () => {
  const css = responsiveChatCss();
  assert.match(css, /max-width:560px/);
  assert.match(css, /flex-wrap:wrap/);
  assert.match(css, /grid-template-columns:minmax\(0,1fr\) auto/);
  assert.match(css, /max-width:360px/);
});

test('keeps message content inside narrow chat panels', () => {
  const css = chatMessageCss();
  assert.match(css, /\.messages,\.row,\.body\{min-width:0/);
  assert.match(css, /overflow-wrap:anywhere/);
  assert.match(css, /\.body pre\{max-width:100%/);
});

test('keeps the older-messages control hidden until its flow is ready', () => {
  assert.equal(showOlderMessagesControl(), false);
});

test('keeps the floating activity indicator isolated from Agent Deck row kinds', () => {
  assert.equal(ACTIVITY_INDICATOR_FLOATING_CLASS, 'agent-activity-indicator floating');
  assert.equal(THINKING_TIMEOUT_MS, 45_000);
  assert.notEqual(ACTIVITY_INDICATOR_CLASS, 'thinking');
  assert.notEqual(ACTIVITY_INDICATOR_CLASS, 'assistant');
  assert.notEqual(ACTIVITY_INDICATOR_CLASS, 'turn_end');
});
