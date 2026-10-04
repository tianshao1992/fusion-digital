import test from 'node:test';
import assert from 'node:assert/strict';
import { buildControlChartOption } from '../app/components/home/control-chart-option.ts';
import type { ChartThemePalette } from '../app/components/charts/chart-theme.ts';
import { init, use } from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import { readFileSync } from 'node:fs';

const dark: ChartThemePalette = {
  mode: 'dark', background: '#0b1511', surface: '#111d18', surfaceRaised: '#18241f',
  text: '#eef8f4', muted: '#9fb4aa', subtle: '#7f968b', line: '#486157',
  grid: 'rgba(120,164,157,.12)', accent: '#e18766', accentSoft: '#4c3027',
  info: '#9aafa0', infoSoft: '#2c3c32', violet: '#b5a4bd',
  tooltipBackground: '#07100d', tooltipBorder: '#4d6a5d', tooltipText: '#dcebe4',
};
const light: ChartThemePalette = { ...dark, mode: 'light', background: '#fffdf8', surfaceRaised: '#ffffff', text: '#2f2b27', info: '#52685b', accent: '#c86545', violet: '#7d7085', tooltipText: '#2f2b27' };

for (const palette of [light,dark]) {
  test(palette.mode+' evidence chart follows theme while displaying all user-confirmed rates', () => {
    const option = buildControlChartOption(palette, false);
    const series = option.series as Array<{data: unknown[]; connectNulls?: boolean; itemStyle: {color: string}; label: {color: string}}>;
    assert.deepEqual(series[0].data,[8,44,64,562]);
    assert.deepEqual(series[1].data,[7,19,21,33]);
    assert.deepEqual(series[2].data,[0,7,10,11]);
    assert.deepEqual(series[3].data,[15,70,95,606]);
    assert.deepEqual(series[4].data,[53,70,73,94]);
    assert.equal(series[4].connectNulls,false);
    assert.deepEqual([series[0].itemStyle.color,series[1].itemStyle.color,series[2].itemStyle.color,series[4].itemStyle.color],[palette.info,palette.accent,palette.subtle,palette.violet]);
    assert.equal(series[0].label.color,palette.mode === 'dark'?palette.background:palette.surfaceRaised);
    assert.equal(option.animation,false);
    assert.equal(option.backgroundColor,'transparent');
    assert.equal(option.legend,undefined,'HTML legend cannot hide stacks while totals remain visible');
  });
}
test('tooltip shows supplied rates and handles empty observations without fabricated values', () => {
  const zh=buildControlChartOption(dark,false).tooltip as {formatter:(data:unknown)=>string};
  const en=buildControlChartOption(light,true).tooltip as {formatter:(data:unknown)=>string};
  assert.equal(zh.formatter([]),'');
  assert.equal(zh.formatter([{dataIndex:99}]),'');
  assert.match(zh.formatter([{dataIndex:2}]),/成功率 73%/);
  assert.match(en.formatter([{dataIndex:2}]),/Success rate 73%/);
  assert.doesNotMatch(en.formatter([{dataIndex:2}]),/pending|75.3/);
});
test('separate aligned chart panels start both scales at zero and keep legible category labels', () => {
  const option=buildControlChartOption(light,false);
  const grids=option.grid as Array<{left:number;right:number;top:number|string}>;
  const yAxes=option.yAxis as Array<{gridIndex:number;min:number;max:number;axisLabel:{fontSize:number}}>;
  const xAxes=option.xAxis as Array<{gridIndex:number;data:string[];axisLabel:{fontSize:number}}>;
  const series=option.series as Array<{xAxisIndex:number;yAxisIndex:number;label:{position:string}}>;
  assert.equal(grids.length,2);
  assert.equal(grids[0].left,grids[1].left);
  assert.equal(grids[0].right,grids[1].right);
  assert.deepEqual(yAxes.map(axis=>[axis.gridIndex,axis.min,axis.max]),[[0,0,700],[1,0,100]]);
  assert.deepEqual(xAxes.map(axis=>axis.gridIndex),[0,1]);
  assert.deepEqual(xAxes[0].data,xAxes[1].data);
  for(const axis of [...xAxes,...yAxes]) assert.ok(axis.axisLabel.fontSize>=12);
  assert.deepEqual(series.map(item=>[item.xAxisIndex,item.yAxisIndex]),[[0,0],[0,0],[0,0],[0,0],[1,1]]);
  assert.equal(series[3].label.position,'top');
  assert.equal(series[4].label.position,'top');
});
test('light and dark chart options render valid SVG at phone and desktop widths', () => {
  use([BarChart,LineChart,GridComponent,TooltipComponent,SVGRenderer]);
  for(const palette of [light,dark]) for(const width of [280,320,720]) {
    const chart=init(null,undefined,{renderer:'svg',ssr:true,width,height:460});
    try {
      chart.setOption(buildControlChartOption(palette,true));
      const svg=chart.renderToSVGString();
      assert.match(svg,/<svg/);
      assert.match(svg,/606/);
      for(const rate of [53,70,73,94]) assert.match(svg,new RegExp(rate+'%'));
      assert.doesNotMatch(svg,/NaN|undefined/);
    } finally { chart.dispose(); }
  }
});
test('SSR fallback and accessible detail retain every count and rate without JavaScript', () => {
  const source=readFileSync(new URL('../app/components/home/ControlEvidence.tsx',import.meta.url),'utf8');
  const fallback=source.split('className="fdEvidenceFallback"')[1].split('className="fdEvidenceAccessible"')[0];
  for(const key of ['total','success','failed','operation','reportedRate']) assert.ok(fallback.includes(`item.${key}`),key+' is present in the fallback');
  assert.match(source,/fdEvidenceAccessible/);
  assert.match(source,/rateConfirmedOn|2026\.10\.05/);
  assert.match(source,/not a time-normalized growth rate/);
  assert.doesNotMatch(source,/ratePending|折线点暂不显示|definition pending/);
});
