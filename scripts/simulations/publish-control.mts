// Operator-only import: never mounted as a public website upload API.
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { CONTROL_RUNNER_SHA256, isControlId, parseControlSpec, recipeFor, type ControlRunEntry } from '../../app/simulations/control/contracts.ts';
import { collectControlBundle, sha } from './control-collector.mts';

export async function publishControl(input: string, id: string, project: string) {
  if (!isControlId(id) || !path.isAbsolute(input) || !path.isAbsolute(project)) throw new Error('INVALID_CONTROL_IMPORT');
  const normalized = JSON.parse(await readFile(path.join(input, 'spec.json'), 'utf8'));
  if (normalized.parameters?.usePsm !== false) throw new Error('CONTROL_PSM_NOT_APPROVED');
  delete normalized.parameters.usePsm;
  const result = await collectControlBundle(input, id, parseControlSpec(normalized), CONTROL_RUNNER_SHA256);
  if (result.execution.state !== 'succeeded') throw new Error('ONLY_SUCCESSFUL_CONTROL_RUNS_ARE_PUBLISHABLE');
  const raw = Buffer.from(JSON.stringify(result) + '\n'), compressed = gzipSync(raw, { level: 9 });
  if (raw.length > 20_000_000 || compressed.length > 6_000_000) throw new Error('CONTROL_PUBLIC_BUNDLE_TOO_LARGE');
  const asset = `/data/simulations/${sha(compressed)}.json.gz`, catalogPath = path.join(project, 'app/simulations/data/control-runs.json');
  const entries: ControlRunEntry[] = JSON.parse(await readFile(catalogPath, 'utf8'));
  const previous = entries.find(e => e.id === id);
  if (previous) { if (previous.artifact.rawSha256 === sha(raw)) return previous; throw new Error('IMMUTABLE_CONTROL_RUN_CONFLICT'); }
  const recipe = recipeFor(result.engine.id);
  const entry: ControlRunEntry = { id, engineId: result.engine.id, recipe: recipe.id, labelZh: `${recipe.zh} · ${result.spec!.parameters.durationSeconds} s`, labelEn: `${recipe.en} · ${result.spec!.parameters.durationSeconds} s`, origin: result.origin, artifact: { path: asset, sha256: sha(compressed), bytes: compressed.length, rawSha256: sha(raw), rawBytes: raw.length } };
  await mkdir(path.join(project, 'public/data/simulations'), { recursive: true });
  try { await writeFile(path.join(project, 'public', asset), compressed, { flag: 'wx' }); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EEXIST' || sha(await readFile(path.join(project, 'public', asset))) !== sha(compressed)) throw e; }
  // Preserve every previous run; only the source-controlled index is atomically replaced.
  await writeFile(catalogPath + '.pending', JSON.stringify([...entries, entry], null, 2) + '\n', { flag: 'wx' });
  await rename(catalogPath + '.pending', catalogPath);
  return entry;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.length !== 5 || args[0] !== '--input' || args[2] !== '--id' || args[4] !== '--reviewed-for-publication') throw new Error('USAGE_INPUT_ID_REVIEWED_FOR_PUBLICATION_REQUIRED');
  console.log(JSON.stringify(await publishControl(path.resolve(args[1]), args[3], path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')), null, 2));
}
