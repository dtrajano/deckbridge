import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { renderShellBeforeProbe } from '../src/chatInitialization';

test('renders the chat shell before waiting for the runtime probe', async () => {
  const events: string[] = [];
  const value = await renderShellBeforeProbe(
    () => events.push('shell'),
    async () => { events.push('probe'); return 'ready'; },
    () => events.push('error')
  );
  assert.equal(value, 'ready');
  assert.deepEqual(events, ['shell', 'probe']);
});

test('keeps the shell available when the runtime probe fails', async () => {
  const events: string[] = [];
  const value = await renderShellBeforeProbe(
    () => events.push('shell'),
    async () => { throw new Error('tmux unavailable'); },
    (error) => events.push(error instanceof Error ? error.message : String(error))
  );
  assert.equal(value, undefined);
  assert.deepEqual(events, ['shell', 'tmux unavailable']);
});

test('does not place literal newlines inside webview regular expressions', () => {
  const source = readFileSync('src/chatPanel.ts', 'utf8');
  const script = source.slice(source.indexOf('<script nonce="${nonce}">'), source.indexOf('</script>'));
  assert.equal(script.includes('/\n'), false);
});
