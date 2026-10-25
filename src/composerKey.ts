export function shouldSubmitComposerKey(event: { key: string; shiftKey?: boolean }): boolean {
  return event.key === 'Enter' && !event.shiftKey;
}
