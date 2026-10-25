export interface WorkspaceContextInfo {
  fileName: string;
  path: string;
}

export function workspaceContextInfo(path: string | undefined): WorkspaceContextInfo | undefined {
  if (!path || !path.toLowerCase().endsWith('.code-workspace')) return undefined;
  const fileName = path.split(/[\\/]/).pop() || path;
  return { fileName, path };
}

export function formatWorkspaceContext(info: WorkspaceContextInfo, content: string): string {
  return `Contexto do workspace ${info.fileName} (${info.path}):\n\n\`\`\`json\n${content}\n\`\`\``;
}
