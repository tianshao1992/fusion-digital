export const VISUALIZATION_CONTEXT_MESSAGE = 'fusiondigital:set-context' as const;

export interface VisualizationContext {
  type: typeof VISUALIZATION_CONTEXT_MESSAGE;
  version: 2;
  record: {
    kind: 'facility-record' | 'simulation-run' | 'comparison-record' | 'design-asset';
    id: string;
    pulse?: string;
    run?: string;
  };
  artifactId: string;
  timestep?: number;
  timeSeconds?: number;
  field?: string;
  stablePartIds?: string[];
  intent?: 'inspect' | 'analyze' | 'immersive';
}

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function optionalFiniteNumber(value: unknown): number | undefined | null {
  if (value === undefined) return undefined;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function parseVisualizationContext(value: unknown): VisualizationContext | null {
  const root = object(value);
  if (!root || root.type !== VISUALIZATION_CONTEXT_MESSAGE || root.version !== 2) return null;
  const record = object(root.record);
  if (!record || typeof record.id !== 'string' || record.id.trim() === '') return null;
  if (
    record.kind !== 'facility-record' &&
    record.kind !== 'simulation-run' &&
    record.kind !== 'comparison-record' &&
    record.kind !== 'design-asset'
  ) {
    return null;
  }
  if (typeof root.artifactId !== 'string' || root.artifactId.trim() === '') return null;

  const timestep = optionalFiniteNumber(root.timestep);
  const timeSeconds = optionalFiniteNumber(root.timeSeconds);
  if (timestep === null || timeSeconds === null || (timestep !== undefined && timestep < 0)) return null;
  if (root.field !== undefined && typeof root.field !== 'string') return null;
  if (
    root.stablePartIds !== undefined &&
    (!Array.isArray(root.stablePartIds) || root.stablePartIds.some((id) => typeof id !== 'string'))
  ) {
    return null;
  }
  if (
    root.intent !== undefined &&
    root.intent !== 'inspect' &&
    root.intent !== 'analyze' &&
    root.intent !== 'immersive'
  ) {
    return null;
  }

  return {
    type: VISUALIZATION_CONTEXT_MESSAGE,
    version: 2,
    record: {
      kind: record.kind,
      id: record.id,
      pulse: typeof record.pulse === 'string' ? record.pulse : undefined,
      run: typeof record.run === 'string' ? record.run : undefined,
    },
    artifactId: root.artifactId,
    timestep,
    timeSeconds,
    field: typeof root.field === 'string' ? root.field : undefined,
    stablePartIds: root.stablePartIds as string[] | undefined,
    intent: root.intent as VisualizationContext['intent'],
  };
}
