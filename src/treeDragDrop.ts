export const SESSION_TREE_MIME = 'application/vnd.code.tree.deckbridge.sessions';

export function encodeDraggedSessionIds(ids: readonly string[]): string {
  return JSON.stringify([...new Set(ids.filter(Boolean))]);
}

export function decodeDraggedSessionIds(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string' && Boolean(id)) : [];
  } catch {
    return [];
  }
}
