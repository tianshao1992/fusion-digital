export type Profile = { id: string; label: string; x: number[]; y: (number | null)[]; axis: 'rho_tor_norm' | 'psi_norm'; unit: string; source: string };
export type RZ = [number, number][];
export type PhysicsData = {
  schema: 'fuse-physics.v1' | 'fuse-physics.v2'; authority: 'simulated'; runId: string; timeSeconds: number; coreTimeSeconds: number; cocos: 11;
  equilibrium: { r: number[]; z: number[]; psi: number[][]; arrayOrder: 'z,r'; psiUnit: 'Wb'; psiAxis: number; psiBoundary: number; boundary: RZ; axis: [number, number]; wall: RZ; contours: { psiNorm: number; paths: RZ[] }[] };
  profiles: Profile[]; sources: { prefix: string; name: string; index: number; timeSeconds: number }[];
  geometry: { layers: { name: string; material: string; thicknessM: number | null; outline: RZ }[]; coils: { name: string; elements: { geometryType: number; outline: RZ }[]; timeSeconds: (number | null)[] | null; currentA: (number | null)[] | null }[] };
  unavailable: string[]; coreTransportModel: string; nativeFormat: string; versions: { fuse: string; imas: string; julia: string }; derivation: string;
  equilibriumOrigin?: 'input-reconstruction' | 'model-solved';
  reference?: { authority: 'upstream-initialized-reference'; timeSeconds: number; rho: number[]; te: number[]; ti: number[]; ne: number[]; description: string };
  fluxMatch?: { rho: number[]; channels: { id: string; unit: string; target: number[]; model: number[] }[]; selectedResidual: number; evaluationResiduals: number[]; xtol: number; residualCriterion: null; derivation: string; stateRelation: 'same-state' | 'post-coupling-recomputed' };
};
export type PhysicsBundle = { runId: string; recordSha256: string; path: string; sha256: string; bytes: number; rawSha256: string; rawBytes: number; profiles: number; grid: [number, number] };
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
function assert(ok: unknown): asserts ok { if (!ok) throw new Error('INVALID_PHYSICS_PROJECTION'); }
const words = (v: unknown) => typeof v === 'string' && v.length < 500;
const vector = (v: unknown, nullable = false): v is number[] => Array.isArray(v) && v.length <= 10000 && v.every(n => finite(n) || (nullable && n === null));
const monotonic = (v: number[]) => v.length > 1 && v.every((n, i) => finite(n) && (!i || n > v[i - 1]));
const rz = (v: unknown) => Array.isArray(v) && v.length <= 20000 && v.every(p => Array.isArray(p) && p.length === 2 && p.every(finite));
const keys = (v: object, allowed: string) => Object.keys(v).every(key => allowed.split(' ').includes(key));
export function parsePhysics(input: unknown): PhysicsData {
  assert(input && typeof input === 'object');
  const p = input as PhysicsData;
  assert(keys(p, 'schema authority runId timeSeconds coreTimeSeconds cocos equilibrium profiles sources geometry unavailable coreTransportModel nativeFormat versions derivation equilibriumOrigin reference fluxMatch'));
  assert(['fuse-physics.v1','fuse-physics.v2'].includes(p.schema) && p.authority === 'simulated' && /^[a-zA-Z0-9._-]{1,100}$/.test(p.runId) && finite(p.timeSeconds) && finite(p.coreTimeSeconds) && p.cocos === 11);
  if (p.schema === 'fuse-physics.v1') assert(!p.reference && !p.fluxMatch && !p.equilibriumOrigin);
  else {
    assert(p.equilibriumOrigin === 'input-reconstruction' || p.equilibriumOrigin === 'model-solved');
    const ref = p.reference;
    if (ref) assert(keys(ref,'authority timeSeconds rho te ti ne description') && ref.authority === 'upstream-initialized-reference' && finite(ref.timeSeconds) && words(ref.description) && vector(ref.rho) && monotonic(ref.rho) && [ref.te,ref.ti,ref.ne].every(v => vector(v) && v.length === ref.rho.length));
    const flux = p.fluxMatch;
    if (flux) {
      assert(keys(flux,'rho channels selectedResidual evaluationResiduals xtol residualCriterion derivation stateRelation') && vector(flux.rho) && monotonic(flux.rho) && finite(flux.selectedResidual) && flux.selectedResidual >= 0 && vector(flux.evaluationResiduals) && flux.evaluationResiduals.length > 0 && flux.evaluationResiduals.every(v=>v>=0) && finite(flux.xtol) && flux.xtol > 0 && flux.residualCriterion === null && words(flux.derivation) && ['same-state','post-coupling-recomputed'].includes(flux.stateRelation));
      const units: Record<string,string> = {electron_heat:'W/m^2',ion_heat:'W/m^2',momentum:'kg/s^2',electron_particles:'m^-2/s'};
      assert(Array.isArray(flux.channels) && flux.channels.length >= 2 && flux.channels.length <= 4 && new Set(flux.channels.map(c=>c.id)).size === flux.channels.length && flux.channels.every(c=>keys(c,'id unit target model') && Object.hasOwn(units,c.id) && c.unit===units[c.id] && [c.target,c.model].every(v=>vector(v) && v.length===flux.rho.length)));
    }
  }
  const e = p.equilibrium;
  assert(e && keys(e, 'r z psi arrayOrder psiUnit psiAxis psiBoundary boundary axis wall contours'));
  assert(e && vector(e.r) && vector(e.z) && monotonic(e.r) && monotonic(e.z) && e.r.length * e.z.length <= 300000);
  assert(e.arrayOrder === 'z,r' && e.psiUnit === 'Wb' && finite(e.psiAxis) && finite(e.psiBoundary) && e.psiAxis !== e.psiBoundary);
  assert(Array.isArray(e.psi) && e.psi.length === e.z.length && e.psi.every(row => vector(row) && row.length === e.r.length));
  assert(rz(e.boundary) && e.boundary.length > 2 && rz(e.wall) && Array.isArray(e.axis) && e.axis.length === 2 && e.axis.every(finite));
  assert(Array.isArray(e.contours) && e.contours.length <= 50 && e.contours.every(c => finite(c.psiNorm) && c.psiNorm > 0 && c.psiNorm < 1 && Array.isArray(c.paths) && c.paths.length <= 20 && c.paths.every(rz)));
  assert(Array.isArray(p.profiles) && p.profiles.length <= 500 && new Set(p.profiles.map(v => v.id)).size === p.profiles.length);
  for (const v of p.profiles) assert(/^[a-zA-Z0-9_-]{1,100}$/.test(v.id) && words(v.label) && words(v.source) && ['eV', 'm^-3', 'A/m^2', '1', 'Pa', 'W/m^3', 'W', 'm^-3/s', 'W/m^2', 'm^-2/s', 's^-1'].includes(v.unit) && ['rho_tor_norm', 'psi_norm'].includes(v.axis) && vector(v.x) && monotonic(v.x) && vector(v.y, true) && v.x.length === v.y.length);
  assert(Array.isArray(p.sources) && p.sources.length <= 100 && p.sources.every(s => words(s.prefix) && words(s.name) && finite(s.index) && finite(s.timeSeconds)));
  assert(p.geometry && Array.isArray(p.geometry.layers) && p.geometry.layers.length <= 100 && p.geometry.layers.every(l => words(l.name) && words(l.material) && (l.thicknessM === null || finite(l.thicknessM)) && rz(l.outline)));
  assert(Array.isArray(p.geometry.coils) && p.geometry.coils.length <= 200 && p.geometry.coils.every(c => words(c.name) && Array.isArray(c.elements) && c.elements.length <= 100 && c.elements.every(e => finite(e.geometryType) && rz(e.outline)) && (c.timeSeconds === null || vector(c.timeSeconds, true)) && (c.currentA === null || vector(c.currentA, true)) && (c.timeSeconds === null || c.currentA === null || c.timeSeconds.length === c.currentA.length)));
  assert(Array.isArray(p.unavailable) && p.unavailable.length <= 1000 && p.unavailable.every(words) && words(p.coreTransportModel) && words(p.nativeFormat) && words(p.derivation) && p.versions && Object.values(p.versions).every(words));
  assert(keys(p.versions, 'fuse imas julia') && keys(p.geometry, 'layers coils'));
  assert(p.profiles.every(v => keys(v, 'id label x y axis unit source')) && p.sources.every(v => keys(v, 'prefix name index timeSeconds')));
  assert(e.contours.every(v => keys(v, 'psiNorm paths')) && p.geometry.layers.every(v => keys(v, 'name material thicknessM outline')));
  assert(p.geometry.coils.every(v => keys(v, 'name elements timeSeconds currentA') && v.elements.every(el => keys(el, 'geometryType outline'))));
  return p;
}
export async function sha256(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes));
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
}
async function readBounded(stream: ReadableStream<Uint8Array>, maximum: number): Promise<Uint8Array> {
  const reader = stream.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try { while (true) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > maximum) throw new Error('PHYSICS_SIZE_LIMIT'); chunks.push(value); } }
  finally { await reader.cancel(); reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; } return bytes;
}
export async function loadPhysics(bundle: PhysicsBundle, signal: AbortSignal): Promise<PhysicsData> {
  if (!/^\/data\/simulations\/[a-f0-9]{64}\.json\.gz$/.test(bundle.path) || !Number.isInteger(bundle.bytes) || bundle.bytes <= 0 || bundle.bytes > 6000000 || !Number.isInteger(bundle.rawBytes) || bundle.rawBytes <= 0 || bundle.rawBytes > 20000000) throw new Error('INVALID_BUNDLE');
  const response = await fetch(bundle.path, { signal, credentials: 'omit', redirect: 'error' });
  if (!response.ok || !response.body) throw new Error('PHYSICS_UNAVAILABLE');
  // Some static servers advertise the stored gzip as HTTP Content-Encoding;
  // browsers then transparently decode it. Verify the exact native JSON hash
  // in both transport modes, and the compressed hash whenever bytes are exposed.
  const transportEncoded = Boolean(response.headers.get('content-encoding'));
  const received = await readBounded(response.body, transportEncoded ? Math.max(bundle.rawBytes, bundle.bytes) : bundle.bytes);
  const isGzip = received[0] === 0x1f && received[1] === 0x8b;
  let decoded: Uint8Array;
  if (isGzip) {
    if (received.length !== bundle.bytes || await sha256(received) !== bundle.sha256) throw new Error('PHYSICS_INTEGRITY');
    decoded = await readBounded(new Blob([Uint8Array.from(received)]).stream().pipeThrough(new DecompressionStream('gzip')), bundle.rawBytes);
  } else {
    if (!transportEncoded) throw new Error('PHYSICS_INTEGRITY');
    decoded = received;
  }
  if (decoded.length !== bundle.rawBytes || await sha256(decoded) !== bundle.rawSha256) throw new Error('PHYSICS_INTEGRITY');
  const data = parsePhysics(JSON.parse(new TextDecoder().decode(decoded)));
  if (data.runId !== bundle.runId || data.profiles.length !== bundle.profiles || data.equilibrium.r.length !== bundle.grid[0] || data.equilibrium.z.length !== bundle.grid[1]) throw new Error('PHYSICS_IDENTITY');
  return data;
}
export function profileDisplay(profile: Profile) {
  const scales: Record<string, [number, string]> = { eV: [0.001, 'keV'], 'm^-3': [1e-20, '10²⁰ m⁻³'], 'A/m^2': [1e-6, 'MA/m²'], Pa: [1e-3, 'kPa'], 'W/m^3': [1e-6, 'MW/m³'], W: [1e-6, 'MW'] };
  const [scale, unit] = scales[profile.unit] ?? [1, profile.unit];
  return { unit, scale, data: profile.x.map((x, i) => [x, profile.y[i] === null ? null : profile.y[i]! * scale]) };
}
