import assert from 'node:assert/strict';
import test from 'node:test';
import { isSessionInWorkspace, parseGroupPaths, parseSessions, parseTimeline, parseVersion } from '../src/parsers';

test('parses the Agent Deck version', () => {
  assert.equal(parseVersion('Agent Deck v1.16.28'), '1.16.28');
  assert.equal(parseVersion('agent-deck 2.0.1\n'), '2.0.1');
  assert.equal(parseVersion('development build'), undefined);
});

test('normalizes a session list', () => {
  const sessions = parseSessions(JSON.stringify({ sessions: [{
    id: 'abc123', title: 'API work', status: 'running', path: '/repo/api', group: 'work', tool: 'codex', transcript_path: '/tmp/a.jsonl'
  }] }));
  assert.deepEqual(sessions[0], {
    id: 'abc123', title: 'API work', status: 'running', path: '/repo/api', group: 'work', tool: 'codex',
    model: undefined, substate: undefined, account: undefined, nativeSessionId: undefined,
    profile: undefined, branch: undefined, favorite: false, transcriptPath: '/tmp/a.jsonl',
    statusSource: undefined, tmuxSession: undefined, createdAt: undefined, lastActivityAt: undefined, viewerCount: undefined,
    raw: { id: 'abc123', title: 'API work', status: 'running', path: '/repo/api', group: 'work', tool: 'codex', transcript_path: '/tmp/a.jsonl' }
  });
});

test('accepts a top-level session array', () => {
  assert.equal(parseSessions('[{"id":"1","name":"Session"}]')[0].title, 'Session');
});

test('accepts instances and fallback field names', () => {
  const [session] = parseSessions(JSON.stringify({ instances: [{
    session_id: 'session-2', cwd: '/repo/web', command: 'claude', profile: 'work', branch: 'feature/chat', favorite: true
  }] }));
  assert.equal(session.id, 'session-2');
  assert.equal(session.title, 'session-2');
  assert.equal(session.path, '/repo/web');
  assert.equal(session.tool, 'claude');
  assert.equal(session.group, 'Ungrouped');
  assert.equal(session.status, 'not-started');
  assert.equal(session.profile, 'work');
  assert.equal(session.branch, 'feature/chat');
  assert.equal(session.favorite, true);
});

test('normalizes Agent Deck status and model metadata', () => {
  const [session] = parseSessions(JSON.stringify([{
    id: 'deck-id', title: 'Chat', path: '/repo', tool: 'codex', status: 'running', substate: 'working',
    model_id: 'gpt-6.1-sol', account: 'work', codex_session_id: 'native-codex-id',
    status_source: 'live', tmux_session: 'agentdeck_Chat_123', created_at: '2026-10-01T10:00:00Z', last_activity_at: '2026-10-02T11:00:00Z', viewer_count: 2
  }]));
  assert.equal(session.status, 'running');
  assert.equal(session.substate, 'working');
  assert.equal(session.model, 'gpt-6.1-sol');
  assert.equal(session.account, 'work');
  assert.equal(session.nativeSessionId, 'native-codex-id');
  assert.equal(session.statusSource, 'live');
  assert.equal(session.tmuxSession, 'agentdeck_Chat_123');
  assert.equal(session.createdAt, '2026-10-01T10:00:00Z');
  assert.equal(session.lastActivityAt, '2026-10-02T11:00:00Z');
  assert.equal(session.viewerCount, 2);
});

test('prefers explicit model and harness-specific session IDs in stable order', () => {
  const [session] = parseSessions(JSON.stringify([{
    id: 'deck-id', model: 'opus', model_id: 'fallback', claude_session_id: 'claude-id', codex_session_id: 'codex-id'
  }]));
  assert.equal(session.model, 'opus');
  assert.equal(session.nativeSessionId, 'claude-id');
});

test('ignores malformed session entries and rejects unsupported containers', () => {
  assert.deepEqual(parseSessions('[null,42,{"title":"missing id"},{"id":"ok"}]').map((session) => session.id), ['ok']);
  assert.throws(() => parseSessions('{"sessions":{}}'), /unsupported session-list shape/);
  assert.throws(() => parseSessions('not json'), SyntaxError);
});

test('checks workspace containment without prefix collisions', () => {
  assert.equal(isSessionInWorkspace('/repo/app/packages/ui', ['/repo/app']), true);
  assert.equal(isSessionInWorkspace('/repo/application', ['/repo/app']), false);
  assert.equal(isSessionInWorkspace('/repo/app', ['/repo/app/']), true);
  assert.equal(isSessionInWorkspace('', ['/repo/app']), false);
  assert.equal(isSessionInWorkspace('/repo/two', ['/repo/one', '/repo/two']), true);
});

test('validates timeline turns', () => {
  const timeline = parseTimeline('{"turns":[{"id":"m1","kind":"assistant","body":"Done"}],"through_cursor":"x"}');
  assert.equal(timeline.turns[0].body, 'Done');
  const older = parseTimeline('{"turns":[],"before_cursor":"older-cursor"}');
  assert.equal(older.before_cursor, 'older-cursor');
  assert.throws(() => parseTimeline('{"rows":[]}'));
  assert.throws(
    () => parseTimeline('{"code":"INVALID_OPERATION","error":"recall is off"}'),
    /recall is off/
  );
  assert.throws(() => parseTimeline('invalid json'), SyntaxError);
});

test('collects nested Agent Deck group paths', () => {
  assert.deepEqual(parseGroupPaths(JSON.stringify({ groups: [
    { path: 'work', children: [{ path: 'work/api' }, { path: 'work/web' }] },
    { path: 'personal' }
  ] })), ['work', 'work/api', 'work/web', 'personal']);
});

test('ignores malformed group entries', () => {
  assert.deepEqual(parseGroupPaths('{"groups":[null,4,{"name":"no path"}]}'), []);
  assert.deepEqual(parseGroupPaths('{"groups":{}}'), []);
});
