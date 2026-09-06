// Browser-safe, executable recipe contract. No commands, paths or arbitrary actors.
export const FUSE_COMMIT = '9ef2f99af73497706a097d99a2aaac2f08405370';
export type RunSpec = {
  schema: 'simulation-runspec.v1'; engineId: 'fuse'; engineCommit: typeof FUSE_COMMIT;
  recipe: 'diiid-lmode-fluxmatch' | 'diiid-default-stationary'; model: 'TGLFNN' | 'GKNN' | 'QLNN';
  solver: { maxIterations: number; xtol: number; stationaryIterations: number; stationaryThreshold: number };
  resources: { threads: number; timeoutSeconds: number };
};
export function defaultRunSpec(): RunSpec {
  return { schema: 'simulation-runspec.v1', engineId: 'fuse', engineCommit: FUSE_COMMIT, recipe: 'diiid-lmode-fluxmatch', model: 'TGLFNN', solver: { maxIterations: 300, xtol: 0.001, stationaryIterations: 5, stationaryThreshold: 0.05 }, resources: { threads: 8, timeoutSeconds: 1800 } };
}
export function parseRunSpec(value: unknown): RunSpec {
  const fail = (): never => { throw new Error('INVALID_RUN_SPEC'); };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  const r = value as RunSpec;
  const exact = (o: object, keys: string[]) => Object.keys(o).length === keys.length && keys.every(k => Object.hasOwn(o, k));
  const bounded = (n: number, min: number, max: number) => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
  if (!exact(r, ['schema', 'engineId', 'engineCommit', 'recipe', 'model', 'solver', 'resources']) || r.schema !== 'simulation-runspec.v1' || r.engineId !== 'fuse' || r.engineCommit !== FUSE_COMMIT) return fail();
  if (!['diiid-lmode-fluxmatch', 'diiid-default-stationary'].includes(r.recipe) || !['TGLFNN', 'GKNN', 'QLNN'].includes(r.model) || (r.recipe === 'diiid-default-stationary' && r.model !== 'TGLFNN')) return fail();
  if (!r.solver || !exact(r.solver, ['maxIterations','xtol','stationaryIterations','stationaryThreshold']) || !Number.isInteger(r.solver.maxIterations) || !bounded(r.solver.maxIterations, 1, 300) || !bounded(r.solver.xtol, 1e-5, 0.01) || !Number.isInteger(r.solver.stationaryIterations) || !bounded(r.solver.stationaryIterations, 2, 10) || !bounded(r.solver.stationaryThreshold, 0.001, 0.1)) return fail();
  if (!r.resources || !exact(r.resources, ['threads','timeoutSeconds']) || !Number.isInteger(r.resources.threads) || !bounded(r.resources.threads, 1, 8) || !Number.isInteger(r.resources.timeoutSeconds) || !bounded(r.resources.timeoutSeconds, 60, 7200)) return fail();
  return { schema:r.schema,engineId:r.engineId,engineCommit:r.engineCommit,recipe:r.recipe,model:r.model,solver:{maxIterations:r.solver.maxIterations,xtol:r.solver.xtol,stationaryIterations:r.solver.stationaryIterations,stationaryThreshold:r.solver.stationaryThreshold},resources:{threads:r.resources.threads,timeoutSeconds:r.resources.timeoutSeconds} };
}
