import { digest, isControlEngine, type ControlEngine, type ControlRunEntry } from './contracts.ts';
import type { ControlExample } from './examples.ts';

// Display-only native grids never acquire ControlResult or TORAX qualifications.
export type ControlEquilibrium = {
  schema: 'control-equilibrium.v1'; id: string; engineId: ControlEngine;
  authority: 'simulated'; mode: 'historical-replay';
  association: { exampleId: string | null; sourceSha256: string };
  time: { unit: 's'; reference: 'archive-relative' | 'solver-time'; values: number[] };
  grid: { unit: 'm'; layout: 'z-major-r-fast'; r: number[]; z: number[] };
  flux: { quantity: 'poloidal-flux'; unit: 'code-unit'; normalization: 'none'; cocos: null; frames: number[][] };
  boundary: { unit: 'm'; frames: { timeIndex: number; rz: [number, number][] }[] };
  source: { runId: string; nativeField: string; nativeLayout: string; files: { name: string; sha256: string }[] };
  limitations: { code: string; zh: string; en: string }[];
};
export type ControlEquilibriumEntry = {
  id: string; engineId: ControlEngine; exampleId: string | null;
  labelZh: string; labelEn: string; frames: number; grid: [number, number];
  artifact: ControlRunEntry['artifact'];
};
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const exact = (v: unknown, keys: string): boolean => !!v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === keys.split(' ').length && Object.keys(v).every(k => keys.split(' ').includes(k));
const text = (v: unknown) => typeof v === 'string' && v.length > 0 && v.length <= 500;
function check(ok: unknown): asserts ok { if (!ok) throw new Error('INVALID_CONTROL_EQUILIBRIUM'); }
const ascending = (values: number[], max: number) => Array.isArray(values) && values.length >= 2 && values.length <= max && values.every((v, i) => finite(v) && (i === 0 || v > values[i - 1]));

export function parseControlEquilibrium(value: unknown): ControlEquilibrium {
  check(exact(value, 'schema id engineId authority mode association time grid flux boundary source limitations'));
  const e = value as ControlEquilibrium;
  check(e.schema === 'control-equilibrium.v1' && isControlEngine(e.engineId) && /^[a-z0-9-]{1,120}$/.test(e.id) && e.id.startsWith(e.engineId + '-equilibrium-'));
  check(e.authority === 'simulated' && e.mode === 'historical-replay');
  check(exact(e.association, 'exampleId sourceSha256') && (e.association.exampleId === null || typeof e.association.exampleId === 'string' && e.association.exampleId.startsWith(e.engineId + '-example-') && /^[a-z0-9-]{1,120}$/.test(e.association.exampleId)) && digest(e.association.sourceSha256));
  check(exact(e.time, 'unit reference values') && e.time.unit === 's' && ['archive-relative', 'solver-time'].includes(e.time.reference) && ascending(e.time.values, 1001) && e.time.values[0] >= 0);
  check(exact(e.grid, 'unit layout r z') && e.grid.unit === 'm' && e.grid.layout === 'z-major-r-fast' && ascending(e.grid.r, 512) && ascending(e.grid.z, 512) && e.grid.r[0] > 0);
  const n = e.grid.r.length * e.grid.z.length;
  check(n * e.time.values.length <= 1_000_000);
  check(exact(e.flux, 'quantity unit normalization cocos frames') && e.flux.quantity === 'poloidal-flux' && e.flux.unit === 'code-unit' && e.flux.normalization === 'none' && e.flux.cocos === null && Array.isArray(e.flux.frames) && e.flux.frames.length === e.time.values.length && e.flux.frames.every(f => Array.isArray(f) && f.length === n && f.every(finite)));
  check(exact(e.boundary, 'unit frames') && e.boundary.unit === 'm' && Array.isArray(e.boundary.frames) && e.boundary.frames.length <= e.time.values.length);
  let previous = -1;
  for (const f of e.boundary.frames) {
    check(exact(f, 'timeIndex rz') && Number.isInteger(f.timeIndex) && f.timeIndex > previous && f.timeIndex < e.time.values.length && Array.isArray(f.rz) && f.rz.length >= 3 && f.rz.length <= 512 && f.rz.every(p => Array.isArray(p) && p.length === 2 && p.every(finite) && p[0] > 0));
    previous = f.timeIndex;
  }
  check(exact(e.source, 'runId nativeField nativeLayout files') && typeof e.source.runId === 'string' && /^[a-zA-Z0-9_.-]{1,150}$/.test(e.source.runId) && text(e.source.nativeField) && text(e.source.nativeLayout));
  check(Array.isArray(e.source.files) && e.source.files.length > 0 && e.source.files.length <= 10 && new Set(e.source.files.map(f => f.name)).size === e.source.files.length && e.source.files.every(f => exact(f, 'name sha256') && /^[a-zA-Z0-9_.-]{1,100}$/.test(f.name) && digest(f.sha256)) && e.source.files.some(f => f.sha256 === e.association.sourceSha256));
  check(Array.isArray(e.limitations) && e.limitations.length > 0 && e.limitations.length <= 20 && e.limitations.every(l => exact(l, 'code zh en') && /^[a-z-]{1,80}$/.test(l.code) && text(l.zh) && text(l.en)));
  return e;
}

