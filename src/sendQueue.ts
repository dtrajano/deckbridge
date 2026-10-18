export interface QueuedSend {
  id: string;
  preview: string;
  state: string;
  enqueuedAt?: string;
  cancellable: boolean;
}

export interface SendQueueModel {
  items: QueuedSend[];
  pendingCount: number;
}

export function parseSendQueue(value: unknown): SendQueueModel {
  const queue = typeof value === 'object' && value !== null && Array.isArray((value as { queue?: unknown }).queue)
    ? (value as { queue: unknown[] }).queue
    : [];
  const items = queue.flatMap((candidate): QueuedSend[] => {
    if (!candidate || typeof candidate !== 'object') return [];
    const raw = candidate as Record<string, unknown>;
    if (typeof raw.id !== 'string' || !raw.id) return [];
    const state = typeof raw.state === 'string' ? raw.state : 'unknown';
    return [{
      id: raw.id,
      preview: typeof raw.text_preview === 'string' ? raw.text_preview : '',
      state,
      enqueuedAt: typeof raw.enqueued_at === 'string' ? raw.enqueued_at : undefined,
      cancellable: state === 'queued'
    }];
  });
  return { items, pendingCount: items.filter((item) => item.cancellable).length };
}

export function queueButtonLabel(pendingCount: number): string {
  return pendingCount > 0 ? `☷ Fila (${pendingCount})` : '☷ Fila';
}
