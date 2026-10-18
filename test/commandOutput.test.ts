import assert from 'node:assert/strict';
import test from 'node:test';
import { paneOutputDelta } from '../src/commandOutput';

test('returns only lines appended by a terminal command', () => {
  assert.equal(paneOutputDelta('old response\n› /status', 'old response\n› /status\nModel: GPT-5.6\nContext: 92%'), 'Model: GPT-5.6\nContext: 92%');
});

test('handles a tmux viewport that discarded older lines', () => {
  assert.equal(paneOutputDelta('one\ntwo\nthree', 'two\nthree\nnew output'), 'new output');
});

test('does not create a row before the pane changes', () => {
  assert.equal(paneOutputDelta('same\nprompt', 'same\nprompt'), undefined);
});
