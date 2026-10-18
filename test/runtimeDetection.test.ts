import assert from 'node:assert/strict';
import test from 'node:test';
import { hasAgentDescendant, parsePanePid, parseTmuxDisplay, tmuxStateLabel } from '../src/runtimeDetection';

const processList = `
76561 76560 bash -c cd /workspace && codex resume abc
76563 76561 node /opt/homebrew/bin/codex resume abc
76579 76563 /opt/homebrew/lib/node_modules/@openai/codex/bin/codex resume abc
80000 1 /usr/bin/unrelated
`;

test('recognizes an agent running below the tmux pane leader', () => {
  assert.equal(hasAgentDescendant(76561, processList, 'codex'), true);
  assert.equal(hasAgentDescendant(76561, processList, 'claude'), false);
});

test('does not mistake text in the pane shell command for a live child process', () => {
  assert.equal(hasAgentDescendant(76563, '76563 1 bash -c codex resume abc', 'codex'), false);
});

test('parses only valid positive tmux pane pids', () => {
  assert.equal(parsePanePid('76561\n'), 76561);
  assert.equal(parsePanePid(''), undefined);
  assert.equal(parsePanePid('not-a-pid'), undefined);
});

test('parses attached, detached, and dead tmux runtime states', () => {
  assert.deepEqual(parseTmuxDisplay('2|3|0|76561\n'), {
    state: 'attached', attachedClients: 2, windows: 3, panePid: 76561
  });
  assert.equal(parseTmuxDisplay('0|1|0|76561')?.state, 'detached');
  assert.equal(parseTmuxDisplay('0|1|1|76561')?.state, 'dead');
  assert.equal(parseTmuxDisplay('invalid'), undefined);
});

test('describes tmux and agent state separately', () => {
  assert.equal(tmuxStateLabel({ state: 'attached', attachedClients: 1, windows: 1, panePid: 10, agentRunning: true }), 'attached (1) · agent running');
  assert.equal(tmuxStateLabel({ state: 'detached', attachedClients: 0, windows: 1, panePid: 10, agentRunning: false }), 'detached · agent not running');
  assert.equal(tmuxStateLabel({ state: 'not-running', attachedClients: 0, agentRunning: false }), 'not running');
});
