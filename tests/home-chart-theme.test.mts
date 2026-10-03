import test from 'node:test';
import assert from 'node:assert/strict';
import { buildControlChartOption } from '../app/components/home/control-chart-option.ts';
import type { ChartThemePalette } from '../app/components/charts/chart-theme.ts';
import { init, use } from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';

const dark: ChartThemePalette = {
  mode: 'dark', background: '#0b1511', surface: '#111d18', surfaceRaised: '#18241f',
  text: '#eef8f4', muted: '#9fb4aa', subtle: '#7f968b', line: '#486157',
  grid: 'rgba(120,164,157,.12)', accent: '#e18766', accentSoft: '#4c3027',
  info: '#9aafa0', infoSoft: '#2c3c32', violet: '#b5a4bd',
  tooltipBackground: '#07100d', tooltipBorder: '#4d6a5d', tooltipText: '#dcebe4',
};
const light: ChartThemePalette = { ...dark, mode: 'light', background: '#fffdf8', surfaceRaised: '#ffffff', text: '#2f2b27', info: '#52685b', accent: '#c86545', violet: '#7d7085', tooltipText: '#2f2b27' };

for (const palette of [light,dark]) {
  test(palette.mode+' evidence chart follows theme without changing counts or filling gaps', () => {
    const option = buildControlChartOption(palette, false);
    const series = option.series as Array<{data: unknown[]; connectNulls?: boolean; itemStyle: {color: string}; label: {color: string}}>;
    assert.deepEqual(series[0].data,[8,44,64,562]);
    assert.deepEqual(series[1].data,[7,19,21,33]);
    assert.deepEqual(series[2].data,[0,7,10,11]);
    assert.deepEqual(series[3].data,[15,70,95,606]);
    assert.deepEqual(series[4].data,[53,70,null,94]);
    assert.equal(series[4].connectNulls,false);
    assert.deepEqual([series[0].itemStyle.color,series[1].itemStyle.color,series[2].itemStyle.color,series[4].itemStyle.color],[palette.info,palette.accent,palette.subtle,palette.violet]);
    assert.equal(series[0].label.color,palette.mode === 'dark'?palette.background:palette.surfaceRaised);
    assert.equal(option.animation,false);
    assert.equal(option.backgroundColor,'transparent');
    assert.equal(option.legend,undefined,'HTML legend cannot hide stacks while totals remain visible');
  });
}
test('tooltip retains uncertainty and handles empty observations without fabricated values', () => {
  const zh=buildControlChartOption(dark,false).tooltip as {formatter:(data:unknown)=>string};
  const en=buildControlChartOption(light,true).tooltip as {formatter:(data:unknown)=>string};
  assert.equal(zh.formatter([]),'');
  assert.equal(zh.formatter([{dataIndex:99}]),'');
  assert.match(zh.formatter([{dataIndex:2}]),/73%（口径待核验）/);
  assert.match(en.formatter([{dataIndex:2}]),/definition pending/);
});
test('light and dark chart options render valid SVG at phone and desktop widths', () => {
  use([BarChart,LineChart,GridComponent,TooltipComponent,SVGRenderer]);
  for(const palette of [light,dark]) for(const width of [320,720]) {
    const chart=init(null,undefined,{renderer:'svg',ssr:true,width,height:335});
    try {
      chart.setOption(buildControlChartOption(palette,true));
      const svg=chart.renderToSVGString();
      assert.match(svg,/<svg/);
      assert.match(svg,/606/);
      assert.doesNotMatch(svg,/NaN|undefined/);
    } finally { chart.dispose(); }
  }
});