export function bindControlEquilibrium(value: unknown, entry: ControlEquilibriumEntry, example?: ControlExample | null): ControlEquilibrium {
  const e = parseControlEquilibrium(value);
  check(e.id === entry.id && e.engineId === entry.engineId && e.association.exampleId === entry.exampleId && e.time.values.length === entry.frames && e.grid.r.length === entry.grid[0] && e.grid.z.length === entry.grid[1]);
  if (e.association.exampleId !== null) {
    check(example && example.id === e.association.exampleId && example.engineId === e.engineId && example.source.runId === e.source.runId && example.source.files.some(f => f.sha256 === e.association.sourceSha256));
    check(e.time.reference === 'archive-relative' && e.time.values.length === example.time.values.length && e.time.values.every((v, i) => v === example.time.values[i]));
    check(JSON.stringify(e.boundary) === JSON.stringify(example.boundary));
  }
  return e;
}

export function fieldRange(e: ControlEquilibrium, index?: number): [number, number] {
  let low = Infinity, high = -Infinity;
  for (const frame of index === undefined ? e.flux.frames : [e.flux.frames[index]]) for (const v of frame ?? []) { low = Math.min(low, v); high = Math.max(high, v); }
  return [low, high];
}

// Isolines interpolate edge crossings for display only; disconnected segments stay separate.
// No inferred magnetic-axis values, closed flux surfaces, or normalized psi are produced.
export function fieldContours(e: ControlEquilibrium, index: number, level: number): [number, number][][] {
  const { r, z } = e.grid, values = e.flux.frames[index], segments: [number, number][][] = [];
  if (!values || !finite(level)) return segments;
  for (let j = 0; j < z.length - 1; j++) for (let i = 0; i < r.length - 1; i++) {
    const v = [values[j*r.length+i], values[j*r.length+i+1], values[(j+1)*r.length+i+1], values[(j+1)*r.length+i]];
    const p = [[r[i],z[j]], [r[i+1],z[j]], [r[i+1],z[j+1]], [r[i],z[j+1]]];
    const crossings: [number, number][] = [];
    for (let k = 0; k < 4; k++) {
      const next = (k+1)%4;
      if ((v[k] > level) === (v[next] > level)) continue;
      const t = (level-v[k])/(v[next]-v[k]);
      crossings.push([p[k][0]+t*(p[next][0]-p[k][0]), p[k][1]+t*(p[next][1]-p[k][1])]);
    }
    if (crossings.length === 2) segments.push(crossings);
    if (crossings.length === 4) {
      const same = (v[0] > level) === (v.reduce((sum, x) => sum+x, 0)/4 > level);
      segments.push([crossings[0],crossings[same?1:3]], [crossings[2],crossings[same?3:1]]);
    }
  }
  return segments;
}
