import * as vscode from 'vscode';
import { AgentDeckClient, RecallFollower } from './agentDeckClient';
import { AgentDeckSession, RecallFrame, RecallRow } from './types';
import { canSendToSession, canStopSession, expectsTranscriptResponse, sendReceiptLabel, sessionIndicatorTone, shouldAutoStartSession, shouldSendImmediately, shouldStartAfterRuntimeProbe } from './sessionPolicy';
import { ChatNavigationState, returnToSessionList } from './chatNavigation';
import { contextOverviewModel, contextPercentage } from './contextUsage';
import { ACTIVITY_INDICATOR_CLASS, chatHeaderModel, chatMetadataModel, sessionClipboardText, sessionCopiedMessage, shouldPinChatChrome, shouldShowChatTabs } from './chatPresentation';
import { ChatVsCodeAction, vscodeActionDescriptor } from './vscodeIntegration';
import { chatCommandCompletions } from './chatCompletions';
import { modelChoices, modelCommand } from './modelSelection';
import { readSessionRuntime } from './sessionRuntime';
import { LatestSerialTask } from './latestSerialTask';
import { deliveryStatusModel, sendIdFromReceipt } from './deliveryStatus';
import { tmuxStateLabel } from './runtimeDetection';
import { paneOutputDelta } from './commandOutput';

export class ChatPanel implements vscode.Disposable {
  private static readonly panels = new Map<string, ChatPanel>();
  private follower?: RecallFollower;
  private beforeCursor?: string;
  private contextOverviewReport?: unknown;
  private readonly disposables: vscode.Disposable[] = [];
  private deliveryGeneration = 0;
  private commandOutputGeneration = 0;
  private agentRuntimeAlive = false;

  static async show(extensionUri: vscode.Uri, client: AgentDeckClient, session: AgentDeckSession): Promise<void> {
    const existing = this.panels.get(session.id);
    if (existing) {
      if ('reveal' in existing.surface) existing.surface.reveal();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'deckbridge.chat',
      session.title,
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    const chat = new ChatPanel(extensionUri, client, session, panel, false);
    this.panels.set(session.id, chat);
    await chat.initialize();
  }

  static async attachToView(
    extensionUri: vscode.Uri,
    client: AgentDeckClient,
    session: AgentDeckSession,
    view: vscode.WebviewView,
    tabs: readonly AgentDeckSession[],
    onBack: () => void,
    onActivate: (id: string) => void,
    onClose: (id: string) => void
  ): Promise<ChatPanel> {
    const chat = new ChatPanel(extensionUri, client, session, view, true, onBack, tabs, onActivate, onClose);
    await chat.initialize();
    return chat;
  }

  private constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly client: AgentDeckClient,
    private readonly session: AgentDeckSession,
    private readonly surface: vscode.WebviewPanel | vscode.WebviewView,
    private readonly sidebar: boolean,
    private readonly onBack?: () => void,
    private readonly tabs: readonly AgentDeckSession[] = [],
    private readonly onActivate?: (id: string) => void,
    private readonly onClose?: (id: string) => void
  ) {
    this.disposables.push(surface.onDidDispose(() => this.dispose()));
    this.disposables.push(surface.webview.onDidReceiveMessage((message: { type?: string; text?: string }) => void this.onMessage(message)));
  }

  private async initialize(): Promise<void> {
    const autoStart = vscode.workspace.getConfiguration('deckbridge').get<boolean>('autoStartOnOpen', true);
    const details = await this.client.sessionDetails(this.session.id).catch(() => undefined);
    if (details) {
      this.session.tmuxSession = details.tmuxSession ?? this.session.tmuxSession;
      this.session.transcriptPath = details.transcriptPath ?? this.session.transcriptPath;
      this.session.raw = { ...this.session.raw, ...details.raw };
    }
    let runtime = await this.client.sessionRuntimeState(this.session);
    const runtimeAlive = runtime.agentRunning;
    this.agentRuntimeAlive = runtimeAlive;
    if (shouldAutoStartSession(this.session.status, autoStart) && runtimeAlive) this.session.status = 'waiting';
    this.surface.webview.html = html(this.surface.webview, this.extensionUri, this.session, this.sidebar, this.tabs);
    await this.post({ type: 'tmuxState', label: tmuxStateLabel(runtime), runtime });
    void this.refreshSendQueue();
    void this.client.skillCompletions()
      .catch(() => [])
      .then((skills) => this.post({ type: 'completions', items: [...chatCommandCompletions(this.session.tool), ...skills] }));
    void readSessionRuntime(this.session.transcriptPath)
      .catch(() => ({}))
      .then((settings) => this.post({ type: 'runtimeSettings', settings }));
    if (shouldStartAfterRuntimeProbe(this.session.status, autoStart, runtimeAlive)) {
      await this.post({ type: 'starting', starting: true });
      try {
        await this.client.sessionAction('start', this.session.id);
        this.session.status = 'running';
        runtime = await this.client.sessionRuntimeState(this.session);
        this.agentRuntimeAlive = runtime.agentRunning;
        await this.post({ type: 'tmuxState', label: tmuxStateLabel(runtime), runtime });
        await this.post({ type: 'starting', starting: false });
      } catch (error) {
        await this.post({ type: 'starting', starting: false, succeeded: false });
        await this.post({ type: 'error', message: errorMessage(error) });
      }
    }
    await this.resync();
  }

  private async resync(): Promise<void> {
    this.follower?.dispose();
    try {
      const limit = vscode.workspace.getConfiguration('deckbridge').get<number>('initialMessageLimit', 100);
      const [timeline, contextOverview] = await Promise.all([
        this.client.timeline(this.session.id, limit),
        this.client.contextOverview(this.session.id).catch(() => undefined)
      ]);
      this.contextOverviewReport = contextOverview;
      this.beforeCursor = timeline.before_cursor;
      await this.post({
        type: 'snapshot',
        rows: timeline.turns,
        hasOlder: Boolean(this.beforeCursor),
        status: timeline.status,
        contextIndicator: contextOverviewModel(contextOverview, this.session.tool, contextPercentage(timeline.status))
      });
      this.startFollower(timeline.through_cursor ?? 'end');
    } catch (error) {
      await this.post({ type: 'error', message: errorMessage(error) });
    }
  }

  private startFollower(cursor: string): void {
    this.follower = this.client.follow(this.session.id, cursor);
    this.follower.on('frame', (frame: RecallFrame) => {
      if (frame.frame === 'resync_required') void this.resync();
      else {
        const livePercent = contextPercentage(frame);
        void this.post({ type: 'frame', frame, contextIndicator: livePercent === undefined ? undefined : contextOverviewModel(this.contextOverviewReport, this.session.tool, livePercent) });
      }
    });
    this.follower.on('error', (error: Error) => void this.post({ type: 'error', message: error.message }));
  }

