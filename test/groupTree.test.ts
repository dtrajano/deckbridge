import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGroupTree } from '../src/groupTree';
import { AgentDeckSession } from '../src/types';

const session = (id: string, group: string): AgentDeckSession => ({ id, title: id, status: 'idle', path: '/repo', group, tool: 'codex', raw: {} });

test('keeps empty root groups and nested subgroups visible', () => {
  const tree = buildGroupTree([session('chat', 'projects/active')], ['empty', 'projects/active', 'projects/archive']);
  assert.deepEqual(tree.map((group) => group.path), ['empty', 'projects']);
  const projects = tree.find((group) => group.path === 'projects');
  assert.deepEqual(projects?.children.map((group) => group.path), ['projects/active', 'projects/archive']);
  assert.equal(projects?.children.find((group) => group.path === 'projects/archive')?.sessions.length, 0);
});

test('creates the ungrouped bucket for sessions without a group', () => {
  const tree = buildGroupTree([session('chat', '')], []);
  assert.equal(tree[0]?.path, 'Ungrouped');
  assert.equal(tree[0]?.sessions[0]?.id, 'chat');
});
