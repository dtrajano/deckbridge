import { readFile } from 'node:fs/promises';

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) throw new Error('Pass a major.minor.patch version.');

const changelog = await readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
const marker = `## ${version} `;
const start = changelog.indexOf(marker);
if (start < 0) throw new Error(`CHANGELOG.md has no ${version} section.`);
const contentStart = changelog.indexOf('\n', start) + 1;
const next = changelog.indexOf('\n## ', contentStart);
process.stdout.write(changelog.slice(contentStart, next < 0 ? undefined : next).trim() + '\n');
