export function setGroupExpanded(collapsed: Set<string>, name: string, expanded: boolean): void {
  if (expanded) collapsed.delete(name);
  else collapsed.add(name);
}

export function setAllGroupsExpanded(collapsed: Set<string>, names: readonly string[], expanded: boolean): void {
  if (expanded) {
    collapsed.clear();
    return;
  }
  for (const name of names) collapsed.add(name);
}

export function groupContainsSession(
  groups: readonly { name: string; sessions: readonly { id: string }[] }[],
  sessionId: string
): string | undefined {
  return groups.find((group) => group.sessions.some((session) => session.id === sessionId))?.name;
}