  private async onMessage(message: { type?: string; text?: string }): Promise<void> {
    try {
      if (message.type === 'send' && message.text?.trim()) {
        const text = message.text.trim();
        const waitsForResponse = expectsTranscriptResponse(text);
        const tmuxSession = this.agentRuntimeAlive ? this.session.tmuxSession : undefined;
        const paneBefore = !waitsForResponse && tmuxSession
          ? await this.client.paneOutput(tmuxSession).catch(() => undefined)
          : undefined;
        await this.post({ type: 'sending', sending: true, command: !waitsForResponse, text });
        const receipt = await this.client.send(this.session.id, text, shouldSendImmediately(text, this.agentRuntimeAlive), tmuxSession);
        const delivery = deliveryStatusModel(receipt);
        await this.post({ type: 'sending', sending: false, receipt: sendReceiptLabel(receipt), waitsForResponse, command: !waitsForResponse, text, delivery });
        const sendId = sendIdFromReceipt(receipt);
        if (sendId) void this.trackDelivery(sendId);
        if (!waitsForResponse && tmuxSession && paneBefore !== undefined) void this.trackCommandOutput(text, tmuxSession, paneBefore);
        await this.refreshSendQueue();
      } else if (message.type === 'start') {
        await this.post({ type: 'starting', starting: true });
        await this.client.sessionAction('start', this.session.id);
        this.session.status = 'running';
        await this.refreshTmuxState();
        await this.post({ type: 'starting', starting: false });
      } else if (message.type === 'stop') {
        await this.post({ type: 'stopping', stopping: true });
        await this.client.sessionAction('stop', this.session.id);
        this.session.status = 'stopped';
        await this.refreshTmuxState();
        await this.post({ type: 'stopping', stopping: false });
      } else if (message.type === 'older' && this.beforeCursor) {
        const page = await this.client.olderTimeline(this.session.id, this.beforeCursor, 100);
        this.beforeCursor = page.before_cursor;
        await this.post({ type: 'older', rows: page.turns, hasOlder: Boolean(this.beforeCursor) });
      } else if (message.type === 'attach') {
        await vscode.commands.executeCommand('deckbridge.attach', { session: this.session });
      } else if (message.type === 'runTests' || message.type === 'openTestExplorer') {
        await this.runVsCodeAction(message.type);
      } else if (message.type === 'copySessionId') {
        await vscode.env.clipboard.writeText(sessionClipboardText(this.session));
        await this.post({ type: 'sessionIdCopied', message: sessionCopiedMessage() });
      } else if (message.type === 'chooseModel') {
        await this.chooseModel();
      } else if (message.type === 'refreshQueue') {
        await this.refreshSendQueue();
      } else if (message.type === 'cancelQueue' && message.text) {
        await this.cancelQueuedSend(message.text);
      } else if (message.type === 'back') {
        this.onBack?.();
      } else if (message.type === 'activateTab' && message.text) {
        this.onActivate?.(message.text);
      } else if (message.type === 'closeTab' && message.text) {
        this.onClose?.(message.text);
      }
    } catch (error) {
      await this.post({ type: 'sending', sending: false });
      await this.post({ type: 'deliveryStatus', delivery: { state: 'failed', label: 'Não foi possível enviar ao Agent Deck', detail: errorMessage(error), tone: 'error', terminal: true } });
      await this.post({ type: 'starting', starting: false, succeeded: false });
      await this.post({ type: 'stopping', stopping: false, succeeded: false });
      await this.post({ type: 'error', message: errorMessage(error) });
    }
  }

  private async chooseModel(): Promise<void> {
    const customLabel = '$(edit) Enter model ID…';
    const selected = await vscode.window.showQuickPick(
      [...modelChoices(this.session.tool, this.session.model), customLabel],
      { placeHolder: `Select a model for ${this.session.title}` }
    );
    if (!selected) return;
    const model = selected === customLabel
      ? await vscode.window.showInputBox({ prompt: 'Model ID', value: this.session.model ?? '', validateInput: (value) => value.trim() && !/[\r\n]/.test(value) ? undefined : 'Enter a single-line model ID.' })
      : selected;
    if (!model?.trim() || model.trim() === this.session.model) return;
    await this.post({ type: 'modelChanging', changing: true, model: model.trim() });
    await this.client.send(this.session.id, modelCommand(model), true, this.agentRuntimeAlive ? this.session.tmuxSession : undefined);
    this.session.model = model.trim();
    await this.post({ type: 'modelChanging', changing: false, model: this.session.model });
  }

  private async refreshTmuxState(): Promise<void> {
    const runtime = await this.client.sessionRuntimeState(this.session);
    this.agentRuntimeAlive = runtime.agentRunning;
    await this.post({ type: 'tmuxState', label: tmuxStateLabel(runtime), runtime });
  }

  private async refreshSendQueue(): Promise<void> {
    await this.post({ type: 'queueLoading', loading: true });
    try {
      await this.post({ type: 'queue', queue: await this.client.sendQueue(this.session.id) });
    } catch (error) {
      await this.post({ type: 'queueError', message: errorMessage(error) });
    } finally {
      await this.post({ type: 'queueLoading', loading: false });
    }
  }

  private async cancelQueuedSend(sendId: string): Promise<void> {
    const confirmed = await vscode.window.showWarningMessage(
      'Cancelar esta mensagem pendente? Ela não será enviada ao agente.',
      { modal: true },
      'Cancelar mensagem'
    );
    if (confirmed !== 'Cancelar mensagem') return;
    await this.post({ type: 'queueCancelling', sendId });
    try {
      await this.client.cancelQueuedSend(sendId);
      await this.post({ type: 'queueCancelled', message: 'Mensagem removida da fila.' });
      await this.refreshSendQueue();
    } catch (error) {
      await this.post({ type: 'queueError', message: errorMessage(error) });
    } finally {
      await this.post({ type: 'queueCancelling' });
    }
  }

