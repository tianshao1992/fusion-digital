import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  resolveCadSceneTheme,
  scaleCadFogDensity,
} from '../app/components/device-viewer/cadSceneTheme';
import {
  INDUSTRIAL_MATERIAL_SPECS,
  resolveAnonymousAssemblyMaterialPreset,
} from '../app/components/device-viewer/industrialAppearance';

const source = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

function luminance(color: number) {
  const red = (color >> 16) & 0xff;
  const green = (color >> 8) & 0xff;
  const blue = color & 0xff;
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function rgbDistance(left: number, right: number) {
  return Math.hypot(
    ((left >> 16) & 0xff) - ((right >> 16) & 0xff),
    ((left >> 8) & 0xff) - ((right >> 8) & 0xff),
    (left & 0xff) - (right & 0xff),
  );
}

test('CAD scene themes provide brighter light studios for semantic and industrial models', () => {
  for (const appearance of ['semantic', 'industrial-silver-v1'] as const) {
    const light = resolveCadSceneTheme('light', appearance);
    const dark = resolveCadSceneTheme('dark', appearance);

    assert.ok(luminance(light.clearColor) > luminance(dark.clearColor) + 120);
    assert.ok(luminance(light.fogColor) > luminance(dark.fogColor) + 120);
    assert.notEqual(light.grid.line, dark.grid.line);
    assert.ok(light.grid.opacity >= dark.grid.opacity);
    assert.notEqual(light.lights.hemisphere.ground, dark.lights.hemisphere.ground);
  }
});

test('only the large anonymous assembly scales fog by its physical source radius', () => {
  const base = resolveCadSceneTheme('light', 'assembly-color-v1').fogDensity;
  const assemblyRadius = 46.2315435935626;

  assert.equal(scaleCadFogDensity(base, 'assembly-color-v1', 4), base);
  assert.ok(Math.abs(
    scaleCadFogDensity(base, 'assembly-color-v1', assemblyRadius)
      - base * (8 / assemblyRadius),
  ) < 1e-12);
  assert.equal(scaleCadFogDensity(base, 'industrial-silver-v1', assemblyRadius), base);
  assert.equal(scaleCadFogDensity(base, 'semantic', assemblyRadius), base);
  assert.equal(scaleCadFogDensity(base, 'assembly-color-v1', Number.NaN), base);
});

test('assembly themes preserve the EXL industrial rig with lower light energy and a distinct matte ground', () => {
  const lightAssembly = resolveCadSceneTheme('light', 'assembly-color-v1');
  const darkAssembly = resolveCadSceneTheme('dark', 'assembly-color-v1');
  const lightSilver = resolveCadSceneTheme('light', 'industrial-silver-v1');

  assert.equal(lightAssembly.lights.kind, 'industrial');
  assert.equal(darkAssembly.lights.kind, 'industrial');
  assert.ok(lightAssembly.fogDensity <= 0.003);
  assert.ok(lightAssembly.exposure <= lightSilver.exposure - 0.15);
  assert.ok(lightAssembly.environmentIntensity <= lightSilver.environmentIntensity - 0.3);
  assert.ok(lightAssembly.lights.hemisphere.intensity < lightSilver.lights.hemisphere.intensity);
  assert.ok(lightAssembly.lights.key.intensity < lightSilver.lights.key.intensity);
  assert.ok(luminance(lightAssembly.ground.color) < luminance(lightAssembly.clearColor) - 30);
  assert.ok(lightAssembly.ground.metalness <= 0.02);
  assert.ok(lightAssembly.ground.roughness >= 0.95);
  assert.equal(lightSilver.exposure, 0.98);
  assert.equal(lightSilver.environmentIntensity, 0.94);
});

test('assembly presentation palette keeps visible colour and reflectance separation', () => {
  const palette = INDUSTRIAL_MATERIAL_SPECS;
  assert.ok(luminance(palette['foundation-slate'].color) < luminance(palette['architectural-stone'].color) - 40);
  for (const [left, right] of [
    ['foundation-slate', 'architectural-stone'],
    ['architectural-stone', 'pipework-teal'],
    ['pipework-teal', 'equipment-blue'],
    ['equipment-blue', 'electrical-brass'],
    ['electrical-brass', 'copper-alloy'],
  ] as const) {
    assert.ok(rgbDistance(palette[left].color, palette[right].color) >= 24, `${left} and ${right} must remain visibly separated`);
  }
  for (const preset of ['pipework-teal', 'equipment-blue', 'electrical-brass'] as const) {
    assert.ok(palette[preset].metalness <= 0.2);
    assert.ok(palette[preset].envMapIntensity <= 0.5);
  }
});

test('anonymous assembly classifier separates foundation, architecture, pipework and equipment by presentation geometry', () => {
  const base = { assemblySize: [100, 20, 100], assemblyCentre: [0, 0, 0] } as const;
  assert.equal(resolveAnonymousAssemblyMaterialPreset({ ...base, size: [50, 0.5, 50], centre: [0, -8, 0], ordinal: 1 }), 'foundation-slate');
  assert.equal(resolveAnonymousAssemblyMaterialPreset({ ...base, size: [20, 12, 20], centre: [30, 0, 0], ordinal: 2 }), 'architectural-stone');
  assert.equal(resolveAnonymousAssemblyMaterialPreset({ ...base, size: [20, 0.5, 0.5], centre: [25, 2, 0], ordinal: 3 }), 'pipework-teal');
  assert.equal(resolveAnonymousAssemblyMaterialPreset({ ...base, size: [5, 1, 5], centre: [25, 2, 0], ordinal: 4 }), 'equipment-blue');
  assert.equal(resolveAnonymousAssemblyMaterialPreset({ ...base, size: [5, 1, 5], centre: [25, 2, 0], ordinal: 5 }), 'electrical-brass');
});

test('assembly viewer uses definition bounds for instances and owns a disposable matte ground', async () => {
  const viewer = await source('app/components/TokamakCadViewer.tsx');
  const css = await source('app/components/tokamak-cad-viewer.css');

  assert.match(viewer, /mesh\.geometry\.computeBoundingBox\(\)/);
  assert.match(viewer, /const definitionBox = mesh\.geometry\.boundingBox\?\.clone\(\)/);
  assert.match(viewer, /mesh\.getWorldScale\(new THREE\.Vector3\(\)\)/);
  assert.match(viewer, /mesh instanceof THREE\.InstancedMesh[\s\S]*?mesh\.getMatrixAt\(instanceIndex, instanceMatrix\)[\s\S]*?meshCentre\.multiplyScalar\(1 \/ mesh\.count\)/);
  assert.match(viewer, /new THREE\.PlaneGeometry\(groundWidth, groundDepth\)/);
  assert.match(viewer, /ground\.position\.set\(fittedSphere\.center\.x, floorY - 0\.025, fittedSphere\.center\.z\)/);
  assert.match(viewer, /localScene\?\.traverse\(\(node\) => \{[\s\S]*?renderable\.geometry\?\.dispose\(\)/);
  assert.match(css, /appearance-assembly-color-v1 \.tokamakCadViewportShell/);
  assert.match(css, /data-theme='light'[^\n]*appearance-assembly-color-v1 \.tokamakCadViewportShell/);
});

test('Tokamak viewer applies theme changes in place without reloading the model', async () => {
  const viewer = await source('app/components/TokamakCadViewer.tsx');

  assert.match(viewer, /const \{ resolvedTheme \} = useTheme\(\)/);
  assert.match(viewer, /viewerRef\.current\?\.setVisualTheme\(resolvedTheme\)/);
  assert.match(viewer, /setVisualTheme: \(theme: ResolvedTheme\) => void/);
  assert.doesNotMatch(viewer, /\[activated, appearancePreset, attempt, manifest, resolvedTheme, selectedModel\]/);
  assert.match(viewer, /data-cad-theme=\{resolvedTheme\}/);
});

test('light CAD chrome covers the complete operational workbench', async () => {
  const css = await source('app/components/tokamak-cad-viewer.css');
  const requiredSurfaces = [
    'tokamakCadShell',
    'tokamakCadTopbar',
    'tokamakCadWorkspace',
    'tokamakCadViewportShell',
    'tokamakCadLaunch',
    'tokamakCadLoading',
    'tokamakCadLegend',
    'tokamakCadReadout',
    'tokamakCadTree',
    'tokamakCadProperties',
    'tokamakCadControls',
    'tokamakCadTreeActions',
    'tokamakCadEfitControls',
  ];

  assert.match(css, /:root\[data-theme='light'\] \.tokamakCadSection\{/);
  for (const className of requiredSurfaces) {
    assert.match(
      css,
      new RegExp(`:root\\[data-theme='light'\\][^\\n]*\\.${className}`),
      `${className} must participate in the light CAD workbench`,
    );
  }
});
