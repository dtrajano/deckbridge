import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCreateGroupArgs, buildCreateSessionArgs } from '../src/groupCreation';

test('builds a root group create command', () => {
  assert.deepEqual(buildCreateGroupArgs('mobile'), ['group', 'create', 'mobile']);
});

test('builds a nested group create command', () => {
  assert.deepEqual(buildCreateGroupArgs('ios', 'mobile'), ['group', 'create', 'ios', '--parent', 'mobile']);
});

test('builds a session command targeted at a group', () => {
  assert.deepEqual(buildCreateSessionArgs('/workspace/app', 'Chat', 'codex', 'mobile/ios'), [
    'add', '--json', '-t', 'Chat', '-c', 'codex', '-g', 'mobile/ios', '/workspace/app'
  ]);
});

test('omits the group flag for a root session', () => {
  assert.deepEqual(buildCreateSessionArgs('/workspace/app', 'Chat', 'codex'), [
    'add', '--json', '-t', 'Chat', '-c', 'codex', '/workspace/app'
  ]);
});
