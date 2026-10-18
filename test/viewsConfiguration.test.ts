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
});
