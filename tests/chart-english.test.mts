import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const chartHostPath = new URL('../app/components/charts/ScientificChart.tsx', import.meta.url);
const chartHostSource = readFileSync(chartHostPath, 'utf8');
const exactSource = chartHostSource.match(/const exactEnglish:[^=]+\=\s*({[\s\S]*?});\s*\n\s*const englishFragments/)?.[1];
const fragmentsSource = chartHostSource.match(/const englishFragments:[^=]+\=\s*(\[[\s\S]*?\]);\s*\n\s*const hanPattern/)?.[1];
assert.ok(exactSource, 'exact English chart dictionary must be discoverable');
assert.ok(fragmentsSource, 'English chart fragment dictionary must be discoverable');

const exact = Function(`"use strict"; return (${exactSource});`)() as Record<string, string>;
const fragments = Function(`"use strict"; return (${fragmentsSource});`)() as [string, string][];
const han = /\p{Script=Han}/u;

function localize(source: string) {
  if (!han.test(source)) return source;
  if (exact[source]) return exact[source];
  let translated = source;
  for (const [zh, en] of fragments) translated = translated.replaceAll(zh, en);
  if (!han.test(translated)) return translated;
  const tokens = translated.match(/[A-Za-z][A-Za-z0-9+./_\-]*(?:[‑–—→][A-Za-z0-9+./_\-]+)*/g) ?? [];
  return tokens.length ? `Technical annotation — ${[...new Set(tokens)].slice(0, 10).join(' · ')}` : 'Technical annotation — English record pending source verification';
}

const chartSources = [
  '../app/physics/PhysicsCharts.tsx',
  '../app/engineering/EngineeringCharts.tsx',
  '../app/control/ControlCharts.tsx',
  '../app/diagnostics/DiagnosticsCharts.tsx',
  '../app/components/FusionTwinSystemMap.tsx',
  '../app/components/PhaseOneRoadmap.tsx',
  '../app/roadmap/ProgramRoadmapCharts.tsx',
  '../app/roadmap/program-roadmap-data.ts',
  '../app/roadmap/program-pillar-route-maps.ts',
] as const;

test('English chart localization is total for every authored Han-bearing literal', () => {
  let checked = 0;
  for (const relativePath of chartSources) {
    const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
    for (const match of source.matchAll(/'([^'\\]*(?:\\.[^'\\]*)*)'|"([^"\\]*(?:\\.[^"\\]*)*)"|`([^`\\]*(?:\\.[^`\\]*)*)`/g)) {
      const value = match[1] ?? match[2] ?? match[3] ?? '';
      if (!han.test(value)) continue;
      checked += 1;
      assert.equal(han.test(localize(value)), false, `${relativePath} retained Han after English localization: ${value}`);
    }
  }
  assert.ok(checked > 500, `expected broad chart copy coverage, checked ${checked} literals`);
});

test('chart host localizes option data, formatter output, fallbacks and status copy', () => {
  assert.match(chartHostSource, /typeof value === 'function'/);
  assert.match(chartHostSource, /Array\.isArray\(value\)/);
  assert.match(chartHostSource, /Object\.entries\(value as Record<string, unknown>\)/);
  assert.match(chartHostSource, /localizeReactNode\(fallback, locale\)/);
  assert.match(chartHostSource, /localizedAriaLabel/);
  assert.match(chartHostSource, /localizedFallbackAlt/);

  const customMap = readFileSync(new URL('../app/components/FusionTwinSystemMap.tsx', import.meta.url), 'utf8');
  assert.match(customMap, /localizeScientificOption\(locale, option\)/);
  for (const path of ['../app/components/PhaseOneRoadmap.tsx', '../app/roadmap/ProgramRoadmapCharts.tsx']) {
    assert.match(readFileSync(new URL(path, import.meta.url), 'utf8'), /LocalizedChartRegion/);
  }
});

test('high-value scientific labels have authored English rather than a generic placeholder', () => {
  const required = [
    '自由边界', '合成诊断', '瞬态电磁', '结构动力学', '中子输运', '包层 MHD', '氚迁移',
    '磁位形控制', '破裂预警/缓解', '核心输运', 'MHD/破裂', '实时确定性', 'V&V',
    '权威事实档案', '实验前正问题预演', '实验后逆问题重构', '控制验证与故障注入',
  ];
  for (const value of required) {
    const result = localize(value);
    assert.equal(han.test(result), false, value);
    assert.doesNotMatch(result, /^Technical annotation/, `${value} needs authored professional English`);
  }
});
