import * as vscode from 'vscode';
import { homedir } from 'node:os';
import { AgentDeckClient } from './agentDeckClient';
import { ChatPanel, ChatViewProvider } from './chatPanel';
import { GroupNode, SessionNode, SessionTreeProvider, TreeNode } from './sessionTree';
import { AgentDeckSession } from './types';
import { assessSwitch } from './switchPolicy';
import { buildCommandEnvironment } from './environment';

const INSTALL_URL = 'https://github.com/asheshgoplani/agent-deck#installation';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const getClient = () => createClient();
  const tree = new SessionTreeProvider(getClient);
  let sessionsView: vscode.TreeView<TreeNode>;
  let sessionsViewListeners: vscode.Disposable[] = [];
  const createSessionsView = (): void => {
    sessionsView = vscode.window.createTreeView('deckbridge.sessions', { treeDataProvider: tree });
    sessionsViewListeners = [
      sessionsView.onDidExpandElement((event) => {
        if (event.element instanceof GroupNode) tree.setGroupExpanded(event.element, true);
      }),
      sessionsView.onDidCollapseElement((event) => {
        if (event.element instanceof GroupNode) tree.setGroupExpanded(event.element, false);
      })
    ];
    context.subscriptions.push(sessionsView, ...sessionsViewListeners);
  };
  createSessionsView();
  context.subscriptions.push(tree);
  const chatView = new ChatViewProvider(context.extensionUri, getClient, () => tree.refresh());
  context.subscriptions.push(chatView, vscode.window.registerWebviewViewProvider('deckbridge.chat', chatView, {
    webviewOptions: { retainContextWhenHidden: true }
  }));

  const register = (command: string, handler: (...args: unknown[]) => unknown) => {
    context.subscriptions.push(vscode.commands.registerCommand(command, handler));
  };

  register('deckbridge.refresh', () => tree.refresh());
  register('deckbridge.collapseGroups', async () => {
    tree.collapseAll();
    await vscode.commands.executeCommand('setContext', 'deckbridge.groupsCollapsed', true);
    await vscode.commands.executeCommand('workbench.actions.treeView.deckbridge.sessions.collapseAll');
  });
  register('deckbridge.expandGroups', async () => {
    await tree.expandAll(sessionsView);
    await vscode.commands.executeCommand('setContext', 'deckbridge.groupsCollapsed', false);
  });
  register('deckbridge.openInstallGuide', () => vscode.env.openExternal(vscode.Uri.parse(INSTALL_URL)));
  register('deckbridge.checkInstallation', async () => {
    const state = await getClient().checkInstallation();
    if (state.available) {
      void vscode.window.showInformationMessage(`Agent Deck ${state.version ?? ''} is ready.`);
      await tree.refresh();
      return;
    }
    const action = await vscode.window.showWarningMessage(
      'DeckBridge requires Agent Deck, but the executable was not found.',
      'View installation', 'Configure path', 'Check again'
    );
    if (action === 'View installation') await vscode.env.openExternal(vscode.Uri.parse(INSTALL_URL));
    if (action === 'Configure path') await vscode.commands.executeCommand('deckbridge.configureExecutable');
    if (action === 'Check again') await vscode.commands.executeCommand('deckbridge.checkInstallation');
  });
  register('deckbridge.configureExecutable', async () => {
    const selected = await vscode.window.showOpenDialog({ canSelectFiles: true, canSelectFolders: false, canSelectMany: false, title: 'Select the Agent Deck executable' });
    if (!selected?.[0]) return;
    await vscode.workspace.getConfiguration('deckbridge').update('executablePath', selected[0].fsPath, vscode.ConfigurationTarget.Global);
    await tree.refresh();
  });
  register('deckbridge.toggleScope', async () => {
    const config = vscode.workspace.getConfiguration('deckbridge');
    await config.update('showAllSessions', !config.get<boolean>('showAllSessions', false), vscode.ConfigurationTarget.Workspace);
    await tree.refresh();
  });
  register('deckbridge.openChat', async (value: unknown) => {
    const session = extractSession(value);
    if (session) await chatView.open(session);
  });
  register('deckbridge.openChatInEditor', async (value: unknown) => {
    const session = extractSession(value);
    if (session) await ChatPanel.show(context.extensionUri, getClient(), session);
  });
  register('deckbridge.attach', async (value: unknown) => {
    const session = extractSession(value);
    if (!session) return;
    const config = vscode.workspace.getConfiguration('deckbridge');
    const executable = config.get<string>('executablePath', 'agent-deck');
    const terminal = vscode.window.createTerminal({
      name: `Agent Deck: ${session.title}`,
      cwd: session.path || undefined,
      env: commandEnvironment(config)
    });
    terminal.show();
    terminal.sendText(shellCommand(executable, getClient().terminalArgs(session.id)), true);
  });
  register('deckbridge.createSession', async () => {
    const folders = vscode.workspace.workspaceFolders ?? [];
    if (!folders.length) return void vscode.window.showWarningMessage('Open a workspace before creating an Agent Deck session.');
    const folder = folders.length === 1 ? folders[0] : await vscode.window.showWorkspaceFolderPick({ placeHolder: 'Choose the session workspace' });
    if (!folder) return;
    const title = await vscode.window.showInputBox({ prompt: 'Session title', value: folder.name, validateInput: (value) => value.trim() ? undefined : 'A title is required.' });
    if (!title) return;
    const tool = await vscode.window.showQuickPick(['claude', 'codex', 'gemini', 'opencode', 'pi'], { placeHolder: 'Choose an agent' });
    if (!tool) return;
    await runWithProgress(`Creating ${title}…`, () => getClient().createSession(folder.uri.fsPath, title, tool));
    await tree.refresh();
  });

  for (const action of ['start', 'stop', 'restart'] as const) {
    register(`deckbridge.${action}`, async (value: unknown) => {
      const session = extractSession(value);
      if (!session) return;
      await runWithProgress(`${capitalize(action)}ing ${session.title}…`, () => getClient().sessionAction(action, session.id));
      await tree.refresh();
    });
  }
  register('deckbridge.rename', async (value: unknown) => {
    const session = extractSession(value);
    if (!session) return;
    const title = await vscode.window.showInputBox({
      prompt: 'New session title',
      value: session.title,
      validateInput: (candidate) => candidate.trim() ? undefined : 'A title is required.'
    });
    if (!title || title.trim() === session.title) return;
    await runWithProgress(`Renaming ${session.title}…`, () => getClient().renameSession(session.id, title.trim()));
    await tree.refresh();
  });
  register('deckbridge.moveToGroup', async (value: unknown) => {
    const session = extractSession(value);
    if (!session) return;
    let groups: string[];
    try {
      groups = await getClient().listGroups();
    } catch (error) {
      return void vscode.window.showErrorMessage(errorMessage(error));
    }
    const selection = await vscode.window.showQuickPick(
      [{ label: '$(root-folder) Ungrouped', group: '' }, ...groups.map((group) => ({ label: `$(folder) ${group}`, group }))],
      { placeHolder: `Move ${session.title} to a group` }
    );
    if (!selection || selection.group === session.group) return;
    await runWithProgress(`Moving ${session.title}…`, () => getClient().moveSessionToGroup(session.id, selection.group));
    await tree.refresh();
  });
  register('deckbridge.switchTool', async (value: unknown) => {
    const session = extractSession(value);
    if (!session) return;
    const target = await vscode.window.showQuickPick(
      ['claude', 'codex', 'gemini', 'opencode', 'pi', 'cursor'].filter((tool) => tool !== session.tool),
      { placeHolder: `Switch from ${session.tool} to another tool` }
    );
    if (!target) return;
    let preview: Record<string, unknown>;
    try {
      preview = await getClient().switchPreview(session.id, target);
    } catch (error) {
      return void vscode.window.showErrorMessage(errorMessage(error));
    }
    const assessment = assessSwitch(preview);
    if (!assessment.allowed) {
      return void vscode.window.showWarningMessage(
        `Agent Deck cannot switch this session to ${target}. Capability: ${assessment.capability}; execution: ${assessment.execution}.`
      );
    }
    const answer = await vscode.window.showWarningMessage(
      `Switch ${session.title} from ${session.tool} to ${target}? Agent Deck reports ${assessment.fidelity}. A new target session may be created; the source is preserved.`,
      { modal: true },
      'Switch with context'
    );
    if (answer !== 'Switch with context') return;
    await runWithProgress(`Switching to ${target}…`, () => getClient().switchHarness(session.id, target));
    await tree.refresh();
  });
  register('deckbridge.sendMessage', async (value: unknown) => {
    const session = extractSession(value);
    if (!session) return;
    const message = await vscode.window.showInputBox({ prompt: `Message ${session.title}` });
    if (message?.trim()) await runWithProgress('Sending message…', () => getClient().send(session.id, message.trim()));
  });

  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration('deckbridge')) void tree.refresh();
  }));
  await vscode.commands.executeCommand('setContext', 'deckbridge.groupsCollapsed', false);
  await tree.refresh();
  tree.startAutoRefresh();
  const state = await getClient().checkInstallation();
  if (!state.available) void vscode.commands.executeCommand('deckbridge.checkInstallation');
}

export function deactivate(): void {}

function createClient(): AgentDeckClient {
  const config = vscode.workspace.getConfiguration('deckbridge');
  return new AgentDeckClient({
    executable: config.get<string>('executablePath', 'agent-deck'),
    profile: config.get<string>('profile') || undefined,
    cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
    env: commandEnvironment(config)
  });
}

function commandEnvironment(config: vscode.WorkspaceConfiguration): NodeJS.ProcessEnv {
  return buildCommandEnvironment(process.env, homedir(), config.get<string[]>('additionalPath', []));
}

function extractSession(value: unknown): AgentDeckSession | undefined {
  if (value instanceof SessionNode) return value.session;
  if (typeof value === 'object' && value !== null && 'session' in value) return (value as { session: AgentDeckSession }).session;
  return undefined;
}

function shellCommand(executable: string, args: string[]): string {
  return [executable, ...args].map(shellEscape).join(' ');
}

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

async function runWithProgress<T>(title: string, task: () => Promise<T>): Promise<T | undefined> {
  try {
    return await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title }, task);
  } catch (error) {
    void vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
    return undefined;
  }
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
