import {
  diagnosticsResearchItems,
  diagnosticsTaskMeta,
  type DiagnosticsCodeStatus,
  type DiagnosticsDeploymentLevel,
  type DiagnosticsEvidenceLevel,
  type DiagnosticsTaskId,
  type DiagnosticsTechniqueFamily,
} from './diagnosticsResearch';

export type DiagnosticsFilterState = {
  task: 'all' | DiagnosticsTaskId;
  technique: 'all' | DiagnosticsTechniqueFamily;
  device: 'all' | string;
  evidence: 'all' | DiagnosticsEvidenceLevel;
  deployment: 'all' | DiagnosticsDeploymentLevel;
  code: 'all' | DiagnosticsCodeStatus;
};

export type DiagnosticsCatalogState = {
  query: string;
  filters: DiagnosticsFilterState;
  page: number;
};

export type DiagnosticsSearchParams = Record<string, string | string[] | undefined>;

export const diagnosticsTaskIds = Object.keys(diagnosticsTaskMeta) as DiagnosticsTaskId[];
export const diagnosticsTechniqueFamilies: DiagnosticsTechniqueFamily[] = ['MAGNETIC', 'MICROWAVE', 'LASER', 'OPTICAL', 'NUCLEAR_PARTICLE', 'PROBE_SAMPLING', 'ENGINEERING_SENSOR', 'COMPUTATIONAL'];
export const diagnosticsEvidenceLevels: DiagnosticsEvidenceLevel[] = ['E0', 'E1', 'E2', 'E3', 'E4'];
export const diagnosticsDeploymentLevels: DiagnosticsDeploymentLevel[] = ['D1', 'D2', 'D3', 'D4', 'D5'];
export const diagnosticsCodeStatuses: DiagnosticsCodeStatus[] = ['official-direct', 'official-enabling', 'community-reproduction', 'controlled-access', 'commercial', 'not-public'];
export const diagnosticsDeviceNames: string[] = Array.from(new Set<string>(
  diagnosticsResearchItems.flatMap((item) => item.devices.map((device) => device.name)),
)).sort((a, b) => a.localeCompare(b, 'en'));

export const defaultDiagnosticsFilters: DiagnosticsFilterState = {
  task: 'all',
  technique: 'all',
  device: 'all',
  evidence: 'all',
  deployment: 'all',
  code: 'all',
};

export const defaultDiagnosticsCatalogState: DiagnosticsCatalogState = {
  query: '',
  filters: defaultDiagnosticsFilters,
  page: 1,
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeInput(input: DiagnosticsSearchParams | URLSearchParams): DiagnosticsSearchParams {
  if (!(input instanceof URLSearchParams)) return input;
  return Object.fromEntries(input.entries());
}

function isOneOf<T extends string>(value: string | undefined, values: readonly T[]): value is T {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}

export function parseDiagnosticsCatalogState(input: DiagnosticsSearchParams | URLSearchParams): DiagnosticsCatalogState {
  const params = normalizeInput(input);
  const task = first(params.task);
  const technique = first(params.technique);
  const device = first(params.device);
  const evidence = first(params.evidence);
  const deployment = first(params.deployment);
  const code = first(params.code);
  const query = first(params.query)?.trim() ?? '';
  const rawPage = Number.parseInt(first(params.page) ?? '1', 10);

  return {
    query,
    page: Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1,
    filters: {
      task: isOneOf(task, diagnosticsTaskIds) ? task : 'all',
      technique: isOneOf(technique, diagnosticsTechniqueFamilies) ? technique : 'all',
      device: device && diagnosticsDeviceNames.includes(device) ? device : 'all',
      evidence: isOneOf(evidence, diagnosticsEvidenceLevels) ? evidence : 'all',
      deployment: isOneOf(deployment, diagnosticsDeploymentLevels) ? deployment : 'all',
      code: isOneOf(code, diagnosticsCodeStatuses) ? code : 'all',
    },
  };
}

export function serializeDiagnosticsCatalogState(state: DiagnosticsCatalogState) {
  const params = new URLSearchParams();
  const { filters } = state;
  if (state.query.trim()) params.set('query', state.query.trim());
  if (filters.task !== 'all') params.set('task', filters.task);
  if (filters.technique !== 'all') params.set('technique', filters.technique);
  if (filters.device !== 'all') params.set('device', filters.device);
  if (filters.evidence !== 'all') params.set('evidence', filters.evidence);
  if (filters.deployment !== 'all') params.set('deployment', filters.deployment);
  if (filters.code !== 'all') params.set('code', filters.code);
  if (state.page > 1) params.set('page', String(state.page));
  return params;
}
