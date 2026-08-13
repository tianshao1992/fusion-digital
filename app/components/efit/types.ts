export type EfitShotId = number;

export type EfitQualityState = 'good' | 'warning' | 'invalid' | 'missing';

export type EfitNumericVector = Float32Array | readonly number[];

export type EfitQuality = {
  flags: number;
  state: EfitQualityState;
  messages: readonly string[];
};

export type EfitRzPolyline = {
  rM: EfitNumericVector;
  zM: EfitNumericVector;
  validPoints: number;
};

export type EfitContour = EfitRzPolyline & {
  psiN: number;
  kind: 'surface' | 'lcfs';
  closed: boolean;
};

export type EfitFrameSummary = {
  shot: EfitShotId;
  index: number;
  timeMs: number;
  quality: EfitQuality;
  currentA: number;
  rAxisM: number;
  zAxisM: number;
  bcentrT: number;
  psiAxisWbPerRad: number;
  psiBoundaryWbPerRad: number;
  q95?: number;
  efitError?: number;
  iconvr?: number;
  surfaceMask: number;
  lcfsValidPoints: number;
  offsetBytes: number;
};

export type EfitFrame = EfitFrameSummary & {
  contours: readonly EfitContour[];
};

export type EfitGap = {
  afterMs: number;
  beforeMs: number;
  missingCount?: number;
  reason?: string;
};

export type EfitBinaryDescriptor = {
  url: string;
  byteLength?: number;
  sha256?: string;
  fileHeaderBytes: number;
  frameHeaderBytes: number;
  frameStrideBytes: number;
  surfaceCount: number;
  pointsPerContour: number;
};

export type EfitShotManifest = {
  shot: EfitShotId;
  frameCount: number;
  minTimeMs: number;
  maxTimeMs: number;
  gaps: readonly EfitGap[];
  frames: readonly EfitFrameSummary[];
  binary: EfitBinaryDescriptor;
};

export type EfitCadRegistration = {
  description?: string;
  coordinateSystem?: string;
  [key: string]: unknown;
};

export type EfitManifest = {
  schema: string;
  device: string;
  generatedAt?: string;
  psiNLevels: readonly number[];
  geometry: {
    limiterRzM: EfitRzPolyline;
    gridExtentM?: readonly [number, number, number, number];
    coordinateSystem?: string;
    cadRegistration?: EfitCadRegistration;
  };
  shots: readonly EfitShotManifest[];
};

export type EfitDataRequest = {
  signal?: AbortSignal;
};

/**
 * The UI and Three.js overlay depend on this interface, never on the binary
 * representation. Alternative MDSplus, WebSocket or object-storage adapters
 * can therefore be injected without changing playback or rendering code.
 */
export interface EfitDataSource {
  loadManifest(request?: EfitDataRequest): Promise<EfitManifest>;
  loadTimeline(shot: EfitShotId, request?: EfitDataRequest): Promise<readonly EfitFrameSummary[]>;
  loadFrame(shot: EfitShotId, frameIndex: number, request?: EfitDataRequest): Promise<EfitFrame>;
  prefetchFrame?(shot: EfitShotId, frameIndex: number): void;
}
