import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSendArgs, canSendToSession, canStopSession, expectsTranscriptResponse, isSessionActive, isThinkingStatus, sendReceiptLabel, sessionIndicatorTone, sessionTreeIndicator, shouldAutoStartSession, shouldSendImmediately, shouldStartAfterRuntimeProbe } from '../src/sessionPolicy';

test('blocks messages until a session has started and while stopped or errored', () => {
  for (const status of ['running', 'waiting', 'idle']) assert.equal(canSendToSession(status), true);
  for (const status of ['not-started', 'stopped', 'error', 'ERROR']) assert.equal(canSendToSession(status), false);
});

test('marks sessions with a live agent process as active', () => {
  for (const status of ['running', 'waiting', 'idle', 'RUNNING']) assert.equal(isSessionActive(status), true);
  for (const status of ['not-started', 'stopped', 'error', 'ERROR']) assert.equal(isSessionActive(status), false);
});

test('offers stop only while the session is active', () => {
  for (const status of ['running', 'waiting', 'idle', 'RUNNING']) assert.equal(canStopSession(status), true);
  for (const status of ['not-started', 'stopped', 'error', 'ERROR']) assert.equal(canStopSession(status), false);
});

test('uses distinct indicator colors for active, stopped, and errored sessions', () => {
  for (const status of ['running', 'waiting', 'idle']) assert.equal(sessionIndicatorTone(status), 'active');
  assert.equal(sessionIndicatorTone('stopped'), 'stopped');
  assert.equal(sessionIndicatorTone('STOPPED'), 'stopped');
  assert.equal(sessionIndicatorTone('error'), 'error');
  assert.equal(sessionIndicatorTone('not-started'), 'not-started');
});

test('maps session states to visible tree icons and colors', () => {
  assert.deepEqual(sessionTreeIndicator('running'), { icon: 'sync~spin', color: 'charts.green' });
  assert.deepEqual(sessionTreeIndicator('waiting'), { icon: 'bell-dot-filled', color: 'charts.yellow' });
  assert.deepEqual(sessionTreeIndicator('idle'), { icon: 'circle-filled', color: 'charts.orange' });
  assert.deepEqual(sessionTreeIndicator('stopped'), { icon: 'debug-stop', color: 'charts.orange' });
  assert.deepEqual(sessionTreeIndicator('error'), { icon: 'error', color: 'charts.red' });
  assert.deepEqual(sessionTreeIndicator('not-started'), { icon: 'circle-outline', color: 'charts.blue' });
  assert.deepEqual(sessionTreeIndicator('unknown'), { icon: 'question', color: 'disabledForeground' });
});

test('auto-starts only inactive sessions when enabled', () => {
  assert.equal(shouldAutoStartSession('stopped', true), true);
  assert.equal(shouldAutoStartSession('error', true), true);
  assert.equal(shouldAutoStartSession('not-started', true), true);
  assert.equal(shouldAutoStartSession('running', true), false);
  assert.equal(shouldAutoStartSession('waiting', true), false);
  assert.equal(shouldAutoStartSession('stopped', false), false);
});

test('does not start a session when its agent process is already alive', () => {
  assert.equal(shouldStartAfterRuntimeProbe('error', true, true), false);
  assert.equal(shouldStartAfterRuntimeProbe('error', true, false), true);
  assert.equal(shouldStartAfterRuntimeProbe('running', true, false), false);
});

test('shows thinking state from running status or activity verb', () => {
  assert.equal(isThinkingStatus('running', false), false);
  assert.equal(isThinkingStatus('waiting', true), false);
  assert.equal(isThinkingStatus('waiting', false, 'Working…'), true);
  assert.equal(isThinkingStatus('waiting', false), false);
  assert.equal(isThinkingStatus('idle', undefined), false);
  assert.equal(isThinkingStatus('error', false), false);
  assert.equal(isThinkingStatus('running', undefined), false);
});

test('builds send arguments in Agent Deck documented order', () => {
  assert.deepEqual(buildSendArgs('session-id', 'hello world'), [
    'session', 'send', 'session-id', 'hello world', '--json'
  ]);
  assert.deepEqual(buildSendArgs('session-id', '/status', true), [
    'session', 'send', 'session-id', '/status', '--json', '--no-wait'
  ]);
});

test('does not wait for transcript output from slash commands', () => {
  assert.equal(expectsTranscriptResponse('/status'), false);
  assert.equal(expectsTranscriptResponse('  /compact'), false);
  assert.equal(expectsTranscriptResponse('Explain /status'), true);
});

test('bypasses a stale durable queue when a live agent is available', () => {
  assert.equal(shouldSendImmediately('hello', true), true);
  assert.equal(shouldSendImmediately('hello', false), false);
  assert.equal(shouldSendImmediately('/status', false), true);
});

test('describes send receipts', () => {
  assert.equal(sendReceiptLabel({ verdict: 'queued', send_id: '123456789' }), 'Message queued');
  assert.equal(sendReceiptLabel({ state: 'landed' }), 'Message landed');
  assert.equal(sendReceiptLabel({ send_id: 'abcdefgh-more' }), 'Message accepted (abcdefgh)');
  assert.equal(sendReceiptLabel({}), 'Message accepted');
});
