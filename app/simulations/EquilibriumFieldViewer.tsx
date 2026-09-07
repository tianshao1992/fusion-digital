'use client';

import type { EChartsCoreOption } from 'echarts/core';
import type { CustomSeriesRenderItem } from 'echarts/types/dist/option';
import { useMemo, useState } from 'react';
import EfitCanvasChart from '../components/efit/EfitCanvasChart';
import { PSI_N_COLORS } from '../components/efit/psi-n-palette';
import { useChartTheme } from '../components/charts/chart-theme';
import type { PhysicsData, RZ } from './physics';
import type { FluxCoordinateMap } from './flux-coordinate-map';
import {
  buildEquilibriumFieldProjection,
  normalizedPoloidalFlux,
  pointInClosedPolygon,
  sampleSpatialFieldAtPsiNorm,
  spatialFieldSpec,
  spatialFieldUnavailableReason,
  SPATIAL_FIELD_SPECS,
  type EquilibriumFieldProjection,
  type SpatialFieldChannel,
} from './equilibrium-field';

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

function tooltipValue(params: unknown, projection: EquilibriumFieldProjection | null, en: boolean): string {
  if (!params || typeof params !== 'object' || !('value' in params)) return '';
  const value = (params as { value?: unknown }).value;
  if (!Array.isArray(value) || value.length < 5 || !value.slice(0, 5).every((item) => typeof item === 'number' && Number.isFinite(item))) return '';
  if (!projection) return '';
  const [rM, zM, fieldValue, psiNorm, psiWb, , , , , rhoTorNorm] = value as (number | null)[];
  const spec = spatialFieldSpec(projection.channel);
  return [
    `<b>${en ? spec.labelEn : spec.labelZh} · ${Number(fieldValue).toPrecision(6)} ${projection.unit}</b>`,
    `R ${Number(rM).toFixed(4)} m · Z ${Number(zM).toFixed(4)} m`,
    `ψ ${Number(psiWb).toPrecision(6)} Wb · ψN ${Number(psiNorm).toFixed(4)}`,
    rhoTorNorm === null ? '' : `ρtor,N ${Number(rhoTorNorm).toFixed(4)}`,
    `<small>${projection.authority === 'profile-mapped' ? (en ? 'Bounded radial interpolation on an archived flux-coordinate map' : '基于归档磁通坐标映射的有界径向插值') : (en ? 'Nearest archived equilibrium-grid sample' : '最近归档磁平衡网格样本')}</small>`,
  ].filter(Boolean).join('<br/>');
}

