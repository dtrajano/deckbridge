import { AgentDeckSession } from './types';

export interface GroupTreeEntry {
  path: string;
  label: string;
  sessions: AgentDeckSession[];
  children: GroupTreeEntry[];
}

export function buildGroupTree(sessions: readonly AgentDeckSession[], groupPaths: readonly string[]): GroupTreeEntry[] {
  const nodes = new Map<string, GroupTreeEntry>();
  const ensure = (rawPath: string): GroupTreeEntry | undefined => {
    const path = rawPath.trim().replace(/^\/+|\/+$/g, '');
    if (!path) return undefined;
    const parts = path.split('/').filter(Boolean);
    let current = '';
    let node: GroupTreeEntry | undefined;
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      node = nodes.get(current) ?? { path: current, label: part, sessions: [], children: [] };
      nodes.set(current, node);
    }
    return node;
  };
  for (const groupPath of groupPaths) ensure(groupPath);
  for (const session of sessions) ensure(session.group || 'Ungrouped')?.sessions.push(session);
  for (const node of nodes.values()) {
    const parentPath = node.path.includes('/') ? node.path.slice(0, node.path.lastIndexOf('/')) : undefined;
    if (parentPath) nodes.get(parentPath)?.children.push(node);
  }
  for (const node of nodes.values()) {
    node.children.sort((left, right) => left.label.localeCompare(right.label));
    node.sessions.sort((left, right) => left.title.localeCompare(right.title));
  }
  return [...nodes.values()]
    .filter((node) => !node.path.includes('/') || !nodes.has(node.path.slice(0, node.path.lastIndexOf('/'))))
    .sort((left, right) => left.label.localeCompare(right.label));
}
