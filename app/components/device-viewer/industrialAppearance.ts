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
  | 'machine-red'
  | 'industrial-green'
  | 'cabinet-pearl'
  | 'signal-blue'
  | 'safety-yellow'
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
    color: 0x8f9ea1,
    metalness: 0.68,
    roughness: 0.34,
    envMapIntensity: 0.52,
    clearcoat: 0.08,
    clearcoatRoughness: 0.42,
  },
  'brushed-steel': {
    kind: 'standard',
    color: 0x667579,
    metalness: 0.58,
    roughness: 0.52,
    envMapIntensity: 0.44,
  },
  'dark-alloy': {
    kind: 'standard',
    color: 0x3a4644,
    metalness: 0.34,
    roughness: 0.66,
    envMapIntensity: 0.3,
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
    color: 0x17211f,
    metalness: 0.02,
    roughness: 0.96,
    envMapIntensity: 0.14,
  },
  'architectural-stone': {
    kind: 'standard',
    color: 0x485653,
    metalness: 0.05,
    roughness: 0.8,
    envMapIntensity: 0.28,
  },
  'pipework-teal': {
    kind: 'standard',
    color: 0x236d5d,
    metalness: 0.22,
    roughness: 0.46,
    envMapIntensity: 0.52,
  },
  'equipment-blue': {
    kind: 'standard',
    color: 0x315f87,
    metalness: 0.22,
    roughness: 0.48,
    envMapIntensity: 0.5,
  },
  'electrical-brass': {
    kind: 'standard',
    color: 0xa67b35,
    metalness: 0.18,
    roughness: 0.62,
    envMapIntensity: 0.46,
  },
  'machine-red': {
    kind: 'physical',
    color: 0xa22a22,
    metalness: 0.2,
    roughness: 0.46,
    envMapIntensity: 0.38,
    clearcoat: 0.1,
    clearcoatRoughness: 0.42,
  },
  'industrial-green': {
    kind: 'standard',
    color: 0x286550,
    metalness: 0.1,
    roughness: 0.58,
    envMapIntensity: 0.34,
  },
  'cabinet-pearl': {
    kind: 'standard',
    color: 0x82908f,
    metalness: 0.1,
    roughness: 0.68,
    envMapIntensity: 0.32,
  },
  'signal-blue': {
    kind: 'standard',
    color: 0x245b92,
    metalness: 0.12,
    roughness: 0.54,
    envMapIntensity: 0.36,
  },
  'safety-yellow': {
    kind: 'standard',
    color: 0xd9aa22,
    metalness: 0.02,
    roughness: 0.62,
    envMapIntensity: 0.32,
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
  const physicalSize = size.map((value) => Math.abs(value));
  const sorted = [...physicalSize].sort((a, b) => a - b);
  const footprint = normalizedSize[0] * normalizedSize[2];
  const flatness = physicalSize[1] / Math.max(physicalSize[0], physicalSize[2], 1e-6);
  const slenderness = sorted[2] / Math.max(sorted[1], 1e-6);
  const radialOffset = Math.hypot(normalizedCentre[0], normalizedCentre[2]);
  const horizontalSize = Math.max(physicalSize[0], physicalSize[2], 1e-6);
  const planRoundness = Math.min(physicalSize[0], physicalSize[2]) / horizontalSize;
  const centralMachine = radialOffset < 0.24 && Math.abs(normalizedCentre[1]) < 0.38;
  const largeBody = normalizedSize.some((value) => value > 0.22);
  const largeBodyCadence = Math.abs(
    (ordinal * 17)
    ^ Math.round((centre[0] + 70) * 10)
    ^ Math.round((centre[2] + 16) * 10)
    ^ Math.round(physicalSize[0] * 10),
  ) % 20;

  // Large, low horizontal surfaces form the visual foundation.
  if (flatness < 0.09 && footprint > 0.075 && normalizedCentre[1] < -0.18) return 'foundation-slate';
  // A handful of transport draw calls span most of the long hall. Keep those
  // envelopes graphite/architectural so the foundation and distant building
  // do not wash out the denser machine at the photographed end of the model.
  if (normalizedSize[0] > 0.86 && normalizedSize[2] > 0.82) {
    return ordinal % 2 === 0 ? 'architectural-stone' : 'foundation-slate';
  }
  if (normalizedSize[0] > 0.38 && normalizedSize[2] > 0.62) {
    if (centre[0] >= -8) return 'dark-alloy';
    return ordinal % 3 === 0 ? 'architectural-stone' : 'cabinet-pearl';
  }
  // The anonymous derivative contains twenty large, interleaved visual
  // batches rather than engineering systems. A stable, geometry-derived
  // cadence distributes the photographed EXL palette across those batches:
  // steel remains dominant while red machine bodies, green equipment and one
  // blue routing layer remain legible at whole-installation scale.
  if (largeBody) {
    if (largeBodyCadence === 12) return 'machine-red';
    if (largeBodyCadence === 11) return 'industrial-green';
    if (largeBodyCadence === 10 || largeBodyCadence === 13) return 'dark-alloy';
    return largeBodyCadence % 2 === 0 ? 'polished-steel' : 'brushed-steel';
  }
  // Broad, near-round horizontal bodies around the visual centre echo the
  // photographed EXL-50U red machine rings without claiming coil identity.
  if (centralMachine && planRoundness > 0.52 && flatness > 0.045 && flatness < 0.38
    && Math.max(normalizedSize[0], normalizedSize[2]) > 0.028) {
    return ordinal % 4 === 0 ? 'machine-red' : 'polished-steel';
  }
  // Keep the dense central machine predominantly stainless steel, with a
  // restrained cadence of EXL-red and industrial-green gallery accents.
  if (centralMachine) {
    if (ordinal % 19 === 0 || ordinal % 23 === 0) return 'machine-red';
    if (ordinal % 17 === 0) return 'industrial-green';
    if (ordinal % 29 === 0) return 'signal-blue';
    return ordinal % 3 === 0 ? 'brushed-steel' : 'polished-steel';
  }
  // Long, thin definitions read primarily as stainless pipework and rails;
  // green, blue and yellow are sparse routing/safety accents inspired by the
  // facility photographs, not engineering-system labels.
  if (slenderness > 4.2 && sorted[1] < 0.42) {
    if (ordinal % 19 === 0) return 'safety-yellow';
    if (ordinal % 7 === 0) return 'signal-blue';
    if (ordinal % 13 === 0) return 'industrial-green';
    return ordinal % 3 === 0 ? 'brushed-steel' : 'polished-steel';
  }
  // Large cuboid envelopes resemble cabinets and architectural enclosures.
  if (normalizedSize.filter((value) => value > 0.075).length >= 2
    && Math.max(...normalizedSize) > 0.16 && radialOffset > 0.12) {
    if (ordinal % 11 === 0) return 'industrial-green';
    if (ordinal % 13 === 0) return 'signal-blue';
    return ordinal % 5 === 0 ? 'architectural-stone' : 'cabinet-pearl';
  }
  // Repeated medium boxes stay quiet and pearlescent, with controlled colour
  // beats so the installation reads as one machine instead of a patchwork.
  if (sorted[0] > 0.1 && sorted[2] < 4.2 && slenderness < 3.6) {
    if (ordinal % 17 === 0) return 'safety-yellow';
    if (ordinal % 7 === 0) return 'industrial-green';
    if (ordinal % 11 === 0) return 'signal-blue';
    return 'cabinet-pearl';
  }
  if (slenderness > 2.2) return ordinal % 23 === 0 ? 'machine-red' : 'brushed-steel';
  return ordinal % 11 === 0 ? 'industrial-green' : 'dark-alloy';
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
