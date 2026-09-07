'use client';

import type { EChartsCoreOption } from 'echarts/core';
import type { CustomSeriesRenderItem } from 'echarts/types/dist/option';
import { useMemo, useState } from 'react';
import EfitCanvasChart from '../components/efit/EfitCanvasChart';
import { PSI_N_COLORS } from '../components/efit/psi-n-palette';
import { useChartTheme } from '../components/charts/chart-theme';
import type { PhysicsData, RZ } from './physics';
import {
  buildEquilibriumFieldProjection,
  normalizedPoloidalFlux,
  type EquilibriumFieldChannel,
} from './equilibrium-field';

type FieldSelection = EquilibriumFieldChannel | 'none';
type OverlaySelection = 'wall' | 'contours' | 'lcfs' | 'axis';

const OVERLAYS: readonly OverlaySelection[] = ['wall', 'contours', 'lcfs', 'axis'];

function nearestIndex(values: number[], target: number): number {
  return values.reduce((best, value, index) => (
    Math.abs(value - target) < Math.abs(values[best] - target) ? index : best
  ), 0);
}

function closed(points: RZ): RZ {
  if (points.length < 2) return points;
  const first = points[0];
  const last = points.at(-1)!;
  return first[0] === last[0] && first[1] === last[1] ? points : [...points, first];
}

function extent(points: RZ): { r: [number, number]; z: [number, number] } {
  const r = points.map((point) => point[0]);
  const z = points.map((point) => point[1]);
  const rMin = Math.min(...r); const rMax = Math.max(...r);
  const zMin = Math.min(...z); const zMax = Math.max(...z);
  const padding = Math.max(rMax - rMin, zMax - zMin) * 0.055;
  return { r: [rMin - padding, rMax + padding], z: [zMin - padding, zMax + padding] };
}

function tooltipValue(params: unknown, field: FieldSelection, en: boolean): string {
  if (!params || typeof params !== 'object' || !('value' in params)) return '';
  const value = (params as { value?: unknown }).value;
  if (!Array.isArray(value) || value.length < 5 || !value.slice(0, 5).every((item) => typeof item === 'number' && Number.isFinite(item))) return '';
  const [rM, zM, , psiNorm, psiWb] = value as number[];
  return [
    `<b>${field === 'psi' ? 'ψ / Wb' : 'ψN / 1'}</b>`,
    `R ${rM.toFixed(4)} m · Z ${zM.toFixed(4)} m`,
    `ψ ${psiWb.toPrecision(6)} Wb`,
    `ψN ${psiNorm.toFixed(4)}`,
    `<small>${en ? 'Nearest archived grid sample' : '最近归档网格点'}</small>`,
  ].join('<br/>');
}

