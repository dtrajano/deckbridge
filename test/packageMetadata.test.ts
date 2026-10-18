import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import path from 'node:path';

const root = process.cwd();
const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')) as Record<string, unknown>;

test('publishes DeckBridge under the personal publisher as a free Preview', () => {
  assert.equal(manifest.name, 'deckbridge');
  assert.equal(manifest.publisher, 'dtrajano');
  assert.equal(manifest.pricing, 'Free');
  assert.equal(manifest.preview, true);
  assert.equal(manifest.icon, 'media/deckbridge.png');
});

test('links Marketplace users to the public project resources', () => {
  assert.deepEqual(manifest.repository, {
    type: 'git',
    url: 'https://github.com/dtrajano/deckbridge-vscode.git'
  });
  assert.equal(manifest.homepage, 'https://github.com/dtrajano/deckbridge-vscode#readme');
  assert.deepEqual(manifest.bugs, { url: 'https://github.com/dtrajano/deckbridge-vscode/issues' });
});

test('keeps development files and generated VSIX archives out of the package', () => {
  const ignored = readFileSync(path.join(root, '.vscodeignore'), 'utf8');
  for (const pattern of ['.github/**', 'src/**', 'test/**', 'scripts/**', 'deckbridge-*.vsix']) {
    assert.match(ignored, new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'));
  }
});
