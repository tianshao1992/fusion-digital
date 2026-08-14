'use client';

import type { EChartsCoreOption } from 'echarts/core';
import type { CustomSeriesRenderItem } from 'echarts/types/dist/option';
import { useMemo } from 'react';
import { deriveReviewedDivertorRegion } from './divertor-region';
import EfitCanvasChart from './EfitCanvasChart';
import { PSI_N_COLORS } from './psi-n-palette';
import type { EfitFrame, EfitGeometry, EfitNumericVector, EfitTopologyKind } from './types';

type EfitEquilibriumChartProps = {
  frame: EfitFrame | null;
  geometry: EfitGeometry | null;
};

// Keep the psiN legend as a slim vertical rail at the chart's far-right edge.
// The plot grid reserves a separate gutter below so the legend never covers
// equilibrium geometry or the chart's top information.
const PSI_N_COLORBAR_SHORT_PX = 7;
const PSI_N_COLORBAR_LONG_PX = 104;
const X_POINT_SYMBOL = 'path://M-7,-5 L-5,-7 L0,-2 L5,-7 L7,-5 L2,0 L7,5 L5,7 L0,2 L-5,7 L-7,5 L-2,0 Z';

export function efitTopologyLabel(kind: EfitTopologyKind): string {
  switch (kind) {
    case 'limited': return '受限位形';
    case 'upper-single-null': return '上单零位形';
    case 'lower-single-null': return '下单零位形';
    case 'double-null': return '双零位形';
    case 'near-double-null': return '近双零位形';
    case 'partial': return '偏滤器拓扑部分有效';
    default: return '拓扑待确认';
  }
}

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

function flatVectorPairs(pointsRzM: EfitNumericVector, closed = false): number[][] {
  const pairs: number[][] = [];
  for (let index = 0; index + 1 < pointsRzM.length; index += 2) {
    const r = Number(pointsRzM[index]);
    const z = Number(pointsRzM[index + 1]);
    if (Number.isFinite(r) && Number.isFinite(z)) pairs.push([r, z]);
  }
  if (closed && pairs.length > 2 && Math.hypot(pairs[0][0] - pairs.at(-1)![0], pairs[0][1] - pairs.at(-1)![1]) > 1e-7) {
    pairs.push([...pairs[0]]);
  }
  return pairs;
}

function finiteExtent(values: number[], paddingRatio = 0.05): [number, number] | undefined {
  if (values.length === 0) return undefined;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const padding = Math.max((max - min) * paddingRatio, 0.01);
  return [min - padding, max + padding];
}

