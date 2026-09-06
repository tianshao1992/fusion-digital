export type SimulationResultEnvelope = {
  schema: 'simulation-result.v1'; resultProfile: string; id: string;
  authority: 'simulated'; recordKind: 'simulation-run'; execution: 'succeeded';
  assessment: 'passed-demo-criterion' | 'not-established';
  engine: { id: string; version: string; commit: string; runtime: { name: string; version: string }; threads: number };
};
// First supported scientific profile, not a universal IDS/engineering result schema.
export type SimulationRun = SimulationResultEnvelope & {
  resultProfile: 'fuse-demo.v1'; caseId: 'fpp-stationary' | 'diiid-fluxmatcher';
  metrics: { id: string; value: number; unit: string }[];
  convergence: { labels: string[]; values: number[]; threshold: number | null; kind: 'iterations' | 'variants'; calls?: number[] };
  solverTolerances?: { xtol: number };
  timing: { seconds: number; scope: 'simulation-stage' | 'upstream-execution' };
  source: { recordSha256: string; artifacts: { name: string; sha256: string }[] };
  traces?: { model: string; observations: { calls: number; residual: number }[] }[];
};
export type SimulationDraft = {
  schema: 'simulation-draft.v1'; name: string; caseId: 'fpp-stationary'; domainIds: ['physics']; engineId: 'fuse';
  parameters: { maxIterations: number; convergenceThreshold: number; threads: number; majorRadius: number; toroidalField: number; plasmaCurrent: number };
  authority: 'simulated'; executionReady: false;
};
export const DEFAULT_PARAMETERS = { maxIterations: 5, convergenceThreshold: 0.05, threads: 8, majorRadius: 4.9, toroidalField: 4.7, plasmaCurrent: 8 };
export function validateDraft(input: unknown): string[] {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return ['INVALID_DRAFT'];
  const d = input as Partial<SimulationDraft>; const e: string[] = [];
  if (d.schema !== 'simulation-draft.v1' || d.caseId !== 'fpp-stationary' || d.engineId !== 'fuse' || d.authority !== 'simulated' || d.executionReady !== false) e.push('UNSUPPORTED_CONFIGURATION');
  if (!Array.isArray(d.domainIds) || d.domainIds.length !== 1 || d.domainIds[0] !== 'physics') e.push('INVALID_DOMAIN');
  if (typeof d.name !== 'string' || !d.name.trim() || d.name.length > 100) e.push('INVALID_NAME');
  const p = d.parameters;
  if (!p || !Number.isInteger(p.maxIterations) || p.maxIterations < 1 || p.maxIterations > 10) e.push('INVALID_ITERATIONS');
  if (!p || !Number.isFinite(p.convergenceThreshold) || p.convergenceThreshold < 0.001 || p.convergenceThreshold > 0.1) e.push('INVALID_THRESHOLD');
  if (!p || !Number.isInteger(p.threads) || p.threads < 1 || p.threads > 8) e.push('INVALID_THREADS');
  if (!p || !Number.isFinite(p.majorRadius) || p.majorRadius < 0.1 || p.majorRadius > 20) e.push('INVALID_RADIUS');
  if (!p || !Number.isFinite(p.toroidalField) || p.toroidalField < 0.1 || p.toroidalField > 30) e.push('INVALID_FIELD');
  if (!p || !Number.isFinite(p.plasmaCurrent) || p.plasmaCurrent < 0.1 || p.plasmaCurrent > 30) e.push('INVALID_CURRENT');
  return e;
}
export function createDraft(name: string, parameters = DEFAULT_PARAMETERS): SimulationDraft {
  return { schema: 'simulation-draft.v1', name: name.trim(), caseId: 'fpp-stationary', domainIds: ['physics'], engineId: 'fuse', parameters: { majorRadius: parameters.majorRadius, toroidalField: parameters.toroidalField, plasmaCurrent: parameters.plasmaCurrent, maxIterations: parameters.maxIterations, convergenceThreshold: parameters.convergenceThreshold, threads: parameters.threads }, authority: 'simulated', executionReady: false };
}
export const metricLabels: Record<string, { zh: string; en: string }> = {
  fusion_power_MW: { zh: '聚变功率', en: 'Fusion power' }, fusion_gain_Q: { zh: '等离子体增益', en: 'Plasma gain' },
  plasma_current_MA: { zh: '等离子体电流', en: 'Plasma current' }, q95: { zh: '边缘安全因子', en: 'Edge safety factor' },
  major_radius_m: { zh: '大半径', en: 'Major radius' }, minor_radius_m: { zh: '小半径', en: 'Minor radius' },
  toroidal_field_T: { zh: '环向磁场', en: 'Toroidal field' }, central_electron_temperature_keV: { zh: '中心电子温度', en: 'Central electron temperature' },
  central_ion_temperature_keV: { zh: '中心离子温度', en: 'Central ion temperature' }, central_electron_density_m3: { zh: '中心电子密度', en: 'Central electron density' },
  auxiliary_power_MW: { zh: '辅助加热功率', en: 'Auxiliary heating' }, power_through_separatrix_MW: { zh: '分离面通过功率', en: 'Separatrix power' }, H98y2: { zh: '约束增强因子', en: 'Confinement enhancement' },
};
export function formatMetric(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return Math.abs(value) >= 1e6 || (value !== 0 && Math.abs(value) < 0.001) ? value.toExponential(3) : new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(value);
}

