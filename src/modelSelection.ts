export function modelChoices(tool: string, current?: string): string[] {
  const presets: Record<string, string[]> = {
    claude: ['opus', 'sonnet', 'haiku'],
    codex: ['gpt-6.1-sol', 'gpt-6.1', 'gpt-6-sol'],
    gemini: ['auto', 'gemini-3-pro-preview', 'gemini-3-flash-preview']
  };
  return [...new Set([current, ...(presets[tool.toLowerCase()] ?? [])].filter((item): item is string => Boolean(item)))];
}

export function modelCommand(model: string): string {
  const normalized = model.trim();
  if (!normalized || /[\r\n]/.test(normalized)) throw new Error('A model ID must be a single non-empty line.');
  return `/model ${normalized}`;
}
