import type { ResolvedTheme } from '../theme/theme-config';
import {
  INDUSTRIAL_STUDIO,
  type TokamakAppearancePreset,
} from './industrialAppearance';

type HemisphereLightSpec = Readonly<{
  sky: number;
  ground: number;
  intensity: number;
}>;

type PositionedLightSpec = Readonly<{
  color: number;
  intensity: number;
  position: readonly [number, number, number];
}>;

type IndustrialLightRig = Readonly<{
  kind: 'industrial';
  hemisphere: HemisphereLightSpec;
  key: PositionedLightSpec;
  fill: PositionedLightSpec;
  rim: PositionedLightSpec;
}>;

type SemanticLightRig = Readonly<{
  kind: 'semantic';
  hemisphere: HemisphereLightSpec;
  key: PositionedLightSpec;
  warm: PositionedLightSpec;
  violet: PositionedLightSpec;
}>;

export type CadSceneTheme = Readonly<{
  fogColor: number;
  fogDensity: number;
  clearColor: number;
  clearAlpha: number;
  exposure: number;
  environmentIntensity: number;
  ground: Readonly<{
    color: number;
    metalness: number;
    roughness: number;
  }>;
  grid: Readonly<{ center: number; line: number; opacity: number }>;
  orbit: Readonly<{ color: number; opacity: number }>;
  lights: IndustrialLightRig | SemanticLightRig;
}>;

const ASSEMBLY_FOG_REFERENCE_RADIUS_METRES = 8;

export function scaleCadFogDensity(
  fogDensity: number,
  appearancePreset: TokamakAppearancePreset,
  sourceModelRadius: number,
): number {
  if (appearancePreset !== 'assembly-color-v1'
    || !Number.isFinite(sourceModelRadius)
    || sourceModelRadius <= 0) return fogDensity;
  return fogDensity * Math.min(1, ASSEMBLY_FOG_REFERENCE_RADIUS_METRES / sourceModelRadius);
}

const DARK_SEMANTIC: CadSceneTheme = {
  fogColor: 0x07110e,
  fogDensity: 0.032,
  clearColor: 0x07110e,
  clearAlpha: 0,
  exposure: 1.2,
  environmentIntensity: 1,
  ground: { color: 0x101715, metalness: 0.02, roughness: 0.94 },
  grid: { center: 0x3ab7a4, line: 0x1b4238, opacity: 0.28 },
  orbit: { color: 0x53e6cf, opacity: 0.22 },
  lights: {
    kind: 'semantic',
    hemisphere: { sky: 0xbdeee2, ground: 0x11100f, intensity: 2.4 },
    key: { color: 0x67eed8, intensity: 3.2, position: [4, 5, 6] },
    warm: { color: 0xff6b24, intensity: 26, position: [-4, 1.5, 3] },
    violet: { color: 0x8e6cff, intensity: 25, position: [1, -3, -4] },
  },
};

const LIGHT_SEMANTIC: CadSceneTheme = {
  fogColor: 0xe8e2d8,
  fogDensity: 0.018,
  clearColor: 0xf1ece4,
  clearAlpha: 0.12,
  exposure: 1.02,
  environmentIntensity: 1,
  ground: { color: 0xd0c9be, metalness: 0.01, roughness: 0.96 },
  grid: { center: 0x8a9a90, line: 0xc8beb1, opacity: 0.42 },
  orbit: { color: 0x718579, opacity: 0.32 },
  lights: {
    kind: 'semantic',
    hemisphere: { sky: 0xfffbf3, ground: 0xa99f93, intensity: 1.78 },
    key: { color: 0xfff7ea, intensity: 2.35, position: [4, 5, 6] },
    warm: { color: 0xc86545, intensity: 8.5, position: [-4, 1.5, 3] },
    violet: { color: 0x7d7085, intensity: 7.5, position: [1, -3, -4] },
  },
};

