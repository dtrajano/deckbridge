export type AgentDeckDiagnosticKind = 'readonly-storage' | 'missing-executable' | 'generic';

export interface AgentDeckDiagnostic {
  kind: AgentDeckDiagnosticKind;
  title: string;
  detail: string;
}

export function diagnoseAgentDeckError(message: string): AgentDeckDiagnostic {
  if (/readonly database|attempt to write a readonly database|failed to initialize storage/i.test(message)) {
    return {
      kind: 'readonly-storage',
      title: 'Agent Deck não consegue gravar o banco de sessões',
      detail: `${message}\n\nFeche outras instâncias do Agent Deck e verifique o host remoto. O DeckBridge não apaga nem altera o banco automaticamente.`
    };
  }
  if (/executable was not found|command not found|enoent/i.test(message)) {
    return {
      kind: 'missing-executable',
      title: 'Agent Deck não foi encontrado neste host',
      detail: `${message}\n\nVerifique a instalação e o PATH do host remoto SSH.`
    };
  }
  return { kind: 'generic', title: 'Agent Deck retornou um erro', detail: message };
}
