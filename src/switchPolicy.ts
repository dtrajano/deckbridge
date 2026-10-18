export interface SwitchAssessment {
  capability: string;
  execution: string;
  fidelity: string;
  allowed: boolean;
}

export function assessSwitch(preview: Record<string, unknown>): SwitchAssessment {
  const capability = textField(preview, 'capability', 'capability_level') || 'unknown';
  const execution = textField(preview, 'execution', 'execution_status') || 'unknown';
  const fidelity = textField(preview, 'fidelity', 'context_fidelity') || fidelitySummary(preview);
  return {
    capability,
    execution,
    fidelity,
    allowed: capability !== 'unsupported' && !['unsupported', 'planned'].includes(execution)
  };
}

function fidelitySummary(preview: Record<string, unknown>): string {
  const inclusions = preview.fidelity_inclusions;
  const exclusions = preview.fidelity_exclusions;
  if (Array.isArray(inclusions) || Array.isArray(exclusions)) {
    const kept = Array.isArray(inclusions) ? inclusions.length : 0;
    const omitted = Array.isArray(exclusions) ? exclusions.length : 0;
    return `${kept} context guarantees, ${omitted} exclusions`;
  }
  return 'bounded context handoff';
}

function textField(value: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) if (typeof value[key] === 'string') return value[key] as string;
  return undefined;
}