export default function EquilibriumFieldViewer({ data, en }: { data: PhysicsData; en: boolean }) {
  const chartTheme = useChartTheme();
  const [field, setField] = useState<FieldSelection>('psi_norm');
  const [overlays, setOverlays] = useState<ReadonlySet<OverlaySelection>>(() => new Set(OVERLAYS));
  const [revision, setRevision] = useState(0);
  const equilibrium = data.equilibrium;
  const [sampleIndex, setSampleIndex] = useState(() => ({
    r: nearestIndex(equilibrium.r, equilibrium.axis[0]),
    z: nearestIndex(equilibrium.z, equilibrium.axis[1]),
  }));
  const samplePsi = equilibrium.psi[sampleIndex.z][sampleIndex.r];
  const samplePsiNorm = normalizedPoloidalFlux(samplePsi, equilibrium.psiAxis, equilibrium.psiBoundary);
  const sampleId = `equilibrium-sample-${data.runId}`;
  const geometryExtent = useMemo(() => extent([...equilibrium.wall, ...equilibrium.boundary]), [equilibrium]);
  const dataAspectRatio = (geometryExtent.r[1] - geometryExtent.r[0]) / (geometryExtent.z[1] - geometryExtent.z[0]);
  const projection = useMemo(
    () => field === 'none' ? null : buildEquilibriumFieldProjection(data, field),
    [data, field],
  );

  const option = useMemo<EChartsCoreOption>(() => {
    const palette = projection?.reversePalette ? [...PSI_N_COLORS].reverse() : [...PSI_N_COLORS];
    const renderFieldCell: CustomSeriesRenderItem = (params, api) => {
      const firstCorner = api.coord([api.value(5), api.value(7)]);
      const secondCorner = api.coord([api.value(6), api.value(8)]);
      const coordinateSystem = (params.coordSys ?? {}) as { x?: number; y?: number; width?: number; height?: number };
      const gridX = coordinateSystem.x ?? -Infinity;
      const gridY = coordinateSystem.y ?? -Infinity;
      const gridRight = gridX + (coordinateSystem.width ?? Infinity);
      const gridBottom = gridY + (coordinateSystem.height ?? Infinity);
      const x = Math.max(Math.min(firstCorner[0], secondCorner[0]) - 0.3, gridX);
      const y = Math.max(Math.min(firstCorner[1], secondCorner[1]) - 0.3, gridY);
      const right = Math.min(Math.max(firstCorner[0], secondCorner[0]) + 0.3, gridRight);
      const bottom = Math.min(Math.max(firstCorner[1], secondCorner[1]) + 0.3, gridBottom);
      if (right <= x || bottom <= y) return;
      const visualColor = api.visual('color');
      return {
        type: 'rect',
        shape: { x, y, width: right - x, height: bottom - y },
        style: { fill: typeof visualColor === 'string' ? visualColor : palette[0], opacity: 0.94 },
        transition: [],
      };
    };
    const fieldSeries = projection ? [{
      id: 'simulation-equilibrium-field',
      name: projection.channel === 'psi_norm' ? 'ψN' : 'ψ',
      type: 'custom' as const,
      coordinateSystem: 'cartesian2d' as const,
      renderItem: renderFieldCell,
      data: projection.samples,
      dimensions: ['R', 'Z', 'fieldValue', 'psiNorm', 'psiWb', 'rLower', 'rUpper', 'zLower', 'zUpper'],
      encode: { x: 0, y: 1, value: 2, tooltip: [0, 1, 3, 4] },
      progressive: 4000,
      progressiveThreshold: 8000,
      emphasis: { disabled: true },
      clip: true,
      animation: false,
      z: 1,
    }] : [];
    const contourSeries = overlays.has('contours') ? equilibrium.contours.flatMap((contour) => contour.paths.map((path, index) => ({
      id: `simulation-contour-${contour.psiNorm}-${index}`,
      name: `ψN ${contour.psiNorm.toFixed(1)}`,
      type: 'line' as const,
      data: closed(path),
      showSymbol: false,
      silent: true,
      lineStyle: { color: chartTheme.mode === 'dark' ? 'rgba(239,255,251,.62)' : 'rgba(39,68,58,.58)', width: 1.05 },
      animation: false,
      z: 8,
    }))) : [];
    const wallSeries = overlays.has('wall') ? [{
      id: 'simulation-first-wall', name: en ? 'First wall' : '第一壁', type: 'line' as const,
      data: closed(equilibrium.wall), showSymbol: false, silent: true,
      lineStyle: { color: chartTheme.muted, width: 1.55, type: 'dashed' as const, opacity: 0.88 }, animation: false, z: 10,
    }] : [];
    const boundarySeries = overlays.has('lcfs') ? [{
      id: 'simulation-lcfs', name: 'LCFS', type: 'line' as const,
      data: closed(equilibrium.boundary), showSymbol: false, silent: true,
      lineStyle: { color: chartTheme.mode === 'dark' ? '#ffd5ef' : '#7d4e73', width: 2.6, shadowBlur: 8, shadowColor: chartTheme.violet }, animation: false, z: 12,
    }] : [];
    const axisSeries = overlays.has('axis') ? [{
      id: 'simulation-magnetic-axis', name: en ? 'Magnetic axis' : '磁轴', type: 'scatter' as const,
      data: [equilibrium.axis], symbol: 'diamond', symbolSize: 11,
      itemStyle: { color: '#f9f4d7', borderColor: '#1be0c5', borderWidth: 2, shadowBlur: 10, shadowColor: '#1be0c5' }, animation: false, z: 14,
    }] : [];
    const colorbarText = projection?.channel === 'psi_norm'
      ? ['LCFS · ψN 1', en ? 'Axis · 0' : '磁轴 · 0']
      : projection ? [
        `${projection.maximum.toPrecision(4)} Wb`,
        `${projection.minimum.toPrecision(4)} Wb`,
      ] : undefined;

    return {
      animation: false,
      backgroundColor: 'transparent',
      aria: {
        enabled: true,
        description: en
          ? `Simulated R-Z equilibrium at ${data.timeSeconds} seconds with ${field === 'none' ? 'no field cloud' : field}, LCFS-masked native grid, and selectable overlays.`
          : `${data.timeSeconds} 秒模拟 R–Z 磁平衡；${field === 'none' ? '未显示云图' : `显示 ${field} 云图`}，采用 LCFS 掩膜的原生网格和可选叠加层。`,
      },
      grid: { left: 58, right: 72, top: 26, bottom: 52, containLabel: false },
      visualMap: projection ? {
        type: 'continuous', min: projection.minimum, max: projection.maximum, dimension: 2, seriesIndex: 0,
        orient: 'vertical', right: 5, top: 'middle', itemWidth: 8, itemHeight: 142,
        calculable: false, precision: projection.channel === 'psi_norm' ? 2 : 4, text: colorbarText, textGap: 7,
        textStyle: { color: chartTheme.muted, fontSize: 9 }, inRange: { color: palette }, borderColor: chartTheme.line,
      } : undefined,
      tooltip: {
        trigger: 'item', formatter: (params: unknown) => tooltipValue(params, field, en),
        backgroundColor: chartTheme.tooltipBackground, borderColor: chartTheme.tooltipBorder,
        textStyle: { color: chartTheme.tooltipText, fontSize: 11 },
      },
      dataZoom: [
        { type: 'inside', xAxisIndex: 0, filterMode: 'none' },
        { type: 'inside', yAxisIndex: 0, filterMode: 'none' },
      ],
      xAxis: {
        type: 'value', min: geometryExtent.r[0], max: geometryExtent.r[1], name: 'R / m', nameLocation: 'middle', nameGap: 31,
        axisLine: { lineStyle: { color: chartTheme.line } }, axisLabel: { color: chartTheme.muted, fontSize: 10, formatter: (value: number) => value.toFixed(2) },
        nameTextStyle: { color: chartTheme.muted, fontSize: 10 }, splitLine: { lineStyle: { color: chartTheme.grid } },
      },
      yAxis: {
        type: 'value', min: geometryExtent.z[0], max: geometryExtent.z[1], name: 'Z / m', nameLocation: 'middle', nameGap: 39,
        axisLine: { show: true, lineStyle: { color: chartTheme.line } }, axisLabel: { color: chartTheme.muted, fontSize: 10, formatter: (value: number) => value.toFixed(2) },
        nameTextStyle: { color: chartTheme.muted, fontSize: 10 }, splitLine: { lineStyle: { color: chartTheme.grid } },
      },
      series: [...fieldSeries, ...wallSeries, ...contourSeries, ...boundarySeries, ...axisSeries],
    };
  }, [chartTheme, data.timeSeconds, en, equilibrium, field, geometryExtent, overlays, projection]);

  function toggleOverlay(overlay: OverlaySelection) {
    setOverlays((current) => {
      const next = new Set(current);
      if (next.has(overlay)) next.delete(overlay); else next.add(overlay);
      return next;
    });
  }

  const origin = data.equilibriumOrigin === 'input-reconstruction'
    ? (en ? 'Input reconstruction' : '输入重建')
    : data.equilibriumOrigin === 'model-solved'
      ? (en ? 'Model solved' : '模型求解')
      : (en ? 'Exported · solve origin unspecified' : '归档导出 · 求解来源未声明');

  return <section className="simPanel simEquilibrium simEquilibriumCloud">
    <div className="simPanelTitle">
      <div><p className="simMiniLabel">R–Z FIELD · {origin.toUpperCase()}</p><h3>{en ? 'Poloidal equilibrium cloud' : '极向磁平衡云图'}</h3></div>
      <button className="simTinyButton" onClick={() => setRevision((value) => value + 1)}>{en ? 'Reset view' : '重置视图'}</button>
    </div>
    <div className="simFieldTools simFieldChannelTools">
      <label className="simFieldChannelSelect"><span>{en ? 'Field channel' : '云图通道'}</span><select value={field} onChange={(event) => setField(event.currentTarget.value as FieldSelection)}>
        <option value="psi_norm">{en ? 'Normalized poloidal flux ψN' : '归一化极向磁通 ψN'}</option>
        <option value="psi">{en ? 'Poloidal flux ψ / Wb' : '极向磁通 ψ / Wb'}</option>
        <option value="none">{en ? 'Contours and boundaries only' : '仅磁通面与边界'}</option>
      </select></label>
      <fieldset><legend>{en ? 'Display channels' : '显示通道'}</legend>{OVERLAYS.map((overlay) => <label key={overlay}><input type="checkbox" checked={overlays.has(overlay)} onChange={() => toggleOverlay(overlay)} />{{ wall: en ? 'Wall' : '第一壁', contours: en ? 'Flux surfaces' : '磁通面', lcfs: 'LCFS', axis: en ? 'Axis' : '磁轴' }[overlay]}</label>)}</fieldset>
    </div>
    <EfitCanvasChart key={`${data.runId}-${revision}`} option={option} ariaLabel={en ? 'Simulated R-Z poloidal equilibrium field' : '模拟 R–Z 极向磁平衡场'} fallback={<div className="simEquilibriumFallback"><strong>{en ? 'Preparing verified field…' : '正在准备已校验场数据…'}</strong><span>{equilibrium.r.length} × {equilibrium.z.length} · COCOS {data.cocos}</span></div>} className="simEquilibriumChart" dataAspectRatio={dataAspectRatio} preserveDataZoom />
    <details className="simGridSampler"><summary>{en ? 'Keyboard grid readout' : '键盘网格读数'}</summary><div className="simGridSamplerBody">
      <label htmlFor={`${sampleId}-r`}><span>R index · {sampleIndex.r + 1}/{equilibrium.r.length}</span><input id={`${sampleId}-r`} type="range" min="0" max={equilibrium.r.length - 1} value={sampleIndex.r} onChange={(event) => setSampleIndex((current) => ({ ...current, r: Number(event.currentTarget.value) }))} /><output>{equilibrium.r[sampleIndex.r].toFixed(4)} m</output></label>
      <label htmlFor={`${sampleId}-z`}><span>Z index · {sampleIndex.z + 1}/{equilibrium.z.length}</span><input id={`${sampleId}-z`} type="range" min="0" max={equilibrium.z.length - 1} value={sampleIndex.z} onChange={(event) => setSampleIndex((current) => ({ ...current, z: Number(event.currentTarget.value) }))} /><output>{equilibrium.z[sampleIndex.z].toFixed(4)} m</output></label>
      <output className="simGridSampleValue" aria-live="polite">R {equilibrium.r[sampleIndex.r].toFixed(4)} m · Z {equilibrium.z[sampleIndex.z].toFixed(4)} m · ψ {samplePsi.toPrecision(6)} Wb · ψN {samplePsiNorm.toFixed(4)}</output>
    </div></details>
    <div className="simPlotLegend">{overlays.has('axis') && <span>◇ {en ? 'Magnetic axis' : '磁轴'}</span>}{overlays.has('lcfs') && <span>━ LCFS</span>}<span>{field === 'none' ? (en ? 'Field hidden' : '云图已关闭') : field === 'psi_norm' ? 'ψN 0–1' : `ψ ${equilibrium.psiAxis.toPrecision(4)} → ${equilibrium.psiBoundary.toPrecision(4)} Wb`}</span><span>COCOS {data.cocos}</span></div>
    <p className="simChartNote">{equilibrium.r.length} × {equilibrium.z.length} {en ? 'native archived grid · LCFS grid-point mask · no spatial interpolation. Hover reports the nearest archived sample when the cloud is visible; the keyboard readout is always available. Te, Ti and ne remain 1-D radial profiles.' : '原生归档网格 · 按 LCFS 对网格点作掩膜 · 不进行空间插值；云图启用时，悬停提示显示最近归档样本，键盘读数器始终可用。Te、Ti、ne 仍保持一维径向剖面。'}</p>
  </section>;
}
