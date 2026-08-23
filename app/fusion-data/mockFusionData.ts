import type {
  FusionArtifact,
  FusionDataProvider,
  FusionEvent,
  FusionQuality,
  FusionShotRecord,
  FusionSignalDescriptor,
  FusionSignalPoint,
  ShotQuery,
  ShotRef,
  SignalQuery,
} from './fusionDataContract';
import { sameShot } from './fusionDataContract';

type ShotSeed = {
  pulse: number;
  scenario: string;
  scenarioEn: string;
  currentScale: number;
  densityScale: number;
  heatingScale: number;
  phase: number;
  quality: FusionQuality;
  tags: string[];
};

const SHOT_SEEDS: ShotSeed[] = [
  { pulse: 10421, scenario: '基准高约束模', scenarioEn: 'Baseline H-mode', currentScale: 1, densityScale: 1, heatingScale: 1, phase: 0.1, quality: 'good', tags: ['baseline', 'H-mode'] },
  { pulse: 10422, scenario: 'q95 扫描', scenarioEn: 'q95 scan', currentScale: 1.04, densityScale: 0.97, heatingScale: 1.08, phase: 0.7, quality: 'good', tags: ['q95-scan', 'reconstruction'] },
  { pulse: 10423, scenario: '密度爬升', scenarioEn: 'Density ramp', currentScale: 0.96, densityScale: 1.12, heatingScale: 0.95, phase: 1.2, quality: 'warning', tags: ['density-ramp', 'quality-gap'] },
  { pulse: 10424, scenario: '辅助加热扫描', scenarioEn: 'Auxiliary-heating scan', currentScale: 1.02, densityScale: 1.03, heatingScale: 1.18, phase: 1.8, quality: 'good', tags: ['heating-scan', 'NBI'] },
  { pulse: 10425, scenario: '低密度参考', scenarioEn: 'Low-density reference', currentScale: 0.93, densityScale: 0.86, heatingScale: 0.9, phase: 2.3, quality: 'good', tags: ['reference', 'low-density'] },
  { pulse: 10426, scenario: '平台段延长', scenarioEn: 'Extended flat-top', currentScale: 1.06, densityScale: 1.05, heatingScale: 1.02, phase: 2.9, quality: 'good', tags: ['flat-top', 'scenario'] },
  { pulse: 10427, scenario: '边界裕量扫描', scenarioEn: 'Boundary-margin scan', currentScale: 0.98, densityScale: 1.07, heatingScale: 1.06, phase: 3.4, quality: 'warning', tags: ['boundary', 'EFIT'] },
  { pulse: 10428, scenario: '合成诊断回放', scenarioEn: 'Synthetic-diagnostic replay', currentScale: 1.01, densityScale: 1.01, heatingScale: 0.98, phase: 4, quality: 'good', tags: ['replay', 'synthetic'] },
];

const TIME_STEP = 0.05;
const DURATION = 4;
const DD_VERSION = '4.1.0';

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function smoothStep(edge0: number, edge1: number, value: number) {
  const x = clamp((value - edge0) / (edge1 - edge0));
  return x * x * (3 - 2 * x);
}

function pulseEnvelope(time: number, extended: boolean) {
  const end = extended ? 3.72 : 3.48;
  return smoothStep(0.22, 0.82, time) * (1 - smoothStep(end, 3.98, time));
}

function buildDescriptor(seed: ShotSeed, id: string, definition: Omit<FusionSignalDescriptor, 'id' | 'mdsplus'>): FusionSignalDescriptor {
  return {
    id,
    ...definition,
    mdsplus: {
      gatewayAlias: 'mock-readonly',
      tree: 'SYNTHETIC',
      shot: seed.pulse,
      resolvedShot: seed.pulse,
      node: `\\SYNTHETIC::TOP:${id.toUpperCase()}`,
      access: 'read-only-gateway',
    },
  };
}

function buildPoints(seed: ShotSeed, sample: (time: number, envelope: number) => number): FusionSignalPoint[] {
  const points: FusionSignalPoint[] = [];
  const extended = seed.pulse === 10426;
  for (let index = 0; index <= Math.round(DURATION / TIME_STEP); index += 1) {
    const time = Number((index * TIME_STEP).toFixed(2));
    const envelope = pulseEnvelope(time, extended);
    const gap = seed.pulse === 10423 && time >= 2.1 && time <= 2.3;
    const invalidTail = seed.pulse === 10427 && time >= 3.42;
    const quality: FusionQuality = gap ? 'missing' : invalidTail ? 'invalid' : 'good';
    const value = quality === 'missing' ? null : Number(sample(time, envelope).toFixed(4));
    points.push({ time, value, sigma: value === null ? null : Number((Math.abs(value) * 0.018).toFixed(4)), quality });
  }
  return points;
}

