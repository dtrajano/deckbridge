import { open, stat } from 'node:fs/promises';

export interface SessionRuntimeSettings {
  mode?: string;
  model?: string;
}

export function runtimeSettingsFromJsonl(value: string): SessionRuntimeSettings {
  const result: SessionRuntimeSettings = {};
  const lines = value.split(/\r?\n/).filter(Boolean).reverse();
  for (const line of lines) {
    let record: unknown;
    try { record = JSON.parse(line); } catch { continue; }
    if (!result.mode) {
      const mode = deepText(record, ['collaboration_mode_kind', 'permission_mode', 'approval_mode']) ?? collaborationMode(record);
      if (mode) result.mode = mode;
    }
    if (!result.model) {
      const model = deepText(record, ['model']);
      if (model) result.model = model;
    }
    if (result.mode && result.model) break;
  }
  return result;
}

export async function readSessionRuntime(transcriptPath: string | undefined): Promise<SessionRuntimeSettings> {
  if (!transcriptPath) return {};
  const size = (await stat(transcriptPath)).size;
  const length = Math.min(size, 512 * 1024);
  const handle = await open(transcriptPath, 'r');
  try {
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, size - length);
    return runtimeSettingsFromJsonl(buffer.toString('utf8'));
  } finally {
    await handle.close();
  }
}

function collaborationMode(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const collaboration = record.collaboration_mode;
  if (collaboration && typeof collaboration === 'object' && typeof (collaboration as Record<string, unknown>).mode === 'string') {
    return (collaboration as Record<string, unknown>).mode as string;
  }
  for (const child of Object.values(record)) {
    const found = collaborationMode(child);
    if (found) return found;
  }
  return undefined;
}

function deepText(value: unknown, keys: string[]): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  for (const key of keys) if (typeof record[key] === 'string' && record[key]) return record[key] as string;
  for (const child of Object.values(record)) {
    const found = deepText(child, keys);
    if (found) return found;
  }
  return undefined;
}
