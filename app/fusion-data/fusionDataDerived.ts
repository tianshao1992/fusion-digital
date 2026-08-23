import type { FusionQuality, FusionShotRecord } from './fusionDataContract';

export const diagnosticChannels = [
  { id: 'flux-loop-01', label: '磁通环 01', labelEn: 'Flux loop 01', ids: 'magnetics/flux_loop/0/flux' },
  { id: 'flux-loop-02', label: '磁通环 02', labelEn: 'Flux loop 02', ids: 'magnetics/flux_loop/1/flux' },
  { id: 'bpol-a01', label: '极向场探针 A01', labelEn: 'B-pol probe A01', ids: 'magnetics/b_field_pol_probe/0/field' },
  { id: 'bpol-a02', label: '极向场探针 A02', labelEn: 'B-pol probe A02', ids: 'magnetics/b_field_pol_probe/1/field' },
  { id: 'interferometer', label: '干涉仪主弦', labelEn: 'Interferometer main chord', ids: 'interferometer/channel/0/n_e_line' },
  { id: 'ece-07', label: 'ECE 通道 07', labelEn: 'ECE channel 07', ids: 'ece/channel/6/t_e' },
  { id: 'bolometer-03', label: '辐射计 03', labelEn: 'Bolometer 03', ids: 'bolometer/channel/2/power' },
  { id: 'diamagnetic-flux', label: '抗磁磁通', labelEn: 'Diamagnetic flux', ids: 'magnetics/diamagnetic_flux/0/flux' },
] as const;

export type QualityCell = {
  timeIndex: number;
  channelIndex: number;
  quality: FusionQuality;
  code: 0 | 1 | 2 | 3;
};

const QUALITY_CODE: Record<FusionQuality, QualityCell['code']> = { missing: 0, invalid: 1, warning: 2, good: 3 };

export type DerivedAvailability =
  | { available: true; quality: 'good' | 'warning'; reason: null; signalId: null }
  | { available: false; quality: 'missing' | 'invalid'; reason: 'signal-not-found' | 'source-missing' | 'source-invalid'; signalId: string };

function sourceAvailability(shot: FusionShotRecord, timeIndex: number, signalIds: string[]): DerivedAvailability {
  let warning = false;
  for (const signalId of signalIds) {
    const signal = shot.signals.find(({ id }) => id === signalId);
    if (!signal) return { available: false, quality: 'invalid', reason: 'signal-not-found', signalId };
    const point = signal.points[timeIndex];
    if (!point || point.quality === 'missing' || point.value === null) return { available: false, quality: 'missing', reason: 'source-missing', signalId };
    if (point.quality === 'invalid') return { available: false, quality: 'invalid', reason: 'source-invalid', signalId };
    if (point.quality === 'warning') warning = true;
  }
  return { available: true, quality: warning ? 'warning' : 'good', reason: null, signalId: null };
}

export function buildDiagnosticQuality(shot: FusionShotRecord): QualityCell[] {
  const times = shot.signals[0].points;
  return diagnosticChannels.flatMap((_, channelIndex) => times.map(({ time }, timeIndex) => {
    let quality: FusionQuality = 'good';
    if (time < 0.18 || time > 3.94) quality = 'missing';
    else if ((channelIndex === 4 && shot.summary.pulse === 10423 && time >= 2.1 && time <= 2.3)
      || (channelIndex === 5 && time >= 3.45 && time <= 3.6)) quality = 'missing';
    else if (channelIndex === 2 && shot.summary.pulse === 10427 && time >= 3.42) quality = 'invalid';
    else if ((channelIndex + shot.summary.pulse + timeIndex) % 43 === 0
      || (channelIndex === 6 && time >= 2.55 && time <= 2.72)) quality = 'warning';
    return { timeIndex, channelIndex, quality, code: QUALITY_CODE[quality] };
  }));
}

export type RadialProfiles = {
  availability: DerivedAvailability;
  rho: number[];
  electronTemperature: number[];
  electronDensity: number[];
  safetyFactor: number[];
};

export function buildRadialProfiles(shot: FusionShotRecord, timeIndex: number): RadialProfiles {
  const safeIndex = Math.max(0, Math.min(timeIndex, shot.signals[0].points.length - 1));
  const availability = sourceAvailability(shot, safeIndex, ['ip', 'ne_line', 'p_ohm']);
  if (!availability.available) return { availability, rho: [], electronTemperature: [], electronDensity: [], safetyFactor: [] };
  const ip = shot.signals.find(({ id }) => id === 'ip')!.points[safeIndex].value!;
  const ne = shot.signals.find(({ id }) => id === 'ne_line')!.points[safeIndex].value!;
  const power = shot.signals.find(({ id }) => id === 'p_ohm')!.points[safeIndex].value!;
  const phase = shot.summary.pulse % 17 / 17;
  const rho = Array.from({ length: 31 }, (_, index) => Number((index / 30).toFixed(3)));
  return {
    availability,
    rho,
    electronTemperature: rho.map((value) => Number((0.04 + (1.4 + power * 0.13) * Math.pow(Math.max(0, 1 - value ** 1.7), 1.18) * (0.88 + ip * 0.12)).toFixed(3))),
    electronDensity: rho.map((value) => Number((0.08 + ne * (1 - 0.64 * value ** 2.1) * (1 + 0.025 * Math.sin(value * 8 + phase))).toFixed(3))),
    safetyFactor: rho.map((value) => Number((1.02 + 3.55 * value ** 2 + 0.18 * (1 - ip)).toFixed(3))),
  };
}

