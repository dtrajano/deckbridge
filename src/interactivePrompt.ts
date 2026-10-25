export interface InteractivePrompt {
  text: string;
  choices: Array<{ label: string; value: string }>;
  input?: { placeholder: string; secret: boolean };
}

/** Detects the short approval/question prompts emitted by terminal agents. */
export function detectInteractivePrompt(output: string): InteractivePrompt | undefined {
  const lines = output.replace(/\r/g, '').split('\n').map((line) => line.trim()).filter(Boolean).slice(-12);
  for (const text of lines.reverse()) {
    const lower = text.toLowerCase();
    if (/^\[sudo\]\s+password\s+for\s+.+:/i.test(text) || /^(?:password|passphrase)(?:\s+for\s+.+)?\s*:\s*$/i.test(text)) {
      return { text, choices: [], input: { placeholder: 'Digite a senha ou passphrase…', secret: true } };
    }
    if (/(?:press|aperte)\s+(?:enter|return)\s+(?:to|para)\s+(?:continue|continuar)/i.test(lower)) {
      return { text, choices: [{ label: 'Continuar', value: '' }, { label: 'Cancelar', value: '\u0003' }] };
    }
    if (/\[(?:y\s*\/\s*n|n\s*\/\s*y|yes\s*\/\s*no|no\s*\/\s*yes)\]/i.test(text)) {
      const yesFirst = /\[(?:y|yes)\s*\//i.test(text);
      return { text, choices: yesFirst
        ? [{ label: 'Permitir', value: 'y' }, { label: 'Recusar', value: 'n' }]
        : [{ label: 'Recusar', value: 'n' }, { label: 'Permitir', value: 'y' }] };
    }
    if (/(?:approve|approval|allow|permission|permiss[aã]o|autoriza|autorizar|admin|administrador)/i.test(lower)
      && /(?:\?|\b(?:allow|approve|deny|reject|permit|yes|no|sim|n[aã]o)\b)/i.test(lower)) {
      return { text, choices: [{ label: 'Permitir', value: 'y' }, { label: 'Recusar', value: 'n' }] };
    }
    if (/(?:do you want|would you like|should i|can i|continue|proceed|allow|approve|run|execute|deseja|posso|continuar|prosseguir|autoriza)/i.test(lower) && /\?/.test(text)) {
      return { text, choices: [{ label: 'Sim', value: 'y' }, { label: 'Não', value: 'n' }] };
    }
  }
  return undefined;
}