  private async trackDelivery(sendId: string): Promise<void> {
    const generation = ++this.deliveryGeneration;
    for (let attempt = 0; attempt < 120 && generation === this.deliveryGeneration; attempt += 1) {
      try {
        const receipt = await this.client.sendStatus(sendId);
        const delivery = deliveryStatusModel(receipt);
        await this.post({ type: 'deliveryStatus', delivery, sendId });
        if (delivery.terminal) {
          await this.refreshSendQueue();
          return;
        }
      } catch (error) {
        await this.post({ type: 'deliveryStatus', delivery: { state: 'unknown', label: 'Não foi possível consultar a entrega', detail: errorMessage(error), tone: 'warning', terminal: true }, sendId });
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    if (generation === this.deliveryGeneration) await this.post({ type: 'deliveryStatus', delivery: { state: 'timeout', label: 'A entrega continua pendente', detail: 'Abra a sessão no terminal para verificar ou tente reiniciá-la.', tone: 'warning', terminal: true }, sendId });
  }

  private async trackCommandOutput(command: string, tmuxSession: string, paneBefore: string): Promise<void> {
    const generation = ++this.commandOutputGeneration;
    let latest: string | undefined;
    let stableSamples = 0;
    for (let attempt = 0; attempt < 20 && generation === this.commandOutputGeneration; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const paneAfter = await this.client.paneOutput(tmuxSession).catch(() => undefined);
      if (paneAfter === undefined) break;
      const output = paneOutputDelta(paneBefore, paneAfter);
      if (!output) continue;
      if (output === latest) stableSamples += 1;
      else {
        latest = output;
        stableSamples = 0;
      }
      if (stableSamples >= 2) break;
    }
    if (generation === this.commandOutputGeneration && latest) {
      await this.post({ type: 'commandOutput', command, output: latest });
    }
  }

  private async runVsCodeAction(action: ChatVsCodeAction): Promise<void> {
    const descriptor = vscodeActionDescriptor(action);
    await this.post({ type: 'vscodeAction', running: true, message: descriptor.progressMessage, action });
    await vscode.commands.executeCommand(descriptor.command);
    await this.post({ type: 'vscodeAction', running: false, message: descriptor.completionMessage, action });
  }

  private post(message: unknown): Thenable<boolean> {
    return this.surface.webview.postMessage(message);
  }

  dispose(): void {
    this.deliveryGeneration += 1;
    this.commandOutputGeneration += 1;
    this.follower?.dispose();
    if (ChatPanel.panels.get(this.session.id) === this) ChatPanel.panels.delete(this.session.id);
    for (const disposable of this.disposables.splice(0)) disposable.dispose();
  }
}

export class ChatViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  private view?: vscode.WebviewView;
  private controller?: ChatPanel;
  private readonly navigation = new ChatNavigationState();
  private readonly renders = new LatestSerialTask();

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly getClient: () => AgentDeckClient,
    private readonly refreshSessions: () => Promise<void> = async () => {}
  ) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true };
    view.onDidDispose(() => {
      this.controller?.dispose();
      this.controller = undefined;
      this.view = undefined;
    });
    if (this.navigation.session) void this.render(this.navigation.session);
  }

  async open(session: AgentDeckSession): Promise<void> {
    this.navigation.open(session);
    await vscode.commands.executeCommand('setContext', 'deckbridge.chatOpen', true);
    await vscode.commands.executeCommand('deckbridge.chat.focus');
    if (this.view) await this.render(session);
  }

  async back(): Promise<void> {
    this.controller?.dispose();
    this.controller = undefined;
    this.navigation.back();
    await vscode.commands.executeCommand('setContext', 'deckbridge.chatOpen', false);
    await returnToSessionList(
      this.refreshSessions,
      async () => { await vscode.commands.executeCommand('deckbridge.sessions.focus'); }
    );
  }

  dispose(): void {
    this.controller?.dispose();
  }

  private async render(session: AgentDeckSession): Promise<void> {
    await this.renders.run(async () => {
      if (!this.view) return;
      this.controller?.dispose();
      this.controller = undefined;
      this.controller = await ChatPanel.attachToView(
        this.extensionUri,
        this.getClient(),
        session,
        this.view,
        this.navigation.tabs,
        () => void this.back(),
        (id) => void this.activate(id),
        (id) => void this.close(id)
      );
    });
  }

  private async activate(id: string): Promise<void> {
    if (this.navigation.activate(id) && this.navigation.session) await this.render(this.navigation.session);
  }

  private async close(id: string): Promise<void> {
    const next = this.navigation.close(id);
    if (next) await this.render(next);
    else await this.back();
  }
}

