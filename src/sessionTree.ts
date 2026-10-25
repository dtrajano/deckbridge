import * as vscode from 'vscode';
import { AgentDeckClient } from './agentDeckClient';
import { isSessionInWorkspace } from './parsers';
import { sessionTreeIndicator } from './sessionPolicy';
import { summarizeSessions } from './sessionSummary';
import { AgentDeckSession, InstallationState } from './types';
import { mergeTreeSessionStatus } from './treeSessionStatus';
import { setAllGroupsExpanded, setGroupExpanded } from './treeExpansion';
import { buildGroupTree, GroupTreeEntry } from './groupTree';
import { decodeDraggedSessionIds, encodeDraggedSessionIds, SESSION_TREE_MIME } from './treeDragDrop';

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
  constructor(readonly name: string, readonly sessions: AgentDeckSession[], readonly children: GroupNode[] = [], readonly label = name) {}
}

export class SessionNode {
  readonly kind = 'session';
  constructor(readonly session: AgentDeckSession) {}
}

export class SessionTreeDragController implements vscode.TreeDragAndDropController<TreeNode>, vscode.Disposable {
  readonly dragMimeTypes = [SESSION_TREE_MIME];
  readonly dropMimeTypes = [SESSION_TREE_MIME];

  constructor(private readonly getClient: () => AgentDeckClient, private readonly refresh: () => Thenable<void> | Promise<void>) {}

  handleDrag(source: readonly TreeNode[], dataTransfer: vscode.DataTransfer): void {
    const ids = source.filter((node): node is SessionNode => node instanceof SessionNode).map((node) => node.session.id);
    if (ids.length) dataTransfer.set(SESSION_TREE_MIME, new vscode.DataTransferItem(encodeDraggedSessionIds(ids)));
  }

  async handleDrop(target: TreeNode | undefined, dataTransfer: vscode.DataTransfer): Promise<void> {
    if (!(target instanceof GroupNode)) return;
    const item = dataTransfer.get(SESSION_TREE_MIME);
    if (!item) return;
    const ids = decodeDraggedSessionIds(await item.value);
    if (!ids.length) return;
    const client = this.getClient();
    for (const id of ids) await client.moveSessionToGroup(id, target.name);
    await this.refresh();
  }

  dispose(): void {}
}

export class SessionTreeProvider implements vscode.TreeDataProvider<TreeNode>, vscode.Disposable {
  private readonly changeEmitter = new vscode.EventEmitter<TreeNode | undefined>();
  readonly onDidChangeTreeData = this.changeEmitter.event;
  private sessions: AgentDeckSession[] = [];
  private groupPaths: string[] = [];
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
      this.groupPaths = await client.listGroups().catch(() => []);
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
      this.groupPaths = [];
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
      item.command = element.state.error
        ? { command: 'deckbridge.diagnose', title: 'Diagnose Agent Deck', arguments: [element.state.error] }
        : element.state.available ? undefined : { command: 'deckbridge.checkInstallation', title: 'Check installation' };
      return item;
    }
    if (element instanceof GroupNode) {
      const item = new vscode.TreeItem(
        element.label,
        this.collapsedGroups.has(element.name)
          ? vscode.TreeItemCollapsibleState.Collapsed
          : vscode.TreeItemCollapsibleState.Expanded
      );
      item.id = `group:${element.name}`;
      item.description = `${element.sessions.length}${element.children.length ? ` · ${element.children.length} subgrupo${element.children.length === 1 ? '' : 's'}` : ''}`;
      item.iconPath = new vscode.ThemeIcon('folder');
      item.contextValue = 'deckbridge.group';
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
    const indicator = sessionTreeIndicator(session.status);
    item.description = [indicator.label, session.tool, session.model].filter(Boolean).join(' · ');
    item.tooltip = new vscode.MarkdownString([
      `**${session.title}**`,
      `Status: ${indicator.label}`,
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
    item.iconPath = new vscode.ThemeIcon(indicator.icon, new vscode.ThemeColor(indicator.color));
    item.contextValue = 'deckbridge.session';
    item.command = { command: 'deckbridge.openChat', title: 'Open chat', arguments: [element] };
    return item;
  }

  getChildren(element?: TreeNode): TreeNode[] {
    if (!this.installation.available) return element ? [] : [new StatusNode(this.installation)];
    if (element instanceof GroupNode) return [
      ...element.children,
      ...element.sessions.map((session) => new SessionNode(session))
    ];
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
    const findParent = (groups: readonly GroupNode[]): GroupNode | undefined => {
      for (const group of groups) {
        if (group.sessions.some((session) => session.id === element.session.id)) return group;
        const nested = findParent(group.children);
        if (nested) return nested;
      }
      return undefined;
    };
    return findParent(this.rootNodes().filter((node): node is GroupNode => node instanceof GroupNode));
  }

  async expandAll(treeView: vscode.TreeView<TreeNode>): Promise<void> {
    const groups = flattenGroups(this.rootNodes().filter((node): node is GroupNode => node instanceof GroupNode));
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
    setAllGroupsExpanded(this.collapsedGroups, flattenGroups(this.rootNodes().filter((node): node is GroupNode => node instanceof GroupNode)).map((node) => node.name), false);
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

    const groups = buildGroupTree(visible, this.groupPaths).map((group) => toGroupNode(group));
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

function toGroupNode(group: GroupTreeEntry): GroupNode {
  return new GroupNode(group.path, group.sessions.sort(sortSessions), group.children.map(toGroupNode), group.label);
}

function flattenGroups(groups: readonly GroupNode[]): GroupNode[] {
  return groups.flatMap((group) => [group, ...flattenGroups(group.children)]);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
