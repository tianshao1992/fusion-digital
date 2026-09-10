// Offline, operator-reviewed historical examples. This does not relax publish-control.
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { parseControlExample, bindControlExample, type ControlExampleEntry } from '../../app/simulations/control/examples.ts';
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
export async function publishControlExamples(inputs: string[], project: string) {
  if (!inputs.length || !inputs.every(path.isAbsolute) || !path.isAbsolute(project)) throw new Error('ABSOLUTE_EXAMPLE_PATHS_REQUIRED');
  const catalogPath = path.join(project, 'app/simulations/data/control-examples.json');
  const entries: ControlExampleEntry[] = JSON.parse(await readFile(catalogPath, 'utf8').catch(e => { if (e.code !== 'ENOENT') throw e; return '[]'; }));
  for (const input of inputs) {
    const r = parseControlExample(JSON.parse(await readFile(input, 'utf8')));
    const raw = Buffer.from(JSON.stringify(r) + '\n'), bytes = gzipSync(raw, { level: 9 });
    if (raw.length > 2_000_000 || bytes.length > 1_000_000) throw new Error('EXAMPLE_SIZE_LIMIT');
    const previous = entries.find(e => e.id === r.id);
    if (previous) { if (previous.artifact.rawSha256 !== sha(raw)) throw new Error('IMMUTABLE_EXAMPLE_CONFLICT'); continue; }
    const signal = (id: string) => r.signals.find(s => s.id === id)!;
    const entry: ControlExampleEntry = {
      id: r.id, engineId: r.engineId, labelZh: r.title.zh, labelEn: r.title.en,
      samples: r.time.values.length, requestedDurationSeconds: r.scenario.requestedDurationSeconds, recordedSpanSeconds: r.time.values.at(-1)! - r.time.values[0],
      initial: { ip: signal('ip').values[0], r: signal('r').values[0], z: signal('z').values[0] },
      units: { ip: signal('ip').unit as ControlExampleEntry['units']['ip'], r: signal('r').unit as ControlExampleEntry['units']['r'], z: signal('z').unit as ControlExampleEntry['units']['z'] },
      artifact: { path: `/data/simulations/${sha(bytes)}.json.gz`, sha256: sha(bytes), bytes: bytes.length, rawSha256: sha(raw), rawBytes: raw.length },
    };
    bindControlExample(r, entry);
    const destination = path.join(project, 'public', entry.artifact.path);
    await mkdir(path.dirname(destination), { recursive: true });
    try { await writeFile(destination, bytes, { flag: 'wx' }); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EEXIST' || sha(await readFile(destination)) !== sha(bytes)) throw e; }
    entries.push(entry);
  }
  await mkdir(path.dirname(catalogPath), { recursive: true });
  await writeFile(catalogPath + '.pending', JSON.stringify(entries, null, 2) + '\n', { flag: 'wx' });
  await rename(catalogPath + '.pending', catalogPath);
  return entries;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [approval, ...inputs] = process.argv.slice(2);
  if (approval !== '--reviewed-for-publication') throw new Error('EXPLICIT_PUBLICATION_REVIEW_REQUIRED');
  console.log(JSON.stringify(await publishControlExamples(inputs, path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')), null, 2));
}
