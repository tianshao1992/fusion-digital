'use client';

import type { EChartsCoreOption } from 'echarts/core';
import { useMemo } from 'react';
import { useI18n } from '../../i18n';
import { useChartTheme } from '../charts/chart-theme';
import EfitCanvasChart from './EfitCanvasChart';
import { buildGapAwareSignalSeries } from './signal-series';
import type { EfitFrameSummary } from './types';

type EfitSignalsChartProps = {
  timeline: readonly EfitFrameSummary[];
  currentTimeMs: number;
  onSeekTimeMs?: (timeMs: number) => void;
};

export const EFIT_SIGNAL_WINDOW_MS = Object.freeze({ min: 0, max: 1000 });

function chartTimeFromClick(params: unknown): number | null {
  if (!params || typeof params !== 'object' || !('value' in params)) return null;
  const value = (params as { value?: unknown }).value;
  if (!Array.isArray(value) || typeof value[0] !== 'number' || !Number.isFinite(value[0])) return null;
  return value[0];
}

export default function EfitSignalsChart({ timeline, currentTimeMs, onSeekTimeMs }: EfitSignalsChartProps) {
  const { locale, t } = useI18n();
  const chartTheme = useChartTheme();
  const timelineInWindow = useMemo(
    () => timeline.filter((frame) => frame.timeMs >= EFIT_SIGNAL_WINDOW_MS.min && frame.timeMs <= EFIT_SIGNAL_WINDOW_MS.max),
    [timeline],
  );
  const option = useMemo<EChartsCoreOption>(() => {
    const signalColors = chartTheme.mode === 'dark'
      ? ['#45ddc7', '#80a7ff', '#ff9c70']
      : ['#287b6f', '#526fa8', '#b85b37'];
    const cursor = {
      silent: true,
      symbol: 'none',
      lineStyle: { color: chartTheme.accent, width: 1.2, type: 'dashed' as const },
      label: {
        show: true,
        formatter: `${(currentTimeMs / 1000).toFixed(3)} s`,
        color: chartTheme.mode === 'dark' ? '#13221f' : '#fffdf8',
        backgroundColor: chartTheme.accent,
        padding: [3, 6],
      },
      data: currentTimeMs >= EFIT_SIGNAL_WINDOW_MS.min && currentTimeMs <= EFIT_SIGNAL_WINDOW_MS.max
        ? [{ xAxis: currentTimeMs }]
        : [],
    };

    return {
      animation: false,
      backgroundColor: 'transparent',
      aria: { enabled: true, description: t('efit.signalsAria') },
      color: signalColors,
      legend: {
        top: 4,
        right: 12,
        itemWidth: 16,
        itemHeight: 3,
        textStyle: { color: chartTheme.muted, fontSize: 10 },
      },
      grid: { left: 58, right: 52, top: 38, bottom: 50 },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'line', lineStyle: { color: chartTheme.line } },
        backgroundColor: chartTheme.tooltipBackground,
        borderColor: chartTheme.tooltipBorder,
        textStyle: { color: chartTheme.tooltipText, fontSize: 11 },
      },
      xAxis: {
        type: 'value',
        min: EFIT_SIGNAL_WINDOW_MS.min,
        max: EFIT_SIGNAL_WINDOW_MS.max,
        interval: 200,
        name: 't / s',
        nameLocation: 'middle',
        nameGap: 30,
        axisLine: { lineStyle: { color: chartTheme.line } },
        axisLabel: { color: chartTheme.muted, fontSize: 10, formatter: (value: number) => (value / 1000).toFixed(2) },
        nameTextStyle: { color: chartTheme.muted, fontSize: 10 },
        splitLine: { lineStyle: { color: chartTheme.grid } },
      },
      yAxis: [
        {
          type: 'value',
          name: 'Ip / kA',
          scale: true,
          axisLine: { show: true, lineStyle: { color: signalColors[0] } },
          axisLabel: { color: signalColors[0], fontSize: 10 },
          nameTextStyle: { color: signalColors[0], fontSize: 10 },
          splitLine: { lineStyle: { color: chartTheme.grid } },
        },
        {
          type: 'value',
          name: t('efit.axisPosition'),
          scale: true,
          axisLine: { show: true, lineStyle: { color: signalColors[1] } },
          axisLabel: { color: signalColors[1], fontSize: 10 },
          nameTextStyle: { color: signalColors[1], fontSize: 10 },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: 'Ip',
          type: 'line',
          data: buildGapAwareSignalSeries(timelineInWindow, (frame) => frame.currentA / 1000),
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
          data: buildGapAwareSignalSeries(timelineInWindow, (frame) => frame.rAxisM),
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
          data: buildGapAwareSignalSeries(timelineInWindow, (frame) => frame.zAxisM),
          connectNulls: false,
          showSymbol: false,
          lineStyle: { width: 1.4 },
          sampling: 'lttb',
          animation: false,
        },
      ],
    };
  }, [chartTheme, currentTimeMs, t, timelineInWindow]);

  const validIp = timelineInWindow.filter((frame) => Number.isFinite(frame.currentA));
  const fallback = (
    <div className="efitChartTextFallback">
      <strong>{t('efit.signalFallback')}</strong>
      <span>{t('efit.frames', { count: timelineInWindow.length.toLocaleString(locale) })}</span>
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
