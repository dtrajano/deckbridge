import { AgentDeckSession } from './types';

export class ChatNavigationState {
  private readonly opened: AgentDeckSession[] = [];
  private activeId?: string;
  private visible = false;

  get session(): AgentDeckSession | undefined {
    return this.opened.find((session) => session.id === this.activeId);
  }

  get tabs(): readonly AgentDeckSession[] {
    return this.opened;
  }

  get isOpen(): boolean {
    return this.visible && this.session !== undefined;
  }

  open(session: AgentDeckSession): void {
    const index = this.opened.findIndex((candidate) => candidate.id === session.id);
    if (index === -1) this.opened.push(session);
    else this.opened[index] = session;
    this.activeId = session.id;
    this.visible = true;
  }

  activate(id: string): boolean {
    if (!this.opened.some((session) => session.id === id)) return false;
    this.activeId = id;
    this.visible = true;
    return true;
  }

  close(id: string): AgentDeckSession | undefined {
    const index = this.opened.findIndex((session) => session.id === id);
    if (index === -1) return this.session;
    const wasActive = this.activeId === id;
    this.opened.splice(index, 1);
    if (wasActive) this.activeId = this.opened[Math.min(index, this.opened.length - 1)]?.id;
    if (this.opened.length === 0) this.visible = false;
    return this.session;
  }

  back(): void {
    this.visible = false;
  }
}

export async function returnToSessionList(
  refresh: () => Promise<void>,
  focus: () => Promise<void>
): Promise<void> {
  await refresh();
  await focus();
}
