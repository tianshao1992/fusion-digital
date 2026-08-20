import {
  buildDiagView2MathProfile,
  type DiagView2GeqdskData,
  type DiagView2MathProfile,
} from './ehl2DiagView2Core';
import {
  parseDiagView2PhysicsSettings,
  resolveDiagView2PhysicsExecutionPlan,
  type DiagView2PhysicsSettings,
} from './ehl2DiagView2Physics';

const DEFAULT_MAX_GRID_CELLS = 16_384;
const MAX_GRID_CELLS = 65_536;
const DEFAULT_MAX_BOUNDARY_POINTS = 4_096;
const MAX_BOUNDARY_POINTS = 16_384;

export type DiagView2ForwardPresentationOptions = Readonly<{
  /** Maximum R-Z cells retained in the figure data. Defaults to 16,384. */
  maxGridCells?: number;
  /** Maximum LCFS vertices retained in the figure data. Defaults to 4,096. */
  maxBoundaryPoints?: number;
}>;

export type DiagView2ForwardFieldUnit = 'relative-emissivity' | 'relative-line-weight';

export type DiagView2ForwardFigureData = Readonly<{
  schema: 'fusiondigital.diagview2-forward-figure';
  version: 1;
  authority: 'virtual-software';
  metadata: Readonly<{
    caseName: string;
    sourceBranch: 'origin/digView2';
    sourceCommit: '868d74d5e0e6c9abaec0eb623bcdd13ead771c79';
    executionKernel: 'broadband-mathematical' | 'spectral-relative-manual';
    diagnosticMode: DiagView2PhysicsSettings['diagnosticMode'];
    profileSource: 'mathematical';
    normalization: 'relative-only';
    fieldUnit: DiagView2ForwardFieldUnit;
    experimentalMeasurement: false;
    absoluteCalibration: false;
    sourceGrid: Readonly<{ nw: number; nh: number; cellCount: number }>;
    profile: Readonly<{
      model: DiagView2MathProfile['model'];
      coreValue: number;
      edgeValue: number;
      unit: DiagView2ForwardFieldUnit;
      authority: 'virtual-software';
    }>;
    physicsSettings: Readonly<DiagView2PhysicsSettings>;
    limitations: readonly string[];
  }>;
  magneticAxis: Readonly<{ rM: number; zM: number }>;
  radial: Readonly<{
    selectedZIndex: number;
    selectedZM: number;
    magneticAxisZM: number;
    deltaZM: number;
    rM: readonly number[];
    psiNorm: readonly number[];
    rho: readonly number[];
    teEv: readonly number[];
    neM3: readonly number[];
    emission: readonly number[];
  }>;
  grid: Readonly<{
    coverage: 'all-source-cells' | 'deterministic-strided-sample';
    sourceDimensions: Readonly<{ nw: number; nh: number }>;
    sampledDimensions: Readonly<{ nw: number; nh: number }>;
    sourceCellCount: number;
    sampledCellCount: number;
    strideR: number;
    strideZ: number;
    isDownsampled: boolean;
    storageOrder: 'R-major; index = rIndex * sampledNh + zIndex';
    rM: readonly number[];
    zM: readonly number[];
    psiNorm: readonly number[];
    rho: readonly number[];
    teEv: readonly number[];
    neM3: readonly number[];
    emission: readonly number[];
  }>;
  lcfs: Readonly<{
    sourcePointCount: number;
    sampledPointCount: number;
    stride: number;
    isDownsampled: boolean;
    rM: readonly number[];
    zM: readonly number[];
  }>;
}>;

export class DiagView2ForwardPresentationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DiagView2ForwardPresentationError';
  }
}

function fail(path: string, message: string): never {
  throw new DiagView2ForwardPresentationError(`${path}: ${message}`);
}

function finiteNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(path, 'expected a finite number');
  return Object.is(value, -0) ? 0 : value;
}

