import type { SimulationRun } from './contract';

export type ComparisonRow = { id: string; unit: string; current?: number; reference?: number; delta?: number; percent?: number };
// Display-only comparison: matching quantity names/units do not prove equivalent inputs or model qualifications.
export function compareRuns(current: SimulationRun, reference: SimulationRun): ComparisonRow[] {
  if (current.resultProfile !== reference.resultProfile || current.caseId !== reference.caseId) throw new Error('INCOMPATIBLE_COMPARISON');
  const quantities = (run: SimulationRun) => run.caseId === 'fpp-stationary' || run.resultProfile === 'fuse-physics-run.v1' ? run.metrics : run.convergence.labels.map((id,i) => ({ id, value: run.convergence.values[i], unit: '1' }));
  const a = quantities(current), b = quantities(reference);
  return [...new Set([...a.map(m => m.id), ...b.map(m => m.id)])].map(id => {
    const left = a.find(m => m.id === id), right = b.find(m => m.id === id);
    if (left && right && left.unit !== right.unit) throw new Error('INCOMPATIBLE_UNIT');
    const delta = left && right ? left.value - right.value : undefined;
    const percent = delta !== undefined && right && right.value !== 0 ? delta / Math.abs(right.value) * 100 : undefined;
    return { id, unit: left?.unit ?? right!.unit, current: left?.value, reference: right?.value, delta: delta !== undefined && Number.isFinite(delta) ? delta : undefined, percent: percent !== undefined && Number.isFinite(percent) ? percent : undefined };
  });
}
