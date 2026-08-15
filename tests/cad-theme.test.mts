import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { resolveCadSceneTheme } from '../app/components/device-viewer/cadSceneTheme';

const source = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

function luminance(color: number) {
  const red = (color >> 16) & 0xff;
  const green = (color >> 8) & 0xff;
  const blue = color & 0xff;
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
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