export type EquilibriumFrame = {
  availability: DerivedAvailability;
  r: number[];
  z: number[];
  psi: [number, number, number][];
  boundary: [number, number][];
  magneticAxis: [number, number];
  xPoint: [number, number];
};

export function buildEquilibriumFrame(shot: FusionShotRecord, timeIndex: number): EquilibriumFrame {
  const safeIndex = Math.max(0, Math.min(timeIndex, shot.signals[0].points.length - 1));
  const availability = sourceAvailability(shot, safeIndex, ['ip']);
  if (!availability.available) return { availability, r: [], z: [], psi: [], boundary: [], magneticAxis: [0, 0], xPoint: [0, 0] };
  const ip = shot.signals.find(({ id }) => id === 'ip')!.points[safeIndex].value!;
  const time = shot.signals[0].points[safeIndex].time;
  const magneticAxis: [number, number] = [Number((1.7 + 0.025 * Math.sin(time * 1.8)).toFixed(4)), Number((0.018 * Math.sin(time * 2.3)).toFixed(4))];
  const minorRadius = 0.48 * (0.72 + 0.28 * Math.min(1, ip));
  const elongation = 1.58 + 0.07 * Math.sin(time * 1.2);
  const triangularity = 0.28 + 0.025 * Math.cos(time * 1.6);
  const r = Array.from({ length: 43 }, (_, index) => Number((1.08 + index * (1.25 / 42)).toFixed(4)));
  const z = Array.from({ length: 43 }, (_, index) => Number((-0.96 + index * (1.92 / 42)).toFixed(4)));
  const psi: [number, number, number][] = [];
  for (const zValue of z) {
    for (const rValue of r) {
      const radial = (rValue - magneticAxis[0]) / Math.max(minorRadius, 0.12);
      const vertical = (zValue - magneticAxis[1]) / Math.max(minorRadius * elongation, 0.18);
      psi.push([rValue, zValue, Number(Math.min(1.35, Math.sqrt(radial ** 2 + vertical ** 2)).toFixed(4))]);
    }
  }
  const boundary = Array.from({ length: 121 }, (_, index) => {
    const theta = 2 * Math.PI * index / 120;
    return [
      Number((magneticAxis[0] + minorRadius * Math.cos(theta + triangularity * Math.sin(theta))).toFixed(4)),
      Number((magneticAxis[1] + minorRadius * elongation * Math.sin(theta)).toFixed(4)),
    ] as [number, number];
  });
  return {
    availability,
    r,
    z,
    psi,
    boundary,
    magneticAxis,
    xPoint: [Number((magneticAxis[0] - minorRadius * triangularity).toFixed(4)), Number((magneticAxis[1] - minorRadius * elongation * 0.94).toFixed(4))],
  };
}

export type CaeFieldFrame = {
  availability: DerivedAvailability;
  r: number[];
  z: number[];
  values: [number, number, number][];
  min: number;
  max: number;
  field: 'von_mises_stress';
  unit: 'MPa';
};

export function buildCaeFieldFrame(shot: FusionShotRecord, timeIndex: number): CaeFieldFrame {
  const safeIndex = Math.max(0, Math.min(timeIndex, shot.signals[0].points.length - 1));
  const availability = sourceAvailability(shot, safeIndex, ['p_ohm']);
  if (!availability.available) return { availability, r: [], z: [], values: [], min: 0, max: 0, field: 'von_mises_stress', unit: 'MPa' };
  const power = shot.signals.find(({ id }) => id === 'p_ohm')!.points[safeIndex].value!;
  const time = shot.signals[0].points[safeIndex].time;
  const r = Array.from({ length: 34 }, (_, index) => Number((1.15 + index * (1.1 / 33)).toFixed(4)));
  const z = Array.from({ length: 30 }, (_, index) => Number((-0.82 + index * (1.64 / 29)).toFixed(4)));
  const values: [number, number, number][] = [];
  let min = Infinity;
  let max = -Infinity;
  for (const zValue of z) {
    for (const rValue of r) {
      const hotSpot = Math.exp(-(((rValue - 1.92) / 0.19) ** 2 + ((zValue + 0.48) / 0.23) ** 2));
      const secondary = 0.5 * Math.exp(-(((rValue - 1.43) / 0.24) ** 2 + ((zValue - 0.35) / 0.28) ** 2));
      const value = Number((38 + 3.4 * power + (105 + power * 4.2) * hotSpot + 62 * secondary + 7 * Math.sin(time * 1.4 + rValue * 3)).toFixed(3));
      min = Math.min(min, value);
      max = Math.max(max, value);
      values.push([rValue, zValue, value]);
    }
  }
  return { availability, r, z, values, min: Number(min.toFixed(2)), max: Number(max.toFixed(2)), field: 'von_mises_stress', unit: 'MPa' };
}
