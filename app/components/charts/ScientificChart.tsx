'use client';

import type { EChartsCoreOption, EChartsType } from 'echarts/core';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import './scientific-chart.css';

type ChartClickHandler = (params: unknown) => void;

type ScientificChartProps = {
  id: string;
  option: EChartsCoreOption;
  ariaLabel: string;
  fallbackSrc: string;
  fallbackAlt: string;
  className?: string;
  height?: number;
  eager?: boolean;
  dark?: boolean;
  onChartClick?: ChartClickHandler;
  fallback?: ReactNode;
};

export default function ScientificChart({
  id,
  option,
  ariaLabel,
  fallbackSrc,
  fallbackAlt,
  className = '',
  height = 460,
  eager = false,
  dark = false,
  onChartClick,
  fallback,
}: ScientificChartProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<EChartsType | null>(null);
  const optionRef = useRef(option);
  const clickRef = useRef(onChartClick);
  const [nearViewport, setNearViewport] = useState(eager);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    optionRef.current = option;
  }, [option]);

  useEffect(() => {
    clickRef.current = onChartClick;
  }, [onChartClick]);

  useEffect(() => {
    if (eager || nearViewport || !rootRef.current) return;
    if (typeof IntersectionObserver === 'undefined') {
      const timeout = globalThis.setTimeout(() => setNearViewport(true), 0);
      return () => globalThis.clearTimeout(timeout);
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setNearViewport(true);
          observer.disconnect();
        }
      },
      { rootMargin: '420px 0px' },
    );
    observer.observe(rootRef.current);
    return () => observer.disconnect();
  }, [eager, nearViewport]);

  useEffect(() => {
    if (!nearViewport || !mountRef.current) return;
    let cancelled = false;
    let resizeObserver: ResizeObserver | undefined;
    let resizeFallback: (() => void) | undefined;

    void import('./echartsRuntime')
      .then(({ init }) => {
        if (cancelled || !mountRef.current) return;
        const chart = init(mountRef.current, undefined, {
          renderer: 'svg',
          useCoarsePointer: true,
        });
        chartRef.current = chart;
        const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        chart.setOption({ ...optionRef.current, animation: !reduceMotion }, true);
        chart.on('click', (params) => clickRef.current?.(params));
        if (typeof ResizeObserver !== 'undefined') {
          resizeObserver = new ResizeObserver(() => chart.resize());
          resizeObserver.observe(mountRef.current);
        } else {
          resizeFallback = () => chart.resize();
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
  }, [nearViewport]);

  useEffect(() => {
    if (!chartRef.current) return;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    chartRef.current.setOption({ ...option, animation: !reduceMotion }, true);
  }, [option]);

  function exportSvg() {
    const chart = chartRef.current;
    if (!chart) return;
    const anchor = document.createElement('a');
    anchor.href = chart.getDataURL({ type: 'svg', backgroundColor: dark ? '#0b1511' : '#ffffff' });
    anchor.download = `${id}.svg`;
    anchor.click();
  }

  return (
    <div
      ref={rootRef}
      className={`scientificChart${ready ? ' isReady' : ''}${failed ? ' hasFailed' : ''}${dark ? ' darkChart' : ''}${className ? ` ${className}` : ''}`}
      style={{ '--scientific-chart-height': `${height}px` } as CSSProperties}
      data-echart={id}
    >
      {fallback ? (
        <div className="scientificChartFallback scientificChartFallbackContent" style={{ overflow: 'auto', objectFit: 'initial' }} aria-hidden={ready || undefined}>{fallback}</div>
      ) : (
        <img className="scientificChartFallback" src={fallbackSrc} alt={fallbackAlt} aria-hidden={ready || undefined} loading={eager ? 'eager' : 'lazy'} decoding="async" />
      )}
      <div ref={mountRef} className="scientificChartMount" role="img" aria-label={ariaLabel} aria-hidden={!ready || undefined} />
      {!ready && !failed && <span className="scientificChartStatus">交互图加载中…</span>}
      {failed && <span className="scientificChartStatus">交互组件未加载，当前显示可读静态图。</span>}
      {ready && <button type="button" className="scientificChartExport" onClick={exportSvg} aria-label="导出当前图表为 SVG">SVG ↓</button>}
    </div>
  );
}
