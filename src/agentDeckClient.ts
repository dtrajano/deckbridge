import { ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { AgentDeckSession, InstallationState, RecallFrame, RecallTimeline } from './types';
import { parseGroupPaths, parseSessions, parseTimeline, parseVersion } from './parsers';
import { buildSendArgs } from './sessionPolicy';
import { buildContextArgs } from './contextUsage';
import { hasAgentDescendant, parseTmuxDisplay, TmuxRuntimeState } from './runtimeDetection';
import { ChatCompletion, parseSkillCompletions } from './chatCompletions';
import { parseSendQueue, SendQueueModel } from './sendQueue';

export interface ClientOptions {
  executable: string;
  profile?: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export class AgentDeckError extends Error {
  constructor(message: string, readonly stderr = '', readonly exitCode: number | null = null) {
    super(message);
  }
}

export class AgentDeckClient {
  constructor(private readonly options: ClientOptions) {}

  async checkInstallation(): Promise<InstallationState> {
    try {
      const result = await this.run(['version'], 8_000);
      const version = parseVersion(`${result.stdout}\n${result.stderr}`);
      return version
        ? { available: true, version }
        : { available: false, error: 'Could not determine the Agent Deck version.' };
    } catch (error) {
      return { available: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async listSessions(all = false): Promise<AgentDeckSession[]> {
    const args = ['list', '--json'];
    if (all) args.push('--all');
    return parseSessions((await this.run(args)).stdout);
  }

  async sessionDetails(sessionId: string): Promise<AgentDeckSession> {
    const output = (await this.run(['session', 'show', sessionId, '--json'])).stdout;
    const session = parseSessions(JSON.stringify([JSON.parse(output)]))[0];
    if (!session) throw new AgentDeckError('Agent Deck returned invalid session details.');
    return session;
  }

  async timeline(sessionId: string, tail: number): Promise<RecallTimeline> {
    return parseTimeline((await this.run(['recall', 'timeline', sessionId, '--json', '--tail', String(tail)])).stdout);
  }

  async contextOverview(sessionId: string): Promise<unknown> {
    const output = (await this.run(buildContextArgs(sessionId), 60_000)).stdout;
    return JSON.parse(output);
  }

  async skillCompletions(): Promise<ChatCompletion[]> {
    const output = (await this.run(['skill', 'list', '--json'], 30_000)).stdout;
    return parseSkillCompletions(JSON.parse(output));
  }

  async isSessionRuntimeAlive(session: AgentDeckSession): Promise<boolean> {
    return (await this.sessionRuntimeState(session)).agentRunning;
  }

  async sessionRuntimeState(session: AgentDeckSession): Promise<TmuxRuntimeState> {
    if (!session.tmuxSession) return { state: 'not-configured', attachedClients: 0, agentRunning: false };
    try {
      const display = await this.runExternal('tmux', ['display-message', '-p', '-t', session.tmuxSession, '#{session_attached}|#{session_windows}|#{pane_dead}|#{pane_pid}'], 5_000);
      const runtime = parseTmuxDisplay(display.stdout);
      if (!runtime) return { state: 'not-running', attachedClients: 0, agentRunning: false };
      const processes = await this.runExternal('ps', ['-axo', 'pid=,ppid=,command='], 5_000);
      const command = typeof session.raw.command === 'string' ? session.raw.command : undefined;
      return { ...runtime, agentRunning: hasAgentDescendant(runtime.panePid!, processes.stdout, session.tool, command) };
    } catch {
      return { state: 'not-running', attachedClients: 0, agentRunning: false };
    }
  }

  async paneOutput(tmuxSession: string): Promise<string> {
    return (await this.runExternal('tmux', ['capture-pane', '-p', '-J', '-t', tmuxSession, '-S', '-200'], 5_000)).stdout;
  }

  async olderTimeline(sessionId: string, before: string, limit: number): Promise<RecallTimeline> {
    return parseTimeline((await this.run(['recall', 'timeline', sessionId, '--json', '--before', before, '--limit', String(limit)])).stdout);
  }

  follow(sessionId: string, after: string): RecallFollower {
    return new RecallFollower(this.spawn(['recall', 'follow', sessionId, '--after', after || 'end', '--jsonl', '--status']));
  }

  async send(sessionId: string, message: string, immediate = false, tmuxSession?: string): Promise<Record<string, unknown>> {
    const attempt = async (): Promise<Record<string, unknown>> => {
      const output = (await this.run(buildSendArgs(sessionId, message, immediate), 120_000)).stdout;
      const receipt = output.trim() ? JSON.parse(output) as Record<string, unknown> : {};
      const failure = sendReceiptFailure(receipt);
      if (failure) throw new AgentDeckError(failure, '', 0);
      return receipt;
    };
    try {
      return await attempt();
    } catch (error) {
      let sendError = error;
      if (tmuxSession && isOccupiedComposer(error)) {
        const pane = await this.runExternal('tmux', ['capture-pane', '-p', '-t', tmuxSession, '-S', '-40'], 5_000).catch(() => undefined);
        if (pane && isCodexUpdatePrompt(pane.stdout)) {
          await this.run(['session', 'send-keys', sessionId, '--named-key', 'Escape', '--json'], 10_000);
          await new Promise((resolve) => setTimeout(resolve, 250));
          try {
            return { ...(await attempt()), recovered_blocker: 'codex-update-prompt' };
          } catch (retryError) {
            sendError = retryError;
          }
        }
      }
      if (!tmuxSession || !isUnresolvedCodexSubmission(sendError)) throw sendError;
      await this.run(['session', 'send-keys', sessionId, '--text', message, '--json'], 10_000);
      await this.run(['session', 'send-keys', sessionId, '--enter', '--json'], 10_000);
      return { success: true, delivery: 'unverified', transport: 'agent-deck-send-keys', fallback_reason: 'unresolved Codex submission marker' };
    }
  }

  async sendStatus(sendId: string): Promise<Record<string, unknown>> {
    const output = (await this.run(['session', 'send-status', sendId, '--json'], 10_000)).stdout;
    return output.trim() ? JSON.parse(output) as Record<string, unknown> : {};
  }

  async sendQueue(sessionId: string): Promise<SendQueueModel> {
    const output = (await this.run(['session', 'queue', 'list', sessionId, '--json'], 10_000)).stdout;
    return parseSendQueue(output.trim() ? JSON.parse(output) : {});
  }

  async cancelQueuedSend(sendId: string): Promise<Record<string, unknown>> {
    const output = (await this.run(['session', 'queue', 'cancel', sendId, '--json'], 10_000)).stdout;
    return output.trim() ? JSON.parse(output) as Record<string, unknown> : {};
  }

  async sessionAction(action: 'start' | 'stop' | 'restart', sessionId: string): Promise<void> {
    await this.run(['session', action, sessionId], 60_000);
  }

  async createSession(path: string, title: string, tool: string): Promise<void> {
    await this.run(['add', '--json', '-t', title, '-c', tool, path], 60_000);
  }

  async renameSession(sessionId: string, title: string): Promise<void> {
    await this.run(['session', 'set', sessionId, 'title', title]);
  }

  async listGroups(): Promise<string[]> {
    return parseGroupPaths((await this.run(['group', 'list', '--json'])).stdout);
  }

  async moveSessionToGroup(sessionId: string, group: string): Promise<void> {
    await this.run(['group', 'move', sessionId, group]);
  }

  async switchPreview(sessionId: string, harness: string): Promise<Record<string, unknown>> {
    const output = (await this.run(['session', 'switch-preview', sessionId, '--to-harness', harness, '--json'])).stdout;
    return JSON.parse(output) as Record<string, unknown>;
  }

  async switchHarness(sessionId: string, harness: string): Promise<Record<string, unknown>> {
    const output = (await this.run([
      'session', 'switch', sessionId, '--to-harness', harness, '--confirm-context-loss', '--json'
    ], 120_000)).stdout;
    return JSON.parse(output) as Record<string, unknown>;
  }

  terminalArgs(sessionId: string): string[] {
    return this.withProfile(['session', 'attach', sessionId]);
  }

  private withProfile(args: string[]): string[] {
    return this.options.profile ? ['--profile', this.options.profile, ...args] : args;
  }

  private spawn(args: string[]): ChildProcessWithoutNullStreams {
    return spawn(this.options.executable, this.withProfile(args), {
      cwd: this.options.cwd,
      env: { ...(this.options.env ?? process.env), AGENTDECK_SUPPRESS_TMUX_WARNING: '1' },
      stdio: ['pipe', 'pipe', 'pipe']
    });
  }

  private run(args: string[], timeout = 30_000): Promise<{ stdout: string; stderr: string }> {
    return this.runExternal(this.options.executable, this.withProfile(args), timeout, true);
  }

  private runExternal(executable: string, args: string[], timeout: number, suppressTmuxWarning = false): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const child = spawn(executable, args, {
        cwd: this.options.cwd,
        env: suppressTmuxWarning
          ? { ...(this.options.env ?? process.env), AGENTDECK_SUPPRESS_TMUX_WARNING: '1' }
          : (this.options.env ?? process.env),
        stdio: ['pipe', 'pipe', 'pipe']
      });
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        child.kill();
        reject(new AgentDeckError(`Agent Deck timed out after ${timeout}ms.`, stderr));
      }, timeout);
      child.stdout.setEncoding('utf8').on('data', (chunk: string) => { stdout += chunk; });
      child.stderr.setEncoding('utf8').on('data', (chunk: string) => { stderr += chunk; });
      child.on('error', (error) => {
        clearTimeout(timer);
        reject(new AgentDeckError(error.message, stderr));
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) {
          resolve({ stdout, stderr });
          return;
        }
        reject(new AgentDeckError(extractCliError(stdout, stderr, code), stderr, code));
      });
    });
  }
}