export function parseSimulationRun(value: unknown): SimulationRun {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_RESULT');
  const r = value as SimulationRun;
  const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
  const token = (x: unknown) => typeof x === 'string' && /^[a-zA-Z0-9._-]{1,100}$/.test(x);
  const sha = (x: unknown, n = 64) => typeof x === 'string' && new RegExp(`^[a-f0-9]{${n}}$`).test(x);
  if (r.schema !== 'simulation-result.v1' || r.resultProfile !== 'fuse-demo.v1' || !token(r.id) || !['fpp-stationary', 'diiid-fluxmatcher'].includes(r.caseId) || r.authority !== 'simulated' || r.recordKind !== 'simulation-run' || r.execution !== 'succeeded' || !['passed-demo-criterion', 'not-established'].includes(r.assessment)) throw new Error('UNSUPPORTED_RESULT');
  if (!r.engine || !token(r.engine.id) || !token(r.engine.version) || !sha(r.engine.commit, 40) || !r.engine.runtime || !token(r.engine.runtime.name) || !token(r.engine.runtime.version) || !Number.isInteger(r.engine.threads) || r.engine.threads < 1 || r.engine.threads > 1024) throw new Error('INVALID_ENGINE');
  if (!Array.isArray(r.metrics) || r.metrics.length > 100 || r.metrics.some(m => !m || !Object.hasOwn(metricLabels, m.id) || !finite(m.value) || typeof m.unit !== 'string' || m.unit.length > 16) || new Set(r.metrics.map(m => m.id)).size !== r.metrics.length) throw new Error('INVALID_METRICS');
  const units: Record<string, string> = { fusion_power_MW: 'MW', fusion_gain_Q: '1', plasma_current_MA: 'MA', q95: '1', major_radius_m: 'm', minor_radius_m: 'm', toroidal_field_T: 'T', central_electron_temperature_keV: 'keV', central_ion_temperature_keV: 'keV', central_electron_density_m3: 'm⁻³', auxiliary_power_MW: 'MW', power_through_separatrix_MW: 'MW', H98y2: '1' };
  if (r.metrics.some(m => units[m.id] !== m.unit)) throw new Error('INCOMPATIBLE_UNIT');
  const c = r.convergence;
  if (!c || !Array.isArray(c.labels) || !Array.isArray(c.values) || !c.values.length || c.values.length > 1000 || c.labels.length !== c.values.length || c.labels.some(x => !token(x)) || c.values.some(x => !finite(x) || x < 0) || (c.threshold !== null && (!finite(c.threshold) || c.threshold <= 0)) || (c.kind !== 'iterations' && c.kind !== 'variants')) throw new Error('INVALID_CONVERGENCE');
  if ((r.caseId === 'fpp-stationary') !== (c.kind === 'iterations')) throw new Error('INVALID_PROFILE');
  if (new Set(c.labels).size !== c.labels.length) throw new Error('DUPLICATE_CONVERGENCE_LABEL');
  if ((c.kind === 'variants' && c.threshold !== null) || (c.kind === 'iterations' && c.threshold === null)) throw new Error('INVALID_RESIDUAL_CRITERION');
  if (r.solverTolerances && (!finite(r.solverTolerances.xtol) || r.solverTolerances.xtol <= 0)) throw new Error('INVALID_SOLVER_TOLERANCE');
  if (c.calls && (!Array.isArray(c.calls) || c.calls.length !== c.values.length || c.calls.some(n => !Number.isInteger(n) || n < 0))) throw new Error('INVALID_CALLS');
  if (r.assessment === 'passed-demo-criterion' && (c.kind !== 'iterations' || c.threshold === null || c.values.at(-1)! > c.threshold)) throw new Error('INCONSISTENT_ASSESSMENT');
  if (!r.timing || !finite(r.timing.seconds) || r.timing.seconds < 0 || !['simulation-stage', 'upstream-execution'].includes(r.timing.scope)) throw new Error('INVALID_TIMING');
  if (!r.source || !sha(r.source.recordSha256) || !Array.isArray(r.source.artifacts) || r.source.artifacts.length > 20 || r.source.artifacts.some(a => !a || !token(a.name) || !sha(a.sha256))) throw new Error('INVALID_SOURCE');
  if (r.traces !== undefined && (!Array.isArray(r.traces) || r.traces.length > 10 || r.traces.some(t => !t || !token(t.model) || !Array.isArray(t.observations) || t.observations.length > 5000 || t.observations.some(p => !p || !Number.isInteger(p.calls) || p.calls < 0 || !finite(p.residual) || p.residual < 0)))) throw new Error('INVALID_TRACES');
  if (r.traces?.length) {
    if (c.kind !== 'variants' || r.traces.length !== c.labels.length || new Set(r.traces.map(t => t.model)).size !== r.traces.length) throw new Error('INCONSISTENT_TRACES');
    for (const trace of r.traces) {
      const index = c.labels.indexOf(trace.model); const last = trace.observations.at(-1);
      if (index < 0 || !last || last.residual !== c.values[index] || (c.calls && last.calls !== c.calls[index]) || trace.observations.some((p,i) => i > 0 && p.calls <= trace.observations[i - 1].calls)) throw new Error('INCONSISTENT_TRACES');
    }
  }
  // Rebuild from an allowlist; imported objects must not bring extra local/private metadata into exports.
  return { schema: r.schema, resultProfile: r.resultProfile, id: r.id, caseId: r.caseId, authority: r.authority, recordKind: r.recordKind, execution: r.execution, assessment: r.assessment,
    engine: { id: r.engine.id, version: r.engine.version, commit: r.engine.commit, runtime: { name: r.engine.runtime.name, version: r.engine.runtime.version }, threads: r.engine.threads },
    metrics: r.metrics.map(m => ({ id: m.id, value: m.value, unit: m.unit })),
    convergence: { kind: c.kind, labels: [...c.labels], values: [...c.values], threshold: c.threshold, ...(c.calls ? { calls: [...c.calls] } : {}) },
    timing: { seconds: r.timing.seconds, scope: r.timing.scope }, source: { recordSha256: r.source.recordSha256, artifacts: r.source.artifacts.map(a => ({ name: a.name, sha256: a.sha256 })) },
    ...(r.solverTolerances ? { solverTolerances: { xtol: r.solverTolerances.xtol } } : {}),
    ...(r.traces ? { traces: r.traces.map(t => ({ model: t.model, observations: t.observations.map(p => ({ calls: p.calls, residual: p.residual })) })) } : {}),
  };
}
