import { loadScientificJson, type PhysicsBundle } from './physics';

export const magneticUnits = { rampup_flux: 'Wb', flattop_flux: 'Wb', pf_flux: 'Wb', flattop_duration: 's', oh_current_density: 'A/m^2', oh_field: 'T', tf_current_density: 'A/m^2', tf_field: 'T' } as const;
export type MagneticMetric = { value: number | null; unit: string; status: 'finite' | 'missing' | 'nan' | 'positive-infinity' | 'negative-infinity' };
export type StressPart = { id: 'tf' | 'oh'; r: number[]; radialPa: number[]; hoopPa: number[]; vonMisesPa: number[]; axialPa: number; displacementM: number[] };
export type EngineeringData = {
  schema: 'fuse-engineering.v1'; runId: string; parentRunId: string; parentRecordSha256: string; authority: 'simulated';
  model: '1D analytical cylindrical center stack'; mode: 'maximum-flattop-capability-at-oh-current-margin';
  timeSeconds: number; geometryUnchanged: true; deviceValidated: false; allowableStressAssessed: false;
  metrics: Record<keyof typeof magneticUnits, MagneticMetric>; branches: { samplingPoints: number; parts: StressPart[] }[];
  fuseVersion: string; assumptions: string[];
};
export type EngineeringBundle = Omit<PhysicsBundle, 'profiles' | 'grid'> & { parentRunId: string; parentRecordSha256: string };
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
function assert(ok: unknown): asserts ok { if (!ok) throw new Error('INVALID_ENGINEERING_PROJECTION'); }
function exact(v: object, fields: string) { return v && Object.keys(v).sort().join(' ') === fields.split(' ').sort().join(' '); }
export function parseEngineering(input: unknown): EngineeringData {
  assert(input && typeof input === 'object'); const p = input as EngineeringData;
  assert(exact(p, 'schema runId parentRunId parentRecordSha256 authority model mode timeSeconds geometryUnchanged deviceValidated allowableStressAssessed metrics branches fuseVersion assumptions'));
  assert(p.schema === 'fuse-engineering.v1' && /^fuse-engineering-[a-zA-Z0-9-]{1,80}$/.test(p.runId) && /^fuse-fpp-[a-zA-Z0-9-]{1,80}$/.test(p.parentRunId) && /^[a-f0-9]{64}$/.test(p.parentRecordSha256));
  assert(p.authority === 'simulated' && p.model === '1D analytical cylindrical center stack' && p.mode === 'maximum-flattop-capability-at-oh-current-margin');
  assert(finite(p.timeSeconds) && p.geometryUnchanged === true && p.deviceValidated === false && p.allowableStressAssessed === false && p.fuseVersion === '1.2.0');
  assert(exact(p.metrics, Object.keys(magneticUnits).join(' ')));
  for (const [id, unit] of Object.entries(magneticUnits)) {
    const m = p.metrics[id as keyof typeof magneticUnits];
    assert(exact(m, 'value unit status') && m.unit === unit && ['finite', 'missing', 'nan', 'positive-infinity', 'negative-infinity'].includes(m.status));
    assert(m.status === 'finite' ? finite(m.value) : m.value === null);
  }
  assert(Array.isArray(p.branches) && p.branches.length === 3);
  for (const [i, b] of p.branches.entries()) {
    assert(exact(b, 'samplingPoints parts') && b.samplingPoints === [101, 201, 401][i] && Array.isArray(b.parts) && b.parts.length === 2 && b.parts[0].id === 'tf' && b.parts[1].id === 'oh');
    for (const part of b.parts) {
      assert(exact(part, 'id r radialPa hoopPa vonMisesPa axialPa displacementM') && finite(part.axialPa));
      assert(Array.isArray(part.r) && part.r.length === b.samplingPoints && part.r.every((r, j) => finite(r) && r >= 0 && (!j || r > part.r[j - 1])));
      for (const v of [part.radialPa, part.hoopPa, part.vonMisesPa, part.displacementM]) assert(Array.isArray(v) && v.length === part.r.length && v.every(finite));
      assert(part.vonMisesPa.every(v => v >= 0));
    }
  }
  assert(Array.isArray(p.assumptions) && p.assumptions.length <= 12 && p.assumptions.every(v => typeof v === 'string' && v.length < 500));
  return p;
}
export async function loadEngineering(bundle: EngineeringBundle, signal: AbortSignal) {
  const p = parseEngineering(await loadScientificJson(bundle, signal));
  if (p.runId !== bundle.runId || p.parentRunId !== bundle.parentRunId || p.parentRecordSha256 !== bundle.parentRecordSha256) throw new Error('ENGINEERING_IDENTITY');
  return p;
}
