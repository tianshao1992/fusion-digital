import { loadScientificJson, type PhysicsBundle } from './physics';
export type InnerIteration = { iteration: number; selectedResidual: number; evaluationResiduals: number[] };
export type DiagnosticsBundle = Omit<PhysicsBundle, 'profiles' | 'grid'> & { iterations: number };
export function parseInnerHistory(input: unknown): InnerIteration[] {
  if (!Array.isArray(input) || input.length < 2 || input.length > 10) throw new Error('INVALID_INNER_HISTORY');
  const rows = input as InnerIteration[];
  for (const [i, r] of rows.entries()) {
    if (!r || Object.keys(r).sort().join(' ') !== 'evaluationResiduals iteration selectedResidual' || r.iteration !== i + 1 || !Number.isFinite(r.selectedResidual) || r.selectedResidual < 0 || !Array.isArray(r.evaluationResiduals) || r.evaluationResiduals.length < 1 || r.evaluationResiduals.length > 10000 || r.evaluationResiduals.some(n => typeof n !== 'number' || !Number.isFinite(n) || n < 0)) throw new Error('INVALID_INNER_HISTORY');
  }
  return rows;
}
export async function loadInnerHistory(bundle: DiagnosticsBundle, signal: AbortSignal) {
  const rows = parseInnerHistory(await loadScientificJson(bundle, signal));
  if (rows.length !== bundle.iterations) throw new Error('INNER_HISTORY_IDENTITY');
  return rows;
}