function positiveInteger(value: unknown, path: string, fallback: number, maximum: number): number {
  const resolved = value === undefined ? fallback : value;
  if (!Number.isInteger(resolved) || (resolved as number) < 4 || (resolved as number) > maximum) {
    fail(path, `expected an integer between 4 and ${maximum}`);
  }
  return resolved as number;
}

function frozenNumbers(values: Iterable<number>, path: string, minimum = -Infinity): readonly number[] {
  const result: number[] = [];
  let index = 0;
  for (const raw of values) {
    const value = finiteNumber(raw, `${path}[${index}]`);
    if (value < minimum) fail(`${path}[${index}]`, `expected a value >= ${minimum}`);
    result.push(value);
    index += 1;
  }
  return Object.freeze(result);
}

function validateNumbers(values: ArrayLike<number>, path: string, minimum = -Infinity): void {
  for (let index = 0; index < values.length; index += 1) {
    const value = finiteNumber(values[index], `${path}[${index}]`);
    if (value < minimum) fail(`${path}[${index}]`, `expected a value >= ${minimum}`);
  }
}

function validateAxis(values: ArrayLike<number>, expectedLength: number, path: string): void {
  if (values.length !== expectedLength) fail(path, `expected ${expectedLength} coordinates`);
  let previous = -Infinity;
  for (let index = 0; index < values.length; index += 1) {
    const current = finiteNumber(values[index], `${path}[${index}]`);
    if (index > 0 && current <= previous) fail(path, 'coordinates must be strictly increasing');
    previous = current;
  }
}

function sampleCount(length: number, stride: number): number {
  if (length <= 1) return length;
  return Math.ceil((length - 1) / stride) + 1;
}

function sampleIndices(length: number, stride: number): readonly number[] {
  if (length === 0) return Object.freeze([]);
  const result: number[] = [];
  for (let index = 0; index < length; index += stride) result.push(index);
  if (result[result.length - 1] !== length - 1) result.push(length - 1);
  return Object.freeze(result);
}

function gridStrides(nw: number, nh: number, maximumCells: number): readonly [number, number] {
  if (nw * nh <= maximumCells) return Object.freeze([1, 1]) as readonly [number, number];
  const initial = Math.max(1, Math.floor(Math.sqrt((nw * nh) / maximumCells)));
  let strideR = initial;
  let strideZ = initial;
  while (sampleCount(nw, strideR) * sampleCount(nh, strideZ) > maximumCells) {
    const rCount = sampleCount(nw, strideR);
    const zCount = sampleCount(nh, strideZ);
    if (rCount >= zCount && strideR < nw) strideR += 1;
    else if (strideZ < nh) strideZ += 1;
    else strideR += 1;
  }
  return Object.freeze([strideR, strideZ]) as readonly [number, number];
}

function nearestIndex(values: ArrayLike<number>, target: number): number {
  let nearest = 0;
  let distance = Infinity;
  for (let index = 0; index < values.length; index += 1) {
    const candidate = Math.abs(values[index] - target);
    if (candidate < distance) {
      nearest = index;
      distance = candidate;
    }
  }
  return nearest;
}

function freezeSettings(settings: DiagView2PhysicsSettings): Readonly<DiagView2PhysicsSettings> {
  return Object.freeze({
    ...settings,
    source: Object.freeze({ ...settings.source }),
    broadband: Object.freeze({ ...settings.broadband }),
    plasma: Object.freeze({
      ...settings.plasma,
      te: Object.freeze({ ...settings.plasma.te }),
      ne: Object.freeze({ ...settings.plasma.ne }),
    }),
    spectral: Object.freeze({ ...settings.spectral }),
  });
}

