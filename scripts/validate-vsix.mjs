import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const file = process.argv[2];
if (!file || !existsSync(file)) throw new Error('Pass an existing VSIX path to validate.');

const listing = execFileSync('unzip', ['-Z1', file], { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);
const forbidden = [
  /^extension\/(?:src|test|scripts|\.git|\.github|\.vscode)\//,
  /^extension\/.*\.vsix$/,
  /^extension\/AGENTS\.md$/,
  /^extension\/tsconfig\.json$/,
  /^extension\/.*\.map$/
];

const violations = listing.filter((entry) => forbidden.some((pattern) => pattern.test(entry)));
if (violations.length) throw new Error(`VSIX contains development-only files:\n${violations.join('\n')}`);

for (const required of [
  'extension/package.json',
  'extension/readme.md',
  'extension/changelog.md',
  'extension/LICENSE.txt',
  'extension/media/deckbridge.png',
  'extension/dist/src/extension.js'
]) {
  if (!listing.includes(required)) throw new Error(`VSIX is missing ${required}.`);
}

console.log(`Validated ${file}: ${listing.length} packaged files and no development-only content.`);
