import * as path from 'node:path';
import { AgentDeckSession, RecallTimeline } from './types';

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function parseVersion(output: string): string | undefined {
  return output.match(/(?:Agent Deck\s+)?v?(\d+\.\d+\.\d+)/i)?.[1];
}

export function parseSessions(output: string): AgentDeckSession[] {
  const parsed: unknown = JSON.parse(output);
  const candidates = Array.isArray(parsed)
    ? parsed
    : typeof parsed === 'object' && parsed !== null
      ? ((parsed as Record<string, unknown>).sessions ?? (parsed as Record<string, unknown>).instances ?? [])
      : [];

  if (!Array.isArray(candidates)) {
    throw new Error('Agent Deck returned an unsupported session-list shape.');
  }

  return candidates.flatMap((candidate): AgentDeckSession[] => {
    if (typeof candidate !== 'object' || candidate === null) return [];
    const raw = candidate as Record<string, unknown>;
    const id = stringValue(raw.id, stringValue(raw.session_id));
    if (!id) return [];
    return [{
      id,
      title: stringValue(raw.title, stringValue(raw.name, id)),
      status: stringValue(raw.status, 'not-started'),
      path: stringValue(raw.path, stringValue(raw.cwd)),
      group: stringValue(raw.group, 'Ungrouped'),
      tool: stringValue(raw.tool, stringValue(raw.command, 'unknown')),
      model: stringValue(raw.model, stringValue(raw.model_id)) || undefined,
      substate: stringValue(raw.substate) || undefined,
      account: stringValue(raw.account) || undefined,
      nativeSessionId: firstString(raw, 'claude_session_id', 'codex_session_id', 'gemini_session_id', 'opencode_session_id', 'tool_session_id'),
      profile: stringValue(raw.profile) || undefined,
      branch: stringValue(raw.branch) || undefined,
      favorite: raw.favorite === true,
      transcriptPath: stringValue(raw.transcript_path) || undefined,
      statusSource: stringValue(raw.status_source) || undefined,
      tmuxSession: stringValue(raw.tmux_session) || undefined,
      createdAt: stringValue(raw.created_at) || undefined,
      lastActivityAt: stringValue(raw.last_activity_at) || undefined,
      viewerCount: numberValue(raw.viewer_count ?? raw.viewers),
      raw
    }];
  });
}

function firstString(value: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const candidate = stringValue(value[key]);
    if (candidate) return candidate;
  }
  return undefined;
}

export function parseTimeline(output: string): RecallTimeline {
  const parsed = JSON.parse(output) as Partial<RecallTimeline> & { error?: unknown; code?: unknown };
  if (typeof parsed.error === 'string') {
    throw new Error(parsed.error);
  }
  if (!parsed || !Array.isArray(parsed.turns)) {
    throw new Error('Agent Deck returned an unsupported recall timeline.');
  }
  return { ...parsed, turns: parsed.turns };
}

export function parseGroupPaths(output: string): string[] {
  const parsed = JSON.parse(output) as { groups?: unknown };
  const paths: string[] = [];
  const visit = (groups: unknown[]): void => {
    for (const value of groups) {
      if (!value || typeof value !== 'object') continue;
      const group = value as { path?: unknown; children?: unknown };
      if (typeof group.path === 'string') paths.push(group.path);
      if (Array.isArray(group.children)) visit(group.children);
    }
  };
  if (Array.isArray(parsed.groups)) visit(parsed.groups);
  return paths;
}

export function isSessionInWorkspace(sessionPath: string, workspacePaths: string[]): boolean {
  if (!sessionPath) return false;
  const target = normalize(sessionPath);
  return workspacePaths.some((workspacePath) => {
    const root = normalize(workspacePath);
    const relative = path.relative(root, target);
    return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
  });
}

function normalize(value: string): string {
  return path.resolve(value).replace(/[\\/]+$/, '');
}