function validateInputs(
  gfile: DiagView2GeqdskData,
  settings: DiagView2PhysicsSettings,
  profile: DiagView2MathProfile,
): Readonly<{
  settings: DiagView2PhysicsSettings;
  kernel: 'broadband-mathematical' | 'spectral-relative-manual';
}> {
  if (!Number.isInteger(gfile.nw) || gfile.nw < 2) fail('gfile.nw', 'expected an integer >= 2');
  if (!Number.isInteger(gfile.nh) || gfile.nh < 2) fail('gfile.nh', 'expected an integer >= 2');
  const cellCount = gfile.nw * gfile.nh;
  validateAxis(gfile.rM, gfile.nw, 'gfile.rM');
  validateAxis(gfile.zM, gfile.nh, 'gfile.zM');
  if (gfile.psiNorm.length !== cellCount) fail('gfile.psiNorm', `expected ${cellCount} values`);
  if (gfile.boundaryRM.length !== gfile.boundaryZM.length) fail('gfile.boundary', 'R/Z lengths differ');
  finiteNumber(gfile.rmaxisM, 'gfile.rmaxisM');
  finiteNumber(gfile.zmaxisM, 'gfile.zmaxisM');
  validateNumbers(gfile.psiNorm, 'gfile.psiNorm');
  validateNumbers(gfile.boundaryRM, 'gfile.boundaryRM');
  validateNumbers(gfile.boundaryZM, 'gfile.boundaryZM');

  const parsed = parseDiagView2PhysicsSettings(settings);
  const plan = resolveDiagView2PhysicsExecutionPlan(parsed);
  if (!plan.runnable) fail('settings.profileSource', 'CHERAB/ADAS is not a browser-runnable presentation source');
  if (profile.authority !== 'virtual-software') fail('profile.authority', 'expected virtual-software');
  if (profile.values.length !== cellCount) fail('profile.values', `expected ${cellCount} values`);
  if (profile.rho.length !== cellCount) fail('profile.rho', `expected ${cellCount} values`);
  const expectedUnit = parsed.diagnosticMode === 'broadband-radiation'
    ? 'relative-emissivity'
    : 'relative-line-weight';
  if (profile.unit !== expectedUnit) fail('profile.unit', `expected ${expectedUnit}`);
  validateNumbers(profile.values, 'profile.values', 0);
  validateNumbers(profile.rho, 'profile.rho', 0);
  return Object.freeze({ settings: parsed, kernel: plan.kernel });
}

/**
 * Build immutable, renderer-independent figure data for a completed browser
 * virtual-forward run. The R-Z grid is deterministically strided when it would
 * exceed the declared cell cap; source and sampled dimensions remain explicit.
 */
