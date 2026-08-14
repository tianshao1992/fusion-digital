import type { DevicePartCategory } from '../deviceManifest';

export type TokamakAppearancePreset = 'semantic' | 'industrial-silver-v1';

export type IndustrialMaterialPresetId =
  | 'polished-steel'
  | 'brushed-steel'
  | 'dark-alloy'
  | 'copper-alloy'
  | 'matte-carbon'
  | 'plasma';

export type IndustrialMaterialSpec = Readonly<{
  kind: 'standard' | 'physical';
  color: number;
  metalness: number;
  roughness: number;
  envMapIntensity: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
  emissive?: number;
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
  doubleSided?: boolean;
}>;

export const INDUSTRIAL_MATERIAL_SPECS: Readonly<Record<IndustrialMaterialPresetId, IndustrialMaterialSpec>> = {
  'polished-steel': {
    kind: 'physical',
    color: 0xb8c0c2,
    metalness: 0.86,
    roughness: 0.24,
    envMapIntensity: 1.2,
    clearcoat: 0.15,
    clearcoatRoughness: 0.3,
  },
  'brushed-steel': {
    kind: 'standard',
    color: 0x939c9f,
    metalness: 0.82,
    roughness: 0.38,
    envMapIntensity: 1.02,
  },
  'dark-alloy': {
    kind: 'standard',
    color: 0x4d5659,
    metalness: 0.72,
    roughness: 0.46,
    envMapIntensity: 0.88,
  },
  'copper-alloy': {
    kind: 'standard',
    color: 0xa86a40,
    metalness: 0.74,
    roughness: 0.31,
    envMapIntensity: 1.05,
  },
  'matte-carbon': {
    kind: 'standard',
    color: 0x252a2b,
    metalness: 0.08,
    roughness: 0.76,
    envMapIntensity: 0.55,
  },
  plasma: {
    kind: 'physical',
    color: 0xff6a1e,
    metalness: 0.08,
    roughness: 0.18,
    envMapIntensity: 0.65,
    emissive: 0xff3d09,
    emissiveIntensity: 3.4,
    transparent: true,
    opacity: 0.9,
    doubleSided: true,
  },
};

/**
 * These presets are presentation-only appearance codes. They do not assert the
 * real material, coating, finish, temperature or engineering condition of a part.
 */
export const EXL50U_INDUSTRIAL_SYSTEM_PRESETS: Readonly<Record<string, IndustrialMaterialPresetId>> = {
  'coil-support': 'brushed-steel',
  coil: 'copper-alloy',
  'torsional-support': 'brushed-steel',
  'vacuum-vessel': 'polished-steel',
  'divertor-support': 'dark-alloy',
  'cfc-limiter': 'matte-carbon',
  'passive-stabilizer': 'copper-alloy',
  'fast-control-coil': 'copper-alloy',
  'cfc-protecting-block': 'matte-carbon',
  divertor: 'dark-alloy',
  cryopump: 'polished-steel',
  'vde-coil-supports': 'brushed-steel',
};

const CATEGORY_FALLBACKS: Readonly<Record<DevicePartCategory, IndustrialMaterialPresetId>> = {
  plasma: 'plasma',
  tf: 'copper-alloy',
  pf: 'copper-alloy',
  layer: 'dark-alloy',
  structure: 'brushed-steel',
};

export const INDUSTRIAL_STUDIO = {
  fogColor: 0x080b0c,
  fogDensity: 0.026,
  clearColor: 0x080b0c,
  exposure: 1.02,
  environmentIntensity: 1.08,
  hemisphere: { sky: 0xe8eeee, ground: 0x111416, intensity: 0.92 },
  key: { color: 0xf5f7f5, intensity: 2.35, position: [4.5, 6.5, 7] as const },
  fill: { color: 0xb8d3e2, intensity: 1.08, position: [-5, 2.5, 4] as const },
  rim: { color: 0xffc59b, intensity: 0.92, position: [2, 1.5, -6] as const },
  grid: { center: 0x768783, line: 0x293431, opacity: 0.2 },
  orbit: { color: 0x8c9b98, opacity: 0.14 },
  selection: { tint: 0xffb06a, mix: 0.07, emissive: 0xff8a3d, emissiveIntensity: 0.58, roughnessDelta: -0.05 },
} as const;

export function resolveIndustrialMaterialPreset(
  systemId: string,
  category: DevicePartCategory,
): IndustrialMaterialPresetId {
  return EXL50U_INDUSTRIAL_SYSTEM_PRESETS[systemId] ?? CATEGORY_FALLBACKS[category];
}

export function resolveIndustrialMaterialSpec(
  systemId: string,
  category: DevicePartCategory,
): IndustrialMaterialSpec {
  return INDUSTRIAL_MATERIAL_SPECS[resolveIndustrialMaterialPreset(systemId, category)];
}
