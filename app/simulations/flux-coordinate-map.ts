import catalogJson from './data/fuse-coordinate-maps.json';
import { loadScientificJson, type PhysicsBundle, type PhysicsData } from './physics';

export type FluxCoordinateMap = {
  schema: 'fuse-flux-coordinate-map.v1';
  authority: 'simulation-derived';
  runId: string;
  source: {
    nativeSha256: string;
    physicsSha256: string;
    equilibriumTimeSeconds: number;
    coreTimeSeconds: number;
    cocos: 11;
    psiNormPath: 'equilibrium.time_slice.profiles_1d.psi_norm';
    rhoTorNormPath: 'equilibrium.time_slice.profiles_1d.rho_tor_norm';
  };
  psiNorm: number[];
  rhoTorNorm: number[];
  method: 'native-equilibrium-coordinate-map';
  interpolation: 'bounded-linear';
  extrapolation: 'none';
  assumptions: ['axisymmetric-flux-function'];
  projectorSha256: string;
};

export type FluxCoordinateMapBundle = {
  runId: string;
  sourceNativeSha256: string;
  sourcePhysicsSha256: string;
  artifact: {
    path: string;
    sha256: string;
    bytes: number;
    rawSha256: string;
    rawBytes: number;
  };
};

export const fluxCoordinateMapCatalog = catalogJson as FluxCoordinateMapBundle[];

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const digest = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const identifier = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/.test(value);
const exactKeys = (value: unknown, keys: string[]): boolean => (
  !!value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length
  && Object.keys(value).every((key) => keys.includes(key))
);
const increasing = (values: number[]): boolean => values.every((value, index) => index === 0 || value > values[index - 1]);
function check(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}

export function parseFluxCoordinateMap(value: unknown): FluxCoordinateMap {
  check(exactKeys(value, ['schema', 'authority', 'runId', 'source', 'psiNorm', 'rhoTorNorm', 'method', 'interpolation', 'extrapolation', 'assumptions', 'projectorSha256']), 'INVALID_FLUX_COORDINATE_MAP');
  const map = value as FluxCoordinateMap;
  check(map.schema === 'fuse-flux-coordinate-map.v1' && map.authority === 'simulation-derived' && identifier(map.runId), 'INVALID_FLUX_COORDINATE_MAP_IDENTITY');
  check(exactKeys(map.source, ['nativeSha256', 'physicsSha256', 'equilibriumTimeSeconds', 'coreTimeSeconds', 'cocos', 'psiNormPath', 'rhoTorNormPath']), 'INVALID_FLUX_COORDINATE_MAP_SOURCE');
  check(digest(map.source.nativeSha256) && digest(map.source.physicsSha256) && finite(map.source.equilibriumTimeSeconds) && finite(map.source.coreTimeSeconds) && map.source.cocos === 11, 'INVALID_FLUX_COORDINATE_MAP_SOURCE');
  check(map.source.psiNormPath === 'equilibrium.time_slice.profiles_1d.psi_norm' && map.source.rhoTorNormPath === 'equilibrium.time_slice.profiles_1d.rho_tor_norm', 'INVALID_FLUX_COORDINATE_MAP_PATH');
  check(Array.isArray(map.psiNorm) && Array.isArray(map.rhoTorNorm) && map.psiNorm.length === map.rhoTorNorm.length && map.psiNorm.length >= 3 && map.psiNorm.length <= 2048, 'INVALID_FLUX_COORDINATE_MAP_SHAPE');
  check(map.psiNorm.every(finite) && map.rhoTorNorm.every(finite) && increasing(map.psiNorm) && increasing(map.rhoTorNorm), 'INVALID_FLUX_COORDINATE_MAP_AXIS');
  check(Math.abs(map.psiNorm[0]) <= 1e-10 && Math.abs(map.psiNorm.at(-1)! - 1) <= 1e-10 && Math.abs(map.rhoTorNorm[0]) <= 1e-10 && Math.abs(map.rhoTorNorm.at(-1)! - 1) <= 1e-10, 'INCOMPLETE_FLUX_COORDINATE_MAP');
  check(map.psiNorm.every((item) => item >= 0 && item <= 1) && map.rhoTorNorm.every((item) => item >= 0 && item <= 1), 'OUT_OF_RANGE_FLUX_COORDINATE_MAP');
  check(map.method === 'native-equilibrium-coordinate-map' && map.interpolation === 'bounded-linear' && map.extrapolation === 'none', 'INVALID_FLUX_COORDINATE_MAP_METHOD');
  check(Array.isArray(map.assumptions) && map.assumptions.length === 1 && map.assumptions[0] === 'axisymmetric-flux-function' && digest(map.projectorSha256), 'INVALID_FLUX_COORDINATE_MAP_PROVENANCE');
  return structuredClone(map);
}

export async function loadFluxCoordinateMap(
  entry: FluxCoordinateMapBundle,
  physicsBundle: PhysicsBundle,
  physics: PhysicsData,
  signal: AbortSignal,
): Promise<FluxCoordinateMap> {
  check(entry.runId === physicsBundle.runId && entry.sourcePhysicsSha256 === physicsBundle.rawSha256, 'FLUX_COORDINATE_MAP_CATALOG_MISMATCH');
  const map = parseFluxCoordinateMap(await loadScientificJson(entry.artifact, signal));
  check(map.runId === physics.runId && map.source.physicsSha256 === physicsBundle.rawSha256 && map.source.nativeSha256 === entry.sourceNativeSha256, 'FLUX_COORDINATE_MAP_IDENTITY_MISMATCH');
  check(map.source.equilibriumTimeSeconds === physics.timeSeconds && map.source.coreTimeSeconds === physics.coreTimeSeconds && map.source.cocos === physics.cocos, 'FLUX_COORDINATE_MAP_STATE_MISMATCH');
  return map;
}
