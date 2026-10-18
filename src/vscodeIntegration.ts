export type ChatVsCodeAction = 'runTests' | 'openTestExplorer';

export interface VsCodeActionDescriptor {
  command: string;
  progressMessage: string;
  completionMessage: string;
}

export function vscodeActionDescriptor(action: ChatVsCodeAction): VsCodeActionDescriptor {
  if (action === 'runTests') {
    return {
      command: 'testing.runAll',
      progressMessage: 'Starting tests in VS Code…',
      completionMessage: 'Tests started. Open Test Explorer to follow the results.'
    };
  }
  return {
    command: 'workbench.view.testing',
    progressMessage: 'Opening Test Explorer…',
    completionMessage: 'Test Explorer opened.'
  };
}
