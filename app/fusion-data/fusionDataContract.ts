export type FusionAuthority = 'raw' | 'calibrated' | 'reconstructed' | 'simulated' | 'synthetic';
export type FusionQuality = 'good' | 'warning' | 'invalid' | 'missing';
export type FusionTimeMode = 'homogeneous' | 'heterogeneous' | 'static';

export type ShotRef = {
  facility: string;
  database: string;
  pulse: number;
  run: number;
  occurrence: number;
};

export type ImasBinding = {
  ids: string;
  path: string;
  ddVersion: string;
  occurrence: number;
  homogeneousTime: 0 | 1 | 2;
};

export type MdsplusBinding = {
  gatewayAlias: string;
  tree: string;
  shot: number;
  resolvedShot: number;
  node: string;
  access: 'read-only-gateway';
};

export type FusionSignalDescriptor = {
  id: string;
  label: string;
  labelEn: string;
  sourceUnit: string;
  unit: string;
  /** Signal-point values are always expressed in `unit`, after applying this scale to the canonical source value. */
  sourceToValueScale: number;
  valueSpace: 'display';
  samplePolicy: 'nearest';
  connectAcrossGaps: false;
  color: string;
  authority: FusionAuthority;
  timeMode: FusionTimeMode;
  imas: ImasBinding;
  mdsplus: MdsplusBinding;
};

export type FusionSignalPoint = {
  time: number;
  /** Display-space value in the parent descriptor's `unit`; null is never imputed. */
  value: number | null;
  sigma: number | null;
  quality: FusionQuality;
};

export type FusionSignalSeries = FusionSignalDescriptor & {
  points: FusionSignalPoint[];
};

export type FusionEvent = {
  id: string;
  time: number;
  label: string;
  labelEn: string;
  kind: 'phase' | 'heating' | 'quality';
};

export type FusionArtifact = {
  id: string;
  label: string;
  labelEn: string;
  version: string;
  format: 'VTPC' | 'VTU' | 'Zarr' | 'Parquet';
  authority: FusionAuthority;
  checksum: string;
  viewerMode: 'vtkjs' | 'trame';
  timeSteps: number;
  pointFields: string[];
  cellFields: string[];
};

export type FusionShotSummary = ShotRef & {
  id: string;
  title: string;
  titleEn: string;
  scenario: string;
  scenarioEn: string;
  processingRun: string;
  authority: FusionAuthority;
  quality: FusionQuality;
  synthetic: true;
  compliance: 'mapping-preview';
  duration: number;
  peakCurrent: number;
  peakHeatingPower: number;
  tags: string[];
};

export type FusionShotRecord = {
  summary: FusionShotSummary;
  signals: FusionSignalSeries[];
  events: FusionEvent[];
  artifacts: FusionArtifact[];
  provenance: {
    sourceRevision: string;
    mappingVersion: string;
    geometryVersion: string;
    generatorVersion: string;
    generatedAt: string;
  };
};

export type ShotQuery = {
  search?: string;
  facility?: string;
  authority?: FusionAuthority;
  signal?: AbortSignal;
};

export type SignalQuery = {
  shot: ShotRef;
  signalIds: string[];
  timeRange?: readonly [number, number];
  maxPoints?: number;
  signal?: AbortSignal;
};

export interface FusionDataProvider {
  listShots(query?: ShotQuery): Promise<FusionShotSummary[]>;
  loadShot(ref: ShotRef, signal?: AbortSignal): Promise<FusionShotRecord>;
  loadSignals(query: SignalQuery): Promise<FusionSignalSeries[]>;
  listArtifacts(ref: ShotRef, signal?: AbortSignal): Promise<FusionArtifact[]>;
}

export function sameShot(left: ShotRef, right: ShotRef) {
  return left.facility === right.facility
    && left.database === right.database
    && left.pulse === right.pulse
    && left.run === right.run
    && left.occurrence === right.occurrence;
}
