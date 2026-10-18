export type SessionStatus = 'running' | 'waiting' | 'idle' | 'not-started' | 'stopped' | 'error' | string;

export interface AgentDeckSession {
  id: string;
  title: string;
  status: SessionStatus;
  path: string;
  group: string;
  tool: string;
  model?: string;
  substate?: string;
  account?: string;
  nativeSessionId?: string;
  profile?: string;
  branch?: string;
  favorite?: boolean;
  transcriptPath?: string;
  statusSource?: string;
  tmuxSession?: string;
  createdAt?: string;
  lastActivityAt?: string;
  viewerCount?: number;
  raw: Record<string, unknown>;
}

export interface RecallRow {
  id: string;
  kind: string;
  ts?: string;
  title?: string;
  body?: string;
  summary?: string;
  detail?: string;
  finished?: boolean;
  is_error?: boolean;
  queued?: boolean;
  meta?: Record<string, unknown>;
}

export interface RecallTimeline {
  schema?: string;
  turns: RecallRow[];
  through_cursor?: string;
  before_cursor?: string;
  status?: Record<string, unknown>;
}

export type RecallFrame =
  | { frame: 'row'; row: RecallRow; cursor?: string }
  | { frame: 'update'; row: Partial<RecallRow> & { id: string }; cursor?: string }
  | { frame: 'remove'; id: string; cursor?: string }
  | { frame: 'status'; cursor?: string; [key: string]: unknown }
  | { frame: 'resync_required'; reason?: string; cursor?: string }
  | { frame: string; cursor?: string; [key: string]: unknown };

export interface InstallationState {
  available: boolean;
  version?: string;
  error?: string;
}
