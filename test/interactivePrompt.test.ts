import assert from 'node:assert/strict';
import test from 'node:test';
import { detectInteractivePrompt } from '../src/interactivePrompt';

test('detects yes/no approval prompts and preserves their text', () => {
  assert.deepEqual(detectInteractivePrompt('Plan ready\nAllow access to the workspace? [y/N]'), {
    text: 'Allow access to the workspace? [y/N]',
    choices: [{ label: 'Permitir', value: 'y' }, { label: 'Recusar', value: 'n' }]
  });
});

test('detects permission questions without a bracketed choice', () => {
  assert.deepEqual(detectInteractivePrompt('Request administrator permission?'), {
    text: 'Request administrator permission?',
    choices: [{ label: 'Permitir', value: 'y' }, { label: 'Recusar', value: 'n' }]
  });
});

test('ignores ordinary plan text', () => {
  assert.equal(detectInteractivePrompt('Plan: continue with the next step.'), undefined);
});

test('detects a free-form approval question without y/n markers', () => {
  assert.deepEqual(detectInteractivePrompt('Would you like to run this command?'), {
    text: 'Would you like to run this command?',
    choices: [{ label: 'Sim', value: 'y' }, { label: 'Não', value: 'n' }]
  });
});

test('detects sudo password prompts as secure free-text input', () => {
  assert.deepEqual(detectInteractivePrompt('[sudo] password for diogo:'), {
    text: '[sudo] password for diogo:',
    choices: [],
    input: { placeholder: 'Digite a senha ou passphrase…', secret: true }
  });
});

test('detects enter-to-continue prompts', () => {
  assert.deepEqual(detectInteractivePrompt('Press Enter to continue'), {
    text: 'Press Enter to continue',
    choices: [{ label: 'Continuar', value: '' }, { label: 'Cancelar', value: '\u0003' }]
  });
});

test('ignores an old prompt outside the active pane tail', () => {
  const oldPrompt = Array.from({ length: 12 }, (_, index) => `output ${index}`).join('\n');
  assert.equal(detectInteractivePrompt('Allow the old command? [y/N]\n' + oldPrompt), undefined);
});
