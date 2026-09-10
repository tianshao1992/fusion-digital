// Offline reviewed native-field sidecars. Does not change the new-cloud-run contract.
import { readFile, writeFile, mkdir, rename, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { parseControlEquilibrium, bindControlEquilibrium, type ControlEquilibriumEntry } from '../../app/simulations/control/equilibrium.ts';
import { bindControlExample, type ControlExampleEntry } from '../../app/simulations/control/examples.ts';
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

export async function publishControlEquilibrium(input: string, project: string, labels: { zh: string; en: string }) {
  if (!path.isAbsolute(input) || !path.isAbsolute(project)) throw new Error('ABSOLUTE_EQUILIBRIUM_PATHS_REQUIRED');
  if (!labels.zh || !labels.en || labels.zh.length > 150 || labels.en.length > 150) throw new Error('EQUILIBRIUM_LABELS_REQUIRED');
  if ((await stat(input)).size > 20_000_000) throw new Error('EQUILIBRIUM_SIZE_LIMIT');
  const e = parseControlEquilibrium(JSON.parse(await readFile(input, 'utf8')));
  const raw = Buffer.from(JSON.stringify(e) + '\n'), zipped = gzipSync(raw, { level: 9 });
  if (raw.length > 20_000_000 || zipped.length > 6_000_000) throw new Error('EQUILIBRIUM_SIZE_LIMIT');
  const entry: ControlEquilibriumEntry = { id: e.id, engineId: e.engineId, exampleId: e.association.exampleId, labelZh: labels.zh, labelEn: labels.en, frames: e.time.values.length, grid: [e.grid.r.length, e.grid.z.length], artifact: { path: `/data/simulations/${sha(zipped)}.json.gz`, sha256: sha(zipped), bytes: zipped.length, rawSha256: sha(raw), rawBytes: raw.length } };
  const catalogPath = path.join(project, 'app/simulations/data/control-equilibria.json');
  const entries: ControlEquilibriumEntry[] = JSON.parse(await readFile(catalogPath, 'utf8').catch(err => { if (err.code !== 'ENOENT') throw err; return '[]'; }));
  let example = null;
  if (e.association.exampleId !== null) {
    const examples: ControlExampleEntry[] = JSON.parse(await readFile(path.join(project, 'app/simulations/data/control-examples.json'), 'utf8'));
    const selected = examples.find(v => v.id === e.association.exampleId);
    if (!selected) throw new Error('EQUILIBRIUM_EXAMPLE_MISSING');
    const bytes = await readFile(path.join(project, 'public', selected.artifact.path));
    if (bytes.length !== selected.artifact.bytes || sha(bytes) !== selected.artifact.sha256) throw new Error('EXAMPLE_HASH_MISMATCH');
    const decoded = gunzipSync(bytes, { maxOutputLength: selected.artifact.rawBytes });
    if (decoded.length !== selected.artifact.rawBytes || sha(decoded) !== selected.artifact.rawSha256) throw new Error('EXAMPLE_HASH_MISMATCH');
    example = bindControlExample(JSON.parse(decoded.toString('utf8')), selected);
  }
  bindControlEquilibrium(e, entry, example);
  const previous = entries.find(v => v.id === e.id);
  if (previous) { if (JSON.stringify(previous) !== JSON.stringify(entry)) throw new Error('IMMUTABLE_EQUILIBRIUM_CONFLICT'); return entries; }
  if (entries.some(v => v.engineId === entry.engineId && v.exampleId === entry.exampleId)) throw new Error('DUPLICATE_EQUILIBRIUM_ASSOCIATION');
  const destination = path.join(project, 'public', entry.artifact.path);
  await mkdir(path.dirname(destination), { recursive: true });
  try { await writeFile(destination, zipped, { flag: 'wx' }); } catch (err) { if ((err as NodeJS.ErrnoException).code !== 'EEXIST' || sha(await readFile(destination)) !== sha(zipped)) throw err; }
  entries.push(entry);
  await mkdir(path.dirname(catalogPath), { recursive: true });
  await writeFile(catalogPath + '.pending', JSON.stringify(entries, null, 2) + '\n', { flag: 'wx' });
  await rename(catalogPath + '.pending', catalogPath);
  return entries;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [approval, input, zh, en, ...rest] = process.argv.slice(2);
  if (approval !== '--reviewed-for-publication' || rest.length) throw new Error('EXPLICIT_PUBLICATION_REVIEW_REQUIRED');
  console.log(JSON.stringify(await publishControlEquilibrium(input, path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), { zh, en }), null, 2));
}
