import type { Exl50uSensorFamily, Exl50uSensorPoint } from './exl50uSensorPoints';

export const EXL50U_SENSOR_FAMILIES = ['LD', 'PF', 'TF', 'TF_V', 'SMOKE'] as const;

export type Exl50uSensorColorHex = `#${string}`;
export type Exl50uSensorFamilyColors = Readonly<Record<Exl50uSensorFamily, Exl50uSensorColorHex>>;
export type Exl50uSensorPointColorOverrides = Readonly<Record<string, Exl50uSensorColorHex>>;

/**
 * Stable, theme-independent signal colours. The palette deliberately avoids the
 * site's cyan/orange/purple brand colours so the measurement layer remains
 * distinct from the CAD systems and surrounding controls.
 */
export const DEFAULT_EXL50U_SENSOR_FAMILY_COLORS: Exl50uSensorFamilyColors = Object.freeze({
  LD: '#E40046',
  PF: '#FFD600',
  TF: '#0057B8',
  TF_V: '#008A3B',
  SMOKE: '#F7F7F7',
});

export const EXL50U_SENSOR_MARKER_OUTLINE_DARK = 0x0b0f14;
export const EXL50U_SENSOR_MARKER_OUTLINE_LIGHT = 0xf8fafc;

const COLOR_HEX_PATTERN = /^#[0-9A-F]{6}$/i;

export function normalizeExl50uSensorColorHex(value: unknown): Exl50uSensorColorHex | null {
  if (typeof value !== 'string' || !COLOR_HEX_PATTERN.test(value)) return null;
  return value.toUpperCase() as Exl50uSensorColorHex;
}

export function exl50uSensorColorHexToNumber(value: Exl50uSensorColorHex) {
  return Number.parseInt(value.slice(1), 16);
}

export function normalizeExl50uSensorFamilyColors(value: unknown): Exl50uSensorFamilyColors | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !EXL50U_SENSOR_FAMILIES.includes(key as Exl50uSensorFamily))) return null;
  const normalized = {} as Record<Exl50uSensorFamily, Exl50uSensorColorHex>;
  for (const family of EXL50U_SENSOR_FAMILIES) {
    const color = normalizeExl50uSensorColorHex(record[family]);
    if (!color) return null;
    normalized[family] = color;
  }
  return normalized;
}

export function normalizeExl50uSensorPointColorOverrides(
  value: unknown,
  knownIds: ReadonlySet<string>,
): Exl50uSensorPointColorOverrides | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const normalized: Record<string, Exl50uSensorColorHex> = {};
  for (const [pointId, candidate] of Object.entries(value as Record<string, unknown>)) {
    const color = normalizeExl50uSensorColorHex(candidate);
    if (!knownIds.has(pointId) || !color) return null;
    normalized[pointId] = color;
  }
  return normalized;
}

export function resolveExl50uSensorPointColor(
  point: Pick<Exl50uSensorPoint, 'id' | 'family'>,
  familyColors: Exl50uSensorFamilyColors,
  pointColorOverrides: Exl50uSensorPointColorOverrides,
) {
  return pointColorOverrides[point.id] ?? familyColors[point.family];
}
