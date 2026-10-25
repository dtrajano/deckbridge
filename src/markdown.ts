export function markdownToHtml(source: string): string {
  const escaped = escapeHtml(source.replace(/\r/g, ''));
  const codeBlocks: string[] = [];
  let html = escaped.replace(/```([\w-]*)\n?([\s\S]*?)```/g, (_match, language: string, code: string) => {
    const className = language ? ` class="language-${escapeHtml(language)}"` : '';
    codeBlocks.push(`<pre><code${className}>${code.trimEnd()}</code></pre>`);
    return `§§CODEBLOCK${codeBlocks.length - 1}§§`;
  });
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li value="$1">$2</li>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/_([^_]+)_/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
    .replace(/\[([^\]]+)\]\((?!https?:\/\/)[^\s)]+\)/g, '$1')
    .replace(/(?:\n){2,}/g, '<br><br>')
    .replace(/\n/g, '<br>');
  html = html.replace(/(?:<li>.*<\/li>)(?:<br>)?/g, (list) => `<ul>${list.replace(/<br>/g, '')}</ul>`);
  return html.replace(/§§CODEBLOCK(\d+)§§/g, (_match, index: string) => codeBlocks[Number(index)]);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] ?? character));
}
