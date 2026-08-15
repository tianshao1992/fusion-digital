import type { AnalyticPlasmaVisualization } from '../deviceManifest';

export const ANALYTIC_PLASMA_POLOIDAL_SEGMENTS = 160;
export const ANALYTIC_PLASMA_TOROIDAL_SEGMENTS = 192;
export const ANALYTIC_PLASMA_VISIBLE_BY_DEFAULT = true;

/**
 * Fail-closed runtime semantics shared by the manifest contract, viewer and
 * tests. The rendered surface is deliberately not promoted to an equilibrium
 * result merely because it is displayed beside EFIT-capable UI.
 */
export const ANALYTIC_PLASMA_RUNTIME_SEMANTICS = Object.freeze({
  geometryOnly: true,
  isEfit: false,
  hasPsiGrid: false,
  hasXPoint: false,
  hasDiagnostics: false,
  pickable: false,
} as const);

export type AnalyticPlasmaSurfaceData = {
  positions: Float32Array;
  indices: Uint32Array;
};

export type AnalyticPlasmaGeometryData = {
  surface95: AnalyticPlasmaSurfaceData;
  separatrixReferenceContours: [Float32Array, Float32Array];
};

type MillerPoint = readonly [x: number, y: number, z: number];

function assertMillerParameters(
  majorRadiusMetres: number,
  minorRadiusMetres: number,
  kappa: number,
  delta: number,
  theta: number,
  phi: number,
) {
  if (![majorRadiusMetres, minorRadiusMetres, kappa, delta, theta, phi].every(Number.isFinite)
    || majorRadiusMetres <= minorRadiusMetres
    || minorRadiusMetres <= 0
    || kappa <= 0
    || Math.abs(delta) >= 1) {
    throw new RangeError('Invalid Miller geometry parameters.');
  }
}

function millerPointToWebUnchecked(
  majorRadiusMetres: number,
  minorRadiusMetres: number,
  kappa: number,
  delta: number,
  theta: number,
  phi: number,
): MillerPoint {
  const alpha = Math.asin(delta);
  const radius = majorRadiusMetres
    + minorRadiusMetres * Math.cos(theta + alpha * Math.sin(theta));
  const vertical = kappa * minorRadiusMetres * Math.sin(theta);
  return [
    radius * Math.cos(phi),
    vertical,
    -radius * Math.sin(phi),
  ];
}

/**
 * Analytic Miller-style point in the viewer's metre-scale, Y-up,
 * right-handed frame. This is geometry only: it does not evaluate psi,
 * reconstruct an equilibrium, or infer an X point.
 */
export function millerPointToWeb(
  majorRadiusMetres: number,
  minorRadiusMetres: number,
  kappa: number,
  delta: number,
  theta: number,
  phi: number,
): MillerPoint {
  assertMillerParameters(majorRadiusMetres, minorRadiusMetres, kappa, delta, theta, phi);
  return millerPointToWebUnchecked(
    majorRadiusMetres,
    minorRadiusMetres,
    kappa,
    delta,
    theta,
    phi,
  );
}

function buildMillerSurface(
  definition: AnalyticPlasmaVisualization,
  poloidalSegments: number,
  toroidalSegments: number,
): AnalyticPlasmaSurfaceData {
  const positions = new Float32Array(poloidalSegments * toroidalSegments * 3);
  const indices = new Uint32Array(poloidalSegments * toroidalSegments * 6);

  for (let toroidalIndex = 0; toroidalIndex < toroidalSegments; toroidalIndex += 1) {
    const phi = (toroidalIndex / toroidalSegments) * Math.PI * 2;
    for (let poloidalIndex = 0; poloidalIndex < poloidalSegments; poloidalIndex += 1) {
      const theta = (poloidalIndex / poloidalSegments) * Math.PI * 2;
      const point = millerPointToWebUnchecked(
        definition.majorRadiusMetres,
        definition.minorRadiusMetres,
        definition.kappa95,
        definition.delta95,
        theta,
        phi,
      );
      const offset = (toroidalIndex * poloidalSegments + poloidalIndex) * 3;
      positions[offset] = point[0];
      positions[offset + 1] = point[1];
      positions[offset + 2] = point[2];
    }
  }

  let indexOffset = 0;
  for (let toroidalIndex = 0; toroidalIndex < toroidalSegments; toroidalIndex += 1) {
    const nextToroidal = (toroidalIndex + 1) % toroidalSegments;
    for (let poloidalIndex = 0; poloidalIndex < poloidalSegments; poloidalIndex += 1) {
      const nextPoloidal = (poloidalIndex + 1) % poloidalSegments;
      const current = toroidalIndex * poloidalSegments + poloidalIndex;
      const alongToroidal = nextToroidal * poloidalSegments + poloidalIndex;
      const alongPoloidal = toroidalIndex * poloidalSegments + nextPoloidal;
      const diagonal = nextToroidal * poloidalSegments + nextPoloidal;

      // d(phi) x d(theta) points outwards for the chosen web mapping.
      indices[indexOffset] = current;
      indices[indexOffset + 1] = alongToroidal;
      indices[indexOffset + 2] = alongPoloidal;
      indices[indexOffset + 3] = alongToroidal;
      indices[indexOffset + 4] = diagonal;
      indices[indexOffset + 5] = alongPoloidal;
      indexOffset += 6;
    }
  }

  return { positions, indices };
}

function buildMillerContour(
  definition: AnalyticPlasmaVisualization,
  phi: number,
  poloidalSegments: number,
): Float32Array {
  const positions = new Float32Array((poloidalSegments + 1) * 3);
  for (let index = 0; index <= poloidalSegments; index += 1) {
    const theta = (index / poloidalSegments) * Math.PI * 2;
    const point = millerPointToWebUnchecked(
      definition.majorRadiusMetres,
      definition.minorRadiusMetres,
      definition.kappaSeparatrixReference,
      definition.deltaSeparatrixReference,
      theta,
      phi,
    );
    const offset = index * 3;
    positions[offset] = point[0];
    positions[offset + 1] = point[1];
    positions[offset + 2] = point[2];
  }
  return positions;
}

export function buildAnalyticPlasmaGeometry(
  definition: AnalyticPlasmaVisualization,
): AnalyticPlasmaGeometryData {
  assertMillerParameters(
    definition.majorRadiusMetres,
    definition.minorRadiusMetres,
    definition.kappa95,
    definition.delta95,
    0,
    0,
  );
  assertMillerParameters(
    definition.majorRadiusMetres,
    definition.minorRadiusMetres,
    definition.kappaSeparatrixReference,
    definition.deltaSeparatrixReference,
    0,
    0,
  );
  return {
    surface95: buildMillerSurface(
      definition,
      ANALYTIC_PLASMA_POLOIDAL_SEGMENTS,
      ANALYTIC_PLASMA_TOROIDAL_SEGMENTS,
    ),
    separatrixReferenceContours: [
      buildMillerContour(definition, 0, ANALYTIC_PLASMA_POLOIDAL_SEGMENTS),
      buildMillerContour(definition, Math.PI, ANALYTIC_PLASMA_POLOIDAL_SEGMENTS),
    ],
  };
}
