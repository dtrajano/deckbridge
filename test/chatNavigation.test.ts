import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ChatNavigationState, returnToSessionList } from '../src/chatNavigation';
import { AgentDeckSession } from '../src/types';

const session = (id: string): AgentDeckSession => ({
  id,
  title: `Session ${id}`,
  tool: 'codex',
  status: 'running',
  path: '/workspace',
  group: '',
  raw: {}
});

it('refreshes session status before returning focus to the session list', async () => {
  const calls: string[] = [];
  await returnToSessionList(
    async () => { calls.push('refresh'); },
    async () => { calls.push('focus'); }
  );
  assert.deepEqual(calls, ['refresh', 'focus']);
});

describe('ChatNavigationState', () => {
  it('opens a session in the sidebar state', () => {
    const state = new ChatNavigationState();
    const selected = session('one');

    state.open(selected);

    assert.equal(state.isOpen, true);
    assert.equal(state.session, selected);
  });

  it('replaces the selected session instead of creating another surface', () => {
    const state = new ChatNavigationState();
    state.open(session('one'));

    state.open(session('two'));

    assert.equal(state.session?.id, 'two');
    assert.deepEqual(state.tabs.map((tab) => tab.id), ['one', 'two']);
  });

  it('switches between open tabs', () => {
    const state = new ChatNavigationState();
    state.open(session('one'));
    state.open(session('two'));

    assert.equal(state.activate('one'), true);
    assert.equal(state.session?.id, 'one');
    assert.equal(state.activate('missing'), false);
  });

  it('closes an active tab and selects the adjacent tab', () => {
    const state = new ChatNavigationState();
    state.open(session('one'));
    state.open(session('two'));

    state.close('two');

    assert.equal(state.session?.id, 'one');
    assert.deepEqual(state.tabs.map((tab) => tab.id), ['one']);
  });

  it('returns to the sessions list without losing open tabs', () => {
    const state = new ChatNavigationState();
    state.open(session('one'));

    state.back();

    assert.equal(state.isOpen, false);
    assert.equal(state.session?.id, 'one');
    assert.equal(state.tabs.length, 1);
  });

  it('returns to the sessions list when the final tab closes', () => {
    const state = new ChatNavigationState();
    state.open(session('one'));

    state.close('one');

    assert.equal(state.isOpen, false);
    assert.equal(state.session, undefined);
  });
});
