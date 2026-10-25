/**
 * Makes the chat surface visible before probing Agent Deck/tmux. Probes may
 * take a while or fail while the terminal is starting; the UI should remain
 * available to explain the failure instead of staying blank.
 */
export async function renderShellBeforeProbe<T>(
  renderShell: () => void,
  probe: () => Promise<T>,
  reportError: (error: unknown) => void
): Promise<T | undefined> {
  renderShell();
  try {
    return await probe();
  } catch (error) {
    reportError(error);
    return undefined;
  }
}
