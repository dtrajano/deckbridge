import assert from 'node:assert/strict';
import test from 'node:test';
import { attachmentPrompt, imageAttachmentArgs, imagePathsForTool } from '../src/attachments';

test('formats local attachment references for the agent', () => {
  const prompt = attachmentPrompt([
    { name: 'shot.png', type: 'image/png', size: 12, dataBase64: 'abc' },
    { name: 'notes.txt', type: 'text/plain', size: 4, dataBase64: 'def' }
  ], ['/tmp/shot.png', '/tmp/notes.txt']);
  assert.match(prompt, /Arquivo anexado: shot\.png/);
  assert.match(prompt, /Caminho local: \/tmp\/notes\.txt/);
});

test('builds repeatable Agent Deck image flags', () => {
  assert.deepEqual(imageAttachmentArgs(['/tmp/a.png', '/tmp/b.jpg']), ['--image', '/tmp/a.png', '--image', '/tmp/b.jpg']);
});

test('only passes image flags to Agent Deck tools that support running images', () => {
  assert.deepEqual(imagePathsForTool('claude', ['/tmp/a.png']), ['/tmp/a.png']);
  assert.deepEqual(imagePathsForTool('gemini', ['/tmp/a.png']), ['/tmp/a.png']);
  assert.deepEqual(imagePathsForTool('codex', ['/tmp/a.png']), []);
});
