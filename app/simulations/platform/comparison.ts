import { canCompare, interpolateProfile, type TransportResult } from './contracts.ts';
export function createComparisonRecord(left: TransportResult, right: TransportResult, timeSeconds: number) {
  if (!canCompare(left, right)) throw new Error('INCOMPATIBLE_COMPARISON');
  if (!Number.isFinite(timeSeconds) || [left, right].some(r => timeSeconds < r.time.values[0] || timeSeconds > r.time.values.at(-1)!)) throw new Error('COMPARISON_TIME_OUT_OF_RANGE');
  return {
    schema: 'comparison-record.v1', authority: 'derived-from-simulation',
    left: { id: left.id, nativeSha256: left.provenance.nativeSha256, parameters: left.parameters },
    right: { id: right.id, nativeSha256: right.provenance.nativeSha256, parameters: right.parameters },
    device: left.device, comparisonGroup: left.comparisonGroup, timeSeconds,
    interpolation: 'linear-time-no-extrapolation', difference: 'left-minus-right', accuracyRanking: false,
    scalars: left.scalars.flatMap(l => {
      const r = right.scalars.find(r => r.id === l.id && r.unit === l.unit);
      if (!r) return [];
      const a = interpolateProfile(left.time.values, l.values, timeSeconds), b = interpolateProfile(right.time.values, r.values, timeSeconds);
      return [{ id: l.id, unit: l.unit, left: a, right: b, difference: a === null || b === null ? null : a - b }];
    }),
  };
}
