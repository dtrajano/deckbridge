import assert from 'node:assert/strict';
import test from 'node:test';
import { vscodeActionDescriptor } from '../src/vscodeIntegration';

test('maps chat test actions to stable VS Code commands', () => {
  assert.deepEqual(vscodeActionDescriptor('runTests'), {
    command: 'testing.runAll',
    progressMessage: 'Starting tests in VS Code…',
    completionMessage: 'Tests started. Open Test Explorer to follow the results.'
  });
  assert.equal(vscodeActionDescriptor('openTestExplorer').command, 'workbench.view.testing');
});