function html(webview: vscode.Webview, _extensionUri: vscode.Uri, session: AgentDeckSession, sidebar = false, tabs: readonly AgentDeckSession[] = []): string {
  const nonce = Math.random().toString(36).slice(2);
  const canSend = canSendToSession(session.status);
  const canStop = canStopSession(session.status);
  const heading = chatHeaderModel(session);
  const metadata = chatMetadataModel(session);
  return `<!doctype html>
<html data-tool="${escapeHtml(session.tool.toLowerCase())}"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{--tool-accent:var(--vscode-charts-blue);padding:0;color:var(--vscode-foreground);background:var(--vscode-editor-background);font-family:var(--vscode-font-family)}
html[data-tool="codex"] body{--tool-accent:var(--vscode-charts-green)}html[data-tool="claude"] body{--tool-accent:var(--vscode-charts-orange)}html[data-tool="gemini"] body{--tool-accent:var(--vscode-charts-blue)}html[data-tool="cursor"] body{--tool-accent:var(--vscode-charts-purple)}
.topbar .stop{background:transparent;color:var(--vscode-errorForeground);border:1px solid var(--vscode-errorForeground)}.topbar .stop:hover{background:color-mix(in srgb,var(--vscode-errorForeground) 14%,transparent)}
.chat-chrome{background:var(--vscode-sideBar-background)}.chat-chrome.pinned{position:sticky;top:0;z-index:10;box-shadow:0 1px 0 var(--vscode-panel-border)}.topbar{display:flex;align-items:center;gap:6px;padding:8px 10px;border-bottom:1px solid var(--vscode-panel-border);background:var(--vscode-sideBar-background);overflow-x:auto}.topbar .spacer{flex:1}.topbar button{padding:5px 8px;white-space:nowrap}.topbar .secondary{background:transparent;color:var(--vscode-foreground);border:1px solid var(--vscode-button-border,var(--vscode-panel-border))}.topbar .secondary:hover{background:var(--vscode-toolbar-hoverBackground)}.heading{padding:11px 12px 10px;border-bottom:1px solid var(--vscode-panel-border);background:var(--vscode-sideBar-background)}.title-line{display:flex;align-items:flex-start;gap:8px}.title-line h1{flex:1;min-width:0;margin:0;font-size:16px;line-height:1.35;font-weight:600;overflow-wrap:anywhere}.metadata{display:flex;align-items:center;flex-wrap:wrap;gap:5px}.badge{padding:3px 7px;border:1px solid var(--vscode-panel-border);border-radius:999px;color:var(--vscode-descriptionForeground);font-size:11px;white-space:nowrap}.session-id-button{max-width:100%;overflow:hidden;text-overflow:ellipsis;background:transparent;color:var(--vscode-descriptionForeground);border:1px solid var(--vscode-panel-border);font-family:var(--vscode-editor-font-family);cursor:copy}.session-id-button:hover{background:var(--vscode-toolbar-hoverBackground);color:var(--vscode-foreground)}.tool{border-color:var(--tool-accent);color:var(--tool-accent);text-transform:uppercase}.context-badge{display:inline-flex;align-items:center;gap:5px;background:transparent;border:1px solid var(--vscode-panel-border);color:var(--vscode-descriptionForeground)}.context-badge:hover{background:var(--vscode-toolbar-hoverBackground)}.context-ring{--context-color:var(--vscode-charts-green);width:12px;height:12px;flex:0 0 12px;border-radius:50%;background:conic-gradient(var(--context-color) calc(var(--context-progress) * 1%),var(--vscode-panel-border) 0);position:relative;transition:background .35s ease}.context-ring::after{content:'';position:absolute;inset:3px;border-radius:50%;background:var(--vscode-editor-background)}.context-badge[data-tone="warning"] .context-ring{--context-color:var(--vscode-charts-yellow)}.context-badge[data-tone="critical"]{color:var(--vscode-errorForeground);border-color:var(--vscode-charts-red)}.context-badge[data-tone="critical"] .context-ring{--context-color:var(--vscode-charts-red);animation:contextPulse 1.8s ease-in-out infinite}@keyframes contextPulse{50%{filter:brightness(1.5);transform:scale(1.1)}}.context-popover{position:absolute;left:10px;right:10px;bottom:100%;max-height:min(430px,65vh);overflow:auto;padding:12px;border:1px solid var(--vscode-panel-border);border-radius:7px;background:var(--vscode-notifications-background,var(--vscode-editorWidget-background));color:var(--vscode-notifications-foreground,var(--vscode-foreground));box-shadow:0 6px 20px color-mix(in srgb,var(--vscode-editor-background) 65%,transparent)}.context-popover[hidden]{display:none}.context-popover header{display:flex;align-items:center;gap:8px;margin-bottom:10px}.context-popover h2{flex:1;margin:0;font-size:14px}.context-popover .close-popover{padding:2px 6px;background:transparent;color:var(--vscode-foreground)}.context-summary{display:grid;grid-template-columns:max-content 1fr;gap:5px 10px;font-size:12px}.context-summary dt{color:var(--vscode-descriptionForeground)}.context-summary dd{margin:0;text-align:right}.context-categories{margin:10px 0 0;padding:0;list-style:none}.context-categories li{display:flex;justify-content:space-between;gap:8px;padding:5px 0;border-top:1px solid var(--vscode-panel-border);font-size:12px}.context-categories small{color:var(--vscode-descriptionForeground)}.context-warnings{margin:10px 0 0;padding:8px;border-left:3px solid var(--vscode-charts-yellow);background:var(--vscode-textBlockQuote-background);font-size:11px}.status[data-running="true"]{border-color:var(--vscode-charts-green);color:var(--vscode-charts-green)}button,textarea{font:inherit;color:var(--vscode-input-foreground);background:var(--vscode-input-background);border:1px solid var(--vscode-input-border);border-radius:3px}button{padding:6px 10px;cursor:pointer;background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:0}button:hover{background:var(--vscode-button-hoverBackground)}button:disabled{opacity:.55;cursor:default}
.tabs{display:flex;gap:4px;overflow-x:auto;padding:6px 10px;border-bottom:1px solid var(--vscode-panel-border);background:var(--vscode-sideBar-background)}.tab{display:flex;align-items:center;min-width:0;padding:5px 8px;background:transparent;border:1px solid var(--vscode-panel-border);color:var(--vscode-descriptionForeground)}.tab.active{border-color:var(--tool-accent);color:var(--vscode-foreground);background:var(--vscode-list-activeSelectionBackground)}.tab-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:150px}
.session-dot{width:8px;height:8px;flex:0 0 8px;margin-left:7px;border-radius:50%;opacity:1}.session-dot[data-state="active"]{background:var(--vscode-testing-iconPassed);box-shadow:0 0 0 1px color-mix(in srgb,var(--vscode-testing-iconPassed) 35%,transparent)}.session-dot[data-state="not-started"]{background:var(--vscode-charts-blue);box-shadow:0 0 0 1px color-mix(in srgb,var(--vscode-charts-blue) 35%,transparent)}.session-dot[data-state="stopped"]{background:var(--vscode-charts-orange);box-shadow:0 0 0 1px color-mix(in srgb,var(--vscode-charts-orange) 35%,transparent)}.session-dot[data-state="error"]{background:var(--vscode-testing-iconFailed);box-shadow:0 0 0 1px color-mix(in srgb,var(--vscode-testing-iconFailed) 35%,transparent)}
.session-details{margin:8px 10px;border:1px solid var(--vscode-panel-border);border-radius:4px;background:var(--vscode-sideBar-background)}.session-details summary{cursor:pointer;padding:7px 9px;color:var(--vscode-descriptionForeground)}.details-grid{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:5px 9px;padding:2px 9px 10px;font-size:12px}.details-grid .key{color:var(--vscode-descriptionForeground)}.details-grid .value{overflow-wrap:anywhere}.details-grid .problem{color:var(--vscode-errorForeground)}
.tmux-state-badge[data-state="attached"],.tmux-state-badge[data-agent-running="true"]{border-color:var(--vscode-charts-green);color:var(--vscode-charts-green)}.tmux-state-badge[data-state="detached"]{border-color:var(--vscode-charts-blue);color:var(--vscode-charts-blue)}.tmux-state-badge[data-state="not-running"],.tmux-state-badge[data-state="dead"]{border-color:var(--vscode-charts-orange);color:var(--vscode-charts-orange)}
.queue-panel{scroll-margin-top:110px;margin:8px 10px;border:1px solid var(--vscode-panel-border);border-radius:5px;background:var(--vscode-sideBar-background)}.queue-panel:focus-within{border-color:var(--vscode-focusBorder)}.queue-panel summary{display:flex;align-items:center;gap:7px;padding:8px 9px;cursor:pointer}.queue-title{font-weight:600}.queue-count{padding:1px 6px;border-radius:999px;background:var(--vscode-badge-background);color:var(--vscode-badge-foreground);font-size:10px}.queue-refresh{margin-left:auto;padding:3px 7px;background:transparent;color:var(--vscode-descriptionForeground);border:1px solid var(--vscode-panel-border)}.queue-list{display:grid;gap:6px;margin:0;padding:0 8px 8px;list-style:none}.queue-empty{padding:4px 2px;color:var(--vscode-descriptionForeground);font-size:12px}.queue-item{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 8px;padding:8px;border:1px solid var(--vscode-panel-border);border-radius:4px;background:var(--vscode-editor-background)}.queue-preview{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--vscode-editor-font-family);font-size:12px}.queue-meta{display:flex;gap:6px;align-items:center;color:var(--vscode-descriptionForeground);font-size:10px}.queue-state{font-weight:600;text-transform:uppercase}.queue-state[data-state="queued"]{color:var(--vscode-charts-yellow)}.queue-state[data-state="landed"]{color:var(--vscode-charts-green)}.queue-state[data-state="failed"]{color:var(--vscode-errorForeground)}.queue-cancel{grid-column:2;grid-row:1/3;align-self:center;padding:4px 7px;background:transparent;color:var(--vscode-errorForeground);border:1px solid var(--vscode-errorForeground)}
.delivery-status{display:grid;grid-template-columns:12px minmax(0,1fr);gap:2px 8px;align-items:center;margin:8px 16px;padding:9px 11px;border:1px solid var(--vscode-panel-border);border-radius:6px;background:var(--vscode-editorWidget-background);font-size:12px}.delivery-status[hidden]{display:none}.delivery-dot{box-sizing:border-box;grid-row:1/3;width:10px;height:10px;border-radius:50%;background:var(--vscode-descriptionForeground)}.delivery-label{font-weight:600}.delivery-detail{color:var(--vscode-descriptionForeground);overflow-wrap:anywhere}.delivery-status[data-tone="progress"]{border-color:var(--vscode-charts-blue)}.delivery-status[data-tone="progress"] .delivery-dot{border:2px solid var(--vscode-panel-border);border-top-color:var(--vscode-charts-blue);background:transparent;animation:spin .8s linear infinite}.delivery-status[data-tone="success"]{border-color:var(--vscode-charts-green)}.delivery-status[data-tone="success"] .delivery-dot{background:var(--vscode-charts-green)}.delivery-status[data-tone="warning"]{border-color:var(--vscode-charts-yellow)}.delivery-status[data-tone="warning"] .delivery-dot{background:var(--vscode-charts-yellow)}.delivery-status[data-tone="error"]{border-color:var(--vscode-errorForeground);color:var(--vscode-errorForeground)}.delivery-status[data-tone="error"] .delivery-dot{background:var(--vscode-errorForeground)}
#older{display:block;margin:12px auto}.messages{max-width:980px;margin:auto;padding:8px 16px 220px}.row{margin:10px 0;padding:10px 12px;border-left:3px solid var(--vscode-panel-border);background:var(--vscode-editorWidget-background)}.row.user{border-color:var(--vscode-charts-blue)}.row.assistant{border-color:var(--vscode-charts-green)}.row.command_output{border-color:var(--vscode-charts-purple)}.row.error{border-color:var(--vscode-charts-red)}.meta{display:flex;gap:8px;color:var(--vscode-descriptionForeground);font-size:11px;text-transform:uppercase}.title{font-weight:600;margin:5px 0}.body{white-space:pre-wrap;overflow-wrap:anywhere;font-family:var(--vscode-editor-font-family)}.${ACTIVITY_INDICATOR_CLASS}{display:flex;align-items:center;gap:8px;width:max-content;max-width:calc(100% - 32px);margin:8px 16px 0;padding:7px 11px;border:1px solid var(--tool-accent);border-radius:999px;background:var(--vscode-editorWidget-background);color:var(--vscode-descriptionForeground);font-size:12px;box-shadow:0 2px 8px color-mix(in srgb,var(--vscode-editor-background) 70%,transparent)}.${ACTIVITY_INDICATOR_CLASS}[hidden]{display:none}.spinner{box-sizing:border-box;width:12px;height:12px;flex:0 0 12px;border:2px solid var(--vscode-panel-border);border-top-color:var(--tool-accent);border-radius:50%;animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.copy-toast{position:fixed;left:50%;bottom:148px;z-index:12;display:flex;align-items:center;gap:7px;max-width:calc(100% - 32px);padding:8px 11px;border:1px solid var(--vscode-charts-green);border-radius:6px;background:var(--vscode-notifications-background,var(--vscode-editorWidget-background));color:var(--vscode-notifications-foreground,var(--vscode-foreground));box-shadow:0 4px 14px color-mix(in srgb,var(--vscode-editor-background) 65%,transparent);font-size:12px;transform:translate(-50%,0);animation:toastIn .16s ease-out}.copy-toast[hidden]{display:none}.copy-toast-icon{color:var(--vscode-charts-green);font-weight:700}@keyframes toastIn{from{opacity:0;transform:translate(-50%,6px)}to{opacity:1;transform:translate(-50%,0)}}.chat-input-dock{position:fixed;bottom:0;left:0;right:0;z-index:3;background:var(--vscode-editor-background);border-top:1px solid var(--vscode-panel-border)}.completion-list{position:absolute;left:16px;right:68px;bottom:72px;z-index:8;max-height:240px;overflow:auto;margin:0;padding:4px;list-style:none;border:1px solid var(--vscode-widget-border,var(--vscode-panel-border));border-radius:5px;background:var(--vscode-editorSuggestWidget-background,var(--vscode-editorWidget-background));box-shadow:0 4px 14px color-mix(in srgb,var(--vscode-editor-background) 65%,transparent)}.completion-list[hidden]{display:none}.completion-item{display:grid;grid-template-columns:auto 1fr;gap:2px 8px;width:100%;padding:6px 8px;text-align:left;background:transparent;color:var(--vscode-editorSuggestWidget-foreground,var(--vscode-foreground));border-radius:3px}.completion-item.selected,.completion-item:hover{background:var(--vscode-editorSuggestWidget-selectedBackground,var(--vscode-list-activeSelectionBackground))}.completion-kind{grid-row:1/3;align-self:center;color:var(--tool-accent);font-size:10px;text-transform:uppercase}.completion-label{font-family:var(--vscode-editor-font-family);font-weight:600}.completion-description{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--vscode-descriptionForeground);font-size:11px}.composer-metadata{padding:8px 16px 0}.composer{padding:8px 16px 12px;display:flex;gap:8px}.composer textarea{flex:1;resize:vertical;min-height:54px;padding:8px}.error-banner{color:var(--vscode-errorForeground);padding:8px 16px}
</style></head><body>
<div class="chat-chrome${shouldPinChatChrome(sidebar) ? ' pinned' : ''}"><header class="topbar">${sidebar ? '<button id="back" title="Back to session list">← Chats</button>' : ''}<span class="spacer"></span><button id="queue-open" class="secondary" title="Mostrar fila de mensagens">☷ Fila</button><button id="start" ${canSend ? 'hidden' : ''}>▶ Start</button><button id="stop" class="stop" title="Stop this Agent Deck session" ${canStop ? '' : 'hidden'}>■ Stop</button><button id="run-tests" class="secondary" title="Run all tests in VS Code">▷ Tests</button><button id="open-tests" class="secondary" title="Open VS Code Test Explorer">✓ Explorer</button><button id="attach" class="secondary" title="Open in Agent Deck terminal">⌁ Terminal</button>${sidebar ? '<button id="close-chat" class="secondary" title="Close this chat">× Close</button>' : ''}</header>
${sidebar && shouldShowChatTabs(tabs.length) ? `<nav class="tabs" aria-label="Open chats">${tabs.map((tab) => `<button class="tab${tab.id === session.id ? ' active' : ''}" data-tab-id="${escapeHtml(tab.id)}" title="Switch to ${escapeHtml(tab.title)}"><span ${tab.id === session.id ? 'id="current-session-dot" ' : ''}class="session-dot" data-state="${sessionIndicatorTone(tab.status)}"></span><span class="tab-name">${escapeHtml(tab.title)}</span></button>`).join('')}</nav>` : ''}
<section class="heading"><div class="title-line"><h1>${escapeHtml(heading.title)}</h1><span id="status" class="badge status">${escapeHtml(heading.status)}</span></div></section></div>
<details class="session-details"><summary>Session details</summary><div class="details-grid">
${detailRow('Status', session.substate ? `${session.status} · ${session.substate}` : session.status, Boolean(session.substate && ['error', 'stopped'].includes(session.status)))}
${detailRow('Session', session.nativeSessionId ?? session.id)}
${detailRow('Model', session.model ?? 'tool default')}
<span id="context-key" class="key" hidden>Context</span><span id="context-value" class="value" hidden></span>
${detailRow('Tool', session.tool)}
${detailRow('Group', session.group || 'Ungrouped')}
${detailRow('Path', session.path || 'Unknown')}
${session.statusSource ? detailRow('Status source', session.statusSource) : ''}
${session.tmuxSession ? detailRow('tmux session', session.tmuxSession) : ''}
<span class="key">tmux state</span><span class="value tmux-state">checking…</span>
${session.viewerCount !== undefined ? detailRow('Viewers', String(session.viewerCount)) : ''}
${session.lastActivityAt ? detailRow('Last activity', formatTimestamp(session.lastActivityAt)) : ''}
${session.createdAt ? detailRow('Created', formatTimestamp(session.createdAt)) : ''}
</div></details>
<details id="queue-panel" class="queue-panel"><summary><span class="queue-title">Fila de mensagens</span><span id="queue-count" class="queue-count">…</span><button id="queue-refresh" class="queue-refresh" type="button" title="Atualizar fila">↻ Atualizar</button></summary><ul id="queue-list" class="queue-list"><li class="queue-empty">Carregando…</li></ul></details>
<div id="error" class="error-banner"></div><div id="notice" class="status"></div><div id="delivery-status" class="delivery-status" role="status" aria-live="polite" hidden><span class="delivery-dot" aria-hidden="true"></span><span id="delivery-label" class="delivery-label"></span><small id="delivery-detail" class="delivery-detail"></small></div><button id="older" hidden>Load older messages</button><main id="messages" class="messages"></main><div id="copy-toast" class="copy-toast" role="status" aria-live="polite" hidden><span class="copy-toast-icon">✓</span><span id="copy-toast-message"></span></div>
<div class="chat-input-dock"><div id="thinking" class="${ACTIVITY_INDICATOR_CLASS}" hidden><span class="spinner"></span><span id="thinking-label">Agent is thinking…</span></div><section id="context-popover" class="context-popover" aria-label="Context details" hidden><header><h2 id="context-title">Context</h2><button id="close-context" class="close-popover" title="Close context details">×</button></header><dl class="context-summary"><dt>Uso</dt><dd id="context-use">—</dd><dt>Contexto fixo</dt><dd id="context-fixed">—</dd><dt>Janela</dt><dd id="context-window">—</dd><dt>Potencial</dt><dd id="context-potential">—</dd><dt>Medição</dt><dd id="context-measurement">—</dd></dl><ul id="context-categories" class="context-categories"></ul><div id="context-warnings" class="context-warnings" hidden></div></section><ul id="completion-list" class="completion-list" role="listbox" hidden></ul><div class="metadata composer-metadata"><span class="badge tool">${escapeHtml(metadata.tool)}</span><span id="mode" class="badge" title="Current agent mode">modo —</span><span class="badge tmux-state tmux-state-badge" title="Estado da sessão tmux">tmux: checking…</span><button id="model" class="badge session-id-button" title="Select model" ${metadata.model ? '' : 'hidden'}>${escapeHtml(metadata.model ?? '')}</button><button id="context-badge" class="badge context-badge" title="Context details" hidden><span id="context-ring" class="context-ring" aria-hidden="true"></span><span id="context-label"></span></button><button id="copy-session-id" class="badge session-id-button" title="Copy complete Agent Deck session ID">${escapeHtml(metadata.sessionId)}</button></div><form id="composer" class="composer"><textarea id="input" placeholder="${canSend ? 'Digite / para comandos ou $ para skills…' : 'Start the session before sending a message'}" ${canSend ? '' : 'disabled'}></textarea><button id="send" ${canSend ? '' : 'disabled'}>Send</button></form></div>
<script nonce="${nonce}">
const vscode=acquireVsCodeApi(),rows=new Map(),list=document.getElementById('messages'),older=document.getElementById('older'),input=document.getElementById('input'),send=document.getElementById('send'),start=document.getElementById('start'),stop=document.getElementById('stop'),notice=document.getElementById('notice'),thinking=document.getElementById('thinking'),thinkingLabel=document.getElementById('thinking-label'),deliveryStatus=document.getElementById('delivery-status'),deliveryLabel=document.getElementById('delivery-label'),deliveryDetail=document.getElementById('delivery-detail'),queuePanel=document.getElementById('queue-panel'),queueList=document.getElementById('queue-list'),queueCount=document.getElementById('queue-count'),queueOpen=document.getElementById('queue-open'),queueRefresh=document.getElementById('queue-refresh'),copyToast=document.getElementById('copy-toast'),copyToastMessage=document.getElementById('copy-toast-message'),completionList=document.getElementById('completion-list');let copyToastTimer,completions=[],filteredCompletions=[],selectedCompletion=0,awaitingTranscript=false;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function setThinking(value,label){thinking.hidden=!value;if(label)thinkingLabel.textContent=label}
function renderDelivery(delivery){if(!delivery)return;deliveryStatus.hidden=false;deliveryStatus.dataset.tone=delivery.tone;deliveryStatus.dataset.state=delivery.state;deliveryLabel.textContent=delivery.label;deliveryDetail.textContent=delivery.detail||'';deliveryDetail.hidden=!delivery.detail;notice.textContent='';if(delivery.tone==='error'||delivery.state==='timeout'||delivery.state==='unknown'){awaitingTranscript=false;setThinking(false)}else if(delivery.terminal&&!awaitingTranscript)setThinking(false);else if(delivery.terminal&&awaitingTranscript)setThinking(true,'Agente processando a mensagem…')}
function renderQueue(queue){queueList.replaceChildren();queueCount.textContent=queue.pendingCount?queue.pendingCount+' pendente'+(queue.pendingCount===1?'':'s'):String(queue.items.length);queueOpen.textContent=queue.pendingCount?'☷ Fila ('+queue.pendingCount+')':'☷ Fila';if(queue.pendingCount)queueOpen.dataset.pending='true';else delete queueOpen.dataset.pending;if(!queue.items.length){const empty=document.createElement('li');empty.className='queue-empty';empty.textContent='Nenhuma mensagem na fila.';queueList.append(empty);return}for(const item of queue.items.slice().reverse()){const row=document.createElement('li');row.className='queue-item';const preview=document.createElement('span');preview.className='queue-preview';preview.textContent=item.preview||'(sem prévia)';preview.title=item.preview||item.id;const meta=document.createElement('span');meta.className='queue-meta';const state=document.createElement('span');state.className='queue-state';state.dataset.state=item.state;state.textContent=item.state;const time=document.createElement('span');time.textContent=item.enqueuedAt?new Date(item.enqueuedAt).toLocaleString():item.id;meta.append(state,time);row.append(preview,meta);if(item.cancellable){const cancel=document.createElement('button');cancel.type='button';cancel.className='queue-cancel';cancel.dataset.sendId=item.id;cancel.textContent='Cancelar';cancel.title='Cancelar esta mensagem pendente';row.append(cancel)}queueList.append(row)}}
function showCopyToast(message){clearTimeout(copyToastTimer);copyToastMessage.textContent=message;copyToast.hidden=false;copyToastTimer=setTimeout(()=>{copyToast.hidden=true},2600)}
function completionQuery(){const before=input.value.slice(0,input.selectionStart),match=before.match(/(^|\s)([\/$][^\s]*)$/);return match?match[2]:undefined}
function chooseCompletion(item){const end=input.selectionStart,start=end-(completionQuery()?.length||0);if(item.action==='chooseModel'){input.setRangeText('',start,end,'end');completionList.hidden=true;vscode.postMessage({type:'chooseModel'});return}input.setRangeText(item.value+' ',start,end,'end');completionList.hidden=true;input.focus()}
function renderCompletions(){const query=completionQuery();if(!query){completionList.hidden=true;return}const kind=query.startsWith('/')?'command':'skill',needle=query.slice(1).toLowerCase();filteredCompletions=completions.filter(item=>item.kind===kind&&(item.label.toLowerCase().includes(needle)||item.value.toLowerCase().includes(needle))).slice(0,12);selectedCompletion=Math.min(selectedCompletion,Math.max(0,filteredCompletions.length-1));completionList.replaceChildren();filteredCompletions.forEach((item,index)=>{const button=document.createElement('button');button.type='button';button.className='completion-item'+(index===selectedCompletion?' selected':'');button.setAttribute('role','option');const kindEl=document.createElement('span'),label=document.createElement('span'),description=document.createElement('span');kindEl.className='completion-kind';kindEl.textContent=item.kind==='skill'?'skill':'cmd';label.className='completion-label';label.textContent=item.value;description.className='completion-description';description.textContent=item.description;button.append(kindEl,label,description);button.onmousedown=event=>{event.preventDefault();chooseCompletion(item)};completionList.append(button)});completionList.hidden=!filteredCompletions.length}
const tokenLabel=value=>value===undefined?'Indisponível':Number(value).toLocaleString()+' tokens';
function renderContextDetails(indicator){document.getElementById('context-title').textContent='Contexto · '+indicator.adapter;document.getElementById('context-use').textContent=indicator.percent.toLocaleString(undefined,{maximumFractionDigits:1})+'%';document.getElementById('context-fixed').textContent=tokenLabel(indicator.fixedTokens);document.getElementById('context-window').textContent=tokenLabel(indicator.windowTokens);document.getElementById('context-potential').textContent=tokenLabel(indicator.potentialTokens);document.getElementById('context-measurement').textContent=indicator.measurement;const categories=document.getElementById('context-categories');categories.replaceChildren();for(const category of indicator.categories||[]){const item=document.createElement('li'),name=document.createElement('span'),amount=document.createElement('small');name.textContent=category.title;amount.textContent=(category.tokens===undefined?'Indisponível':Number(category.tokens).toLocaleString()+' tokens')+' · '+category.measurement;item.append(name,amount);categories.append(item)}const warnings=document.getElementById('context-warnings');warnings.hidden=!(indicator.warnings||[]).length;warnings.textContent=(indicator.warnings||[]).join(' · ')}
function renderRow(row,prepend=false){let el=document.getElementById('row-'+CSS.escape(row.id));if(!el){el=document.createElement('article');el.id='row-'+row.id;el.className='row '+(row.kind||'other');prepend?list.prepend(el):list.append(el)}el.dataset.row=JSON.stringify(row);el.className='row '+(row.kind||'other')+(row.is_error?' error':'');el.innerHTML='<div class="meta"><span>'+esc(row.kind)+'</span><span>'+esc(row.ts?new Date(row.ts).toLocaleString():'')+'</span></div>'+(row.title?'<div class="title">'+esc(row.title)+'</div>':'')+'<div class="body">'+esc(row.body||row.summary||row.detail||'')+'</div>';rows.set(row.id,row);if(!prepend&&(row.kind==='assistant'||row.kind==='turn_end'||row.is_error)){awaitingTranscript=false;setThinking(false)}}
function setCanSend(value){input.disabled=!value;send.disabled=!value;start.hidden=value;stop.hidden=!value;input.placeholder=value?'Digite / para comandos ou $ para skills…':'Start the session before sending a message'}
function setContextIndicator(indicator){if(!indicator)return;const badge=document.getElementById('context-badge'),ring=document.getElementById('context-ring'),label=document.getElementById('context-label'),key=document.getElementById('context-key'),value=document.getElementById('context-value');badge.hidden=false;badge.dataset.tone=indicator.tone;badge.title=indicator.tooltip;badge.setAttribute('aria-label',indicator.tooltip);ring.style.setProperty('--context-progress',String(indicator.percent));label.textContent=indicator.label;key.hidden=false;value.textContent=indicator.label.replace(/^ctx /,'');value.hidden=false;renderContextDetails(indicator)}
function apply(frame,contextIndicator){if(contextIndicator)setContextIndicator(contextIndicator);if(frame.frame==='row')renderRow(frame.row);if(frame.frame==='update'){const old=rows.get(frame.row.id);if(old)renderRow({...old,...frame.row,meta:{...(old.meta||{}),...(frame.row.meta||{})}})}if(frame.frame==='remove'){document.getElementById('row-'+CSS.escape(frame.id))?.remove();rows.delete(frame.id)}if(frame.frame==='status'){const status=document.getElementById('status'),state=frame.session_status||'';status.textContent=frame.verb||state;status.dataset.running=String(Boolean(frame.running));const normalized=state.toLowerCase(),active=!['not-started','stopped','error'].includes(normalized);setCanSend(active);const dot=document.getElementById('current-session-dot');if(dot)dot.dataset.state=normalized==='error'?'error':normalized==='not-started'?'not-started':normalized==='stopped'?'stopped':'active';setThinking(Boolean(frame.verb),frame.verb||'Agent is thinking…');const model=frame.facts?.model||frame.model;if(model){const badge=document.getElementById('model');badge.textContent=model;badge.hidden=false}const mode=frame.facts?.mode||frame.mode||frame.collaboration_mode_kind||frame.permission_mode||frame.approval_mode;if(mode)document.getElementById('mode').textContent='modo '+mode}}
window.addEventListener('message',({data})=>{if(data.type==='completions'){completions=data.items||[];renderCompletions()}if(data.type==='runtimeSettings'){if(data.settings.mode)document.getElementById('mode').textContent='modo '+data.settings.mode;if(data.settings.model){const model=document.getElementById('model');model.textContent=data.settings.model;model.hidden=false}}if(data.type==='tmuxState'){document.querySelectorAll('.tmux-state').forEach(tmux=>{tmux.textContent=(tmux.classList.contains('tmux-state-badge')?'tmux: ':'')+data.label;tmux.classList.toggle('problem',['not-running','dead'].includes(data.runtime?.state));tmux.dataset.state=data.runtime?.state||'';tmux.dataset.agentRunning=String(Boolean(data.runtime?.agentRunning));tmux.title=(data.runtime?.windows?'Windows: '+data.runtime.windows+' · ':'')+data.label})}if(data.type==='snapshot'){list.innerHTML='';rows.clear();data.rows.forEach(r=>renderRow(r));older.hidden=!data.hasOlder;apply({frame:'status',...(data.status||{})},data.contextIndicator);scrollTo(0,document.body.scrollHeight)}if(data.type==='older'){[...data.rows].reverse().forEach(r=>renderRow(r,true));older.hidden=!data.hasOlder}if(data.type==='frame')apply(data.frame,data.contextIndicator);if(data.type==='error'){document.getElementById('error').textContent=data.message;awaitingTranscript=false;setThinking(false);document.getElementById('run-tests').disabled=false;document.getElementById('open-tests').disabled=false;document.getElementById('model').disabled=false}if(data.type==='sending'){send.disabled=data.sending;send.textContent=data.sending?'Sending…':'Send';if(data.sending){document.getElementById('error').textContent='';deliveryStatus.hidden=false;deliveryStatus.dataset.tone='progress';deliveryStatus.dataset.state='sending';deliveryLabel.textContent=data.command?'Executando '+data.text+'…':'Enviando mensagem ao Agent Deck…';deliveryDetail.hidden=true;awaitingTranscript=!data.command;setThinking(true,data.command?'Executando comando…':'Enviando mensagem…')}if(!data.sending&&data.receipt){input.value='';completionList.hidden=true;renderDelivery(data.delivery);if(data.command)showCopyToast(data.delivery?.label||data.receipt)}}if(data.type==='deliveryStatus')renderDelivery(data.delivery);if(data.type==='modelChanging'){const model=document.getElementById('model');model.hidden=false;model.disabled=data.changing;model.textContent=data.changing?'modelo '+data.model+'…':data.model;if(!data.changing)showCopyToast('Modelo alterado para '+data.model)}if(data.type==='starting'){start.disabled=data.starting;start.textContent=data.starting?'Starting…':'Start session';if(data.starting)setThinking(true,'Starting session…');if(!data.starting&&data.succeeded!==false){setCanSend(true);notice.textContent='Session started';setThinking(false)}if(data.succeeded===false)setThinking(false)}if(data.type==='vscodeAction'){const button=document.getElementById(data.action==='runTests'?'run-tests':'open-tests');button.disabled=data.running;notice.textContent=data.message}if(data.type==='sessionIdCopied')showCopyToast(data.message)});
window.addEventListener('message',({data})=>{if(data.type==='queue')renderQueue(data.queue);if(data.type==='queueLoading')queueRefresh.disabled=data.loading;if(data.type==='queueCancelling')document.querySelectorAll('.queue-cancel').forEach(button=>button.disabled=Boolean(data.sendId));if(data.type==='queueCancelled')showCopyToast(data.message);if(data.type==='queueError'){queueList.replaceChildren();const error=document.createElement('li');error.className='queue-empty';error.textContent='Não foi possível carregar a fila: '+data.message;queueList.append(error)}});
window.addEventListener('message',({data})=>{if(data.type==='commandOutput'){renderRow({id:'command-output-'+Date.now(),kind:'command_output',ts:new Date().toISOString(),title:data.command,body:data.output});scrollTo({top:document.body.scrollHeight,behavior:'smooth'})}});
window.addEventListener('message',({data})=>{const status=data.type==='frame'&&data.frame?.frame==='status'?data.frame:data.type==='snapshot'?data.status:undefined;if(status&&status.running===false&&['waiting','idle','stopped','error'].includes(String(status.session_status||'').toLowerCase())){awaitingTranscript=false;setThinking(false)}});
window.addEventListener('message',({data})=>{if(data.type!=='stopping')return;stop.disabled=data.stopping;stop.textContent=data.stopping?'■ Stopping…':'■ Stop';if(data.stopping){setThinking(false);notice.textContent='Stopping session…'}else if(data.succeeded!==false){setCanSend(false);notice.textContent='Session stopped';document.getElementById('status').textContent='stopped';const dot=document.getElementById('current-session-dot');if(dot)dot.dataset.state='stopped'}});
document.getElementById('composer').addEventListener('submit',e=>{e.preventDefault();if(input.value.trim()){setThinking(true,'Sending message…');vscode.postMessage({type:'send',text:input.value})}});input.addEventListener('input',()=>{selectedCompletion=0;renderCompletions()});input.addEventListener('keydown',e=>{if(!completionList.hidden&&['ArrowDown','ArrowUp','Enter','Tab','Escape'].includes(e.key)){e.preventDefault();if(e.key==='Escape')completionList.hidden=true;else if(e.key==='ArrowDown'){selectedCompletion=(selectedCompletion+1)%filteredCompletions.length;renderCompletions()}else if(e.key==='ArrowUp'){selectedCompletion=(selectedCompletion-1+filteredCompletions.length)%filteredCompletions.length;renderCompletions()}else if(filteredCompletions[selectedCompletion])chooseCompletion(filteredCompletions[selectedCompletion]);return}if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)){e.preventDefault();document.getElementById('composer').requestSubmit()}});older.onclick=()=>vscode.postMessage({type:'older'});start.onclick=()=>vscode.postMessage({type:'start'});stop.onclick=()=>vscode.postMessage({type:'stop'});document.getElementById('attach').onclick=()=>vscode.postMessage({type:'attach'});
document.getElementById('back')?.addEventListener('click',()=>vscode.postMessage({type:'back'}));
document.getElementById('run-tests').addEventListener('click',()=>vscode.postMessage({type:'runTests'}));
document.getElementById('open-tests').addEventListener('click',()=>vscode.postMessage({type:'openTestExplorer'}));
document.getElementById('copy-session-id').addEventListener('click',()=>vscode.postMessage({type:'copySessionId'}));
document.getElementById('model').addEventListener('click',()=>vscode.postMessage({type:'chooseModel'}));
document.getElementById('context-badge').addEventListener('click',()=>{const popover=document.getElementById('context-popover');popover.hidden=!popover.hidden});
queueRefresh.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();vscode.postMessage({type:'refreshQueue'})});
queueOpen.addEventListener('click',()=>{queuePanel.open=true;queuePanel.scrollIntoView({behavior:'smooth',block:'start'});setTimeout(()=>queueRefresh.focus(),250)});
queueList.addEventListener('click',event=>{const button=event.target.closest('.queue-cancel');if(button)vscode.postMessage({type:'cancelQueue',text:button.dataset.sendId})});
document.getElementById('close-context').addEventListener('click',()=>{document.getElementById('context-popover').hidden=true});
document.querySelectorAll('.tab').forEach(tab=>tab.addEventListener('click',()=>vscode.postMessage({type:'activateTab',text:tab.dataset.tabId})));
document.getElementById('close-chat')?.addEventListener('click',()=>vscode.postMessage({type:'closeTab',text:${JSON.stringify(session.id)}}));
</script></body></html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
}

function detailRow(label: string, value: string, problem = false): string {
  return `<span class="key">${escapeHtml(label)}</span><span class="value${problem ? ' problem' : ''}">${escapeHtml(value)}</span>`;
}

function formatTimestamp(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
