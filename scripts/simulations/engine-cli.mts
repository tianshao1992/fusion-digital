import { writeFile } from 'node:fs/promises';
import { defaultEngineSpec, parseEngineSpec } from '../../app/simulations/platform/contracts.ts';
import { recipes, engines } from '../../app/simulations/platform/catalog.ts';
import { cancel, collect, createFuseSnapshot, json, publishProjection, readJson, sha, status, submit } from './engine-service.mts';
const [command, argument, output] = process.argv.slice(2);
if (command === 'catalog') console.log(json({ engines, recipes }));
else if (command === 'snapshot') {
  if (!argument) throw new Error('Provide output JSON path');
  const p = await createFuseSnapshot(); await writeFile(argument, json(p)); console.log(sha(json(p)));
} else if (command === 'template') {
  let binding = null;
  if (argument === 'fuse-profile-handoff') binding = { profileSnapshotSha256: sha(json(await createFuseSnapshot())) };
  const spec = defaultEngineSpec(argument, binding);
  if (output) await writeFile(output, json(spec)); else console.log(json(spec));
} else if (command === 'validate') console.log(json(parseEngineSpec(await readJson(argument, 16384))));
else if (command === 'status') console.log(json(await status(argument)));
else if (command === 'cancel') console.log(json(await cancel(argument)));
else if (command === 'collect') console.log(json(await collect(argument)));
else if (command === 'publish') console.log(json(await publishProjection(argument)));
else if (command === 'run' || command === 'demo-suite') {
  const specs = command === 'run' ? [parseEngineSpec(await readJson(argument, 16384))] : await Promise.all(recipes.map(async r => defaultEngineSpec(r.id, r.origin === 'coupled' ? { profileSnapshotSha256: sha(json(await createFuseSnapshot())) } : null)));
  let failures = 0;
  for (const spec of specs) {
    const job = await submit(spec, spec.input ? await createFuseSnapshot() : undefined);
    console.log(`START ${job.id}`);
    const final = await job.completion; console.log(json(final));
    if (final.state !== 'succeeded') { failures++; continue; }
    await collect(job.id);
    if (command === 'demo-suite') await publishProjection(job.id);
  }
  if (failures) process.exitCode = 1;
} else throw new Error('Commands: catalog | snapshot <file> | template <recipe> [file] | validate/run <spec> | status/cancel/collect/publish <id> | demo-suite');