export function sendReceiptFailure(receipt: Record<string, unknown>): string | undefined {
  if (receipt.success !== false && receipt.delivery !== 'acceptance_refused' && receipt.state !== 'failed') return undefined;
  for (const key of ['error', 'reason', 'message']) {
    if (typeof receipt[key] === 'string' && receipt[key]) return receipt[key] as string;
  }
  return 'Agent Deck refused the message.';
}

export function isUnresolvedCodexSubmission(error: unknown): boolean {
  return error instanceof Error && /unresolved Codex submission/i.test(error.message) && /refusing a second send/i.test(error.message);
}

export function isOccupiedComposer(error: unknown): boolean {
  return error instanceof Error && /composer is occupied or unreadable/i.test(error.message);
}

export function isCodexUpdatePrompt(pane: string): boolean {
  return /Update available\s+·?\s*[\d.]+\s*→\s*[\d.]+/i.test(pane)
    && /enter continue\s+·\s+esc skip/i.test(pane);
}

export function extractCliError(stdout: string, stderr: string, exitCode: number | null): string {
  const output = stdout.trim();
  if (output) {
    try {
      const parsed = JSON.parse(output) as { error?: unknown; message?: unknown };
      if (typeof parsed.error === 'string') return parsed.error;
      if (typeof parsed.message === 'string') return parsed.message;
    } catch {
      // Some commands report a plain-text error on stdout.
    }
  }
  return stderr.trim() || output || `Agent Deck exited with code ${exitCode}.`;
}

export class RecallFollower extends EventEmitter {
  private buffer = '';

  constructor(private readonly child: ChildProcessWithoutNullStreams) {
    super();
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => this.consume(chunk));
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => this.emit('diagnostic', chunk));
    child.on('error', (error) => this.emit('error', error));
    child.on('close', (code) => this.emit('close', code));
  }

  dispose(): void {
    this.child.stdin.end();
    this.child.kill();
  }

  private consume(chunk: string): void {
    this.buffer += chunk;
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        this.emit('frame', JSON.parse(line) as RecallFrame);
      } catch {
        this.emit('diagnostic', `Ignored malformed follow frame: ${line}`);
      }
    }
  }
}