export function buildDiagView2ForwardFigureData(
  gfile: DiagView2GeqdskData,
  physicsSettings: DiagView2PhysicsSettings,
  finalProfile: DiagView2MathProfile,
  options: DiagView2ForwardPresentationOptions = {},
): DiagView2ForwardFigureData {
  const validated = validateInputs(gfile, physicsSettings, finalProfile);
  const maximumCells = positiveInteger(options.maxGridCells, 'options.maxGridCells', DEFAULT_MAX_GRID_CELLS, MAX_GRID_CELLS);
  const maximumBoundary = positiveInteger(options.maxBoundaryPoints, 'options.maxBoundaryPoints', DEFAULT_MAX_BOUNDARY_POINTS, MAX_BOUNDARY_POINTS);
  const teProfile = buildDiagView2MathProfile(
    gfile,
    validated.settings.plasma.te.model,
    validated.settings.plasma.te.coreValue,
    validated.settings.plasma.te.edgeValue,
  );
  const neProfile = buildDiagView2MathProfile(
    gfile,
    validated.settings.plasma.ne.model,
    validated.settings.plasma.ne.coreValue,
    validated.settings.plasma.ne.edgeValue,
  );
  const neM3 = Float64Array.from(neProfile.values, (value) => value * 1e19);
  const selectedZIndex = nearestIndex(gfile.zM, gfile.zmaxisM);

  const radialIndices = Array.from({ length: gfile.nw }, (_, rIndex) => rIndex * gfile.nh + selectedZIndex);
  const radial = Object.freeze({
    selectedZIndex,
    selectedZM: finiteNumber(gfile.zM[selectedZIndex], 'radial.selectedZM'),
    magneticAxisZM: finiteNumber(gfile.zmaxisM, 'radial.magneticAxisZM'),
    deltaZM: finiteNumber(gfile.zM[selectedZIndex] - gfile.zmaxisM, 'radial.deltaZM'),
    rM: frozenNumbers(gfile.rM, 'radial.rM'),
    psiNorm: frozenNumbers(radialIndices.map((index) => gfile.psiNorm[index]), 'radial.psiNorm'),
    rho: frozenNumbers(radialIndices.map((index) => finalProfile.rho[index]), 'radial.rho', 0),
    teEv: frozenNumbers(radialIndices.map((index) => teProfile.values[index]), 'radial.teEv', 0),
    neM3: frozenNumbers(radialIndices.map((index) => neM3[index]), 'radial.neM3', 0),
    emission: frozenNumbers(radialIndices.map((index) => finalProfile.values[index]), 'radial.emission', 0),
  });

  const [strideR, strideZ] = gridStrides(gfile.nw, gfile.nh, maximumCells);
  const rIndices = sampleIndices(gfile.nw, strideR);
  const zIndices = sampleIndices(gfile.nh, strideZ);
  const sampledIndices: number[] = [];
  for (const rIndex of rIndices) {
    for (const zIndex of zIndices) sampledIndices.push(rIndex * gfile.nh + zIndex);
  }
  const sourceCellCount = gfile.nw * gfile.nh;
  const sampledCellCount = sampledIndices.length;
  const isDownsampled = sampledCellCount !== sourceCellCount;
  const grid = Object.freeze({
    coverage: isDownsampled ? 'deterministic-strided-sample' as const : 'all-source-cells' as const,
    sourceDimensions: Object.freeze({ nw: gfile.nw, nh: gfile.nh }),
    sampledDimensions: Object.freeze({ nw: rIndices.length, nh: zIndices.length }),
    sourceCellCount,
    sampledCellCount,
    strideR,
    strideZ,
    isDownsampled,
    storageOrder: 'R-major; index = rIndex * sampledNh + zIndex' as const,
    rM: frozenNumbers(rIndices.map((index) => gfile.rM[index]), 'grid.rM'),
    zM: frozenNumbers(zIndices.map((index) => gfile.zM[index]), 'grid.zM'),
    psiNorm: frozenNumbers(sampledIndices.map((index) => gfile.psiNorm[index]), 'grid.psiNorm'),
    rho: frozenNumbers(sampledIndices.map((index) => finalProfile.rho[index]), 'grid.rho', 0),
    teEv: frozenNumbers(sampledIndices.map((index) => teProfile.values[index]), 'grid.teEv', 0),
    neM3: frozenNumbers(sampledIndices.map((index) => neM3[index]), 'grid.neM3', 0),
    emission: frozenNumbers(sampledIndices.map((index) => finalProfile.values[index]), 'grid.emission', 0),
  });

  const boundaryStride = gfile.boundaryRM.length <= maximumBoundary
    ? 1
    : Math.ceil((gfile.boundaryRM.length - 1) / (maximumBoundary - 1));
  const boundaryIndices = sampleIndices(gfile.boundaryRM.length, boundaryStride);
  const lcfs = Object.freeze({
    sourcePointCount: gfile.boundaryRM.length,
    sampledPointCount: boundaryIndices.length,
    stride: boundaryStride,
    isDownsampled: boundaryIndices.length !== gfile.boundaryRM.length,
    rM: frozenNumbers(boundaryIndices.map((index) => gfile.boundaryRM[index]), 'lcfs.rM'),
    zM: frozenNumbers(boundaryIndices.map((index) => gfile.boundaryZM[index]), 'lcfs.zM'),
  });

  const fieldUnit = finalProfile.unit;
  return Object.freeze({
    schema: 'fusiondigital.diagview2-forward-figure',
    version: 1,
    authority: 'virtual-software',
    metadata: Object.freeze({
      caseName: String(gfile.caseName),
      sourceBranch: 'origin/digView2',
      sourceCommit: '868d74d5e0e6c9abaec0eb623bcdd13ead771c79',
      executionKernel: validated.kernel,
      diagnosticMode: validated.settings.diagnosticMode,
      profileSource: 'mathematical',
      normalization: 'relative-only',
      fieldUnit,
      experimentalMeasurement: false,
      absoluteCalibration: false,
      sourceGrid: Object.freeze({ nw: gfile.nw, nh: gfile.nh, cellCount: sourceCellCount }),
      profile: Object.freeze({
        model: finalProfile.model,
        coreValue: finiteNumber(finalProfile.coreValue, 'profile.coreValue'),
        edgeValue: finiteNumber(finalProfile.edgeValue, 'profile.edgeValue'),
        unit: fieldUnit,
        authority: 'virtual-software',
      }),
      physicsSettings: freezeSettings(validated.settings),
      limitations: Object.freeze([
        'Virtual software output; not an experimental measurement.',
        'Emission values are relative-only and have no absolute calibration.',
        'CHERAB/OpenADAS, optics, detector response, calibration and noise are not applied.',
      ]),
    }),
    magneticAxis: Object.freeze({
      rM: finiteNumber(gfile.rmaxisM, 'magneticAxis.rM'),
      zM: finiteNumber(gfile.zmaxisM, 'magneticAxis.zM'),
    }),
    radial,
    grid,
    lcfs,
  });
}

