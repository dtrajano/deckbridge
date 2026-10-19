import assert from 'node:assert/strict';
import test from 'node:test';
import { groupContainsSession, setAllGroupsExpanded, setGroupExpanded } from '../src/treeExpansion';

test('tracks individual group expansion changes', () => {
  const collapsed = new Set<string>(['anil']);
  setGroupExpanded(collapsed, 'anil', true);
  setGroupExpanded(collapsed, 'wow', false);
  assert.deepEqual([...collapsed], ['wow']);
});

test('expands all by clearing collapsed groups and collapses all known groups', () => {
  const collapsed = new Set<string>(['old']);
  setAllGroupsExpanded(collapsed, ['anil', 'wow'], false);
  assert.deepEqual([...collapsed], ['old', 'anil', 'wow']);
  setAllGroupsExpanded(collapsed, [], true);
  assert.equal(collapsed.size, 0);
});

test('finds the parent group needed by TreeView.reveal', () => {
  const groups = [
    { name: 'one', sessions: [{ id: 'a' }] },
    { name: 'two', sessions: [{ id: 'b' }] }
  ];
  assert.equal(groupContainsSession(groups, 'b'), 'two');
  assert.equal(groupContainsSession(groups, 'missing'), undefined);
});
