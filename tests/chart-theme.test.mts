import assert from 'node:assert/strict';
import test from 'node:test';
import { use as registerEChartsModules } from 'echarts/core';
import { SVGRenderer } from 'echarts/renderers';
import { applyScientificChartTheme, type ChartThemePalette } from '../app/components/charts/chart-theme.ts';
import { init } from '../app/components/efit/echarts-canvas-runtime.ts';

const palette: ChartThemePalette = {
  mode: 'dark', background: '#0b1511', surface: '#111d18', surfaceRaised: '#18241f',
  text: '#eef8f4', muted: '#9fb4aa', subtle: '#7f968b', line: '#486157',
  grid: 'rgba(120, 164, 157, .12)', accent: '#e18766', accentSoft: '#4c3027',
  info: '#9aafa0', infoSoft: '#2c3c32', violet: '#b5a4bd',
  tooltipBackground: '#07100d', tooltipBorder: '#4d6a5d', tooltipText: '#dcebe4',
};

test('chart theme does not add polar components to Cartesian options', () => {
  const source = {
    xAxis: { type: 'value', min: 0, max: 1 },
    yAxis: { type: 'value', name: 'Te / eV' },
    series: [{ type: 'line', data: [[0, 10], [1, 2]], itemStyle: { color: '#ff0000' } }],
  };
  const original = structuredClone(source);
  const themed = applyScientificChartTheme(source, palette);
  assert.equal(Object.hasOwn(themed, 'radiusAxis'), false);
  assert.equal(Object.hasOwn(themed, 'angleAxis'), false);
  assert.equal(Object.hasOwn(themed, 'polar'), false);
  assert.equal(Object.hasOwn(themed, 'legend'), false);
  assert.equal(Object.hasOwn(themed, 'visualMap'), false);
  assert.deepEqual(source, original, 'the input options must not be mutated');
  assert.deepEqual(themed.series, original.series, 'scientific samples and series colours must be preserved');
});

test('chart theme leaves coordinate-free options coordinate-free', () => {
  const themed = applyScientificChartTheme({ series: [{ type: 'graph', data: [] }] }, palette);
  for (const component of ['xAxis', 'yAxis', 'radiusAxis', 'angleAxis', 'legend', 'visualMap']) {
    assert.equal(Object.hasOwn(themed, component), false, `${component} was not supplied`);
  }
});

test('chart theme still styles supplied polar axes and preserves their semantics', () => {
  const formatter = (value: number) => `${value} m`;
  const source = {
    polar: { center: ['50%', '50%'] },
    radiusAxis: [{ min: 0, max: 4, axisLabel: { formatter }, axisLine: { lineStyle: { width: 3 } } }],
    angleAxis: { min: 0, max: 360, clockwise: false },
    legend: [{ data: ['field'], textStyle: { fontSize: 14 } }],
    visualMap: { min: 0, max: 2, textStyle: { fontSize: 12 } },
  };
  const themed = applyScientificChartTheme(source, palette);
  assert.deepEqual(themed.polar, source.polar);
  assert.deepEqual(themed.radiusAxis, [{
    min: 0, max: 4,
    axisLabel: { formatter, color: palette.muted },
    axisLine: { lineStyle: { width: 3, color: palette.line } },
    nameTextStyle: { color: palette.muted },
    splitLine: { lineStyle: { color: palette.grid } },
  }]);
  assert.deepEqual(themed.angleAxis, {
    min: 0, max: 360, clockwise: false,
    axisLabel: { color: palette.muted },
    axisLine: { lineStyle: { color: palette.line } },
    nameTextStyle: { color: palette.muted },
    splitLine: { lineStyle: { color: palette.grid } },
  });
  assert.deepEqual(themed.legend, [{ data: ['field'], textStyle: { fontSize: 14, color: palette.muted } }]);
  assert.deepEqual(themed.visualMap, { min: 0, max: 2, textStyle: { fontSize: 12, color: palette.muted } });
});

test('EFIT runtime accepts a themed Cartesian chart without importing PolarComponent', (context) => {
  // Reuse the actual Canvas module registration. SVG is added only for a DOM-free
  // SSR check; the generic SVG runtime would register Polar and hide this bug.
  registerEChartsModules([SVGRenderer]);
  const errors: string[] = [];
  context.mock.method(console, 'error', (...args: unknown[]) => errors.push(args.join(' ')));
  const chart = init(null, undefined, { renderer: 'svg', ssr: true, width: 320, height: 240 });
  try {
    chart.setOption(applyScientificChartTheme({
      animation: false,
      xAxis: { type: 'value' },
      yAxis: { type: 'value' },
      series: [{ type: 'line', data: [[0, 10], [1, 2]] }],
    }, palette));
    assert.match(chart.renderToSVGString(), /<svg/);
    assert.deepEqual(errors, [], 'theme application must not trigger missing-component diagnostics');
  } finally {
    chart.dispose();
  }
});
