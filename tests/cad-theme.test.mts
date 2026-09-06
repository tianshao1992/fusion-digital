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
import {
  PRC_FLAG_CONSTRUCTION_GRID,
  resolveExl50uPresentationIdentityLayout,
} from '../app/components/device-viewer/exl50uPresentationIdentity';

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
  assert.ok(lightAssembly.exposure <= 1);
  assert.ok(lightAssembly.environmentIntensity <= lightSilver.environmentIntensity - 0.15);
  assert.ok(lightAssembly.lights.hemisphere.intensity < lightSilver.lights.hemisphere.intensity);
  assert.ok(lightAssembly.lights.key.intensity < lightSilver.lights.key.intensity);
  assert.ok(luminance(lightAssembly.ground.color) < luminance(lightAssembly.clearColor) - 30);
  assert.ok(lightAssembly.ground.metalness <= 0.02);
  assert.ok(lightAssembly.ground.roughness >= 0.88);
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
    ['machine-red', 'industrial-green'],
    ['industrial-green', 'cabinet-pearl'],
    ['cabinet-pearl', 'signal-blue'],
    ['signal-blue', 'safety-yellow'],
  ] as const) {
    assert.ok(rgbDistance(palette[left].color, palette[right].color) >= 24, `${left} and ${right} must remain visibly separated`);
  }
  assert.ok(palette['machine-red'].color > 0x800000);
  assert.ok(palette['polished-steel'].metalness >= 0.65);
  assert.ok(palette['cabinet-pearl'].roughness >= 0.5);
});

test('anonymous assembly classifier separates foundation, architecture, pipework and equipment by presentation geometry', () => {
  const base = { assemblySize: [100, 20, 100], assemblyCentre: [0, 0, 0] } as const;
  assert.equal(resolveAnonymousAssemblyMaterialPreset({ ...base, size: [50, 0.5, 50], centre: [0, -8, 0], ordinal: 1 }), 'foundation-slate');
  assert.equal(resolveAnonymousAssemblyMaterialPreset({ ...base, size: [100, 12, 100], centre: [30, 0, 0], ordinal: 2 }), 'architectural-stone');
  assert.equal(resolveAnonymousAssemblyMaterialPreset({ ...base, size: [26, 8, 26], centre: [0, 0, 0], ordinal: 2 }), 'polished-steel');
  assert.equal(resolveAnonymousAssemblyMaterialPreset({ ...base, size: [20, 0.5, 0.5], centre: [25, 2, 0], ordinal: 3 }), 'brushed-steel');
  assert.equal(resolveAnonymousAssemblyMaterialPreset({ ...base, size: [3, 1, 3], centre: [25, 2, 0], ordinal: 4 }), 'cabinet-pearl');
  assert.equal(resolveAnonymousAssemblyMaterialPreset({ ...base, size: [3, 1, 3], centre: [25, 2, 0], ordinal: 7 }), 'industrial-green');
  assert.equal(resolveAnonymousAssemblyMaterialPreset({ ...base, size: [3, 1, 3], centre: [25, 2, 0], ordinal: 11 }), 'signal-blue');
  assert.equal(resolveAnonymousAssemblyMaterialPreset({ ...base, size: [3, 1, 3], centre: [25, 2, 0], ordinal: 17 }), 'safety-yellow');
});

