/** Shared presentation preset; geometry and physical authority remain engine-specific. */
export const SURFACE_SCENE_STYLE = {
  fov: 36,
  exposure: 1.35,
  home: [2.7, 1.9, 3.5] as const,
  minDistance: .7,
  maxDistance: 12,
  maxPolarAngle: Math.PI * .94,
} as const;
