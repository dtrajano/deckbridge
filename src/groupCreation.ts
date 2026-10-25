export function buildCreateGroupArgs(name: string, parent?: string): string[] {
  const args = ['group', 'create', name];
  if (parent) args.push('--parent', parent);
  return args;
}

export function buildCreateSessionArgs(path: string, title: string, tool: string, group?: string): string[] {
  const args = ['add', '--json', '-t', title, '-c', tool];
  if (group) args.push('-g', group);
  args.push(path);
  return args;
}
