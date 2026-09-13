import { digest, isControlEngine, type ControlEngine, type ControlRunEntry } from './contracts.ts';

// Historical display evidence is deliberately NOT a control-result.v1 execution record.
// It cannot be submitted to a plant, published as a new cloud run, or handed to TORAX.
export type ControlExample = {
  schema: 'control-example.v1'; id: string; engineId: ControlEngine;
  authority: 'simulated'; recordKind: 'simulation-run'; mode: 'historical-replay';
  title: { zh: string; en: string };
  scenario: { shot: number | null; initialTimeSeconds: number | null; requestedDurationSeconds: number };
  time: { unit: 's'; reference: 'archive-relative'; values: number[] };
  signals: { id: string; unit: 'A' | 'm' | 'V' | '1' | 'code-unit'; values: (number | null)[] }[];
  boundary: { unit: 'm'; frames: { timeIndex: number; rz: [number, number][] }[] };
  source: { runId: string; recordedAt: string | null; codeCommit: string | null; imageId: string | null; reportedStatus: string; files: { name: string; sha256: string }[] };
  qualification: { decoding: 'legacy-adapter'; numericalConvergence: 'not-established'; deviceValidation: 'not-established'; toraxInput: 'not-qualified' };
  limitations: { code: string; zh: string; en: string }[];
};
export type ControlExampleEntry = {
  id: string; engineId: ControlEngine; labelZh: string; labelEn: string;
  samples: number; requestedDurationSeconds: number; recordedSpanSeconds: number;
  initial: { ip: number | null; r: number | null; z: number | null };
  units: { ip: 'A' | 'code-unit'; r: 'm' | 'code-unit'; z: 'm' | 'code-unit' };
  artifact: ControlRunEntry['artifact'];
};
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const exact = (v: unknown, keys: string) => obj(v) && Object.keys(v).length === keys.split(' ').length && Object.keys(v).every(k => keys.split(' ').includes(k));
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const text = (v: unknown) => typeof v === 'string' && v.length > 0 && v.length <= 500;
function check(ok: unknown): asserts ok { if (!ok) throw new Error('INVALID_CONTROL_EXAMPLE'); }
export function parseControlExample(value: unknown): ControlExample {
  check(exact(value, 'schema id engineId authority recordKind mode title scenario time signals boundary source qualification limitations'));
  const r = value as unknown as ControlExample;
  check(r.schema === 'control-example.v1' && isControlEngine(r.engineId) && r.id.startsWith(r.engineId + '-example-') && /^[a-z0-9-]{1,120}$/.test(r.id));
  check(r.authority === 'simulated' && r.recordKind === 'simulation-run' && r.mode === 'historical-replay');
  check(exact(r.title, 'zh en') && text(r.title.zh) && text(r.title.en));
  check(exact(r.scenario, 'shot initialTimeSeconds requestedDurationSeconds') && (r.scenario.shot === null || Number.isInteger(r.scenario.shot) && r.scenario.shot > 0) && (r.scenario.initialTimeSeconds === null || finite(r.scenario.initialTimeSeconds) && r.scenario.initialTimeSeconds >= 0) && finite(r.scenario.requestedDurationSeconds) && r.scenario.requestedDurationSeconds > 0);
  check(exact(r.time, 'unit reference values') && r.time.unit === 's' && r.time.reference === 'archive-relative' && Array.isArray(r.time.values) && r.time.values.length >= 2 && r.time.values.length <= 10001);
  check(r.time.values.every((v, i) => finite(v) && v >= 0 && (i === 0 || v > r.time.values[i - 1])));
  const n = r.time.values.length;
  check(Array.isArray(r.signals) && r.signals.length >= 3 && r.signals.length <= 32 && new Set(r.signals.map(s => s.id)).size === r.signals.length);
  for (const s of r.signals) check(exact(s, 'id unit values') && /^[a-z][a-z0-9_]{0,60}$/.test(s.id) && ['A', 'm', 'V', '1', 'code-unit'].includes(s.unit) && Array.isArray(s.values) && s.values.length === n && s.values.every(v => v === null || finite(v)));
  for (const [id, unit] of [['ip', 'A'], ['r', 'm'], ['z', 'm']]) check(r.signals.some(s => s.id === id && [unit, 'code-unit'].includes(s.unit) && s.values.some(finite)));
  check(exact(r.boundary, 'unit frames') && r.boundary.unit === 'm' && Array.isArray(r.boundary.frames) && r.boundary.frames.length <= n);
  let previous = -1;
  for (const f of r.boundary.frames) { check(exact(f, 'timeIndex rz') && Number.isInteger(f.timeIndex) && f.timeIndex > previous && f.timeIndex < n && Array.isArray(f.rz) && f.rz.length >= 3 && f.rz.length <= 512 && f.rz.every(p => Array.isArray(p) && p.length === 2 && p.every(finite) && p[0] > 0)); previous = f.timeIndex; }
  const s = r.source;
  check(exact(s, 'runId recordedAt codeCommit imageId reportedStatus files') && typeof s.runId === 'string' && /^[a-zA-Z0-9._-]{1,150}$/.test(s.runId) && (s.recordedAt === null || /^\d{4}-\d{2}-\d{2}T/.test(s.recordedAt) && Number.isFinite(Date.parse(s.recordedAt))) && (s.codeCommit === null || /^[a-f0-9]{40}$/.test(s.codeCommit)) && (s.imageId === null || /^sha256:[a-f0-9]{64}$/.test(s.imageId)) && /^[a-zA-Z0-9_-]{1,40}$/.test(s.reportedStatus));
  check(Array.isArray(s.files) && s.files.length > 0 && s.files.length <= 10 && new Set(s.files.map(f => f.name)).size === s.files.length && s.files.every(f => exact(f, 'name sha256') && /^[a-zA-Z0-9_.-]{1,100}$/.test(f.name) && digest(f.sha256)));
  check(exact(r.qualification, 'decoding numericalConvergence deviceValidation toraxInput') && r.qualification.decoding === 'legacy-adapter' && r.qualification.numericalConvergence === 'not-established' && r.qualification.deviceValidation === 'not-established' && r.qualification.toraxInput === 'not-qualified');
  check(Array.isArray(r.limitations) && r.limitations.length > 0 && r.limitations.length <= 20 && r.limitations.every(l => exact(l, 'code zh en') && /^[a-z-]{1,80}$/.test(l.code) && text(l.zh) && text(l.en)));
  return structuredClone(r);
}
export function bindControlExample(value: unknown, entry: ControlExampleEntry): ControlExample {
  const r = parseControlExample(value);
  check(r.id === entry.id && r.engineId === entry.engineId && r.title.zh === entry.labelZh && r.title.en === entry.labelEn && r.time.values.length === entry.samples && r.scenario.requestedDurationSeconds === entry.requestedDurationSeconds);
  check(Math.abs(r.time.values.at(-1)! - r.time.values[0] - entry.recordedSpanSeconds) < 1e-10);
  for (const id of ['ip', 'r', 'z'] as const) { const s = r.signals.find(s => s.id === id)!; check(s.values[0] === entry.initial[id] && s.unit === entry.units[id]); }
  return r;
}
