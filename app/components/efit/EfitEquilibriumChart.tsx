'use client';

import type { EChartsCoreOption } from 'echarts/core';
import { useMemo } from 'react';
import EfitCanvasChart from './EfitCanvasChart';
import type { EfitFrame, EfitManifest, EfitNumericVector } from './types';

type EfitEquilibriumChartProps = {
  frame: EfitFrame | null;
  manifest: EfitManifest | null;
};

const SURFACE_COLORS = ['#154a50', '#17616a', '#19757d', '#1a8990', '#1c9da1', '#22b0b0', '#38c3bb', '#66d5c8', '#9ae5d8'];

function vectorPairs(rM: EfitNumericVector, zM: EfitNumericVector, count: number, closed = false): number[][] {
  const limit = Math.min(count, rM.length, zM.length);
  const pairs: number[][] = [];
  for (let index = 0; index < limit; index += 1) {
    const r = rM[index];
    const z = zM[index];
    if (Number.isFinite(r) && Number.isFinite(z)) pairs.push([r, z]);
  }
  if (closed && pairs.length > 2) pairs.push([...pairs[0]]);
  return pairs;
}

function finiteExtent(values: number[], paddingRatio = 0.05): [number, number] | undefined {
  if (values.length === 0) return undefined;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const padding = Math.max((max - min) * paddingRatio, 0.01);
  return [min - padding, max + padding];
}

export default function EfitEquilibriumChart({ frame, manifest }: EfitEquilibriumChartProps) {
  const extent = manifest?.geometry.gridExtentM;
  const dataAspectRatio = extent && extent[1] > extent[0] && extent[3] > extent[2]
    ? (extent[1] - extent[0]) / (extent[3] - extent[2])
    : undefined;
  const option = useMemo<EChartsCoreOption>(() => {
    const limiter = manifest?.geometry.limiterRzM;
    const limiterData = limiter ? vectorPairs(limiter.rM, limiter.zM, limiter.validPoints, true) : [];
    const contours = frame?.contours ?? [];
    const contourData = contours.map((contour) => ({
      contour,
      data: vectorPairs(contour.rM, contour.zM, contour.validPoints, contour.closed),
    }));
    const allPairs = [...limiterData, ...contourData.flatMap((item) => item.data)];
    const manifestExtent = manifest?.geometry.gridExtentM;
    const rExtent = manifestExtent
      ? [manifestExtent[0], manifestExtent[1]] as [number, number]
      : finiteExtent(allPairs.map((pair) => pair[0]));
    const zExtent = manifestExtent
      ? [manifestExtent[2], manifestExtent[3]] as [number, number]
      : finiteExtent(allPairs.map((pair) => pair[1]));

    const surfaceSeries = contourData.map(({ contour, data }, index) => ({
      name: contour.kind === 'lcfs' ? 'LCFS' : `ψN ${contour.psiN.toFixed(1)}`,
      type: 'line' as const,
      data,
      showSymbol: false,
      silent: true,
      connectNulls: false,
      lineStyle: {
        width: contour.kind === 'lcfs' ? 2.7 : 1.25,
        color: contour.kind === 'lcfs' ? '#ffb46a' : SURFACE_COLORS[index % SURFACE_COLORS.length],
        shadowBlur: contour.kind === 'lcfs' ? 11 : 4,
        shadowColor: contour.kind === 'lcfs' ? 'rgba(255, 180, 106, .55)' : 'rgba(61, 209, 195, .22)',
      },
      emphasis: { disabled: true },
      animation: false,
    }));

    return {
      animation: false,
      backgroundColor: 'transparent',
      aria: {
        enabled: true,
        description: frame
          ? `EXL-50U ${frame.shot} 炮，${frame.timeMs} 毫秒的 EFIT R-Z 平衡位形。`
          : 'EXL-50U EFIT R-Z 平衡位形等待数据。',
      },
      grid: { left: 56, right: 24, top: 24, bottom: 48, containLabel: false },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross', lineStyle: { color: 'rgba(123, 234, 220, .45)' } },
        valueFormatter: (value: unknown) => typeof value === 'number' ? `${value.toFixed(3)} m` : String(value),
        backgroundColor: 'rgba(5, 19, 23, .94)',
        borderColor: 'rgba(98, 211, 195, .4)',
        textStyle: { color: '#d8f4ef' },
      },
      xAxis: {
        type: 'value',
        name: 'R / m',
        nameLocation: 'middle',
        nameGap: 30,
        min: rExtent?.[0],
        max: rExtent?.[1],
        scale: true,
        axisLine: { lineStyle: { color: '#55766f' } },
        axisLabel: { color: '#8dafaa', fontSize: 11, formatter: (value: number) => value.toFixed(2) },
        nameTextStyle: { color: '#a9cbc5', fontSize: 11 },
        splitLine: { lineStyle: { color: 'rgba(120, 164, 157, .12)' } },
      },
      yAxis: {
        type: 'value',
        name: 'Z / m',
        nameLocation: 'middle',
        nameGap: 38,
        min: zExtent?.[0],
        max: zExtent?.[1],
        scale: true,
        axisLine: { show: true, lineStyle: { color: '#55766f' } },
        axisLabel: { color: '#8dafaa', fontSize: 11, formatter: (value: number) => value.toFixed(2) },
        nameTextStyle: { color: '#a9cbc5', fontSize: 11 },
        splitLine: { lineStyle: { color: 'rgba(120, 164, 157, .12)' } },
      },
      series: [
        {
          name: 'Limiter',
          type: 'line',
          data: limiterData,
          showSymbol: false,
          silent: true,
          lineStyle: { color: '#b7c4c1', width: 1.5, type: 'dashed', opacity: 0.78 },
          animation: false,
        },
        ...surfaceSeries,
        ...(frame && Number.isFinite(frame.rAxisM) && Number.isFinite(frame.zAxisM) ? [{
          name: '磁轴',
          type: 'scatter' as const,
          data: [[frame.rAxisM, frame.zAxisM]],
          symbol: 'diamond',
          symbolSize: 11,
          itemStyle: { color: '#f9f4d7', borderColor: '#1be0c5', borderWidth: 2, shadowBlur: 12, shadowColor: '#1be0c5' },
          z: 20,
          animation: false,
        }] : []),
      ],
    };
  }, [frame, manifest]);

  const fallback = frame ? (
    <div className="efitChartTextFallback">
      <strong>R–Z 平衡位形</strong>
      <span>{frame.contours.filter((contour) => contour.kind === 'surface').length} 个归一化磁面</span>
      <span>{frame.contours.some((contour) => contour.kind === 'lcfs') ? 'LCFS 有效' : 'LCFS 缺失'}</span>
      <span>磁轴 R {Number.isFinite(frame.rAxisM) ? frame.rAxisM.toFixed(3) : '—'} m · Z {Number.isFinite(frame.zAxisM) ? frame.zAxisM.toFixed(3) : '—'} m</span>
    </div>
  ) : (
    <div className="efitChartTextFallback"><strong>R–Z 平衡位形</strong><span>等待首帧数据</span></div>
  );

  return (
    <EfitCanvasChart
      option={option}
      ariaLabel={frame ? `EXL-50U ${frame.shot} 炮 ${frame.timeMs} 毫秒的 R-Z EFIT 位形` : 'EFIT R-Z 位形等待数据'}
      fallback={fallback}
      className="efitEquilibriumChart"
      dataAspectRatio={dataAspectRatio}
    />
  );
}
