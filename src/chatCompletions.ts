export interface ChatCompletion {
  value: string;
  label: string;
  description: string;
  kind: 'command' | 'skill';
  action?: 'chooseModel';
}

const COMMANDS: Record<string, Array<[string, string, ChatCompletion['action']?]>> = {
  codex: [['/status', 'Show session status and context usage'], ['/model', 'Choose or inspect the model', 'chooseModel'], ['/plan', 'Switch to planning mode'], ['/ask', 'Ask before making changes'], ['/debug', 'Investigate a problem step by step'], ['/compact', 'Compact the current conversation'], ['/review', 'Review workspace changes']],
  claude: [['/help', 'Show Claude commands'], ['/status', 'Show session status'], ['/context', 'Inspect context usage'], ['/compact', 'Compact the conversation'], ['/model', 'Choose the model', 'chooseModel']],
  gemini: [['/help', 'Show Gemini commands'], ['/stats', 'Show session statistics'], ['/model', 'Choose the model', 'chooseModel'], ['/memory', 'Inspect memory']],
  cursor: [['/help', 'Show Cursor Agent commands'], ['/model', 'Choose the model', 'chooseModel'], ['/resume', 'Resume a conversation']]
};

export function chatCommandCompletions(tool: string): ChatCompletion[] {
  return (COMMANDS[tool.toLowerCase()] ?? [['/help', 'Show commands supported by this agent']]).map(([value, description, action]) => ({ value, label: value, description, kind: 'command', ...(action ? { action } : {}) }));
}

export function parseSkillCompletions(value: unknown): ChatCompletion[] {
  if (!value || typeof value !== 'object' || !Array.isArray((value as { skills?: unknown }).skills)) return [];
  const seen = new Set<string>();
  return (value as { skills: unknown[] }).skills.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const item = entry as Record<string, unknown>;
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    if (!name || seen.has(name)) return [];
    seen.add(name);
    return [{ value: `$${name}`, label: name, description: typeof item.description === 'string' && item.description.trim() ? item.description.trim() : `Use the ${name} skill`, kind: 'skill' as const }];
  });
}

export function completionToken(value: string, cursor = value.length): string | undefined {
  const before = value.slice(0, Math.max(0, cursor));
  return before.match(/(^|\s)([/$][^\s]*)$/)?.[2];
}

export function filterChatCompletions(items: readonly ChatCompletion[], query: string, limit = 12): ChatCompletion[] {
  if (!query.startsWith('/') && !query.startsWith('$')) return [];
  const kind = query.startsWith('/') ? 'command' : 'skill';
  const needle = query.slice(1).toLowerCase();
  return items
    .filter((item) => item.kind === kind)
    .map((item, index) => ({ item, index, text: `${item.value.slice(1)} ${item.label}`.toLowerCase() }))
    .filter(({ text }) => !needle || text.includes(needle))
    .sort((left, right) => {
      const leftPrefix = left.item.value.slice(1).toLowerCase().startsWith(needle) ? 0 : 1;
      const rightPrefix = right.item.value.slice(1).toLowerCase().startsWith(needle) ? 0 : 1;
      return leftPrefix - rightPrefix || left.index - right.index;
    })
    .slice(0, limit)
    .map(({ item }) => item);
}
