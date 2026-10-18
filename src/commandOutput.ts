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

function normalizedLines(value: string): string[] {
  return value.replace(/\r/g, '').split('\n');
}

function clean(lines: string[]): string | undefined {
  const text = lines.join('\n').trim();
  return text || undefined;
}