function buildSignals(seed: ShotSeed) {
  const descriptors = [
    buildDescriptor(seed, 'ip', {
      label: '等离子体电流', labelEn: 'Plasma current', sourceUnit: 'A', unit: 'MA', sourceToValueScale: 1e-6, valueSpace: 'display', samplePolicy: 'nearest', connectAcrossGaps: false, color: '#e18766', authority: 'synthetic', timeMode: 'homogeneous',
      imas: { ids: 'summary', path: 'global_quantities/ip/value', ddVersion: DD_VERSION, occurrence: 0, homogeneousTime: 1 },
    }),
    buildDescriptor(seed, 'ne_line', {
      label: '线平均电子密度', labelEn: 'Line-averaged electron density', sourceUnit: 'm⁻³', unit: '10¹⁹ m⁻³', sourceToValueScale: 1e-19, valueSpace: 'display', samplePolicy: 'nearest', connectAcrossGaps: false, color: '#7bc6b2', authority: 'synthetic', timeMode: 'homogeneous',
      imas: { ids: 'summary', path: 'line_average/n_e/value', ddVersion: DD_VERSION, occurrence: 0, homogeneousTime: 1 },
    }),
    buildDescriptor(seed, 'w_thermal', {
      label: '热能', labelEn: 'Thermal energy', sourceUnit: 'J', unit: 'MJ', sourceToValueScale: 1e-6, valueSpace: 'display', samplePolicy: 'nearest', connectAcrossGaps: false, color: '#b5a4bd', authority: 'reconstructed', timeMode: 'homogeneous',
      imas: { ids: 'summary', path: 'global_quantities/energy_thermal/value', ddVersion: DD_VERSION, occurrence: 0, homogeneousTime: 1 },
    }),
    buildDescriptor(seed, 'p_ohm', {
      label: '欧姆加热功率', labelEn: 'Ohmic heating power', sourceUnit: 'W', unit: 'MW', sourceToValueScale: 1e-6, valueSpace: 'display', samplePolicy: 'nearest', connectAcrossGaps: false, color: '#d6a06c', authority: 'synthetic', timeMode: 'homogeneous',
      imas: { ids: 'summary', path: 'global_quantities/power_ohm/value', ddVersion: DD_VERSION, occurrence: 0, homogeneousTime: 1 },
    }),
  ];

  return [
    { ...descriptors[0], points: buildPoints(seed, (time, envelope) => 1.03 * seed.currentScale * envelope * (1 + 0.012 * Math.sin(time * 9 + seed.phase))) },
    { ...descriptors[1], points: buildPoints(seed, (time, envelope) => (0.35 + 5.7 * seed.densityScale * smoothStep(0.48, 1.35, time)) * envelope * (1 + 0.022 * Math.sin(time * 5 + seed.phase))) },
    { ...descriptors[2], points: buildPoints(seed, (time, envelope) => 0.72 * seed.currentScale * seed.heatingScale * envelope * smoothStep(0.72, 1.38, time) * (1 + 0.035 * Math.cos(time * 4 + seed.phase))) },
    { ...descriptors[3], points: buildPoints(seed, (time, envelope) => 4.8 * seed.heatingScale * envelope * smoothStep(0.68, 1.05, time) * (1 - 0.34 * smoothStep(3.08, 3.28, time))) },
  ];
}

function buildEvents(seed: ShotSeed): FusionEvent[] {
  return [
    { id: 'breakdown', time: 0.24, label: '击穿', labelEn: 'Breakdown', kind: 'phase' },
    { id: 'heating-on', time: 0.72, label: '辅助加热开启', labelEn: 'Auxiliary heating on', kind: 'heating' },
    { id: 'flat-top', time: 1.12, label: '平台段开始', labelEn: 'Flat-top start', kind: 'phase' },
    { id: 'ramp-down', time: seed.pulse === 10426 ? 3.72 : 3.48, label: '下降段', labelEn: 'Ramp-down', kind: 'phase' },
  ];
}