export function diagView2ForwardFigureToJson(data: DiagView2ForwardFigureData): string {
  return `${JSON.stringify(data, null, 2)}\n`;
}

function matlabString(value: string): string {
  return `'${value.replaceAll("'", "''").replace(/[\r\n]+/g, ' ')}'`;
}

function numberLiteral(value: number): string {
  const checked = finiteNumber(value, 'export.value');
  return checked === 0 ? '0' : checked.toPrecision(16).replace(/e\+/, 'e');
}

function matlabVector(values: readonly number[]): string {
  if (values.length === 0) return '[]';
  const lines: string[] = [];
  for (let index = 0; index < values.length; index += 12) {
    lines.push(`  ${values.slice(index, index + 12).map(numberLiteral).join(' ')}`);
  }
  return `[ ...\n${lines.join(' ...\n')} ...\n]`;
}

/** Export a self-contained MATLAB plotting script; no toolbox is required. */
export function diagView2ForwardFigureToMatlab(data: DiagView2ForwardFigureData): string {
  const sampled = data.grid;
  return `% FusionDigital DiagView2 virtual-forward figure\n`+
    `% VIRTUAL SOFTWARE / RELATIVE ONLY / NOT AN EXPERIMENTAL MEASUREMENT\n`+
    `% Source grid ${data.metadata.sourceGrid.nw} x ${data.metadata.sourceGrid.nh}; sampled grid ${sampled.sampledDimensions.nw} x ${sampled.sampledDimensions.nh}; stride R=${sampled.strideR}, Z=${sampled.strideZ}\n`+
    `case_name = ${matlabString(data.metadata.caseName)};\n`+
    `field_unit = ${matlabString(data.metadata.fieldUnit)};\n`+
    `r = ${matlabVector(data.radial.rM)};\n`+
    `radial_psi = ${matlabVector(data.radial.psiNorm)};\n`+
    `radial_rho = ${matlabVector(data.radial.rho)};\n`+
    `radial_te_ev = ${matlabVector(data.radial.teEv)};\n`+
    `radial_ne_m3 = ${matlabVector(data.radial.neM3)};\n`+
    `radial_emission = ${matlabVector(data.radial.emission)};\n`+
    `grid_r = ${matlabVector(sampled.rM)};\n`+
    `grid_z = ${matlabVector(sampled.zM)};\n`+
    `grid_emission_r_major = ${matlabVector(sampled.emission)};\n`+
    `grid_emission = reshape(grid_emission_r_major, [numel(grid_z), numel(grid_r)]);\n`+
    `lcfs_r = ${matlabVector(data.lcfs.rM)};\n`+
    `lcfs_z = ${matlabVector(data.lcfs.zM)};\n`+
    `if ~isempty(lcfs_r), lcfs_r = [lcfs_r lcfs_r(1)]; lcfs_z = [lcfs_z lcfs_z(1)]; end\n`+
    `axis_r = ${numberLiteral(data.magneticAxis.rM)}; axis_z = ${numberLiteral(data.magneticAxis.zM)};\n`+
    `figure('Color','w','Position',[100 100 1400 900]);\n`+
    `tiledlayout(2,2,'TileSpacing','compact','Padding','compact');\n`+
    `nexttile; plot(r,radial_emission,'LineWidth',1.8); grid on; xlabel('R / m'); ylabel(field_unit,'Interpreter','none'); title(sprintf('Radial emission at Z = %.5g m',${numberLiteral(data.radial.selectedZM)}));\n`+
    `nexttile; plot(r,radial_te_ev,'LineWidth',1.8); grid on; xlabel('R / m'); ylabel('T_e / eV'); title('Electron temperature');\n`+
    `nexttile; semilogy(r,max(radial_ne_m3,realmin),'LineWidth',1.8); grid on; xlabel('R / m'); ylabel('n_e / m^{-3}'); title('Electron density');\n`+
    `nexttile; imagesc(grid_r,grid_z,grid_emission); axis xy image; hold on; plot(lcfs_r,lcfs_z,'w-','LineWidth',1.5); plot(axis_r,axis_z,'wp','MarkerFaceColor','k','MarkerSize',10); colorbar; xlabel('R / m'); ylabel('Z / m'); title(sprintf('R-Z %s (relative only)',field_unit),'Interpreter','none');\n`+
    `colormap(turbo(256)); sgtitle(sprintf('%s | virtual software | relative only',case_name),'Interpreter','none');\n`;
}

