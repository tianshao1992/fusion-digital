'use client';

import type { EChartsCoreOption } from 'echarts/core';
import { useMemo } from 'react';
import { useI18n } from '../../i18n';
import EfitCanvasChart from './EfitCanvasChart';
import { buildGapAwareSignalSeries } from './signal-series';
import type { EfitFrameSummary } from './types';

type EfitSignalsChartProps = {
  timeline: readonly EfitFrameSummary[];
  currentTimeMs: number;
  onSeekTimeMs?: (timeMs: number) => void;
};

function chartTimeFromClick(params: unknown): number | null {
  if (!params || typeof params !== 'object' || !('value' in params)) return null;
  const value = (params as { value?: unknown }).value;
  if (!Array.isArray(value) || typeof value[0] !== 'number' || !Number.isFinite(value[0])) return null;
  return value[0];
}

export default function EfitSignalsChart({ timeline, currentTimeMs, onSeekTimeMs }: EfitSignalsChartProps) {
  const { locale, t } = useI18n();
  const option = useMemo<EChartsCoreOption>(() => {
    const cursor = {
      silent: true,
      symbol: 'none',
      lineStyle: { color: '#f5c077', width: 1.2, type: 'dashed' as const },
      label: {
        show: true,
        formatter: `${(currentTimeMs / 1000).toFixed(3)} s`,
        color: '#13221f',
        backgroundColor: '#f5c077',
        padding: [3, 6],
      },
      data: [{ xAxis: currentTimeMs }],
    };

    return {
      animation: false,
      backgroundColor: 'transparent',
      aria: { enabled: true, description: t('efit.signalsAria') },
      color: ['#45ddc7', '#80a7ff', '#ff9c70'],
      legend: {
        top: 4,
        right: 12,
        itemWidth: 16,
        itemHeight: 3,
        textStyle: { color: '#a8c8c2', fontSize: 10 },
      },
      grid: { left: 58, right: 52, top: 38, bottom: 50 },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'line', lineStyle: { color: 'rgba(123, 234, 220, .45)' } },
        backgroundColor: 'rgba(5, 19, 23, .94)',
        borderColor: 'rgba(98, 211, 195, .4)',
        textStyle: { color: '#d8f4ef', fontSize: 11 },
      },
      dataZoom: [{ type: 'inside', xAxisIndex: 0, filterMode: 'none', zoomOnMouseWheel: 'ctrl' }],
      xAxis: {
        type: 'value',
        min: timeline[0]?.timeMs,
        max: timeline.at(-1)?.timeMs,
        name: 't / s',
        nameLocation: 'middle',
        nameGap: 30,
        axisLine: { lineStyle: { color: '#55766f' } },
        axisLabel: { color: '#8dafaa', fontSize: 10, formatter: (value: number) => (value / 1000).toFixed(2) },
        nameTextStyle: { color: '#a9cbc5', fontSize: 10 },
        splitLine: { lineStyle: { color: 'rgba(120, 164, 157, .1)' } },
      },
      yAxis: [
        {
          type: 'value',
          name: 'Ip / kA',
          scale: true,
          axisLine: { show: true, lineStyle: { color: '#45ddc7' } },
          axisLabel: { color: '#75bdb3', fontSize: 10 },
          nameTextStyle: { color: '#75bdb3', fontSize: 10 },
          splitLine: { lineStyle: { color: 'rgba(120, 164, 157, .1)' } },
        },
        {
          type: 'value',
          name: t('efit.axisPosition'),
          scale: true,
          axisLine: { show: true, lineStyle: { color: '#80a7ff' } },
          axisLabel: { color: '#8fa9d9', fontSize: 10 },
          nameTextStyle: { color: '#8fa9d9', fontSize: 10 },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: 'Ip',
          type: 'line',
          data: buildGapAwareSignalSeries(timeline, (frame) => frame.currentA / 1000),
          connectNulls: false,
          showSymbol: false,
          lineStyle: { width: 1.8 },
          sampling: 'lttb',
          markLine: cursor,
          animation: false,
        },
        {
          name: 'Raxis',
          type: 'line',
          yAxisIndex: 1,
          data: buildGapAwareSignalSeries(timeline, (frame) => frame.rAxisM),
          connectNulls: false,
          showSymbol: false,
          lineStyle: { width: 1.4 },
          sampling: 'lttb',
          animation: false,
        },
        {
          name: 'Zaxis',
          type: 'line',
          yAxisIndex: 1,
          data: buildGapAwareSignalSeries(timeline, (frame) => frame.zAxisM),
          connectNulls: false,
          showSymbol: false,
          lineStyle: { width: 1.4 },
          sampling: 'lttb',
          animation: false,
        },
      ],
    };
  }, [currentTimeMs, t, timeline]);

  const validIp = timeline.filter((frame) => Number.isFinite(frame.currentA));
  const fallback = (
    <div className="efitChartTextFallback">
      <strong>{t('efit.signalFallback')}</strong>
      <span>{t('efit.frames', { count: timeline.length.toLocaleString(locale) })}</span>
      <span>{validIp.length ? `Ip ${Math.min(...validIp.map((frame) => frame.currentA / 1000)).toFixed(1)} – ${Math.max(...validIp.map((frame) => frame.currentA / 1000)).toFixed(1)} kA` : t('efit.noIp')}</span>
      <span>{t('efit.currentTime', { time: (currentTimeMs / 1000).toFixed(3) })}</span>
    </div>
  );

  return (
    <EfitCanvasChart
      option={option}
      ariaLabel={t('efit.signalChartAria')}
      fallback={fallback}
      className="efitSignalsChart"
      onChartClick={(params) => {
        const timeMs = chartTimeFromClick(params);
        if (timeMs !== null) onSeekTimeMs?.(timeMs);
      }}
    />
  );
}
