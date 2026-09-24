import calibration from '../../../public/models/exl50u-icrf-antenna/calibration.json';
import manifest from '../../../public/models/exl50u-icrf-antenna/manifest.json';

export const ICRF_MODEL = manifest.webModel;
export const ICRF_DEFAULT_RADIUS_MM = 1350;
// Display exploration bounds, NOT a measured mechanical stroke or safe envelope.
export const ICRF_DISPLAY_RADIUS_RANGE_MM = [1100, 1600] as const;
export type IcrfAntennaOptions = { visible: boolean; radiusMm: number };
export type IcrfAntennaStatus = 'waiting' | 'loading' | 'ready' | 'error';
export const ICRF_DEFAULT_OPTIONS: IcrfAntennaOptions = { visible: true, radiusMm: ICRF_DEFAULT_RADIUS_MM };

export function antennaPlacement(radiusMm = ICRF_DEFAULT_RADIUS_MM) {
  if (!Number.isFinite(radiusMm) || radiusMm < ICRF_DISPLAY_RADIUS_RANGE_MM[0]
    || radiusMm > ICRF_DISPLAY_RADIUS_RANGE_MM[1]) throw new Error('ICRF display radius out of range');
  const cx = calibration.sourceTangentialCenterXmm;
  const cy = calibration.sourceMidplaneYmm;
  const section = calibration.crossSectionMm;
  const contact = (group: typeof section[number], offset: number) => {
    let radius = Infinity;
    for (const [a, b] of group.segments) {
      const x = a[0] - cx, z = a[1] + offset;
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const lengthSq = dx * dx + dz * dz;
      const u = lengthSq ? Math.max(0, Math.min(1, -(x * dx + z * dz) / lengthSq)) : 0;
      radius = Math.min(radius, Math.hypot(x + u * dx, z + u * dz));
    }
    return radius;
  };
  // User-confirmed OUTER pair. Use segment interiors, not an AABB or a flat plane.
  const outer = section.filter((group) => group.name.startsWith('outer_'));
  let lo = 0, hi = radiusMm + 1000;
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    if (Math.min(...outer.map((group) => contact(group, mid))) < radiusMm) lo = mid;
    else hi = mid;
  }
  const offset = (lo + hi) / 2;
  const phi = 300 * Math.PI / 180, c = Math.cos(phi), s = Math.sin(phi);
  // Source is metres. +Y vertical, +Z radial outward, -X right-handed transverse.
  // World: [R cos(phi), Z, -R sin(phi)]. Column-major rigid THREE.Matrix4.
  const matrix = [-s, 0, -c, 0, 0, 1, 0, 0, c, 0, -s, 0,
    (c * offset + s * cx) / 1000, -cy / 1000, (-s * offset + c * cx) / 1000, 1];
  return {
    matrix, radialOffsetMm: offset,
    outerRadiusMm: Math.min(...outer.map((group) => contact(group, offset))),
    innerRadiusMm: Math.min(...section.filter((group) => group.name.startsWith('inner_')).map((group) => contact(group, offset))),
    // Middle of antenna thickness on the mounting centreline, for a front-face camera.
    focusWebMetres: [c * (offset + 185) / 1000, 0, -s * (offset + 185) / 1000] as [number, number, number],
  };
}