export default function EfitEquilibriumChart({ frame, geometry }: EfitEquilibriumChartProps) {
  const extent = geometry?.gridExtentM;
  const dataAspectRatio = extent && extent[1] > extent[0] && extent[3] > extent[2]
    ? (extent[1] - extent[0]) / (extent[3] - extent[2])
    : undefined;
  const option = useMemo<EChartsCoreOption>(() => {
    const limiter = geometry?.limiterRzM;
    const limiterData = limiter ? vectorPairs(limiter.rM, limiter.zM, limiter.validPoints, true) : [];
    const contours = frame?.contours ?? [];
    const contourData = contours.map((contour) => ({
      contour,
      data: vectorPairs(contour.rM, contour.zM, contour.validPoints, contour.closed),
    }));
    const topology = frame?.topology;
    const topologyGraph = frame?.topologyGraphPayload?.topologyGraph;
    const divertorRegion = deriveReviewedDivertorRegion(
      topology,
      limiter,
      frame ? { rM: frame.rAxisM, zM: frame.zAxisM } : undefined,
    );
    const legacySeparatrixData = (topology?.separatrixLegs ?? []).map((leg, index) => ({
      index,
      // Divertor legs are open curves. Never close them or pass them to the
      // nested flux-band polygons below.
      data: vectorPairs(leg.rM, leg.zM, leg.validPoints, false),
    })).filter(({ data }) => data.length >= 2);
    const graphSeparatrixData = (topologyGraph?.edges ?? []).map((edge, index) => ({
      index: legacySeparatrixData.length + index,
      data: flatVectorPairs(edge.pointsRzM, edge.closed),
    })).filter(({ data }) => data.length >= 2);
    const separatrixData = [...legacySeparatrixData, ...graphSeparatrixData];
    const xPointData = [
      ...(topology?.xPoints ?? []).flatMap((point, index) => (
        Number.isFinite(point.rM) && Number.isFinite(point.zM) ? [{
          index,
          rM: point.rM,
          zM: point.zM,
          activityRole: point.role ?? (point.primary === false ? 'secondary' : 'primary'),
          evidenceRole: 'boundary',
          value: [point.rM, point.zM],
        }] : []
      )),
      ...(topologyGraph?.nodes ?? []).filter((node) => node.kind === 'x-point').flatMap((point, index) => (
        Number.isFinite(point.rM) && Number.isFinite(point.zM) ? [{
          index,
          rM: point.rM,
          zM: point.zM,
          activityRole: point.activityRole,
          evidenceRole: point.role,
          value: [point.rM, point.zM],
        }] : []
      )),
    ];
    const strikePointData = [
      ...(topology?.strikePoints ?? []).flatMap((point, index) => (
        Number.isFinite(point.rM) && Number.isFinite(point.zM) ? [{ index, rM: point.rM, zM: point.zM, wallSegment: point.wallSegment, value: [point.rM, point.zM] }] : []
      )),
      ...(topologyGraph?.nodes ?? []).filter((node) => node.kind === 'wall-intersection').flatMap((point, index) => (
        Number.isFinite(point.rM) && Number.isFinite(point.zM) ? [{ index, rM: point.rM, zM: point.zM, wallSegment: point.wallSegment, value: [point.rM, point.zM] }] : []
      )),
    ];
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
    const allPairs = [
      ...limiterData,
      ...contourData.flatMap((item) => item.data),
      ...separatrixData.flatMap((item) => item.data),
      ...xPointData.map((item) => item.value),
      ...strikePointData.map((item) => item.value),
    ];
    const manifestExtent = geometry?.gridExtentM;
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

    const renderDivertorRegion: CustomSeriesRenderItem = (_params, api) => {
      if (divertorRegion.state !== 'filled') return;
      const points = divertorRegion.polygon.map(([r, z]) => api.coord([r, z]));
      return {
        type: 'polygon',
        shape: { points },
        style: {
          fill: 'rgba(255, 132, 55, .28)',
          stroke: '#ff9a52',
          lineWidth: 1.35,
          shadowBlur: 8,
          shadowColor: 'rgba(255, 111, 37, .24)',
        },
        z2: 0,
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
    const separatrixSeries = separatrixData.map(({ data, index }) => ({
      name: `偏滤器分离支 L${index + 1}`,
      type: 'line' as const,
      data,
      showSymbol: false,
      silent: true,
      connectNulls: false,
      lineStyle: {
        width: 2.35,
        color: '#ff9a52',
        shadowBlur: 9,
        shadowColor: 'rgba(255, 111, 37, .5)',
      },
      z: 15,
      emphasis: { disabled: true },
      animation: false,
    }));

    return {
      animation: false,
      backgroundColor: 'transparent',
      aria: {
        enabled: true,
        description: frame
          ? `EXL-50U ${frame.shot} 炮，${frame.timeMs} 毫秒的 EFIT R-Z 平衡位形。颜色表示由已发布等磁通轮廓形成的归一化极向磁通分带，不表示温度或密度。${topology ? `当前为${efitTopologyLabel(topology.kind)}，包含 ${xPointData.length} 个 X 点、${separatrixData.length} 条已发布分离支和 ${strikePointData.length} 个 limiter 交点。${divertorRegion.message}` : topologyGraph ? `拓扑图 v2 包含 ${topologyGraph.features.boundaryXPointCount} 个边界 X 点、${topologyGraph.features.nearBoundaryXPointCount} 个近边界候选证据、${separatrixData.length} 条已解析分离支和 ${strikePointData.length} 个 limiter 交点；未解析臂 ${topologyGraph.unresolvedArms.length} 条，未审查开放区域不填色。` : ''}`
          : 'EXL-50U EFIT R-Z 平衡位形等待数据。',
      },
      visualMap: filledContours.length > 0 ? {
        type: 'continuous',
        min: 0,
        max: 1,
        dimension: 0,
        seriesIndex: 0,
        orient: 'vertical',
        right: 4,
        top: 'middle',
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
      grid: { left: 56, right: 64, top: 24, bottom: 48, containLabel: false },
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
        ...(divertorRegion.state === 'filled' ? [{
          name: '偏滤器拓扑边界区域',
          type: 'custom' as const,
          coordinateSystem: 'cartesian2d' as const,
          renderItem: renderDivertorRegion,
          data: [[1]],
          silent: true,
          clip: true,
          z: 9,
          animation: false,
        }] : []),
        ...surfaceSeries,
        ...separatrixSeries,
        ...(xPointData.length > 0 ? [{
          name: 'X 点',
          type: 'scatter' as const,
          data: xPointData.map(({ activityRole, evidenceRole, index, value }) => ({
            name: `${activityRole === 'secondary' ? '次' : '主'} X${index + 1}${evidenceRole === 'near-boundary' ? '（近边界证据）' : ''}`,
            value,
            itemStyle: {
              color: evidenceRole === 'near-boundary' ? '#9aacc5' : activityRole === 'secondary' ? '#cbb9ff' : '#ffe39a',
              borderColor: '#3a2630',
              borderWidth: 1,
            },
          })),
          symbol: X_POINT_SYMBOL,
          symbolSize: 15,
          label: {
            show: true,
            position: 'right' as const,
            distance: 6,
            color: '#ffe8bb',
            fontSize: 9,
            formatter: '{b}',
          },
          tooltip: { trigger: 'item' as const },
          z: 22,
          animation: false,
        }] : []),
        ...(strikePointData.length > 0 ? [{
          name: 'Limiter 交点',
          type: 'scatter' as const,
          data: strikePointData.map(({ wallSegment, index, value }) => ({
            name: `SP${index + 1} · limiter ${wallSegment}`,
            value,
          })),
          symbol: 'triangle',
          symbolSize: 11,
          symbolRotate: 180,
          itemStyle: { color: '#ff754f', borderColor: '#ffe1d6', borderWidth: 1.2, shadowBlur: 8, shadowColor: 'rgba(255, 93, 55, .45)' },
          tooltip: { trigger: 'item' as const },
          z: 21,
          animation: false,
        }] : []),
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
  }, [frame, geometry]);

  const fallback = frame ? (
    <div className="efitChartTextFallback">
      <strong>R–Z 平衡位形</strong>
      <span>{frame.contours.filter((contour) => contour.kind === 'surface').length} 个 ψN 磁面分带填色</span>
      <span>{frame.contours.some((contour) => contour.kind === 'lcfs') ? 'LCFS 有效' : 'LCFS 缺失'}</span>
      {frame.topology && <span>{efitTopologyLabel(frame.topology.kind)} · X 点 {frame.topology.xPoints.length} · 分离支 {frame.topology.separatrixLegs.length} · limiter 交点 {frame.topology.strikePoints.length}</span>}
      {frame.topology && <span>{deriveReviewedDivertorRegion(frame.topology, geometry?.limiterRzM, { rM: frame.rAxisM, zM: frame.zAxisM }).message}</span>}
      {frame.topologyGraphPayload && <span>拓扑图 v2 · X 点证据 {frame.topologyGraphPayload.topologyGraph.features.xPointCount} · 已解析分离支 {frame.topologyGraphPayload.topologyGraph.edges.length} · limiter 交点 {frame.topologyGraphPayload.topologyGraph.features.wallIntersectionCount}</span>}
      {frame.topologyGraphPayload && <span>开放偏滤器区域尚未完成科学审查，仅显示分离支与交点线框，不进行区域填色。</span>}
      <span>颜色表示归一化极向磁通，不代表温度或密度</span>
      <span>磁轴 R {Number.isFinite(frame.rAxisM) ? frame.rAxisM.toFixed(3) : '—'} m · Z {Number.isFinite(frame.zAxisM) ? frame.zAxisM.toFixed(3) : '—'} m</span>
    </div>
  ) : (
    <div className="efitChartTextFallback"><strong>R–Z 平衡位形</strong><span>等待首帧数据</span></div>
  );

  return (
    <EfitCanvasChart
      option={option}
      ariaLabel={frame ? `EXL-50U ${frame.shot} 炮 ${frame.timeMs} 毫秒的 R-Z EFIT 归一化极向磁通分带位形${frame.topology ? `，${efitTopologyLabel(frame.topology.kind)}及偏滤器拓扑` : frame.topologyGraphPayload ? '，拓扑图 v2 的 X 点、分离支与 limiter 交点' : ''}` : 'EFIT R-Z 位形等待数据'}
      fallback={fallback}
      className="efitEquilibriumChart"
      dataAspectRatio={dataAspectRatio}
    />
  );
}
