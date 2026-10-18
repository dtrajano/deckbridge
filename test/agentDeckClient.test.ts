import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { AgentDeckClient, AgentDeckError, extractCliError, isCodexUpdatePrompt, isOccupiedComposer, isUnresolvedCodexSubmission, RecallFollower, sendReceiptFailure } from '../src/agentDeckClient';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';

test('extracts a structured CLI error from stdout', () => {
  assert.equal(
    extractCliError('{"code":"INVALID_OPERATION","error":"recall is off"}', '', 2),
    'recall is off'
  );
  assert.equal(extractCliError('{"message":"not available"}', '', 1), 'not available');
});

test('falls back through stderr, stdout, and exit code', () => {
  assert.equal(extractCliError('plain stdout', 'specific stderr', 2), 'specific stderr');
  assert.equal(extractCliError('plain stdout', '', 2), 'plain stdout');
  assert.equal(extractCliError('', '', 9), 'Agent Deck exited with code 9.');
});

test('treats structured send refusals as failures even when the CLI exits zero', () => {
  assert.equal(sendReceiptFailure({ success: false, delivery: 'acceptance_refused', error: 'unresolved Codex submission' }), 'unresolved Codex submission');
  assert.equal(sendReceiptFailure({ state: 'failed', reason: 'target not running' }), 'target not running');
  assert.equal(sendReceiptFailure({ success: true, delivery: 'submitted' }), undefined);
  assert.equal(sendReceiptFailure({ verdict: 'queued' }), undefined);
});

test('allows tmux fallback only for the exact unresolved Codex refusal', () => {
  assert.equal(isUnresolvedCodexSubmission(new AgentDeckError('cannot establish exact Codex turn acceptance: unresolved Codex submission abc; refusing a second send')), true);
  assert.equal(isUnresolvedCodexSubmission(new AgentDeckError('target session is not running')), false);
  assert.equal(isUnresolvedCodexSubmission(new Error('unresolved Codex submission')), false);
});

test('recognizes only the known Codex update blocker for automatic dismissal', () => {
  assert.equal(isOccupiedComposer(new Error("message not sent: composer is occupied or unreadable; existing draft preserved")), true);
  assert.equal(isCodexUpdatePrompt('Update available · 0.161.0 → 0.163.0\n1. Update now\n2. Skip\nenter continue · esc skip'), true);
  assert.equal(isCodexUpdatePrompt('Draft: do not delete this text'), false);
  assert.equal(isCodexUpdatePrompt('Update available but no actionable prompt'), false);
});

test('builds terminal arguments with and without a profile', () => {
  const defaultClient = new AgentDeckClient({ executable: 'agent-deck' });
  const profileClient = new AgentDeckClient({ executable: 'agent-deck', profile: 'work' });
  assert.deepEqual(defaultClient.terminalArgs('session-1'), ['session', 'attach', 'session-1']);
  assert.deepEqual(profileClient.terminalArgs('session-1'), ['--profile', 'work', 'session', 'attach', 'session-1']);
});

test('recall follower joins split JSONL chunks and skips blank lines', async () => {
  const child = fakeChild();
  const follower = new RecallFollower(child.process);
  const frames: unknown[] = [];
  follower.on('frame', (frame) => frames.push(frame));

  child.stdout.write('{"frame":"row","row":{"id":"1","kind":"user"');
  child.stdout.write('}}\n\n{"frame":"remove","id":"1"}\n');
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(frames, [
    { frame: 'row', row: { id: '1', kind: 'user' } },
    { frame: 'remove', id: '1' }
  ]);
  follower.dispose();
  assert.equal(child.killed, true);
});

test('recall follower reports malformed frames and stderr diagnostics', async () => {
  const child = fakeChild();
  const follower = new RecallFollower(child.process);
  const diagnostics: string[] = [];
  follower.on('diagnostic', (message: string) => diagnostics.push(message));

  child.stdout.write('not-json\n');
  child.stderr.write('warning from agent-deck');
  await new Promise((resolve) => setImmediate(resolve));

  assert.match(diagnostics[0], /Ignored malformed follow frame/);
  assert.equal(diagnostics[1], 'warning from agent-deck');
  follower.dispose();
});

test('recall follower forwards close events', async () => {
  const child = fakeChild();
  const follower = new RecallFollower(child.process);
  const closed = once(follower, 'close');
  child.emitter.emit('close', 0);
  assert.deepEqual(await closed, [0]);
  follower.dispose();
});

function fakeChild(): {
  process: ChildProcessWithoutNullStreams;
  stdout: PassThrough;
  stderr: PassThrough;
  emitter: EventEmitter;
  readonly killed: boolean;
} {
  const emitter = new EventEmitter();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const stdin = new PassThrough();
  let killed = false;
  const process = emitter as ChildProcessWithoutNullStreams;
  Object.assign(process, {
    stdout,
    stderr,
    stdin,
    kill: () => { killed = true; return true; }
  });
  return {
    process,
    stdout,
    stderr,
    emitter,
    get killed() { return killed; }
  };
}
