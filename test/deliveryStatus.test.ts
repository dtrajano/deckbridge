import assert from 'node:assert/strict';
import test from 'node:test';
import { deliveryStatusModel, sendIdFromReceipt } from '../src/deliveryStatus';

test('describes durable delivery progress and terminal outcomes', () => {
  assert.deepEqual(deliveryStatusModel({ verdict: 'queued' }), {
    state: 'queued', label: 'Aguardando o agente ficar disponível', detail: undefined, tone: 'progress', terminal: false
  });
  assert.equal(deliveryStatusModel({ state: 'landed' }).tone, 'success');
  assert.deepEqual(deliveryStatusModel({ state: 'failed', reason: 'target not running' }), {
    state: 'failed', label: 'O Agent Deck não entregou a mensagem', detail: 'target not running', tone: 'error', terminal: true
  });
});

test('makes unverified slash-command delivery explicit', () => {
  assert.deepEqual(deliveryStatusModel({ success: true, delivery: 'unverified', transport: 'tmux' }), {
    state: 'unverified', label: 'Comando enviado via tmux; confirmação indisponível', detail: undefined, tone: 'warning', terminal: true
  });
  assert.deepEqual(deliveryStatusModel({ success: true, delivery: 'unverified', transport: 'agent-deck-send-keys', fallback_reason: 'stale marker' }), {
    state: 'unverified', label: 'Enviado ao pane pelo Agent Deck', detail: 'stale marker', tone: 'warning', terminal: true
  });
});

test('extracts only a usable durable send id', () => {
  assert.equal(sendIdFromReceipt({ send_id: '01ABC' }), '01ABC');
  assert.equal(sendIdFromReceipt({ send_id: '' }), undefined);
  assert.equal(sendIdFromReceipt({}), undefined);
});

test('explains when a Codex update prompt was dismissed before delivery', () => {
  assert.equal(deliveryStatusModel({ delivery: 'unverified', recovered_blocker: 'codex-update-prompt' }).detail,
    'A tela de atualização do Codex foi ignorada automaticamente.');
});
