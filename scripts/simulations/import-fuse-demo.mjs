import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const finite = value => { if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Non-finite source metric'); return value; };
const hex = value => { if (!/^[a-f0-9]{40,64}$/.test(value)) throw new Error('Invalid source digest'); return value; };

// Explicit allowlist: raw paths, traceback and log content never enter the Web bundle.
export function projectRun(source, bytes, caseId, id) {
  if (source.authority !== 'simulated' || source.record_kind !== 'simulation-run' || source.execution.exit_code !== 0) throw new Error('Unsupported source evidence');
  const fpp = caseId === 'fpp-stationary';
  const keys = { fusion_power_MW: 'MW', fusion_gain_Q: '1', plasma_current_MA: 'MA', q95: '1', major_radius_m: 'm', minor_radius_m: 'm', toroidal_field_T: 'T', central_electron_temperature_keV: 'keV', central_ion_temperature_keV: 'keV', 'central_electron_density_m-3': 'm⁻³', auxiliary_power_MW: 'MW', power_through_separatrix_MW: 'MW', H98y2: '1' };
  const c = source.execution.stationary_convergence;
  return {
    schema: 'simulation-result.v1', resultProfile: 'fuse-demo.v1', id, caseId, authority: 'simulated', recordKind: 'simulation-run', execution: 'succeeded',
    assessment: fpp && c.converged && c.final_error <= c.threshold ? 'passed-demo-criterion' : 'not-established',
    engine: { id: 'fuse', version: source.source.fuse_version, commit: hex(source.source.fuse_commit), runtime: { name: 'Julia', version: source.source.julia_version }, threads: finite(source.source.julia_threads) },
    metrics: fpp ? Object.entries(keys).map(([key, unit]) => ({ id: key.replace('m-3', 'm3'), value: finite(source.key_metrics[key]), unit })) : [],
    convergence: fpp ? { labels: c.history.map((_, i) => String(i + 1)), values: c.history.map(finite), threshold: finite(c.threshold), kind: 'iterations' } : { labels: source.transport_variants.map(v => v.name), values: source.transport_variants.map(v => finite(v.final_selected_residual)), calls: source.transport_variants.map(v => finite(v.reported_calls)), threshold: null, kind: 'variants' },
    ...(!fpp ? { solverTolerances: { xtol: finite(source.execution.nominal_xtol_setting) } } : {}),
    timing: { seconds: finite(fpp ? source.execution.simulation_stage_seconds : source.execution.elapsed_seconds), scope: fpp ? 'simulation-stage' : 'upstream-execution' },
    source: { recordSha256: digest(bytes), artifacts: Object.values(source.artifacts).map(a => ({ name: path.basename(a.path), sha256: hex(a.sha256) })) },
  };
}
export function parseFluxTraces(raw) {
  const clean = raw.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '');
  const blocks = clean.split('actors: FluxMatcher').slice(1);
  if (blocks.length !== 3) throw new Error('Unexpected FluxMatcher block count');
  return blocks.map((block, i) => ({ model: ['TGLFNN', 'GKNN', 'QLNN'][i], observations: [...block.matchAll(/Calls:\s*(\d+).*?error:\s*([0-9.eE+\-]+)/gs)].map(m => ({ calls: finite(Number(m[1])), residual: finite(Number(m[2])) })) }));
}
export async function readVerified(file, caseId, id) {
  const bytes = await readFile(file); const source = JSON.parse(bytes);
  for (const a of Object.values(source.artifacts)) {
    if (path.basename(a.path) !== a.path) throw new Error('Only adjacent source artifacts are supported');
    if (digest(await readFile(path.join(path.dirname(file), a.path))) !== a.sha256) throw new Error(`Artifact digest mismatch: ${a.path}`);
  }
  const result = projectRun(source, bytes, caseId, id);
  if (caseId === 'diiid-fluxmatcher') {
    result.traces = parseFluxTraces(await readFile(path.join(path.dirname(file), source.artifacts.run_log.path), 'utf8'));
    result.traces.forEach((t, i) => {
      if (!t.observations.length || t.observations.at(-1).residual !== result.convergence.values[i]) throw new Error('Trace does not match final residual');
    });
  }
  return result;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [fpp, flux] = process.argv.slice(2);
  if (!fpp || !flux) throw new Error('Usage: import-fuse-demo.mjs <FPP run-manifest.json> <FluxMatcher summary.json>');
  const runs = await Promise.all([readVerified(fpp, 'fpp-stationary', 'fuse-fpp-20260905'), readVerified(flux, 'diiid-fluxmatcher', 'fuse-fluxmatcher-20260905')]);
  const out = new URL('../../app/simulations/data/fuse-demo.json', import.meta.url);
  await mkdir(path.dirname(fileURLToPath(out)), { recursive: true });
  await writeFile(out, `${JSON.stringify(runs, null, 2)}\n`);
  console.log(`Imported ${runs.length} sanitized, artifact-verified simulation records.`);
}
