import type { EChartsCoreOption } from 'echarts/core';
import type { ChartThemePalette } from '../charts/chart-theme';
import { controlEvidence } from './home-content';

export function buildControlChartOption(palette: ChartThemePalette, en: boolean): EChartsCoreOption {
  const labels = en ? ['Success', 'Failed', 'Operation', 'Reported success rate'] : ['成功', '失败', 'Operation', '原图报告成功率'];
  return {
    backgroundColor: 'transparent',
    animation: false,
    grid: { left: 8, right: 12, top: 35, bottom: 12, outerBoundsMode: 'same', outerBoundsContain: 'axisLabel' },
    textStyle: { fontFamily: 'Arial, Microsoft YaHei, sans-serif', color: palette.text },
    tooltip: {
      trigger: 'axis', renderMode: 'richText', confine: true,
      backgroundColor: palette.tooltipBackground, borderColor: palette.tooltipBorder,
      textStyle: { color: palette.tooltipText },
      axisPointer: { type: 'shadow', shadowStyle: { color: palette.grid } },
      formatter: (params: unknown) => {
        if (!Array.isArray(params) || !params.length) return '';
        const item = controlEvidence.stages[params[0]?.dataIndex as number];
        if (!item) return '';
        return item.period+'\n'+(en?'Total':'总数')+' '+item.total+'\n'+labels[0]+' '+item.success+' · '+labels[1]+' '+item.failed+' · Operation '+item.operation+'\n'+(en?'Source rate':'原图成功率')+' '+item.reportedRate+'%'+(item.ratePending ? (en?' (definition pending)':'（口径待核验）'):'');
      },
    },
    xAxis: { type: 'category', data: controlEvidence.stages.map(item => item.period), axisLine: { lineStyle: { color: palette.line } }, axisTick: { show: false }, axisLabel: { color: palette.muted, fontSize: 12, interval: 0 } },
    yAxis: [
      { type: 'value', min: 0, max: 700, interval: 200, axisLabel: { color: palette.muted, fontSize: 12 }, splitLine: { lineStyle: { color: palette.grid } } },
      { type: 'value', min: 50, max: 100, interval: 10, axisLabel: { color: palette.muted, formatter: '{value}%', fontSize: 12 }, splitLine: { show: false } },
    ],
    series: [
      ...(['success', 'failed', 'operation'] as const).map((key, index) => ({
        name: labels[index], type: 'bar', stack: 'shots', barMaxWidth: 56,
        itemStyle: { color: [palette.info, palette.accent, palette.subtle][index] },
        data: controlEvidence.stages.map(item => item[key]),
        label: { show: index === 0, position: 'inside', color: palette.mode === 'dark' ? palette.background : palette.surfaceRaised, fontSize: 13, formatter: (p: {value: number}) => p.value >= 40 ? String(p.value) : '' },
      })),
      { type: 'bar', barGap: '-100%', barMaxWidth: 56, silent: true, tooltip: {show: false}, itemStyle: { color: 'transparent' }, data: controlEvidence.stages.map(item => item.total), label: { show: true, position: 'top', color: palette.text, fontSize: 14 } },
      { name: labels[3], type: 'line', yAxisIndex: 1, connectNulls: false, symbol: 'circle', symbolSize: 8, itemStyle: { color: palette.violet, borderColor: palette.background, borderWidth: 2 }, lineStyle: { color: palette.violet, width: 2 }, data: controlEvidence.stages.map(item => item.ratePending ? null : item.reportedRate), label: { show: true, position: 'left', distance: 12, offset: [0,-5], formatter: '{c}%', color: palette.violet, fontSize: 13 } },
    ],
  };
}
