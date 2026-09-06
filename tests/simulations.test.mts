import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import SimulationPanels from '../app/simulations/SimulationPanels.tsx';
import { compareRuns } from '../app/simulations/comparison.ts';
import { createDraft, DEFAULT_PARAMETERS, formatMetric, parseSimulationRun, validateDraft } from '../app/simulations/contract.ts';
import { parseFluxTraces, projectRun } from '../scripts/simulations/import-fuse-demo.mjs';
const raw = JSON.parse(readFileSync(new URL('../app/simulations/data/fuse-demo.json', import.meta.url), 'utf8')).slice(-2);
const copy = () => structuredClone(raw[0]);

test('both bundled records pass the same versioned result contract', () => {
  assert.equal(raw.length, 2);
  raw.forEach((r: unknown) => assert.deepEqual(parseSimulationRun(r), r));
});
test('FPP reports 13 actual scalars and the exact nonmonotonic convergence history', () => {
  const r = parseSimulationRun(raw[0]);
  assert.equal(r.metrics.length, 13);
  assert.equal(r.metrics.find(m => m.id === 'fusion_power_MW')?.value, 449.32550278627764);
  assert.deepEqual(r.convergence.values, [0.014866684776063779, 0.0770547761715284, 0.031351701114853504]);
  assert.equal(r.source.recordSha256, '0462bee3245a303c918364e9676da1ed35a8e0a2960fc22f07002e416b8c513a');
});
test('successful FluxMatcher execution does not imply strict convergence', () => {
  const r = parseSimulationRun(raw[1]);
  assert.equal(r.execution, 'succeeded'); assert.equal(r.assessment, 'not-established');
  assert.equal(r.convergence.threshold, null); assert.equal(r.solverTolerances?.xtol, 0.001);
  assert.deepEqual(r.traces?.map(t => t.observations.length), [3, 11, 138]);
  r.traces?.forEach((t,i) => assert.equal(t.observations.at(-1)?.residual, r.convergence.values[i]));
});
test('missing outputs remain absent and are never synthesized or zero-filled', () => {
  assert.equal(parseSimulationRun(raw[1]).metrics.length, 0);
  const r = copy(); r.metrics = [];
  assert.deepEqual(parseSimulationRun(r).metrics, []);
  assert.equal(formatMetric(Number.NaN), '—');
});
test('invalid units, nonfinite values and duplicate quantities are rejected', () => {
  const r = copy(); r.metrics[0].unit = 'W'; assert.throws(() => parseSimulationRun(r), /UNIT/);
  r.metrics[0].unit = 'MW'; r.metrics[0].value = Number.NaN; assert.throws(() => parseSimulationRun(r), /METRICS/);
  const duplicate = copy(); duplicate.metrics.push(duplicate.metrics[0]); assert.throws(() => parseSimulationRun(duplicate), /METRICS/);
});
test('invalid result identity and false success criteria are rejected', () => {
  const r = copy(); r.convergence.values[r.convergence.values.length - 1] = 1;
  assert.throws(() => parseSimulationRun(r), /ASSESSMENT/);
  r.id = '../secret'; assert.throws(() => parseSimulationRun(r), /RESULT/);
  const other = copy(); other.authority = 'observed'; assert.throws(() => parseSimulationRun(other), /RESULT/);
});
test('unsupported profiles are rejected and xtol cannot become a residual threshold', () => {
  const r = copy(); r.resultProfile = 'unregistered.v1'; assert.throws(() => parseSimulationRun(r), /RESULT/);
  const flux = structuredClone(raw[1]); flux.convergence.threshold = 0.001; assert.throws(() => parseSimulationRun(flux), /RESIDUAL_CRITERION/);
});
test('draft state is owned by the workspace and not remounted with the scenario tab', () => {
  const root = readFileSync(new URL('../app/simulations/SimulationStudio.tsx', import.meta.url), 'utf8');
  const panel = readFileSync(new URL('../app/simulations/SimulationPanels.tsx', import.meta.url), 'utf8');
  assert.match(root, /\[draft, setDraft\] = useState/); assert.match(panel, /draft: currentDraft, setDraft/);
  assert.doesNotMatch(panel, /\[parameters, setParameters\] = useState/);
});
test('imports are rebuilt from an allowlist and cannot carry private paths into re-export', () => {
  const r = copy(); r.privatePath = 'C:/private/key'; r.engine.extra = 'token'; r.metrics[0].traceback = 'private';
  assert.doesNotMatch(JSON.stringify(parseSimulationRun(r)), /private|token|traceback/);
  r.source.artifacts[0].name = '../private'; assert.throws(() => parseSimulationRun(r), /SOURCE/);
});
test('reference producer can use the result reader without changing the engine adapter', () => {
  const r = copy(); r.id = 'reference-producer-contract-fixture'; r.engine.id = 'reference-producer';
  r.engine.runtime = { name: 'Python', version: '3.12.0' };
  // This is a contract mutation only, not a second independently computed scientific result.
  assert.equal(parseSimulationRun(r).engine.id, 'reference-producer');
});
test('drafts are non-executable and do not mutate archived results or defaults', () => {
  const before = JSON.stringify(raw); const draft = createDraft('  Test  ');
  assert.equal(draft.name, 'Test'); assert.equal(draft.executionReady, false); assert.deepEqual(validateDraft(draft), []);
  draft.parameters.majorRadius = 5.1;
  assert.equal(DEFAULT_PARAMETERS.majorRadius, 4.9); assert.equal(JSON.stringify(raw), before);
});
test('draft validation rejects invalid ranges and unsupported executable configs', () => {
  for (const parameters of [{ threads: 0 }, { maxIterations: 1.5 }, { convergenceThreshold: Number.NaN }, { majorRadius: -1 }, { plasmaCurrent: 100 }, { toroidalField: Infinity }]) {
    const d = createDraft('Test'); Object.assign(d.parameters, parameters); assert.ok(validateDraft(d).length > 0);
  }
  assert.ok(validateDraft({ ...createDraft('Test'), executionReady: true }).length > 0);
  assert.ok(validateDraft(createDraft(' '.repeat(5))).length > 0);
});
test('log parser preserves logged calls, values and the pinned three-model order', () => {
  const log = ['TGLFNN', 'GKNN', 'QLNN'].map((_, i) => `actors: FluxMatcher\nCalls: ${i + 2}\nerror: 0.003`).join('\n');
  assert.deepEqual(parseFluxTraces(log).map((t: { observations: { calls: number }[] }) => t.observations[0].calls), [2,3,4]);
  assert.throws(() => parseFluxTraces('incomplete'), /block count/);
});
test('source exporter rejects a non-simulated record', () => {
  assert.throws(() => projectRun({ authority: 'observed', record_kind: 'facility-record' }, Buffer.from('{}'), 'fpp-stationary', 'r1'), /source evidence/);
});

