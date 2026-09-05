import type { DevicePartCategory } from '../deviceManifest';

export type TokamakAppearancePreset = 'semantic' | 'industrial-silver-v1' | 'assembly-color-v1';

export type IndustrialMaterialPresetId =
  | 'polished-steel'
  | 'brushed-steel'
  | 'dark-alloy'
  | 'copper-alloy'
  | 'matte-carbon'
  | 'foundation-slate'
  | 'architectural-stone'
  | 'pipework-teal'
  | 'equipment-blue'
  | 'electrical-brass'
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
    color: 0xa8b5b8,
    metalness: 0.72,
    roughness: 0.3,
    envMapIntensity: 0.78,
    clearcoat: 0.15,
    clearcoatRoughness: 0.3,
  },
  'brushed-steel': {
    kind: 'standard',
    color: 0x7b898c,
    metalness: 0.64,
    roughness: 0.46,
    envMapIntensity: 0.68,
  },
  'dark-alloy': {
    kind: 'standard',
    color: 0x3d4749,
    metalness: 0.48,
    roughness: 0.56,
    envMapIntensity: 0.56,
  },
  'copper-alloy': {
    kind: 'standard',
    color: 0x985332,
    metalness: 0.46,
    roughness: 0.4,
    envMapIntensity: 0.62,
  },
  'matte-carbon': {
    kind: 'standard',
    color: 0x252a2b,
    metalness: 0.08,
    roughness: 0.76,
    envMapIntensity: 0.55,
  },
  'foundation-slate': {
    kind: 'standard',
    color: 0x2d393b,
    metalness: 0.02,
    roughness: 0.94,
    envMapIntensity: 0.24,
  },
  'architectural-stone': {
    kind: 'standard',
    color: 0x806a52,
    metalness: 0.04,
    roughness: 0.82,
    envMapIntensity: 0.34,
  },
  'pipework-teal': {
    kind: 'standard',
    color: 0x397f79,
    metalness: 0.18,
    roughness: 0.5,
    envMapIntensity: 0.48,
  },
  'equipment-blue': {
    kind: 'standard',
    color: 0x476f8b,
    metalness: 0.14,
    roughness: 0.58,
    envMapIntensity: 0.44,
  },
  'electrical-brass': {
    kind: 'standard',
    color: 0xa67b35,
    metalness: 0.18,
    roughness: 0.62,
    envMapIntensity: 0.46,
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

export const EHL2_INDUSTRIAL_SYSTEM_PRESETS: Readonly<Record<string, IndustrialMaterialPresetId>> = {
  'ehl2-vessel-assembly': 'polished-steel',
  'ehl2-center-post': 'copper-alloy',
  'ehl2-divertor': 'matte-carbon',
  'ehl2-bellows': 'brushed-steel',
  'ehl2-dewar': 'dark-alloy',
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

export type AnonymousAssemblyVisualMetrics = Readonly<{
  size: readonly [number, number, number];
  centre: readonly [number, number, number];
  assemblySize: readonly [number, number, number];
  assemblyCentre: readonly [number, number, number];
  ordinal: number;
}>;

/**
 * Presentation-only spatial/shape styling for anonymous assembly meshes. The
 * result is deliberately not an engineering-system, material or BOM identity.
 */
export function resolveAnonymousAssemblyMaterialPreset({
  size,
  centre,
  assemblySize,
  assemblyCentre,
  ordinal,
}: AnonymousAssemblyVisualMetrics): IndustrialMaterialPresetId {
  const safeAssembly = assemblySize.map((value) => Math.max(Math.abs(value), 1e-6));
  const normalizedSize = size.map((value, index) => Math.abs(value) / safeAssembly[index]);
  const normalizedCentre = centre.map((value, index) => (value - assemblyCentre[index]) / safeAssembly[index]);
  const sorted = [...normalizedSize].sort((a, b) => a - b);
  const footprint = normalizedSize[0] * normalizedSize[2];
  const flatness = normalizedSize[1] / Math.max(normalizedSize[0], normalizedSize[2], 1e-6);
  const slenderness = sorted[2] / Math.max(sorted[1], 1e-6);
  const radialOffset = Math.hypot(normalizedCentre[0], normalizedCentre[2]);

  // Large, low horizontal surfaces form the visual foundation.
  if (flatness < 0.09 && footprint > 0.075 && normalizedCentre[1] < -0.18) return 'foundation-slate';
  // Large cuboid envelopes are visually separated from machinery as architecture.
  if (sorted[1] > 0.075 && sorted[2] > 0.16 && radialOffset > 0.12) return 'architectural-stone';
  // Long, thin definitions read as pipework/cableways without asserting a real system.
  if (slenderness > 4.2 && sorted[1] < 0.055) return 'pipework-teal';
  // Repeated medium boxes are given a quiet equipment/cabinet colour.
  if (sorted[0] > 0.012 && sorted[2] < 0.16) return ordinal % 5 === 0 ? 'electrical-brass' : 'equipment-blue';
  // Keep the dense central machine legible with the EXL host-page metal palette.
  if (radialOffset < 0.19) return ordinal % 7 === 0 ? 'copper-alloy' : 'polished-steel';
  if (slenderness > 2.2) return 'brushed-steel';
  return ordinal % 9 === 0 ? 'copper-alloy' : 'dark-alloy';
}

export function resolveIndustrialMaterialPreset(
  systemId: string,
  category: DevicePartCategory,
): IndustrialMaterialPresetId {
  return EXL50U_INDUSTRIAL_SYSTEM_PRESETS[systemId]
    ?? EHL2_INDUSTRIAL_SYSTEM_PRESETS[systemId]
    ?? CATEGORY_FALLBACKS[category];
}

export function resolveIndustrialMaterialSpec(
  systemId: string,
  category: DevicePartCategory,
): IndustrialMaterialSpec {
  return INDUSTRIAL_MATERIAL_SPECS[resolveIndustrialMaterialPreset(systemId, category)];
}
