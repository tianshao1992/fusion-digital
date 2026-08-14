'use client';

import type { EChartsCoreOption } from 'echarts/core';
import type { CustomSeriesRenderItem } from 'echarts/types/dist/option';
import { useMemo } from 'react';
import EfitCanvasChart from './EfitCanvasChart';
import { PSI_N_COLORS } from './psi-n-palette';
import type { EfitFrame, EfitManifest, EfitNumericVector } from './types';

type EfitEquilibriumChartProps = {
  frame: EfitFrame | null;
  manifest: EfitManifest | null;
};

// ECharts ContinuousVisualMap always interprets itemWidth/itemHeight as the
// unrotated [short, long] bar dimensions. `orient: horizontal` rotates that
// bar; swapping these values would therefore create a vertical strip.
const PSI_N_COLORBAR_SHORT_PX = 7;
const PSI_N_COLORBAR_LONG_PX = 104;

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
    // Draw the largest contour first, then cover it with successively smaller
    // contours. This produces honest, discrete psiN bands from the published
    // contour geometry without inventing a temperature/density field or a
    // higher-resolution psi grid that is not in the public derivative.
    const nestedContours = contourData
      .filter(({ data }) => data.length >= 4)
      .sort((left, right) => right.contour.psiN - left.contour.psiN);
    const filledContours = nestedContours.map((item, index) => ({
      ...item,
      // The visible area of this polygon is the band between this contour and
      // the next inner contour, so colour it by that band's midpoint psiN.
      bandPsiN: (item.contour.psiN + (nestedContours[index + 1]?.contour.psiN ?? 0)) / 2,
    }));
    const allPairs = [...limiterData, ...contourData.flatMap((item) => item.data)];
    const manifestExtent = manifest?.geometry.gridExtentM;
    const rExtent = manifestExtent
      ? [manifestExtent[0], manifestExtent[1]] as [number, number]
      : finiteExtent(allPairs.map((pair) => pair[0]));
    const zExtent = manifestExtent
      ? [manifestExtent[2], manifestExtent[3]] as [number, number]
      : finiteExtent(allPairs.map((pair) => pair[1]));

    const renderFluxBands: CustomSeriesRenderItem = (params, api) => {
      const item = filledContours[params.dataIndex];
      if (!item) return;
      const points = item.data.map(([r, z]) => api.coord([r, z]));
      const visualColor = api.visual('color');
      return {
        type: 'polygon',
        shape: { points },
        style: {
          fill: typeof visualColor === 'string' ? visualColor : PSI_N_COLORS[0],
          stroke: 'rgba(241, 255, 252, .18)',
          lineWidth: 0.55,
          opacity: 0.86,
        },
        z2: params.dataIndex,
      };
    };

    const surfaceSeries = contourData.map(({ contour, data }) => ({
      name: contour.kind === 'lcfs' ? 'LCFS' : `ψN ${contour.psiN.toFixed(1)}`,
      type: 'line' as const,
      data,
      showSymbol: false,
      silent: true,
      connectNulls: false,
      lineStyle: {
        width: contour.kind === 'lcfs' ? 2.7 : 1.25,
        color: contour.kind === 'lcfs' ? '#ffd5ef' : 'rgba(235, 255, 251, .56)',
        shadowBlur: contour.kind === 'lcfs' ? 11 : 2,
        shadowColor: contour.kind === 'lcfs' ? 'rgba(255, 104, 207, .56)' : 'rgba(61, 209, 195, .18)',
      },
      z: contour.kind === 'lcfs' ? 12 : 11,
      emphasis: { disabled: true },
      animation: false,
    }));

    return {
      animation: false,
      backgroundColor: 'transparent',
      aria: {
        enabled: true,
        description: frame
          ? `EXL-50U ${frame.shot} 炮，${frame.timeMs} 毫秒的 EFIT R-Z 平衡位形。颜色表示由已发布等磁通轮廓形成的归一化极向磁通分带，不表示温度或密度。`
          : 'EXL-50U EFIT R-Z 平衡位形等待数据。',
      },
      visualMap: filledContours.length > 0 ? {
        type: 'continuous',
        min: 0,
        max: 1,
        dimension: 0,
        seriesIndex: 0,
        orient: 'horizontal',
        left: 'center',
        top: 3,
        itemWidth: PSI_N_COLORBAR_SHORT_PX,
        itemHeight: PSI_N_COLORBAR_LONG_PX,
        precision: 1,
        calculable: false,
        text: ['ψN 1', '0'],
        textGap: 6,
        textStyle: { color: '#9abdb6', fontSize: 9 },
        inRange: { color: PSI_N_COLORS },
        borderColor: 'rgba(185, 235, 226, .22)',
      } : undefined,
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
          name: '归一化极向磁通 ψN 分带',
          type: 'custom',
          coordinateSystem: 'cartesian2d',
          renderItem: renderFluxBands,
          data: filledContours.map(({ bandPsiN }) => [bandPsiN]),
          dimensions: ['psiN'],
          encode: { tooltip: 0 },
          silent: true,
          clip: true,
          z: 2,
          animation: false,
        },
        {
          name: 'Limiter',
          type: 'line',
          data: limiterData,
          showSymbol: false,
          silent: true,
          lineStyle: { color: '#b7c4c1', width: 1.5, type: 'dashed', opacity: 0.78 },
          z: 13,
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
      <span>{frame.contours.filter((contour) => contour.kind === 'surface').length} 个 ψN 磁面分带填色</span>
      <span>{frame.contours.some((contour) => contour.kind === 'lcfs') ? 'LCFS 有效' : 'LCFS 缺失'}</span>
      <span>颜色表示归一化极向磁通，不代表温度或密度</span>
      <span>磁轴 R {Number.isFinite(frame.rAxisM) ? frame.rAxisM.toFixed(3) : '—'} m · Z {Number.isFinite(frame.zAxisM) ? frame.zAxisM.toFixed(3) : '—'} m</span>
    </div>
  ) : (
    <div className="efitChartTextFallback"><strong>R–Z 平衡位形</strong><span>等待首帧数据</span></div>
  );

  return (
    <EfitCanvasChart
      option={option}
      ariaLabel={frame ? `EXL-50U ${frame.shot} 炮 ${frame.timeMs} 毫秒的 R-Z EFIT 归一化极向磁通分带位形` : 'EFIT R-Z 位形等待数据'}
      fallback={fallback}
      className="efitEquilibriumChart"
      dataAspectRatio={dataAspectRatio}
    />
  );
}
