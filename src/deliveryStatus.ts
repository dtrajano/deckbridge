export type DeliveryTone = 'progress' | 'success' | 'warning' | 'error';

export interface DeliveryStatusModel {
  state: string;
  label: string;
  detail?: string;
  tone: DeliveryTone;
  terminal: boolean;
}

export function sendIdFromReceipt(receipt: Record<string, unknown>): string | undefined {
  return typeof receipt.send_id === 'string' && receipt.send_id ? receipt.send_id : undefined;
}

export function deliveryStatusModel(receipt: Record<string, unknown>): DeliveryStatusModel {
  const state = firstString(receipt, 'state', 'verdict', 'delivery') ?? 'accepted';
  const reason = receipt.recovered_blocker === 'codex-update-prompt'
    ? 'A tela de atualização do Codex foi ignorada automaticamente.'
    : firstString(receipt, 'reason', 'error', 'fallback_reason');
  const settled = receipt.settled === true;
  switch (state) {
    case 'queued': return { state, label: 'Aguardando o agente ficar disponível', detail: reason, tone: 'progress', terminal: false };
    case 'typing': return { state, label: 'Digitando no agente…', detail: reason, tone: 'progress', terminal: false };
    case 'landed': return { state, label: 'Mensagem entregue ao agente', tone: 'success', terminal: true };
    case 'failed':
    case 'acceptance_refused': return { state, label: 'O Agent Deck não entregou a mensagem', detail: reason, tone: 'error', terminal: true };
    case 'typed':
    case 'submitted': return { state, label: settled ? 'Comando enviado; confirmação do transcript indisponível' : 'Enviado; aguardando confirmação…', detail: reason, tone: settled ? 'warning' : 'progress', terminal: settled };
    case 'unverified': return { state, label: receipt.transport === 'agent-deck-send-keys' ? 'Enviado ao pane pelo Agent Deck' : 'Comando enviado via tmux; confirmação indisponível', detail: reason, tone: 'warning', terminal: true };
    default: return { state, label: 'Mensagem aceita pelo Agent Deck', detail: reason, tone: 'progress', terminal: false };
  }
}

function firstString(value: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) if (typeof value[key] === 'string' && value[key]) return value[key] as string;
  return undefined;
}
