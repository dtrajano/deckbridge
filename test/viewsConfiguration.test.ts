import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

interface ViewContribution {
  id: string;
  when?: string;
}

describe('DeckBridge view navigation', () => {
  const packageJson = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'));
  const views = packageJson.contributes.views.deckbridge as ViewContribution[];

  it('shows either the session list or the chat, never both', () => {
    const sessions = views.find((view) => view.id === 'deckbridge.sessions');
    const chat = views.find((view) => view.id === 'deckbridge.chat');

    assert.equal(sessions?.when, 'deckbridge.chatOpen != true');
    assert.equal(chat?.when, 'deckbridge.chatOpen');
  });

  it('shows the full Agent Deck session inventory by default', () => {
    assert.equal(packageJson.contributes.configuration.properties['deckbridge.showAllSessions'].default, true);
  });

  it('contributes one visible expand/collapse action to the session tree', () => {
    const commands = (packageJson.contributes.commands as Array<{ command: string }>).map((command) => command.command);
    assert.ok(commands.includes('deckbridge.expandGroups'));
    assert.ok(commands.includes('deckbridge.collapseGroups'));
    assert.equal(commands.includes('deckbridge.toggleGroups'), false);
    const titleCommands = (packageJson.contributes.menus['view/title'] as Array<{ command: string }>).map((command) => command.command);
    assert.deepEqual(titleCommands.filter((command) => command === 'deckbridge.expandGroups' || command === 'deckbridge.collapseGroups'), ['deckbridge.expandGroups', 'deckbridge.collapseGroups']);
  });
});
