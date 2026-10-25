export function paneOutputDelta(before: string, after: string): string | undefined {
  const oldLines = normalizedLines(before);
  const newLines = normalizedLines(after);
  let common = 0;
  while (common < oldLines.length && common < newLines.length && oldLines[common] === newLines[common]) common += 1;
  if (common === oldLines.length) return clean(newLines.slice(common));

  const maxOverlap = Math.min(oldLines.length, newLines.length);
  for (let size = maxOverlap; size > 0; size -= 1) {
    if (oldLines.slice(-size).every((line, index) => line === newLines[index])) {
      return clean(newLines.slice(size));
    }
  }
  return clean(newLines);
}

export function commandOutputIsError(output: string): boolean {
  return /(?:^|\n)\s*(?:error|fatal|exception|panic|failed|failure)\b/i.test(output)
    || /(?:command not found|permission denied|no such file or directory|sudo:\s+.*(?:password is required|a password is required)|exit(?:ed| status)?\s*(?:code\s*)?[1-9]\d*)/i.test(output)
    || /(?:stream\s+(?:disconnected|closed)|closed\s+before\s+(?:completion|response)|disconnected\s+before\s+(?:completion|response))/i.test(output)
    || /"(?:type|status|error|level)"\s*:\s*(?:"(?:error|invalid_request_error|failed)"|4\d\d|5\d\d)/i.test(output);
}

export function terminalErrorExcerpt(output: string): string | undefined {
  const lines = output.replace(/\r/g, '').split('\n').map((line) => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (!commandOutputIsError(lines[index])) continue;
    const block = [lines[index]];
    for (let next = index + 1; next < lines.length && block.length < 24; next += 1) {
      // tmux may wrap one JSON diagnostic across physical lines. Keep those
      // continuations, but stop when the shell/agent prompt starts again.
      if (/^(?:[›>$#]|ask\s+\w+\s+to\s+do\s+anything)/i.test(lines[next])) break;
      block.push(lines[next]);
    }
    return block.join('\n');
  }
  return undefined;
}

function normalizedLines(value: string): string[] {
  return value.replace(/\r/g, '').split('\n');
}

function clean(lines: string[]): string | undefined {
  const text = lines.join('\n').trim();
  return text || undefined;
}