test('assembly viewer uses definition bounds for instances and owns a disposable matte ground', async () => {
  const viewer = await source('app/components/TokamakCadViewer.tsx');
  const css = await source('app/components/tokamak-cad-viewer.css');

  assert.match(viewer, /mesh\.geometry\.computeBoundingBox\(\)/);
  assert.match(viewer, /const localDefinitionBox = mesh\.geometry\.boundingBox\?\.clone\(\)/);
  assert.match(viewer, /localDefinitionBox[\s\S]*?\.clone\(\)[\s\S]*?\.applyMatrix4\(mesh\.matrixWorld\)[\s\S]*?\.getSize\(new THREE\.Vector3\(\)\)/);
  assert.match(viewer, /mesh instanceof THREE\.InstancedMesh[\s\S]*?const definitionCentre = localDefinitionBox\.getCenter[\s\S]*?mesh\.getMatrixAt\(instanceIndex, instanceMatrix\)[\s\S]*?meshCentre\.multiplyScalar\(1 \/ mesh\.count\)/);
  assert.match(viewer, /new THREE\.PlaneGeometry\(groundWidth, groundDepth\)/);
  assert.match(viewer, /const exl50uAssemblyPresentation = viewerId === 'exl50u-general-assembly-20260630'[\s\S]*?appearancePreset === 'assembly-color-v1'[\s\S]*?anonymousTransport/);
  assert.match(viewer, /const exl50uPresentationTarget = presentationCentre\.clone\(\)[\s\S]*?\.sub\(sourceCenter\)[\s\S]*?\.multiplyScalar\(displayScale\)/);
  assert.match(viewer, /const presentationTarget = exl50uAssemblyPresentation[\s\S]*?\? exl50uPresentationTarget[\s\S]*?: fittedSphere\.center\.clone\(\)/);
  assert.match(viewer, /ground\.position\.set\(presentationTarget\.x, floorY - 0\.025, presentationTarget\.z\)/);
  assert.match(viewer, /const target = presentationTarget\.clone\(\)/);
  assert.match(viewer, /localScene\?\.traverse\(\(node\) => \{[\s\S]*?renderable\.geometry\?\.dispose\(\)/);
  assert.match(css, /appearance-assembly-color-v1 \.tokamakCadViewportShell/);
  assert.match(css, /data-theme='light'[^\n]*appearance-assembly-color-v1 \.tokamakCadViewportShell/);
});

test('EXL-50U presentation identity mounts on the host platform, not the tallest hall geometry', async () => {
  assert.deepEqual(PRC_FLAG_CONSTRUCTION_GRID.largeStar, { x: 5, y: 5, radius: 3 });
  assert.deepEqual(
    PRC_FLAG_CONSTRUCTION_GRID.smallStars.map(({ x, y, radius }) => [x, y, radius]),
    [[10, 2, 1], [12, 4, 1], [12, 7, 1], [10, 9, 1]],
  );

  const layout = resolveExl50uPresentationIdentityLayout();
  assert.deepEqual(layout.anchor, [1.65, 2.996, 1.65]);
  assert.ok(layout.flagWidth < 1.6 && layout.signWidth < 1.7);
  // The pole stays at the previously verified top-platform mount.
  const feet = [-layout.flagWidth * 0.55];
  const measuredFeet = [[1.061970, 2.238030]];
  feet.forEach((x, index) => {
    const sourceX = layout.anchor[0] + x * Math.cos(layout.orientationY);
    const sourceZ = layout.anchor[2] - x * Math.sin(layout.orientationY);
    assert.ok(Math.abs(sourceX - measuredFeet[index][0]) < 0.00001);
    assert.ok(Math.abs(sourceZ - measuredFeet[index][1]) < 0.00001);
  });
  assert.equal(layout.anchor[1] + layout.signOffset[1], 3.4);
  assert.ok(layout.signOffset[2] > 0.7, 'sign moves outward beyond the guardrail');
  assert.ok(layout.signOffset[1] - layout.signHeight * 0.54 > 0, 'whole sign is above the green deck fascia');
  const flagCentreX = -layout.flagWidth * 0.55 + layout.flagWidth * 0.5 + layout.unit * 0.032 * 0.7;
  assert.ok(Math.abs(layout.signOffset[0] - flagCentreX) < 1e-10, 'sign is directly below the flag');
  const flagBottom = layout.poleHeight - layout.flagHeight - layout.unit * 0.08;
  assert.ok(layout.signOffset[1] + layout.signHeight * 0.54 < flagBottom, 'plate clears the flag fabric');

  const [viewer, identity] = await Promise.all([
    source('app/components/TokamakCadViewer.tsx'),
    source('app/components/device-viewer/exl50uPresentationIdentity.ts'),
  ]);
  assert.match(viewer, /viewerId === 'exl50u-general-assembly-20260630'[\s\S]*?appearancePreset === 'assembly-color-v1'[\s\S]*?anonymousTransport[\s\S]*?createExl50uPresentationIdentity/);
  assert.match(viewer, /localDisposableTextures\?\.forEach\(\(texture\) => texture\.dispose\(\)\)/);
  assert.match(identity, /FUSIONDIGITAL_EXL50U_IDENTITY_MARKER/);
  assert.match(identity, /engineeringUseAllowed: false/);
  assert.match(identity, /side: THREE\.DoubleSide/);
  assert.match(identity, /EXL50U_PRESENTATION_LOGO_FRONT/);
  assert.match(identity, /EXL50U_PRESENTATION_LOGO_BACK/);
  assert.match(identity, /node\.raycast = \(\) => undefined/);
  assert.match(viewer, /model\.add\(identity\.root\)/);
  assert.doesNotMatch(viewer, /scene\.add\(identity\.root\)/);
  assert.doesNotMatch(identity, /bounds\.max|fittedBounds/);
  assert.match(identity, /EXL50U_PRESENTATION_GUARDRAIL_MOUNTED_LOGO/);
  assert.match(identity, /EXL50U_PRESENTATION_LOGO_RAIL_CLIP/);
  assert.doesNotMatch(identity, /EXL50U_PRESENTATION_LOGO_REAR_BRACKET/);
  assert.doesNotMatch(identity, /EXL50U_PRESENTATION_LOGO_SUPPORT/);
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
