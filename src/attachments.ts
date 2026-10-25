export interface AttachmentPayload {
  name: string;
  type: string;
  size: number;
  dataBase64: string;
}

export interface MaterializedAttachments {
  imagePaths: string[];
  prompt: string;
}

export function attachmentPrompt(attachments: readonly AttachmentPayload[], paths: readonly string[]): string {
  return attachments.map((attachment, index) => {
    const path = paths[index];
    return `[Arquivo anexado: ${attachment.name}]\nCaminho local: ${path}\nTipo: ${attachment.type || 'desconhecido'}\nTamanho: ${attachment.size} bytes`;
  }).join('\n\n');
}

export function imageAttachmentArgs(imagePaths: readonly string[]): string[] {
  return imagePaths.flatMap((imagePath) => ['--image', imagePath]);
}

export function imagePathsForTool(tool: string, imagePaths: readonly string[]): string[] {
  return ['claude', 'gemini'].includes(tool.trim().toLowerCase()) ? [...imagePaths] : [];
}
