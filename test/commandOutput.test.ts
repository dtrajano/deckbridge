import assert from 'node:assert/strict';
import test from 'node:test';
import { commandOutputIsError, paneOutputDelta, terminalErrorExcerpt } from '../src/commandOutput';

test('returns only lines appended by a terminal command', () => {
  assert.equal(paneOutputDelta('old response\n› /status', 'old response\n› /status\nModel: GPT-5.6\nContext: 92%'), 'Model: GPT-5.6\nContext: 92%');
});

test('handles a tmux viewport that discarded older lines', () => {
  assert.equal(paneOutputDelta('one\ntwo\nthree', 'two\nthree\nnew output'), 'new output');
});

test('does not create a row before the pane changes', () => {
  assert.equal(paneOutputDelta('same\nprompt', 'same\nprompt'), undefined);
});

test('classifies terminal error output for the red chat block', () => {
  assert.equal(commandOutputIsError('Error: unresolved Codex submission marker'), true);
  assert.equal(commandOutputIsError('command not found: agent-deck'), true);
  assert.equal(commandOutputIsError('stream disconnected before completion: stream closed before response.completed'), true);
  assert.equal(commandOutputIsError('{"type":"error","status":400,"error":{"type":"invalid_request_error"}}'), true);
  assert.equal(commandOutputIsError('Model: GPT-5.6\nContext: 92%'), false);
});

test('classifies sudo authentication failures as terminal errors', () => {
  assert.equal(commandOutputIsError('sudo: a password is required'), true);
});

test('extracts the latest structured terminal error for the chat feed', () => {
  assert.equal(
    terminalErrorExcerpt('prompt\n{"type":"error","status":400}\nnext prompt'),
    '{"type":"error","status":400}\nnext prompt'
  );
  assert.equal(
    terminalErrorExcerpt('prompt\nError: first diagnostic\nnormal\nError: complete provider message\nnext prompt'),
    'Error: complete provider message\nnext prompt'
  );
  assert.equal(
    terminalErrorExcerpt('{"type":"error","status":400,"error":{"message":"The model is not\nsupported with this account."}}\n› Ask Codex to do anything'),
    '{"type":"error","status":400,"error":{"message":"The model is not\nsupported with this account."}}'
  );
  assert.equal(terminalErrorExcerpt('prompt\nModel: GPT-5.6'), undefined);
});
