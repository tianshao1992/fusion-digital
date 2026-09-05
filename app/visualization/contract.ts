export const VISUALIZATION_ARTIFACT_SCHEMA = 'fusiondigital.visualization-artifact.v2' as const;

export const VISUALIZATION_DELIVERY_PROFILES = [
  'web-mesh',
  'web-tiles',
  'vtk-local',
  'paraview-remote',
  'openusd',
  'omniverse-stream',
] as const;

export type VisualizationDeliveryProfile = (typeof VISUALIZATION_DELIVERY_PROFILES)[number];
export type VisualizationAuthority =
  | 'raw'
  | 'calibrated'
  | 'reconstructed'
  | 'simulated'
  | 'synthetic';
export type VisualizationClassification = 'public' | 'internal' | 'restricted';

export interface VisualizationSourceRecord {
  kind: 'facility-record' | 'simulation-run' | 'comparison-record' | 'design-asset';
  id: string;
  pulse?: string;
  run?: string;
}

export interface VisualizationDelivery {
  profile: VisualizationDeliveryProfile;
  format: string;
  uri?: string;
  sha256?: string;
  bytes?: number;
  lod?: number;
}

export interface VisualizationArtifact {
  schema: typeof VISUALIZATION_ARTIFACT_SCHEMA;
  artifactId: string;
  version: string;
  label: string;
  sourceRecord: VisualizationSourceRecord;
  provenance: {
    authority: VisualizationAuthority;
    generator?: string;
    generatedAt?: string;
    sourceSha256?: string;
  };
  coordinates: {
    units: string;
    upAxis: 'X' | 'Y' | 'Z';
    handedness: 'left' | 'right';
    frame?: string;
  };
  complexity: {
    compressedBytes?: number;
    decodedBytes?: number;
    workingSetBytes?: number;
    triangles?: number;
    points?: number;
    cells?: number;
    timeSteps?: number;
  };
  access: {
    classification: VisualizationClassification;
    clientDownloadAllowed: boolean;
  };
  deliveries: VisualizationDelivery[];
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredRecord(value: unknown, path: string): UnknownRecord {
  if (!isRecord(value)) throw new Error(`${path} must be an object`);
  return value;
}

function requiredString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${path} must be a non-empty string`);
  return value;
}

function optionalString(value: unknown, path: string): string | undefined {
  if (value === undefined) return undefined;
  return requiredString(value, path);
}

function optionalCount(value: unknown, path: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`${path} must be a finite non-negative number`);
  }
  return value;
}

function oneOf<T extends readonly string[]>(value: unknown, options: T, path: string): T[number] {
  if (typeof value !== 'string' || !options.includes(value)) {
    throw new Error(`${path} must be one of: ${options.join(', ')}`);
  }
  return value as T[number];
}

const SOURCE_RECORD_KINDS = [
  'facility-record',
  'simulation-run',
  'comparison-record',
  'design-asset',
] as const;
const AUTHORITIES = ['raw', 'calibrated', 'reconstructed', 'simulated', 'synthetic'] as const;
const CLASSIFICATIONS = ['public', 'internal', 'restricted'] as const;

export function parseVisualizationArtifact(value: unknown): VisualizationArtifact {
  const root = requiredRecord(value, 'artifact');
  if (root.schema !== VISUALIZATION_ARTIFACT_SCHEMA) {
    throw new Error(`artifact.schema must equal ${VISUALIZATION_ARTIFACT_SCHEMA}`);
  }

  const source = requiredRecord(root.sourceRecord, 'artifact.sourceRecord');
  const provenance = requiredRecord(root.provenance, 'artifact.provenance');
  const coordinates = requiredRecord(root.coordinates, 'artifact.coordinates');
  const complexity = requiredRecord(root.complexity, 'artifact.complexity');
  const access = requiredRecord(root.access, 'artifact.access');

  if (typeof access.clientDownloadAllowed !== 'boolean') {
    throw new Error('artifact.access.clientDownloadAllowed must be a boolean');
  }
  if (!Array.isArray(root.deliveries) || root.deliveries.length === 0) {
    throw new Error('artifact.deliveries must contain at least one delivery');
  }

  const deliveries = root.deliveries.map((entry, index): VisualizationDelivery => {
    const delivery = requiredRecord(entry, `artifact.deliveries[${index}]`);
    const sha256 = optionalString(delivery.sha256, `artifact.deliveries[${index}].sha256`);
    if (sha256 && !/^[a-f0-9]{64}$/i.test(sha256)) {
      throw new Error(`artifact.deliveries[${index}].sha256 must be a SHA-256 hex digest`);
    }
    return {
      profile: oneOf(
        delivery.profile,
        VISUALIZATION_DELIVERY_PROFILES,
        `artifact.deliveries[${index}].profile`,
      ),
      format: requiredString(delivery.format, `artifact.deliveries[${index}].format`),
      uri: optionalString(delivery.uri, `artifact.deliveries[${index}].uri`),
      sha256,
      bytes: optionalCount(delivery.bytes, `artifact.deliveries[${index}].bytes`),
      lod: optionalCount(delivery.lod, `artifact.deliveries[${index}].lod`),
    };
  });

  const sourceSha256 = optionalString(provenance.sourceSha256, 'artifact.provenance.sourceSha256');
  if (sourceSha256 && !/^[a-f0-9]{64}$/i.test(sourceSha256)) {
    throw new Error('artifact.provenance.sourceSha256 must be a SHA-256 hex digest');
  }

  return {
    schema: VISUALIZATION_ARTIFACT_SCHEMA,
    artifactId: requiredString(root.artifactId, 'artifact.artifactId'),
    version: requiredString(root.version, 'artifact.version'),
    label: requiredString(root.label, 'artifact.label'),
    sourceRecord: {
      kind: oneOf(source.kind, SOURCE_RECORD_KINDS, 'artifact.sourceRecord.kind'),
      id: requiredString(source.id, 'artifact.sourceRecord.id'),
      pulse: optionalString(source.pulse, 'artifact.sourceRecord.pulse'),
      run: optionalString(source.run, 'artifact.sourceRecord.run'),
    },
    provenance: {
      authority: oneOf(provenance.authority, AUTHORITIES, 'artifact.provenance.authority'),
      generator: optionalString(provenance.generator, 'artifact.provenance.generator'),
      generatedAt: optionalString(provenance.generatedAt, 'artifact.provenance.generatedAt'),
      sourceSha256,
    },
    coordinates: {
      units: requiredString(coordinates.units, 'artifact.coordinates.units'),
      upAxis: oneOf(coordinates.upAxis, ['X', 'Y', 'Z'] as const, 'artifact.coordinates.upAxis'),
      handedness: oneOf(
        coordinates.handedness,
        ['left', 'right'] as const,
        'artifact.coordinates.handedness',
      ),
      frame: optionalString(coordinates.frame, 'artifact.coordinates.frame'),
    },
    complexity: {
      compressedBytes: optionalCount(complexity.compressedBytes, 'artifact.complexity.compressedBytes'),
      decodedBytes: optionalCount(complexity.decodedBytes, 'artifact.complexity.decodedBytes'),
      workingSetBytes: optionalCount(complexity.workingSetBytes, 'artifact.complexity.workingSetBytes'),
      triangles: optionalCount(complexity.triangles, 'artifact.complexity.triangles'),
      points: optionalCount(complexity.points, 'artifact.complexity.points'),
      cells: optionalCount(complexity.cells, 'artifact.complexity.cells'),
      timeSteps: optionalCount(complexity.timeSteps, 'artifact.complexity.timeSteps'),
    },
    access: {
      classification: oneOf(access.classification, CLASSIFICATIONS, 'artifact.access.classification'),
      clientDownloadAllowed: access.clientDownloadAllowed,
    },
    deliveries,
  };
}