function buildArtifacts(seed: ShotSeed): FusionArtifact[] {
  return [{
    id: `cae-${seed.pulse}-r2`,
    label: '合成第一壁等效应力场',
    labelEn: 'Synthetic first-wall equivalent-stress field',
    version: 'v2.1.0-mock',
    format: 'VTPC',
    authority: 'simulated',
    checksum: `mock:sha256:cae-${seed.pulse}-deterministic-fixture`,
    viewerMode: 'trame',
    timeSteps: Math.round(DURATION / TIME_STEP) + 1,
    pointFields: ['temperature', 'heat_flux'],
    cellFields: ['von_mises_stress'],
  }];
}

function buildRecord(seed: ShotSeed, index: number): FusionShotRecord {
  const signals = buildSignals(seed);
  const peakCurrent = Math.max(...signals[0].points.flatMap(({ value }) => value === null ? [] : [value]));
  const peakHeatingPower = Math.max(...signals[3].points.flatMap(({ value }) => value === null ? [] : [value]));
  return {
    summary: {
      id: `SYN-${seed.pulse}`,
      title: `合成炮次 ${seed.pulse}`,
      titleEn: `Synthetic pulse ${seed.pulse}`,
      scenario: seed.scenario,
      scenarioEn: seed.scenarioEn,
      facility: index < 5 ? 'EXL-50U digital twin' : 'EHL-2 digital twin',
      database: 'fusiondigital_mock',
      pulse: seed.pulse,
      run: (index % 3) + 1,
      occurrence: 0,
      processingRun: `mock-pipeline-r${String(index + 3).padStart(2, '0')}`,
      authority: 'synthetic',
      quality: seed.quality,
      synthetic: true,
      compliance: 'mapping-preview',
      duration: DURATION,
      peakCurrent: Number(peakCurrent.toFixed(3)),
      peakHeatingPower: Number(peakHeatingPower.toFixed(2)),
      tags: seed.tags,
    },
    signals,
    events: buildEvents(seed),
    artifacts: buildArtifacts(seed),
    provenance: {
      sourceRevision: `mock-source-${seed.pulse}-r1`,
      mappingVersion: `fd-imas-map-${DD_VERSION}-preview.2`,
      geometryVersion: 'synthetic-wall-2026.08',
      generatorVersion: 'fusion-data-fixture-v1',
      generatedAt: '2026-08-23T00:00:00Z',
    },
  };
}

export const mockFusionShots = SHOT_SEEDS.map(buildRecord);

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw signal.reason ?? new DOMException('The operation was aborted.', 'AbortError');
}

function limitPoints<T>(points: T[], maxPoints: number | undefined) {
  if (maxPoints === undefined || points.length <= maxPoints) return points;
  const limit = Math.max(0, Math.floor(maxPoints));
  if (limit === 0) return [];
  if (limit === 1) return [points[0]];
  return Array.from({ length: limit }, (_, index) => points[Math.round(index * (points.length - 1) / (limit - 1))]);
}

export class MockFusionDataProvider implements FusionDataProvider {
  async listShots(query: ShotQuery = {}) {
    throwIfAborted(query.signal);
    const needle = query.search?.trim().toLowerCase() ?? '';
    return mockFusionShots
      .map(({ summary }) => summary)
      .filter((shot) => !query.facility || shot.facility === query.facility)
      .filter((shot) => !query.authority || shot.authority === query.authority)
      .filter((shot) => !needle || `${shot.id} ${shot.scenario} ${shot.scenarioEn} ${shot.tags.join(' ')}`.toLowerCase().includes(needle));
  }

  async loadShot(ref: ShotRef, signal?: AbortSignal) {
    throwIfAborted(signal);
    const record = mockFusionShots.find(({ summary }) => sameShot(summary, ref));
    if (!record) throw new Error(`Unknown synthetic shot ${ref.facility}/${ref.pulse}/${ref.run}`);
    return record;
  }

  async loadSignals(query: SignalQuery) {
    const record = await this.loadShot(query.shot, query.signal);
    const [start, end] = query.timeRange ?? [-Infinity, Infinity];
    return record.signals
      .filter(({ id }) => query.signalIds.includes(id))
      .map((series) => ({ ...series, points: limitPoints(series.points.filter(({ time }) => time >= start && time <= end), query.maxPoints) }));
  }

  async listArtifacts(ref: ShotRef, signal?: AbortSignal) {
    return (await this.loadShot(ref, signal)).artifacts;
  }
}

export const mockFusionDataProvider = new MockFusionDataProvider();
