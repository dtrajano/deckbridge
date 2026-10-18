export function hasAgentDescendant(panePid: number, processList: string, tool: string, command?: string): boolean {
  const processes = parseProcessList(processList);
  const descendants = new Set<number>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const process of processes) {
      if ((process.ppid === panePid || descendants.has(process.ppid)) && !descendants.has(process.pid)) {
        descendants.add(process.pid);
        changed = true;
      }
    }
  }
  const names = processNames(tool, command);
  return processes.some((process) => descendants.has(process.pid) && names.some((name) => commandContains(process.command, name)));
}

export function parsePanePid(output: string): number | undefined {
  const value = Number(output.trim());
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

export type TmuxState = 'not-configured' | 'not-running' | 'attached' | 'detached' | 'dead';

export interface TmuxRuntimeState {
  state: TmuxState;
  attachedClients: number;
  windows?: number;
  panePid?: number;
  agentRunning: boolean;
}

export function parseTmuxDisplay(output: string): Omit<TmuxRuntimeState, 'agentRunning'> | undefined {
  const [attachedText, windowsText, deadText, pidText] = output.trim().split('|');
  const attachedClients = Number(attachedText);
  const windows = Number(windowsText);
  const panePid = parsePanePid(pidText ?? '');
  if (!Number.isInteger(attachedClients) || attachedClients < 0 || !Number.isInteger(windows) || windows < 1 || !panePid) return undefined;
  return {
    state: deadText === '1' ? 'dead' : attachedClients > 0 ? 'attached' : 'detached',
    attachedClients,
    windows,
    panePid
  };
}

export function tmuxStateLabel(runtime: TmuxRuntimeState): string {
  switch (runtime.state) {
    case 'not-configured': return 'not configured';
    case 'not-running': return 'not running';
    case 'dead': return 'dead pane';
    case 'attached': return `attached (${runtime.attachedClients}) · agent ${runtime.agentRunning ? 'running' : 'not running'}`;
    case 'detached': return `detached · agent ${runtime.agentRunning ? 'running' : 'not running'}`;
  }
}

function parseProcessList(output: string): Array<{ pid: number; ppid: number; command: string }> {
  return output.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(.+)$/);
    return match ? [{ pid: Number(match[1]), ppid: Number(match[2]), command: match[3] }] : [];
  });
}

function processNames(tool: string, command?: string): string[] {
  const values = [tool, command?.trim().split(/\s+/)[0]].filter((value): value is string => Boolean(value));
  const aliases: Record<string, string[]> = {
    codex: ['codex'], claude: ['claude'], gemini: ['gemini'], cursor: ['cursor', 'agent'],
    opencode: ['opencode'], pi: ['pi'], shell: ['bash', 'zsh', 'fish', 'sh']
  };
  return [...new Set(values.flatMap((value) => aliases[value.toLowerCase()] ?? [value.toLowerCase()]))];
}

function commandContains(command: string, name: string): boolean {
  return command.toLowerCase().split(/[\s/\\]+/).some((part) => part === name || part.startsWith(`${name}.`));
}
