import type { VisualizationArtifact, VisualizationDelivery } from './contract';

const MIB = 1024 * 1024;

export type VisualizationRenderer =
  | 'three-web'
  | 'vtk-local'
  | 'paraview-remote'
  | 'omniverse-stream'
  | 'metadata-only';

export type VisualizationIntent = 'inspect' | 'analyze' | 'immersive';

export interface VisualizationClientProfile {
  deviceMemoryGiB?: number;
  hardwareConcurrency?: number;
  mobile?: boolean;
  webgpu?: boolean;
}

export interface VisualizationRuntimeAvailability {
  paraViewRemote: boolean;
  omniverseStream: boolean;
}

export interface VisualizationRouteRequest {
  client: VisualizationClientProfile;
  availability: VisualizationRuntimeAvailability;
  intent: VisualizationIntent;
}

export type VisualizationRouteReason =
  | 'immersive-usd-session'
  | 'streamed-web-tiles-fit-budget'
  | 'web-mesh-fit-budget'
  | 'local-vtk-fit-budget'
  | 'remote-scientific-rendering-required'
  | 'no-authorized-runtime';

export interface VisualizationRouteDecision {
  renderer: VisualizationRenderer;
  reason: VisualizationRouteReason;
  selectedDelivery?: VisualizationDelivery;
  budget: {
    workingSetBytes: number;
    triangles: number;
  };
  openSourceCore: boolean;
}

function clientBudget(client: VisualizationClientProfile): VisualizationRouteDecision['budget'] {
  const memory = client.deviceMemoryGiB ?? (client.mobile ? 4 : 8);
  if (client.mobile || memory <= 4) return { workingSetBytes: 384 * MIB, triangles: 12_000_000 };
  if (memory <= 8) return { workingSetBytes: 768 * MIB, triangles: 30_000_000 };
  return { workingSetBytes: 1536 * MIB, triangles: 60_000_000 };
}

function delivery(artifact: VisualizationArtifact, ...profiles: VisualizationDelivery['profile'][]) {
  return artifact.deliveries.find((candidate) => profiles.includes(candidate.profile));
}

function estimatedWorkingSet(artifact: VisualizationArtifact): number {
  return (
    artifact.complexity.workingSetBytes ??
    artifact.complexity.decodedBytes ??
    (artifact.complexity.compressedBytes ?? 0) * 4
  );
}

export function routeVisualizationArtifact(
  artifact: VisualizationArtifact,
  request: VisualizationRouteRequest,
): VisualizationRouteDecision {
  const budget = clientBudget(request.client);
  const workingSet = estimatedWorkingSet(artifact);
  const triangles = artifact.complexity.triangles ?? 0;
  const clientAuthorized = artifact.access.clientDownloadAllowed;

  const immersive = delivery(artifact, 'omniverse-stream', 'openusd');
  if (request.intent === 'immersive' && request.availability.omniverseStream && immersive) {
    return {
      renderer: 'omniverse-stream',
      reason: 'immersive-usd-session',
      selectedDelivery: immersive,
      budget,
      openSourceCore: false,
    };
  }

  const tiles = delivery(artifact, 'web-tiles');
  if (clientAuthorized && tiles && workingSet <= budget.workingSetBytes && triangles <= budget.triangles * 8) {
    return {
      renderer: 'three-web',
      reason: 'streamed-web-tiles-fit-budget',
      selectedDelivery: tiles,
      budget,
      openSourceCore: true,
    };
  }

  const mesh = delivery(artifact, 'web-mesh');
  if (clientAuthorized && mesh && workingSet <= budget.workingSetBytes && triangles <= budget.triangles) {
    return {
      renderer: 'three-web',
      reason: 'web-mesh-fit-budget',
      selectedDelivery: mesh,
      budget,
      openSourceCore: true,
    };
  }

  const vtk = delivery(artifact, 'vtk-local');
  const cells = artifact.complexity.cells ?? 0;
  if (
    clientAuthorized &&
    vtk &&
    workingSet <= Math.min(budget.workingSetBytes * 0.75, 768 * MIB) &&
    cells <= 20_000_000
  ) {
    return {
      renderer: 'vtk-local',
      reason: 'local-vtk-fit-budget',
      selectedDelivery: vtk,
      budget,
      openSourceCore: true,
    };
  }

  const remote = delivery(artifact, 'paraview-remote', 'vtk-local');
  if (request.availability.paraViewRemote && remote) {
    return {
      renderer: 'paraview-remote',
      reason: 'remote-scientific-rendering-required',
      selectedDelivery: remote,
      budget,
      openSourceCore: true,
    };
  }

  return {
    renderer: 'metadata-only',
    reason: 'no-authorized-runtime',
    budget,
    openSourceCore: true,
  };
}
