import { readFile } from 'node:fs/promises';

const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const required = {
  name: 'deckbridge',
  publisher: 'dtrajano',
  license: 'MIT',
  pricing: 'Free',
  preview: true,
  icon: 'media/deckbridge.png'
};

for (const [key, expected] of Object.entries(required)) {
  if (manifest[key] !== expected) throw new Error(`package.json ${key} must be ${JSON.stringify(expected)}.`);
}

for (const key of ['repository', 'homepage', 'bugs']) {
  if (!manifest[key]) throw new Error(`package.json must define ${key}.`);
}

if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) throw new Error('Extension version must use major.minor.patch.');

console.log(`Validated ${manifest.publisher}.${manifest.name}@${manifest.version} as a free Preview extension.`);
