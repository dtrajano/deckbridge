export function contextPercentage(value: unknown): number | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const root = value as Record<string, unknown>;
  const containers = [root, record(root.totals), record(root.facts), record(root.tokens), record(root.usage), record(root.context)].filter(Boolean) as Record<string, unknown>[];

  for (const container of containers) {
    for (const key of ['window_percent', 'context_percent', 'context_pct', 'context_percentage', 'percentage']) {
      const percent = numeric(container[key]);
      if (percent !== undefined) return clamp(percent);
    }
  }

  for (const container of containers) {
    const used = firstNumber(container, 'context_tokens', 'used_tokens', 'used', 'input_tokens');
    const total = firstNumber(container, 'context_window', 'context_length', 'max_tokens', 'capacity', 'total');
    if (used !== undefined && total && total > 0) return clamp((used / total) * 100);
  }

  for (const container of containers) {
    for (const candidate of Object.values(container)) {
      if (typeof candidate !== 'string') continue;
      const match = candidate.match(/(?:context|ctx)[^\d]{0,12}(\d+(?:\.\d+)?)\s*%/i);
      if (match) return clamp(Number(match[1]));
    }
  }
  return undefined;
}

export type ContextIndicatorTone = 'normal' | 'warning' | 'critical';

export interface ContextIndicatorModel {
  percent: number;
  label: string;
  tone: ContextIndicatorTone;
  tooltip: string;
}

export interface ContextCategoryModel {
  title: string;
  tokens?: number;
  measurement: string;
}

export interface ContextOverviewModel extends ContextIndicatorModel {
  adapter: string;
  fixedTokens?: number;
  windowTokens?: number;
  potentialTokens?: number;
  measurement: string;
  categories: ContextCategoryModel[];
  warnings: string[];
}

export function contextIndicatorModel(value: number): ContextIndicatorModel {
  const percent = Math.min(100, Math.max(0, Math.round(value * 10) / 10));
  const remaining = Math.round((100 - percent) * 10) / 10;
  const tone: ContextIndicatorTone = percent >= 90 ? 'critical' : percent >= 70 ? 'warning' : 'normal';
  const situation = tone === 'critical' ? 'Context almost full' : tone === 'warning' ? 'Context getting full' : 'Context healthy';
  return {
    percent,
    label: `ctx ${formatPercent(percent)}`,
    tone,
    tooltip: `${situation}: ${formatPercent(percent)} used, ${formatPercent(remaining)} remaining.`
  };
}

export function contextOverviewModel(value: unknown, fallbackAdapter: string, livePercent?: number): ContextOverviewModel | undefined {
  const root = record(value);
  if (!root) return livePercent === undefined ? undefined : overviewFallback(fallbackAdapter, livePercent);
  const report = record(root.report);
  const totals = record(root.totals);
  const fixed = record(totals?.fixed);
  const potential = record(totals?.potential);
  const window = record(report?.window);
  const anchorTokens = record(record(report?.anchor)?.tokens);
  const fixedPercent = numeric(totals?.window_percent);
  const percent = livePercent ?? fixedPercent;
  if (percent === undefined) return undefined;
  const indicator = contextIndicatorModel(percent);
  const adapter = text(record(report?.capabilities)?.adapter) ?? text(report?.adapter) ?? fallbackAdapter;
  const fixedTokens = numeric(fixed?.tokens);
  const windowTokens = numeric(window?.tokens);
  const potentialTokens = numeric(potential?.tokens);
  const measurement = text(anchorTokens?.provenance) ?? text(report?.basis) ?? 'unavailable';
  const categories = Array.isArray(report?.categories)
    ? report.categories.map(categoryModel).filter((item): item is ContextCategoryModel => Boolean(item)).slice(0, 8)
    : [];
  const warnings = Array.isArray(report?.caveats)
    ? report.caveats.map((item) => record(item)).filter((item) => item && ['warning', 'bug', 'error'].includes(text(item.severity) ?? '')).map((item) => text(item?.message)).filter((item): item is string => Boolean(item)).slice(0, 3)
    : [];
  const scope = livePercent === undefined ? 'overhead inicial' : 'contexto atual';
  return {
    ...indicator,
    adapter,
    fixedTokens,
    windowTokens,
    potentialTokens,
    measurement,
    categories,
    warnings,
    tooltip: `${adapter} · ${scope}: ${formatPercent(indicator.percent)} · ${measurement}. Clique para ver detalhes.`
  };
}

function overviewFallback(adapter: string, percent: number): ContextOverviewModel {
  return { ...contextIndicatorModel(percent), adapter, measurement: 'unavailable', categories: [], warnings: [] };
}

function categoryModel(value: unknown): ContextCategoryModel | undefined {
  const category = record(value);
  if (!category) return undefined;
  const title = text(category.title) ?? text(category.name);
  if (!title) return undefined;
  const items = Array.isArray(category.items) ? category.items : [];
  let tokens = 0;
  let foundTokens = false;
  let measurement = 'unavailable';
  for (const item of items) {
    const actual = record(record(record(item)?.load)?.actual);
    const itemTokens = numeric(actual?.tokens);
    if (itemTokens !== undefined) {
      tokens += itemTokens;
      foundTokens = true;
    }
    measurement = text(actual?.provenance) ?? measurement;
  }
  return { title, tokens: foundTokens ? tokens : undefined, measurement };
}

function formatPercent(value: number): string {
  return `${value.toLocaleString('en-US', { maximumFractionDigits: 1 })}%`;
}

export function buildContextArgs(sessionId: string): string[] {
  return ['session', 'context', sessionId, '--tab', 'overview', '--json'];
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function numeric(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function firstNumber(value: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const result = numeric(value[key]);
    if (result !== undefined) return result;
  }
  return undefined;
}

function clamp(value: number): number {
  return Math.round(Math.max(0, Math.min(100, value)) * 10) / 10;
}
