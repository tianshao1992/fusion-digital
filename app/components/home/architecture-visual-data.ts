/** Analytic illustration geometry only: no MHD solver, device data or timing benchmark. */
export type FieldVertex = { x: number; y: number; depth: number; rho: number; theta: number; phi: number };
export type FieldCell = { vertices: FieldVertex[]; depth: number; rho: number; theta: number; phi: number; cap: boolean };

export function torusVertex(rho: number, theta: number, phi: number): FieldVertex {
  const radius = .63 * rho;
  const r = 1.48 + radius * Math.cos(theta + .2 * Math.sin(theta));
  const x = r * Math.cos(phi), y = r * Math.sin(phi), z = 1.35 * radius * Math.sin(theta);
  return { x: 180 + x * 72, y: 110 + (y * .43 - z * .9) * 72, depth: y * .9 + z * .43, rho, theta, phi };
}

export function schematicPerturbation(rho: number, theta: number, phi: number, phase: number) {
  return Math.sin(Math.PI * Math.min(1, rho) * .86) * (
    .55 * Math.sin(7 * theta - 3 * phi - phase) +
    .3 * Math.sin(13 * theta + 5 * phi - phase * 1.4 + rho * 12) +
    .15 * Math.cos(21 * theta - 8 * phi + phase * .6 - rho * 17)
  );
}

export function buildFieldMesh(): FieldCell[] {
  const cells: FieldCell[] = [];
  const start = Math.PI * .83, end = Math.PI * 2.17;
  const add = (vertices: FieldVertex[], cap: boolean) => {
    const mean = (key: 'depth' | 'rho' | 'theta' | 'phi') => vertices.reduce((sum, v) => sum + v[key], 0) / vertices.length;
    cells.push({ vertices, depth: mean('depth'), rho: mean('rho'), theta: mean('theta'), phi: mean('phi'), cap });
  };
  // Resolve the highest displayed poloidal mode (m=21) without coarse-grid aliasing.
  for (let p = 0; p < 64; p++) for (let t = 0; t < 96; t++) {
    const phi = start + (end - start) * p / 64, nextPhi = start + (end - start) * (p + 1) / 64;
    const theta = t * Math.PI * 2 / 96, nextTheta = (t + 1) * Math.PI * 2 / 96;
    add([torusVertex(1, theta, phi), torusVertex(1, theta, nextPhi), torusVertex(1, nextTheta, nextPhi), torusVertex(1, nextTheta, phi)], false);
  }
  for (const phi of [start, end]) for (let r = 0; r < 14; r++) for (let t = 0; t < 72; t++) {
    const theta = t * Math.PI * 2 / 72, nextTheta = (t + 1) * Math.PI * 2 / 72;
    add([torusVertex(r / 14, theta, phi), torusVertex((r + 1) / 14, theta, phi), torusVertex((r + 1) / 14, nextTheta, phi), torusVertex(r / 14, nextTheta, phi)], true);
  }
  return cells.sort((a, b) => a.depth - b.depth);
}

/** Normalized synthetic response; deliberately no physical units or measured-accuracy claim. */
export const controlIllustration = Array.from({ length: 101 }, (_, i) => {
  const t = i / 100;
  const target = t < .28 ? .38 : t < .63 ? .72 : .5;
  const stepResponse = (age: number) => age <= 0 ? 0 : 1 - Math.exp(-age * 36) * (Math.cos(age * 44) + .2 * Math.sin(age * 44));
  const response = .38 + .34 * stepResponse(t - .28) - .22 * stepResponse(t - .63) + .004 * Math.sin(t * 115);
  return { t, target, response, error: response - target };
});
