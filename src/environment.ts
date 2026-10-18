import * as path from 'node:path';

export function buildCommandEnvironment(
  base: NodeJS.ProcessEnv,
  home: string,
  additionalPaths: readonly string[] = [],
  platform: NodeJS.Platform = process.platform
): NodeJS.ProcessEnv {
  const separator = platform === 'win32' ? ';' : ':';
  const defaults = platform === 'darwin'
    ? [path.join(home, '.local', 'bin'), path.join(home, 'bin'), '/opt/homebrew/bin', '/opt/homebrew/sbin', '/usr/local/bin']
    : platform === 'win32'
      ? []
      : [path.join(home, '.local', 'bin'), path.join(home, 'bin'), '/usr/local/bin'];
  const inherited = (base.PATH ?? base.Path ?? '').split(separator).filter(Boolean);
  const expanded = additionalPaths.map((entry) => expandHome(entry.trim(), home)).filter(Boolean);
  const entries = [...new Set([...expanded, ...defaults, ...inherited])];
  return { ...base, PATH: entries.join(separator) };
}

function expandHome(value: string, home: string): string {
  if (value === '~') return home;
  if (value.startsWith('~/')) return path.join(home, value.slice(2));
  return value;
}