test('imported curves must agree with summary values, calls and labels', () => {
  for (const mutate of [
    (r: typeof raw[1]) => { r.traces[0].observations = []; },
    (r: typeof raw[1]) => { r.traces[0].observations.at(-1).residual = 999; },
    (r: typeof raw[1]) => { r.traces[0].model = 'UNKNOWN'; },
    (r: typeof raw[1]) => { r.traces[0].observations[1].calls = 0; },
    (r: typeof raw[1]) => { r.convergence.calls[0] += 1; },
  ]) {
    const r = structuredClone(raw[1]); mutate(r); assert.throws(() => parseSimulationRun(r), /TRACES/);
  }
  const missing = structuredClone(raw[1]); delete missing.traces; delete missing.convergence.calls;
  assert.equal(parseSimulationRun(missing).convergence.calls, undefined);
});

test('small nonzero quantities are never rounded to a displayed zero', () => {
  assert.equal(formatMetric(0.00001), '1.000e-5'); assert.equal(formatMetric(-0.00001), '-1.000e-5');
  assert.equal(formatMetric(0), '0');
});

test('comparison preserves missing/zero references and rejects cross-case comparisons', () => {
  const current = parseSimulationRun(raw[0]); const reference = parseSimulationRun(raw[0]);
  reference.metrics[0].value = 0; reference.metrics = reference.metrics.slice(0,1);
  const rows = compareRuns(current, reference);
  assert.equal(rows[0].delta, current.metrics[0].value); assert.equal(rows[0].percent, undefined);
  assert.equal(rows[1].reference, undefined); assert.equal(rows[1].delta, undefined);
  assert.throws(() => compareRuns(current, parseSimulationRun(raw[1])), /COMPARISON/);
  const flux = parseSimulationRun(raw[1]);
  assert.ok(compareRuns(flux, flux).every(row => row.delta === 0 && row.percent === 0));
});

test('missing FPP scalars render iteration errors, not surrogate model claims', () => {
  const run = parseSimulationRun(raw[0]); run.metrics = [];
  const html = renderToStaticMarkup(createElement(SimulationPanels, { tab: 'data', run, runs: [run], en: true, draft: createDraft('Test'), setDraft() {} }));
  assert.match(html, /No plasma scalars supplied/); assert.match(html, /Iteration/); assert.match(html, /Reported error/);
  assert.doesNotMatch(html, /Final residual|<th>Model<\/th>|<th>Calls<\/th>/);
});

test('comparison view renders source identities and neutral scientific boundaries', () => {
  const run = parseSimulationRun(raw[0]); const other = parseSimulationRun(raw[0]); other.id = 'second-result';
  const html = renderToStaticMarkup(createElement(SimulationPanels, { tab: 'comparison', run, runs: [run, other], en: true, draft: createDraft('Test'), setDraft() {} }));
  assert.match(html, /second-result/); assert.match(html, /Differences do not imply improved accuracy/); assert.match(html, /449\.326/);
  assert.doesNotMatch(html, /\p{Script=Han}/u);
});
test('the Web integration never includes local process execution or writes an API', () => {
  const source = readFileSync(new URL('../app/simulations/SimulationStudio.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /child_process|docker\.sock|method:\s*['"]POST/);
  assert.match(source, /512 \* 1024/); assert.match(source, /parseSimulationRun/);
});
