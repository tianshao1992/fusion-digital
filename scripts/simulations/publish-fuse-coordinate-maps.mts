import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { parseFluxCoordinateMap, type FluxCoordinateMapBundle } from '../../app/simulations/flux-coordinate-map.ts';

function argument(name: string, fallback?: string): string {
  const index = process.argv.indexOf(name);
  if (index < 0) {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing argument: ${name}`);
  }
  const value = process.argv[index + 1];
  if (!value) throw new Error(`Missing value for argument: ${name}`);
  return value;
}

const projectRoot = resolve(argument('--project-root', process.cwd()));
const fuseRoot = resolve(argument('--fuse-root'));
const julia = resolve(argument('--julia', join(fuseRoot, '.tools', 'julia-1.12.7', 'bin', 'julia.exe')));
const juliaProject = resolve(argument('--julia-project', join(fuseRoot, 'environment')));
const juliaDepot = resolve(argument('--julia-depot', join(fuseRoot, '.julia-depot')));
const bundleCatalog = join(projectRoot, 'app', 'simulations', 'data', 'physics-bundles.json');
const outputCatalog = join(projectRoot, 'app', 'simulations', 'data', 'fuse-coordinate-maps.json');
const publicDirectory = join(projectRoot, 'public', 'data', 'simulations');
const extractor = join(projectRoot, 'scripts', 'simulations', 'publish-fuse-coordinate-maps.jl');
const temporaryDirectory = mkdtempSync(join(tmpdir(), 'fusiondigital-fuse-map-'));
const extractedPath = join(temporaryDirectory, 'coordinate-maps.json');
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

try {
  execFileSync(julia, [
    '--startup-file=no',
    `--project=${juliaProject}`,
    extractor,
    '--fuse-root', fuseRoot,
    '--bundle-catalog', bundleCatalog,
    '--output', extractedPath,
  ], {
    stdio: 'inherit',
    env: { ...process.env, JULIA_DEPOT_PATH: juliaDepot },
  });
  const maps = (JSON.parse(readFileSync(extractedPath, 'utf8')) as unknown[]).map(parseFluxCoordinateMap);
  const catalog: FluxCoordinateMapBundle[] = maps.map((map) => {
    const raw = Buffer.from(JSON.stringify(map));
    const compressed = gzipSync(raw, { level: 9 });
    const rawSha256 = digest(raw);
    const sha256 = digest(compressed);
    writeFileSync(join(publicDirectory, `${sha256}.json.gz`), compressed);
    return {
      runId: map.runId,
      sourceNativeSha256: map.source.nativeSha256,
      sourcePhysicsSha256: map.source.physicsSha256,
      artifact: {
        path: `/data/simulations/${sha256}.json.gz`,
        sha256,
        bytes: compressed.length,
        rawSha256,
        rawBytes: raw.length,
      },
    };
  });
  writeFileSync(outputCatalog, `${JSON.stringify(catalog, null, 2)}\n`);
  console.log(`Published ${catalog.length} FUSE flux-coordinate maps`);
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
