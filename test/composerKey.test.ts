import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldSubmitComposerKey } from '../src/composerKey';

test('Enter submits and Shift+Enter keeps a newline', () => {
  assert.equal(shouldSubmitComposerKey({ key: 'Enter' }), true);
  assert.equal(shouldSubmitComposerKey({ key: 'Enter', shiftKey: true }), false);
});
