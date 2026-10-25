import assert from 'node:assert/strict';
import test from 'node:test';
import { formatWorkspaceContext, workspaceContextInfo } from '../src/workspaceContext';

test('recognizes code-workspace files and keeps their full path', () => {
  assert.deepEqual(workspaceContextInfo('/workspaces/demo.code-workspace'), {
    fileName: 'demo.code-workspace', path: '/workspaces/demo.code-workspace'
  });
  assert.equal(workspaceContextInfo('/workspaces/demo.code-workspace.json'), undefined);
});

test('formats the complete workspace file as explicit JSON context', () => {
  const info = workspaceContextInfo('/workspaces/demo.code-workspace')!;
  assert.equal(formatWorkspaceContext(info, '{"folders":[]}'), 'Contexto do workspace demo.code-workspace (/workspaces/demo.code-workspace):\n\n```json\n{"folders":[]}\n```');
});
