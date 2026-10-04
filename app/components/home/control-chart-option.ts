import type { EChartsCoreOption } from 'echarts/core';
import type { ChartThemePalette } from '../charts/chart-theme';
import { controlEvidence } from './home-content';

/** Shared stage positions, separate zero-based scales: volume and reliability are not the same unit. */
export function buildControlChartOption(palette: ChartThemePalette, en: boolean): EChartsCoreOption {
  const labels = en ? ['Success', 'Failed', 'Operation', 'Success rate'] : ['成功', '失败', 'Operation', '成功率'];
  const stages = controlEvidence.stages;
  return {
    backgroundColor: 'transparent',
    animation: false,
    grid: [
      { left: 43, right: 12, top: 30, height: '40%' },
      { left: 43, right: 12, top: '70%', height: '21%' },
    ],
    textStyle: { fontFamily: 'Arial, Microsoft YaHei, sans-serif', color: palette.text },
    tooltip: {
      trigger: 'axis', renderMode: 'richText', confine: true,
      backgroundColor: palette.tooltipBackground, borderColor: palette.tooltipBorder,
      textStyle: { color: palette.tooltipText, fontSize: 12 },
      axisPointer: { type: 'line', lineStyle: { color: palette.line, type: 'dashed' } },
      formatter: (params: unknown) => {
        if (!Array.isArray(params) || !params.length) return '';
        const item = stages[params[0]?.dataIndex as number];
        if (!item) return '';
        return item.period+'\n'+(en?'Applications':'应用次数')+' '+item.total+'\n'+labels[0]+' '+item.success+' · '+labels[1]+' '+item.failed+'\nOperation '+item.operation+'\n'+labels[3]+' '+item.reportedRate+'%';
      },
    },
    xAxis: [0, 1].map(gridIndex => ({
      type: 'category', gridIndex, data: stages.map(item => item.period),
      axisLine: { lineStyle: { color: palette.line } }, axisTick: { show: false },
      axisLabel: { color: palette.muted, fontSize: 12, interval: 0, margin: 12 },
      axisPointer: { show: true },
    })),
    yAxis: [
      { type: 'value', gridIndex: 0, min: 0, max: 700, interval: 350, axisLabel: { color: palette.muted, fontSize: 12 }, splitLine: { lineStyle: { color: palette.grid } } },
      { type: 'value', gridIndex: 1, min: 0, max: 100, interval: 50, axisLabel: { color: palette.muted, formatter: '{value}%', fontSize: 12 }, splitLine: { lineStyle: { color: palette.grid } } },
    ],
    series: [
      ...(['success', 'failed', 'operation'] as const).map((key, index) => ({
        name: labels[index], type: 'bar', stack: 'shots', xAxisIndex: 0, yAxisIndex: 0,
        barMaxWidth: 56, barWidth: '35%', emphasis: { disabled: true },
        itemStyle: { color: [palette.info, palette.accent, palette.subtle][index] },
        data: stages.map(item => item[key]),
        label: { show: index === 0, position: 'inside', color: palette.mode === 'dark' ? palette.background : palette.surfaceRaised, fontSize: 13, formatter: (p: {value: number}) => p.value >= 200 ? String(p.value) : '' },
      })),
      { type: 'bar', xAxisIndex: 0, yAxisIndex: 0, barGap: '-100%', barMaxWidth: 56, barWidth: '35%', silent: true, tooltip: { show: false }, itemStyle: { color: 'transparent' }, data: stages.map(item => item.total), label: { show: true, position: 'top', distance: 8, color: palette.text, fontSize: 17, fontWeight: 600 } },
      {
        name: labels[3], type: 'line', xAxisIndex: 1, yAxisIndex: 1,
        connectNulls: false, smooth: false, symbol: 'circle', symbolSize: 9,
        itemStyle: { color: palette.violet, borderColor: palette.background, borderWidth: 2 },
        lineStyle: { color: palette.violet, width: 3 },
        areaStyle: { color: palette.violet, opacity: 0.07 },
        data: stages.map(item => item.reportedRate),
        label: { show: true, position: 'top', distance: 10, formatter: '{c}%', color: palette.violet, fontSize: 16, fontWeight: 600 },
      },
    ],
  };
}