export default function EquilibriumFieldViewer({ data, coordinateMap, field, onFieldChange, en }: { data: PhysicsData; coordinateMap?: FluxCoordinateMap; field: SpatialFieldChannel; onFieldChange: (field: SpatialFieldChannel) => void; en: boolean }) {
  const chartTheme = useChartTheme();
  const [cloudVisible, setCloudVisible] = useState(true);
  const [overlays, setOverlays] = useState<ReadonlySet<OverlaySelection>>(() => new Set(OVERLAYS));
  const [revision, setRevision] = useState(0);
  const equilibrium = data.equilibrium;
  const [sampleIndex, setSampleIndex] = useState(() => ({
    r: nearestIndex(equilibrium.r, equilibrium.axis[0]),
    z: nearestIndex(equilibrium.z, equilibrium.axis[1]),
  }));
  const samplePsi = equilibrium.psi[sampleIndex.z][sampleIndex.r];
  const samplePsiNorm = normalizedPoloidalFlux(samplePsi, equilibrium.psiAxis, equilibrium.psiBoundary);
  const sampleInside = pointInClosedPolygon(equilibrium.r[sampleIndex.r], equilibrium.z[sampleIndex.z], equilibrium.boundary);
  const sampleField = sampleInside ? sampleSpatialFieldAtPsiNorm(data, field, samplePsiNorm, coordinateMap, samplePsi) : null;
  const selectedSpec = spatialFieldSpec(field);
  const sampleId = `equilibrium-sample-${data.runId}`;
  const geometryExtent = useMemo(() => extent([...equilibrium.wall, ...equilibrium.boundary]), [equilibrium]);
  const dataAspectRatio = (geometryExtent.r[1] - geometryExtent.r[0]) / (geometryExtent.z[1] - geometryExtent.z[0]);
  const projection = useMemo(
    () => !cloudVisible || spatialFieldUnavailableReason(data, field, coordinateMap) ? null : buildEquilibriumFieldProjection(data, field, coordinateMap),
    [cloudVisible, coordinateMap, data, field],
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
      name: en ? spatialFieldSpec(projection.channel).labelEn : spatialFieldSpec(projection.channel).labelZh,
      type: 'custom' as const,
      coordinateSystem: 'cartesian2d' as const,
      renderItem: renderFieldCell,
      data: projection.samples,
      dimensions: ['R', 'Z', 'fieldValue', 'psiNorm', 'psiWb', 'rLower', 'rUpper', 'zLower', 'zUpper', 'rhoTorNorm'],
      encode: { x: 0, y: 1, value: 2, tooltip: [0, 1, 2, 3, 4, 9] },
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
        `${projection.maximum.toPrecision(4)} ${projection.unit}`,
        `${projection.minimum.toPrecision(4)} ${projection.unit}`,
      ] : undefined;

    return {
      animation: false,
      backgroundColor: 'transparent',
      aria: {
        enabled: true,
        description: en
          ? `Simulated R-Z field at ${data.timeSeconds} seconds with ${cloudVisible ? field : 'no field cloud'}, an LCFS grid-point mask, and selectable overlays.`
          : `${data.timeSeconds} 秒模拟 R–Z 场；${cloudVisible ? `显示 ${field} 云图` : '未显示云图'}，采用 LCFS 网格点掩膜和可选叠加层。`,
      },
      grid: { left: 58, right: 72, top: 26, bottom: 52, containLabel: false },
      visualMap: projection ? {
        type: 'continuous', min: projection.minimum, max: projection.maximum, dimension: 2, seriesIndex: 0,
        orient: 'vertical', right: 5, top: 'middle', itemWidth: 8, itemHeight: 142,
        calculable: false, precision: projection.channel === 'psi_norm' ? 2 : 4, text: colorbarText, textGap: 7,
        textStyle: { color: chartTheme.muted, fontSize: 9 }, inRange: { color: palette }, borderColor: chartTheme.line,
      } : undefined,
      tooltip: {
        trigger: 'item', formatter: (params: unknown) => tooltipValue(params, projection, en),
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
  }, [chartTheme, cloudVisible, data.timeSeconds, en, equilibrium, field, geometryExtent, overlays, projection]);

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
  const fieldUnavailable = spatialFieldUnavailableReason(data, field, coordinateMap);
  const authority = selectedSpec.authority === 'native-grid'
    ? (en ? 'NATIVE R–Z GRID' : '原生 R–Z 网格')
    : selectedSpec.authority === 'normalized-grid'
      ? (en ? 'NORMALIZED FROM NATIVE ψ' : '由原生 ψ 归一化')
      : (en ? 'PROFILE-MAPPED / AXISYMMETRIC' : '剖面映射 / 轴对称派生');

  return <section className="simPanel simEquilibrium simEquilibriumCloud">
    <div className="simPanelTitle">
      <div><p className="simMiniLabel">R–Z FIELD · {origin.toUpperCase()} · {authority}</p><h3>{en ? 'Poloidal section field cloud' : '极向截面场云图'}</h3></div>
      <button className="simTinyButton" onClick={() => setRevision((value) => value + 1)}>{en ? 'Reset view' : '重置视图'}</button>
    </div>
    <div className="simFieldTools simFieldChannelTools">
      <label className="simFieldChannelSelect"><span>{en ? 'Field variable · linked with 3D' : '场变量 · 与三维联动'}</span><select value={field} onChange={(event) => onFieldChange(event.currentTarget.value as SpatialFieldChannel)}>
        {SPATIAL_FIELD_SPECS.map((spec) => { const unavailable = spatialFieldUnavailableReason(data, spec.id, coordinateMap); return <option key={spec.id} value={spec.id} disabled={Boolean(unavailable)}>{en ? spec.labelEn : spec.labelZh} · {spec.displayUnit}{unavailable ? (en ? ' · unavailable' : ' · 暂不可用') : ''}</option>; })}
      </select></label>
      <fieldset><legend>{en ? 'Display layers' : '显示图层'}</legend><label><input type="checkbox" checked={cloudVisible} onChange={(event) => setCloudVisible(event.currentTarget.checked)} />{en ? 'Field cloud' : '场云图'}</label>{OVERLAYS.map((overlay) => <label key={overlay}><input type="checkbox" checked={overlays.has(overlay)} onChange={() => toggleOverlay(overlay)} />{{ wall: en ? 'Wall' : '第一壁', contours: en ? 'Flux surfaces' : '磁通面', lcfs: 'LCFS', axis: en ? 'Axis' : '磁轴' }[overlay]}</label>)}</fieldset>
    </div>
    {fieldUnavailable && <p className="simFieldUnavailable" role="status">{en ? 'This field cannot be projected for the selected run because its verified radial coordinate map or aligned profile is unavailable.' : '当前运行缺少已校验的径向坐标映射或对齐剖面，无法投影该场；原一维剖面仍可查看。'}</p>}
    <EfitCanvasChart key={`${data.runId}-${revision}`} option={option} ariaLabel={en ? 'Simulated R-Z poloidal equilibrium field' : '模拟 R–Z 极向磁平衡场'} fallback={<div className="simEquilibriumFallback"><strong>{en ? 'Preparing verified field…' : '正在准备已校验场数据…'}</strong><span>{equilibrium.r.length} × {equilibrium.z.length} · COCOS {data.cocos}</span></div>} className="simEquilibriumChart" dataAspectRatio={dataAspectRatio} preserveDataZoom />
    <details className="simGridSampler"><summary>{en ? 'Keyboard grid readout' : '键盘网格读数'}</summary><div className="simGridSamplerBody">
      <label htmlFor={`${sampleId}-r`}><span>R index · {sampleIndex.r + 1}/{equilibrium.r.length}</span><input id={`${sampleId}-r`} type="range" min="0" max={equilibrium.r.length - 1} value={sampleIndex.r} onChange={(event) => setSampleIndex((current) => ({ ...current, r: Number(event.currentTarget.value) }))} /><output>{equilibrium.r[sampleIndex.r].toFixed(4)} m</output></label>
      <label htmlFor={`${sampleId}-z`}><span>Z index · {sampleIndex.z + 1}/{equilibrium.z.length}</span><input id={`${sampleId}-z`} type="range" min="0" max={equilibrium.z.length - 1} value={sampleIndex.z} onChange={(event) => setSampleIndex((current) => ({ ...current, z: Number(event.currentTarget.value) }))} /><output>{equilibrium.z[sampleIndex.z].toFixed(4)} m</output></label>
      <output className="simGridSampleValue" aria-live="polite">R {equilibrium.r[sampleIndex.r].toFixed(4)} m · Z {equilibrium.z[sampleIndex.z].toFixed(4)} m · ψN {samplePsiNorm.toFixed(4)}{sampleField ? ` · ${en ? selectedSpec.labelEn : selectedSpec.labelZh} ${sampleField.value.toPrecision(6)} ${sampleField.unit}${sampleField.rhoTorNorm === null ? '' : ` · ρtor,N ${sampleField.rhoTorNorm.toFixed(4)}`}` : ` · ${en ? 'unavailable outside the mapped plasma domain' : '映射等离子体域外不可用'}`}</output>
    </div></details>
    <div className="simPlotLegend">{overlays.has('axis') && <span>◇ {en ? 'Magnetic axis' : '磁轴'}</span>}{overlays.has('lcfs') && <span>━ LCFS</span>}<span>{!cloudVisible ? (en ? 'Field hidden' : '云图已关闭') : projection ? `${en ? selectedSpec.labelEn : selectedSpec.labelZh} · ${projection.minimum.toPrecision(4)} → ${projection.maximum.toPrecision(4)} ${projection.unit}` : (en ? 'Field unavailable' : '场不可用')}</span><span>COCOS {data.cocos}</span></div>
    <p className="simChartNote">{equilibrium.r.length} × {equilibrium.z.length} {selectedSpec.authority === 'profile-mapped' ? (en ? `archived equilibrium grid · LCFS grid-point mask · ${selectedSpec.sourceAxis === 'rho_tor_norm' ? 'native ψN↔ρtor,N coordinate map · ' : ''}bounded linear radial interpolation · no extrapolation. This is an axisymmetric flux-surface mapping, not a 2-D transport solve.` : `归档磁平衡网格 · LCFS 网格点掩膜 · ${selectedSpec.sourceAxis === 'rho_tor_norm' ? '原生 ψN↔ρtor,N 坐标映射 · ' : ''}有界线性径向插值 · 不外推。这是轴对称磁通面剖面映射，不是二维输运求解。`) : (en ? 'native archived ψ grid · LCFS grid-point mask · no spatial interpolation.' : '原生归档 ψ 网格 · LCFS 网格点掩膜 · 不进行空间插值。')}{coordinateMap && selectedSpec.authority === 'profile-mapped' ? ` · map ${coordinateMap.projectorSha256.slice(0, 8)}` : ''}</p>
  </section>;
}
