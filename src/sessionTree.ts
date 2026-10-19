import * as vscode from 'vscode';
import { AgentDeckClient } from './agentDeckClient';
import { isSessionInWorkspace } from './parsers';
import { sessionTreeIndicator } from './sessionPolicy';
import { displayStatus, summarizeSessions } from './sessionSummary';
import { AgentDeckSession, InstallationState } from './types';
import { mergeTreeSessionStatus } from './treeSessionStatus';
import { groupContainsSession, setAllGroupsExpanded, setGroupExpanded } from './treeExpansion';

export type TreeNode = StatusNode | SummaryNode | GroupNode | SessionNode;

export class StatusNode {
  readonly kind = 'status';
  constructor(readonly state: InstallationState) {}
}

export class SummaryNode {
  readonly kind = 'summary';
  constructor(readonly sessions: readonly AgentDeckSession[]) {}
}

export class GroupNode {
  readonly kind = 'group';
  constructor(readonly name: string, readonly sessions: AgentDeckSession[]) {}
}

export class SessionNode {
  readonly kind = 'session';
  constructor(readonly session: AgentDeckSession) {}
}

export class SessionTreeProvider implements vscode.TreeDataProvider<TreeNode>, vscode.Disposable {
  private readonly changeEmitter = new vscode.EventEmitter<TreeNode | undefined>();
  readonly onDidChangeTreeData = this.changeEmitter.event;
  private sessions: AgentDeckSession[] = [];
  private readonly collapsedGroups = new Set<string>();
  private cachedRoots?: TreeNode[];
  private installation: InstallationState = { available: false, error: 'Checking Agent Deck…' };
  private refreshTimer?: NodeJS.Timeout;

  constructor(private readonly getClient: () => AgentDeckClient) {}

  async refresh(): Promise<void> {
    const client = this.getClient();
    this.installation = await client.checkInstallation();
    if (!this.installation.available) {
      this.sessions = [];
      this.cachedRoots = undefined;
      this.changeEmitter.fire(undefined);
      return;
    }
    try {
      const listed = await client.listSessions(true);
      const detailed = await mapWithConcurrency(listed, 4, async (session) => {
        const details = await client.sessionDetails(session.id).catch(() => undefined);
        const candidate = mergeTreeSessionStatus(session, details, undefined);
        const runtime = candidate.tmuxSession
          ? await client.sessionRuntimeState(candidate).catch(() => undefined)
          : undefined;
        return mergeTreeSessionStatus(session, details, runtime);
      });
      this.sessions = detailed;
      this.cachedRoots = undefined;
    } catch (error) {
      this.sessions = [];
      this.cachedRoots = undefined;
      this.installation = { available: true, version: this.installation.version, error: errorMessage(error) };
    }
    this.changeEmitter.fire(undefined);
  }

  startAutoRefresh(): void {
    this.refreshTimer = setInterval(() => void this.refresh(), 5_000);
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    if (element instanceof StatusNode) {
      const label = element.state.available
        ? `Agent Deck ${element.state.version ?? ''}`.trim()
        : 'Agent Deck not found';
      const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
      item.description = element.state.error;
      item.iconPath = new vscode.ThemeIcon(element.state.available ? 'pass-filled' : 'warning');
      item.command = element.state.available ? undefined : { command: 'deckbridge.checkInstallation', title: 'Check installation' };
      return item;
    }
    if (element instanceof GroupNode) {
      const item = new vscode.TreeItem(
        element.name,
        this.collapsedGroups.has(element.name)
          ? vscode.TreeItemCollapsibleState.Collapsed
          : vscode.TreeItemCollapsibleState.Expanded
      );
      item.id = `group:${element.name}`;
      item.description = String(element.sessions.length);
      item.iconPath = new vscode.ThemeIcon('folder');
      return item;
    }
    if (element instanceof SummaryNode) {
      const summary = summarizeSessions(element.sessions);
      const item = new vscode.TreeItem(`${summary.total} sessions`, vscode.TreeItemCollapsibleState.None);
      item.description = summary.label;
      item.iconPath = new vscode.ThemeIcon('pulse', new vscode.ThemeColor('charts.blue'));
      item.tooltip = `Agent Deck status summary: ${summary.label}`;
      return item;
    }
    const session = element.session;
    const item = new vscode.TreeItem(session.title, vscode.TreeItemCollapsibleState.None);
    item.id = session.id;
    item.description = [displayStatus(session.status), session.tool, session.model].filter(Boolean).join(' · ');
    item.tooltip = new vscode.MarkdownString([
      `**${session.title}**`,
      `Status: ${displayStatus(session.status)}`,
      ...(session.substate ? [`Substate: ${session.substate}`] : []),
      `Tool: ${session.tool}`,
      ...(session.model ? [`Model: ${session.model}`] : []),
      `Session: ${session.id}`,
      ...(session.nativeSessionId ? [`Native session: ${session.nativeSessionId}`] : []),
      ...(session.account ? [`Account: ${session.account}`] : []),
      ...(session.branch ? [`Branch: ${session.branch}`] : []),
      ...(session.statusSource ? [`Status source: ${session.statusSource}`] : []),
      ...(session.tmuxSession ? [`tmux: ${session.tmuxSession}`] : []),
      ...(session.createdAt ? [`Created: ${session.createdAt}`] : []),
      ...(session.lastActivityAt ? [`Last activity: ${session.lastActivityAt}`] : []),
      `Path: ${session.path || 'Unknown'}`
    ].join('\n\n'));
    const indicator = sessionTreeIndicator(session.status);
    item.iconPath = new vscode.ThemeIcon(indicator.icon, new vscode.ThemeColor(indicator.color));
    item.contextValue = 'deckbridge.session';
    item.command = { command: 'deckbridge.openChat', title: 'Open chat', arguments: [element] };
    return item;
  }