function xmlEscape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function linearMap(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  if (inMax === inMin) return (outMin + outMax) / 2;
  return outMin + (value - inMin) * (outMax - outMin) / (inMax - inMin);
}

function normalizedPolyline(
  xValues: readonly number[],
  yValues: readonly number[],
  xMin: number,
  xMax: number,
  left: number,
  top: number,
  width: number,
  height: number,
): string {
  const maximum = Math.max(...yValues.map((value) => Math.abs(value)), 0);
  return xValues.map((value, index) => {
    const x = linearMap(value, xMin, xMax, left, left + width);
    const normalized = maximum > 0 ? yValues[index] / maximum : 0;
    const y = top + height - normalized * height;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
}

const COLOUR_STOPS = Object.freeze([
  Object.freeze([68, 1, 84]),
  Object.freeze([59, 82, 139]),
  Object.freeze([33, 145, 140]),
  Object.freeze([94, 201, 98]),
  Object.freeze([253, 231, 37]),
] as const);

function heatColour(value: number, minimum: number, maximum: number): string {
  const normalized = maximum === minimum ? 0.5 : Math.min(1, Math.max(0, (value - minimum) / (maximum - minimum)));
  const scaled = normalized * (COLOUR_STOPS.length - 1);
  const first = Math.min(COLOUR_STOPS.length - 2, Math.floor(scaled));
  const fraction = scaled - first;
  const rgb = COLOUR_STOPS[first].map((component, index) => (
    Math.round(component + (COLOUR_STOPS[first + 1][index] - component) * fraction)
  ));
  return `rgb(${rgb.join(',')})`;
}

function coordinateEdges(values: readonly number[]): readonly number[] {
  if (values.length === 1) return Object.freeze([values[0] - 0.5, values[0] + 0.5]);
  const edges = [values[0] - (values[1] - values[0]) / 2];
  for (let index = 1; index < values.length; index += 1) edges.push((values[index - 1] + values[index]) / 2);
  edges.push(values[values.length - 1] + (values[values.length - 1] - values[values.length - 2]) / 2);
  return Object.freeze(edges);
}

/** Export a fixed-size scientific SVG with radial profiles and an R-Z map. */
export function diagView2ForwardFigureToSvg(data: DiagView2ForwardFigureData): string {
  const width = 1440;
  const height = 900;
  const radialBox = Object.freeze({ left: 90, top: 150, width: 560, height: 590 });
  const heatBox = Object.freeze({ left: 790, top: 150, width: 520, height: 590 });
  const rMin = data.radial.rM[0];
  const rMax = data.radial.rM[data.radial.rM.length - 1];
  const gridRMin = data.grid.rM[0];
  const gridRMax = data.grid.rM[data.grid.rM.length - 1];
  const gridZMin = data.grid.zM[0];
  const gridZMax = data.grid.zM[data.grid.zM.length - 1];
  const fieldMin = Math.min(...data.grid.emission);
  const fieldMax = Math.max(...data.grid.emission);
  const rEdges = coordinateEdges(data.grid.rM);
  const zEdges = coordinateEdges(data.grid.zM);
  const cells: string[] = [];
  for (let rIndex = 0; rIndex < data.grid.sampledDimensions.nw; rIndex += 1) {
    for (let zIndex = 0; zIndex < data.grid.sampledDimensions.nh; zIndex += 1) {
      const index = rIndex * data.grid.sampledDimensions.nh + zIndex;
      const x0 = linearMap(rEdges[rIndex], rEdges[0], rEdges[rEdges.length - 1], heatBox.left, heatBox.left + heatBox.width);
      const x1 = linearMap(rEdges[rIndex + 1], rEdges[0], rEdges[rEdges.length - 1], heatBox.left, heatBox.left + heatBox.width);
      const y0 = linearMap(zEdges[zIndex + 1], zEdges[0], zEdges[zEdges.length - 1], heatBox.top + heatBox.height, heatBox.top);
      const y1 = linearMap(zEdges[zIndex], zEdges[0], zEdges[zEdges.length - 1], heatBox.top + heatBox.height, heatBox.top);
      cells.push(`<rect x="${x0.toFixed(2)}" y="${y0.toFixed(2)}" width="${Math.max(0, x1 - x0).toFixed(2)}" height="${Math.max(0, y1 - y0).toFixed(2)}" fill="${heatColour(data.grid.emission[index], fieldMin, fieldMax)}"/>`);
    }
  }
  const lcfsPoints = data.lcfs.rM.map((r, index) => {
    const x = linearMap(r, gridRMin, gridRMax, heatBox.left, heatBox.left + heatBox.width);
    const y = linearMap(data.lcfs.zM[index], gridZMin, gridZMax, heatBox.top + heatBox.height, heatBox.top);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
  const axisX = linearMap(data.magneticAxis.rM, gridRMin, gridRMax, heatBox.left, heatBox.left + heatBox.width);
  const axisY = linearMap(data.magneticAxis.zM, gridZMin, gridZMax, heatBox.top + heatBox.height, heatBox.top);
  const curves = [
    ['Emission', data.radial.emission, '#f2a36b'],
    ['T_e / max', data.radial.teEv, '#77d9ca'],
    ['n_e / max', data.radial.neM3, '#8daaf2'],
    ['rho', data.radial.rho, '#c39be8'],
  ] as const;
  const curveSvg = curves.map(([label, values, colour], index) => {
    const points = normalizedPolyline(data.radial.rM, values, rMin, rMax, radialBox.left, radialBox.top, radialBox.width, radialBox.height);
    return `<polyline fill="none" stroke="${colour}" stroke-width="2.5" points="${points}"/><line x1="${radialBox.left + index * 135}" y1="785" x2="${radialBox.left + 24 + index * 135}" y2="785" stroke="${colour}" stroke-width="3"/><text x="${radialBox.left + 31 + index * 135}" y="791" class="legend">${xmlEscape(label)}</text>`;
  }).join('');
  const sampling = data.grid.isDownsampled
    ? `deterministic sample ${data.grid.sampledDimensions.nw}×${data.grid.sampledDimensions.nh}; stride R=${data.grid.strideR}, Z=${data.grid.strideZ}`
    : `all source cells ${data.grid.sampledDimensions.nw}×${data.grid.sampledDimensions.nh}`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n`+
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">`+
    `<title id="title">${xmlEscape(data.metadata.caseName)} virtual-forward profiles</title>`+
    `<desc id="desc">Virtual software result, relative only. Radial profiles and an R-Z emission map with LCFS and magnetic axis.</desc>`+
    `<style>text{font-family:Inter,Arial,sans-serif;fill:#dce9e4}.title{font-size:30px;font-weight:700}.subtitle{font-size:15px;fill:#9db2aa}.panel{font-size:20px;font-weight:650}.axis{font-size:14px;fill:#aabbb5}.legend{font-size:13px}.frame{fill:none;stroke:#668078;stroke-width:1.5}.gridline{stroke:#385048;stroke-width:1;opacity:.55}</style>`+
    `<rect width="1440" height="900" fill="#08110e"/>`+
    `<text x="70" y="62" class="title">${xmlEscape(data.metadata.caseName)} · DiagView2 virtual-forward figure</text>`+
    `<text x="70" y="93" class="subtitle">VIRTUAL SOFTWARE · RELATIVE ONLY · NOT AN EXPERIMENTAL MEASUREMENT · ${xmlEscape(sampling)}</text>`+
    `<text x="${radialBox.left}" y="130" class="panel">Radial profiles · Z=${numberLiteral(data.radial.selectedZM)} m</text>`+
    `<rect x="${radialBox.left}" y="${radialBox.top}" width="${radialBox.width}" height="${radialBox.height}" class="frame"/>`+
    `<line x1="${radialBox.left}" y1="${radialBox.top + radialBox.height / 2}" x2="${radialBox.left + radialBox.width}" y2="${radialBox.top + radialBox.height / 2}" class="gridline"/>`+
    curveSvg+
    `<text x="${radialBox.left + radialBox.width / 2}" y="835" text-anchor="middle" class="axis">R / m · each curve normalized to its own maximum</text>`+
    `<text x="${heatBox.left}" y="130" class="panel">R-Z ${xmlEscape(data.metadata.fieldUnit)} map</text>`+
    `<g id="rz-heatmap">${cells.join('')}</g>`+
    `<rect x="${heatBox.left}" y="${heatBox.top}" width="${heatBox.width}" height="${heatBox.height}" class="frame"/>`+
    (lcfsPoints ? `<polygon id="lcfs" fill="none" stroke="#ffffff" stroke-width="2.2" points="${lcfsPoints}"/>` : '')+
    `<g id="magnetic-axis"><line x1="${(axisX - 9).toFixed(2)}" y1="${axisY.toFixed(2)}" x2="${(axisX + 9).toFixed(2)}" y2="${axisY.toFixed(2)}" stroke="#ff6f61" stroke-width="3"/><line x1="${axisX.toFixed(2)}" y1="${(axisY - 9).toFixed(2)}" x2="${axisX.toFixed(2)}" y2="${(axisY + 9).toFixed(2)}" stroke="#ff6f61" stroke-width="3"/></g>`+
    `<text x="${heatBox.left + heatBox.width / 2}" y="835" text-anchor="middle" class="axis">R / m</text>`+
    `<text x="1360" y="${heatBox.top + heatBox.height / 2}" text-anchor="middle" transform="rotate(-90 1360 ${heatBox.top + heatBox.height / 2})" class="axis">Z / m</text>`+
    `<text x="790" y="870" class="subtitle">LCFS: white · magnetic axis: red · field range ${numberLiteral(fieldMin)} to ${numberLiteral(fieldMax)} (${xmlEscape(data.metadata.fieldUnit)})</text>`+
    `</svg>\n`;
}
