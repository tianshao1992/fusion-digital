'use client';

import type { EChartsCoreOption, EChartsType } from 'echarts/core';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { applyScientificChartTheme, useChartTheme } from '../charts/chart-theme';
import { useI18n } from '../../i18n';

type EfitCanvasChartProps = {
  option: EChartsCoreOption;
  ariaLabel: string;
  fallback: ReactNode;
  className?: string;
  onChartClick?: (params: unknown) => void;
  /** Locks x/y to the same physical pixel scale (x data span / y data span). */
  dataAspectRatio?: number;
};

function equalScaleGrid(element: HTMLElement, dataAspectRatio?: number) {
  if (!dataAspectRatio || !Number.isFinite(dataAspectRatio) || dataAspectRatio <= 0) return undefined;
  const width = element.clientWidth;
  const height = element.clientHeight;
  if (width <= 0 || height <= 0) return undefined;
  const margins = { left: 56, right: 24, top: 24, bottom: 48 };
  const availableWidth = Math.max(40, width - margins.left - margins.right);
  const availableHeight = Math.max(40, height - margins.top - margins.bottom);
  let plotWidth = availableWidth;
  let plotHeight = plotWidth / dataAspectRatio;
  if (plotHeight > availableHeight) {
    plotHeight = availableHeight;
    plotWidth = plotHeight * dataAspectRatio;
  }
  const horizontalSlack = Math.max(0, availableWidth - plotWidth);
  const verticalSlack = Math.max(0, availableHeight - plotHeight);
  return {
    left: Math.round(margins.left + horizontalSlack / 2),
    right: Math.round(margins.right + horizontalSlack / 2),
    top: Math.round(margins.top + verticalSlack / 2),
    bottom: Math.round(margins.bottom + verticalSlack / 2),
    containLabel: false,
  };
}

function optionWithEqualScale(option: EChartsCoreOption, element: HTMLElement, dataAspectRatio?: number): EChartsCoreOption {
  const grid = equalScaleGrid(element, dataAspectRatio);
  return grid ? { ...option, grid } : option;
}

export default function EfitCanvasChart({
  option,
  ariaLabel,
  fallback,
  className = '',
  onChartClick,
  dataAspectRatio,
}: EfitCanvasChartProps) {
  const { t } = useI18n();
  const chartTheme = useChartTheme();
  const themedOption = useMemo(() => applyScientificChartTheme(option, chartTheme), [chartTheme, option]);
  const mountRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<EChartsType | null>(null);
  const optionRef = useRef(themedOption);
  const clickRef = useRef(onChartClick);
  const aspectRef = useRef(dataAspectRatio);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useLayoutEffect(() => {
    optionRef.current = themedOption;
  }, [themedOption]);

  useEffect(() => {
    clickRef.current = onChartClick;
  }, [onChartClick]);

  useEffect(() => {
    aspectRef.current = dataAspectRatio;
  }, [dataAspectRatio]);

  useEffect(() => {
    if (!mountRef.current) return;
    let cancelled = false;
    let resizeObserver: ResizeObserver | undefined;
    let resizeFallback: (() => void) | undefined;

    void import('./echarts-canvas-runtime')
      .then(({ init }) => {
        if (cancelled || !mountRef.current) return;
        const chart = init(mountRef.current, undefined, {
          renderer: 'canvas',
          useCoarsePointer: true,
          devicePixelRatio: Math.min(window.devicePixelRatio || 1, 2.5),
        });
        chartRef.current = chart;
        chart.setOption(optionWithEqualScale(optionRef.current, mountRef.current, aspectRef.current), { notMerge: true, lazyUpdate: false });
        chart.on('click', (params: unknown) => clickRef.current?.(params));

        if (typeof ResizeObserver !== 'undefined') {
          resizeObserver = new ResizeObserver(() => {
            chart.resize();
            if (mountRef.current && aspectRef.current) {
              chart.setOption({ grid: equalScaleGrid(mountRef.current, aspectRef.current) }, { lazyUpdate: true });
            }
          });
          resizeObserver.observe(mountRef.current);
        } else {
          resizeFallback = () => {
            chart.resize();
            if (mountRef.current && aspectRef.current) {
              chart.setOption({ grid: equalScaleGrid(mountRef.current, aspectRef.current) }, { lazyUpdate: true });
            }
          };
          window.addEventListener('resize', resizeFallback);
        }
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      if (resizeFallback) window.removeEventListener('resize', resizeFallback);
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!chartRef.current || !mountRef.current) return;
    chartRef.current.setOption(optionWithEqualScale(themedOption, mountRef.current, dataAspectRatio), { notMerge: true, lazyUpdate: true });
  }, [dataAspectRatio, themedOption]);

  return (
    <div className={`efitChart ${ready ? 'isReady' : ''} ${failed ? 'hasFailed' : ''} ${className}`.trim()} data-chart-theme={chartTheme.mode}>
      <div className="efitChartFallback" aria-hidden={ready || undefined}>{fallback}</div>
      <div
        ref={mountRef}
        className="efitChartMount"
        role="img"
        aria-label={ariaLabel}
        aria-hidden={!ready || undefined}
      />
      {!ready && !failed && <span className="efitChartStatus">{t('efit.chartLoading')}</span>}
      {failed && <span className="efitChartStatus">{t('efit.chartFailed')}</span>}
    </div>
  );
}