  getChildren(element?: TreeNode): TreeNode[] {
    if (!this.installation.available) return element ? [] : [new StatusNode(this.installation)];
    if (element instanceof GroupNode) return element.sessions.map((session) => new SessionNode(session));
    if (element) return [];
    return this.rootNodes();
  }

  /**
   * TreeView.reveal relies on getParent to locate an element in the tree.
   * Without this method VS Code silently ignores reveal(..., { expand: true }),
   * which made the expand-all action change its icon but leave groups closed.
   */
  getParent(element: TreeNode): TreeNode | undefined {
    if (!(element instanceof SessionNode)) return undefined;
    const groups = this.rootNodes().filter((node): node is GroupNode => node instanceof GroupNode);
    const name = groupContainsSession(groups, element.session.id);
    return groups.find((group) => group.name === name);
  }

  async expandAll(treeView: vscode.TreeView<TreeNode>): Promise<void> {
    const groups = this.rootNodes().filter((node): node is GroupNode => node instanceof GroupNode);
    setAllGroupsExpanded(this.collapsedGroups, [], true);
    for (const group of groups) {
      try {
        await treeView.reveal(group, { expand: true, focus: true, select: true });
        await vscode.commands.executeCommand('list.expand');
      } catch {
        // The group may be replaced by an automatic refresh while revealing it.
      }
    }
    this.changeEmitter.fire(undefined);
  }

  collapseAll(): void {
    setAllGroupsExpanded(this.collapsedGroups, this.rootNodes().filter((node): node is GroupNode => node instanceof GroupNode).map((node) => node.name), false);
    this.changeEmitter.fire(undefined);
  }

  setGroupExpanded(group: GroupNode, expanded: boolean): void {
    setGroupExpanded(this.collapsedGroups, group.name, expanded);
  }

  private rootNodes(): TreeNode[] {
    if (this.cachedRoots) return this.cachedRoots;
    const config = vscode.workspace.getConfiguration('deckbridge');
    const showAll = config.get<boolean>('showAllSessions', false);
    const roots = (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath);
    const visible = showAll || roots.length === 0
      ? this.sessions
      : this.sessions.filter((session) => isSessionInWorkspace(session.path, roots));

    const grouped = new Map<string, AgentDeckSession[]>();
    for (const session of visible) {
      const group = session.group || 'Ungrouped';
      grouped.set(group, [...(grouped.get(group) ?? []), session]);
    }
    const groups = [...grouped.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, sessions]) => new GroupNode(name, sessions.sort(sortSessions)));
    const content: TreeNode[] = [new SummaryNode(visible), ...groups];
    this.cachedRoots = this.installation.error ? [new StatusNode(this.installation), ...content] : content;
    return this.cachedRoots;
  }

  dispose(): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.changeEmitter.dispose();
  }
}

async function mapWithConcurrency<T, R>(values: readonly T[], limit: number, mapper: (value: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(values.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < values.length) {
      const index = next;
      next += 1;
      results[index] = await mapper(values[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, () => worker()));
  return results;
}

function sortSessions(a: AgentDeckSession, b: AgentDeckSession): number {
  const priority = (status: string) => ({ waiting: 0, running: 1, error: 2, idle: 3, stopped: 4, 'not-started': 5 }[status] ?? 6);
  return priority(a.status) - priority(b.status) || a.title.localeCompare(b.title);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