const DARK_INDUSTRIAL: CadSceneTheme = {
  fogColor: INDUSTRIAL_STUDIO.fogColor,
  fogDensity: INDUSTRIAL_STUDIO.fogDensity,
  clearColor: INDUSTRIAL_STUDIO.clearColor,
  clearAlpha: 0,
  exposure: INDUSTRIAL_STUDIO.exposure,
  environmentIntensity: INDUSTRIAL_STUDIO.environmentIntensity,
  ground: { color: 0x111718, metalness: 0.03, roughness: 0.92 },
  grid: INDUSTRIAL_STUDIO.grid,
  orbit: INDUSTRIAL_STUDIO.orbit,
  lights: {
    kind: 'industrial',
    hemisphere: INDUSTRIAL_STUDIO.hemisphere,
    key: INDUSTRIAL_STUDIO.key,
    fill: INDUSTRIAL_STUDIO.fill,
    rim: INDUSTRIAL_STUDIO.rim,
  },
};

const LIGHT_INDUSTRIAL: CadSceneTheme = {
  fogColor: 0xe5dfd5,
  fogDensity: 0.017,
  clearColor: 0xf2ede5,
  clearAlpha: 0.14,
  exposure: 0.98,
  environmentIntensity: 0.94,
  ground: { color: 0xc8bfb3, metalness: 0.02, roughness: 0.94 },
  grid: { center: 0x8c8175, line: 0xc7beb2, opacity: 0.38 },
  orbit: { color: 0x7c7268, opacity: 0.24 },
  lights: {
    kind: 'industrial',
    hemisphere: { sky: 0xffffff, ground: 0xaaa197, intensity: 1.06 },
    key: { color: 0xfffbf4, intensity: 2.08, position: INDUSTRIAL_STUDIO.key.position },
    fill: { color: 0xd7e2dc, intensity: 0.92, position: INDUSTRIAL_STUDIO.fill.position },
    rim: { color: 0xe1a98e, intensity: 0.66, position: INDUSTRIAL_STUDIO.rim.position },
  },
};

const DARK_ASSEMBLY: CadSceneTheme = {
  fogColor: 0x0a1011,
  fogDensity: 0.0024,
  clearColor: 0x0a1011,
  clearAlpha: 0,
  exposure: 0.84,
  environmentIntensity: 0.48,
  ground: { color: 0x14201d, metalness: 0.02, roughness: 0.96 },
  grid: { center: 0x62877e, line: 0x33433f, opacity: 0.25 },
  orbit: { color: 0x7b9690, opacity: 0.16 },
  lights: {
    kind: 'industrial',
    hemisphere: { sky: 0x9fb4ae, ground: 0x080c0c, intensity: 0.42 },
    key: { color: 0xe8ede8, intensity: 1.24, position: INDUSTRIAL_STUDIO.key.position },
    fill: { color: 0x6fa99f, intensity: 0.28, position: INDUSTRIAL_STUDIO.fill.position },
    rim: { color: 0xd37c58, intensity: 0.38, position: INDUSTRIAL_STUDIO.rim.position },
  },
};

const LIGHT_ASSEMBLY: CadSceneTheme = {
  fogColor: 0x8f9996,
  fogDensity: 0.0008,
  clearColor: 0xaeb7b3,
  clearAlpha: 0.68,
  exposure: 0.8,
  environmentIntensity: 0.42,
  ground: { color: 0x596561, metalness: 0.02, roughness: 0.94 },
  grid: { center: 0x344d47, line: 0x78837f, opacity: 0.38 },
  orbit: { color: 0x425d56, opacity: 0.25 },
  lights: {
    kind: 'industrial',
    hemisphere: { sky: 0xd7dfdc, ground: 0x35403d, intensity: 0.44 },
    key: { color: 0xeee9de, intensity: 1.08, position: INDUSTRIAL_STUDIO.key.position },
    fill: { color: 0x80aaa3, intensity: 0.22, position: INDUSTRIAL_STUDIO.fill.position },
    rim: { color: 0xbd6d4e, intensity: 0.3, position: INDUSTRIAL_STUDIO.rim.position },
  },
};

export function resolveCadSceneTheme(
  theme: ResolvedTheme,
  appearancePreset: TokamakAppearancePreset,
): CadSceneTheme {
  if (appearancePreset === 'assembly-color-v1') {
    return theme === 'light' ? LIGHT_ASSEMBLY : DARK_ASSEMBLY;
  }
  if (appearancePreset === 'industrial-silver-v1') {
    return theme === 'light' ? LIGHT_INDUSTRIAL : DARK_INDUSTRIAL;
  }
  return theme === 'light' ? LIGHT_SEMANTIC : DARK_SEMANTIC;
}
