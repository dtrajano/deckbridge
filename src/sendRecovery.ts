/** Returns true when Agent Deck could not deliver because its target is not running. */
export function isTargetNotRunningError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /target[_ ]not[_ ]running/i.test(message);
}

/**
 * Retries one send after starting the session when Agent Deck reports that
 * the target is not running. Other failures are propagated unchanged.
 */
export async function sendWithTargetRecovery<T>(
  send: () => Promise<T>,
  start: () => Promise<void>,
  onStarting: () => Promise<void>,
  onStarted: () => Promise<void>
): Promise<T> {
  try {
    return await send();
  } catch (error) {
    if (!isTargetNotRunningError(error)) throw error;
    await onStarting();
    await start();
    await onStarted();
    return send();
  }
}
