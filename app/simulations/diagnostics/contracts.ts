export type DiagnosticFrame = {
  time: number; te: number[]; ne: number[]; emission: number[];
  predicted: number[]; observed: number[]; sigma: number[]; densityFit: number;
  fitRmsSigma: number; heldOutRmsSigma: number; quadratureRelativeError: number;
};
export type DiagnosticCase = {
  id: string; name: string; device: string; engine: string; runId: string;
  source: { physicsSha256: string; geometrySha256: string; nativeSha256: string; recordSha256: string };
  rho: number[]; assumptions: string[];
  geometry: { kind: 'native-equilibrium' | 'shape-reconstruction'; boundary: [number, number][]; axis: [number, number];
    r: number[]; z: number[]; mask: boolean[];
    channels: { id: string; start: [number, number]; end: [number, number]; fit: boolean }[] };
  frames: DiagnosticFrame[];
  verification: { quadratureMaxRelativeError: number; stepHalvingRelativeError: number; gridRefinementRelativeError: number;
    gridRefinementScope: string; fieldGrid: number[]; displayGrid: number[]; stepM: number;
    independentDeviceValidation: false; sourceNumericalConvergence: 'not-established' };
};
export type DiagnosticData = {
  schema: 'synthetic-diagnostic.v1'; authority: 'synthetic'; recordKind: 'diagnostic-run';
  model: { id: string; formula: string; zeff: number; gaunt: number; emissionUnit: 'W/m^3'; signalUnit: 'W/m^2/sr'; spectralScope: string; atomicData: 'none'; reference: string };
  closure: { kind: string; injectedDensityScale: number; noiseRelativeSigma: number; seed: number; observations: string; validation: 'software-self-consistency-only'; feedbackToPhysicsSolver: false };
  provenance: { inputSha256: string; prepareSha256: string; workerSha256: string; python: string; versions: Record<string, string> };
  verification: { baseline: { name: string; expected: number; actual: number; relativeError: number }; elapsedSeconds: number };
  cases: DiagnosticCase[];
};
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const vector = (v: unknown, n?: number): v is number[] => Array.isArray(v) && v.length > 0 && v.length <= 30000 && (n === undefined || v.length === n) && v.every(finite);
const increasing = (v: number[]) => v.every((x, i) => !i || x > v[i-1]);
const digest = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const id = (v: unknown) => typeof v === 'string' && /^[a-zA-Z0-9._-]{1,120}$/.test(v);
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const point = (v: unknown) => vector(v, 2) && v[0] > 0;
function check(v: unknown, code = 'INVALID_DIAGNOSTIC_RESULT'): asserts v { if (!v) throw Error(code); }
export function parseDiagnosticData(value: unknown): DiagnosticData {
  check(object(value));
  const d = value as unknown as DiagnosticData;
  check(d.schema === 'synthetic-diagnostic.v1' && d.authority === 'synthetic' && d.recordKind === 'diagnostic-run');
  check(object(d.model) && d.model.id === 'hydrogenic-grey-free-free.v1' && d.model.zeff === 1 && d.model.gaunt === 1.2 && d.model.emissionUnit === 'W/m^3' && d.model.signalUnit === 'W/m^2/sr' && d.model.atomicData === 'none' && d.model.spectralScope === 'bolometric-grey-not-a-visible-band', 'DIAGNOSTIC_MODEL_OR_UNITS');
  check(object(d.closure) && d.closure.validation === 'software-self-consistency-only' && d.closure.feedbackToPhysicsSolver === false && d.closure.injectedDensityScale === 1.12 && d.closure.noiseRelativeSigma === .02, 'DIAGNOSTIC_AUTHORITY');
  check(object(d.provenance) && [d.provenance.inputSha256, d.provenance.prepareSha256, d.provenance.workerSha256].every(digest) && object(d.provenance.versions));
  check(object(d.verification) && object(d.verification.baseline) && finite(d.verification.elapsedSeconds) && d.verification.elapsedSeconds >= 0);
  check(finite(d.verification.baseline.relativeError) && d.verification.baseline.relativeError <= 1e-6);
  check(Array.isArray(d.cases) && d.cases.length === 3 && new Set(d.cases.map(c => c.id)).size === 3);
  for (const c of d.cases) {
    check(object(c) && id(c.id) && id(c.runId) && ['fuse', 'torax'].includes(c.engine) && typeof c.name === 'string' && typeof c.device === 'string');
    check(object(c.source) && ['physicsSha256', 'geometrySha256', 'nativeSha256', 'recordSha256'].every(k => digest(c.source[k as keyof typeof c.source])));
    check(vector(c.rho) && increasing(c.rho) && c.rho[0] === 0 && c.rho.at(-1) === 1);
    check(Array.isArray(c.assumptions) && c.assumptions.every(v => typeof v === 'string'));
    const g = c.geometry;
    check(object(g) && ['native-equilibrium', 'shape-reconstruction'].includes(g.kind));
    check(vector(g.r) && increasing(g.r) && vector(g.z) && increasing(g.z) && point(g.axis));
    check(Array.isArray(g.boundary) && g.boundary.length >= 4 && g.boundary.length <= 2048 && g.boundary.every(point));
    const n = g.r.length*g.z.length;
    check(n <= 30000 && Array.isArray(g.mask) && g.mask.length === n && g.mask.every(v => typeof v === 'boolean'));
    check(Array.isArray(g.channels) && g.channels.length === 12 && new Set(g.channels.map(v => v.id)).size === 12);
    check(g.channels.every((v, i) => id(v.id) && point(v.start) && point(v.end) && v.fit === (i%2 === 0)));
    check(Array.isArray(c.frames) && c.frames.length > 0 && c.frames.length <= 100);
    check(c.frames.every((f, i) => finite(f.time) && (!i || f.time > c.frames[i-1].time)));
    for (const f of c.frames) {
      check(vector(f.te, c.rho.length) && vector(f.ne, c.rho.length) && [...f.te, ...f.ne].every(v => v > 0));
      check(vector(f.emission, n) && f.emission.every(v => v >= 0));
      check(vector(f.predicted, 12) && vector(f.observed, 12) && vector(f.sigma, 12) && f.predicted.every(v => v > 0) && f.sigma.every(v => v > 0));
      check(finite(f.densityFit) && f.densityFit > 0 && finite(f.fitRmsSigma) && f.fitRmsSigma >= 0 && finite(f.heldOutRmsSigma) && f.heldOutRmsSigma >= 0 && finite(f.quadratureRelativeError) && f.quadratureRelativeError <= .001);
    }
    const v = c.verification;
    check(object(v) && v.independentDeviceValidation === false && v.sourceNumericalConvergence === 'not-established' && [v.quadratureMaxRelativeError, v.stepHalvingRelativeError, v.gridRefinementRelativeError, v.stepM].every(x => finite(x) && x >= 0));
    check(v.quadratureMaxRelativeError <= .001 && vector(v.displayGrid, 2) && v.displayGrid[0] === g.r.length && v.displayGrid[1] === g.z.length);
  }
  return d;
}

export function projectDensity(frame: DiagnosticFrame, scale: number) {
  check(finite(scale) && scale >= .5 && scale <= 1.5, 'DENSITY_SCALE_OUT_OF_RANGE');
  const predicted = frame.predicted.map(v => v*scale*scale);
  return { predicted, residual: predicted.map((v, i) => (v-frame.observed[i])/frame.sigma[i]) };
}
export function fitDensity(frame: DiagnosticFrame, fitMask: boolean[]): number {
  check(fitMask.length === frame.predicted.length && fitMask.some(Boolean));
  let numerator = 0, denominator = 0;
  fitMask.forEach((fit, i) => { if (fit) { const x = frame.predicted[i]/frame.sigma[i], y = frame.observed[i]/frame.sigma[i]; numerator += x*y; denominator += x*x; } });
  check(denominator > 0 && numerator > 0, 'UNIDENTIFIABLE_DENSITY_SCALE');
  return Math.sqrt(numerator/denominator);
}
