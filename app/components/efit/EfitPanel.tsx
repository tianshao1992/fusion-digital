'use client';

import { useEffect, useRef, type KeyboardEvent } from 'react';
import { deriveReviewedDivertorRegion } from './divertor-region';
import EfitEquilibriumChart, { efitTopologyLabel } from './EfitEquilibriumChart';
import EfitSignalsChart from './EfitSignalsChart';
import EfitTimelineControls from './EfitTimelineControls';
import { efitShotOptionLabel, resolveShotGeometry } from './shot-geometry';
import type { EfitStore } from './store';
import { useEfitStore } from './use-efit-store';
import './efit-panel.css';

type EfitPanelProps = {
  store: EfitStore;
  preferredShot?: number;
  preferredTimeMs?: number;
  className?: string;
  title?: string;
};

function finiteText(value: number | undefined, digits: number, suffix: string): string {
  return value !== undefined && Number.isFinite(value) ? `${value.toFixed(digits)} ${suffix}` : '—';
}

function isFormControl(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest('input, select, textarea, button, [contenteditable="true"]'));
}

export default function EfitPanel({
  store,
  preferredShot,
  preferredTimeMs,
  className = '',
  title = 'EFIT 平衡位形',
}: EfitPanelProps) {
  const snapshot = useEfitStore(store);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    void (async () => {
      await store.actions.initialize(preferredShot);
      if (preferredTimeMs !== undefined && Number.isFinite(preferredTimeMs)) {
        await store.actions.seekTimeMs(preferredTimeMs);
      }
    })();
  }, [preferredShot, preferredTimeMs, store]);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>): void {
    if (isFormControl(event.target) || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === ' ') {
      event.preventDefault();
      store.actions.togglePlayback();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      void store.actions.step(-1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      void store.actions.step(1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      void store.actions.seekFrame(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      void store.actions.seekFrame(snapshot.timeline.length - 1);
    }
  }

  const frame = snapshot.currentFrame;
  const quality = frame?.quality;
  const topology = frame?.topology;
  const topologyGraph = frame?.topologyGraphPayload?.topologyGraph;
  const graphXPoints = topologyGraph?.nodes.filter((node) => node.kind === 'x-point') ?? [];
  const graphBoundaryXPoints = graphXPoints.filter((node) => node.role === 'boundary');
  const graphCandidateXPoints = graphXPoints.filter((node) => node.role === 'near-boundary');
  const graphIsPartial = Boolean(topologyGraph && (topologyGraph.unresolvedArms.length > 0 || topologyGraph.unresolvedRegions.length > 0));
  const activeGeometry = resolveShotGeometry(snapshot.manifest, snapshot.activeShot);
  const divertorRegion = deriveReviewedDivertorRegion(
    topology,
    activeGeometry?.limiterRzM,
    frame ? { rM: frame.rAxisM, zM: frame.zAxisM } : undefined,
  );

  return (
    <section
      className={`efitPanel ${className}`.trim()}
      aria-labelledby="efit-panel-heading"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <header className="efitPanelHeader">
        <div>
          <span className="efitEyebrow">EXL-50U · EQUILIBRIUM RECONSTRUCTION</span>
          <h2 id="efit-panel-heading">{title}</h2>
          <p>实验时间、二维磁面与三维数字样机共享同一帧状态；缺帧不插值，保留重建质量证据。</p>
        </div>
        <label className="efitShotSelect">
          <span>放电炮号</span>
          <select
            value={snapshot.activeShot ?? ''}
            disabled={!snapshot.manifest || snapshot.status === 'loading-index'}
            onChange={(event) => void store.actions.selectShot(Number(event.currentTarget.value))}
          >
            {!snapshot.manifest && <option value="">加载中</option>}
            {snapshot.manifest?.shots.map((shot) => (
              <option key={shot.shot} value={shot.shot}>{efitShotOptionLabel(shot)}</option>
            ))}
          </select>
        </label>
      </header>

      <div className="efitStatusRail" aria-live="polite">
        {snapshot.status !== 'ready' && snapshot.status !== 'idle' && snapshot.status !== 'error' && (
          <span className="efitStatusPill isLoading">{snapshot.status === 'loading-index' ? '读取 EFIT 索引' : snapshot.status === 'loading-shot' ? '准备放电数据' : '读取位形帧'}</span>
        )}
        {quality && <span className={`efitStatusPill quality-${quality.state}`}>质量 · {quality.state === 'good' ? '有效' : quality.state === 'warning' ? '需关注' : '不可用'}</span>}
        {snapshot.activeShot !== null && !activeGeometry && (
          <span className="efitStatusPill quality-invalid">几何合同 · 缺失</span>
        )}
        {topology && (
          <span
            className={`efitStatusPill topology-${topology.kind}`}
            title={topology.kind === 'near-double-null' ? '包含主、次 X 点；次 X 点不等同于严格双零平衡。' : undefined}
          >
            拓扑 · {efitTopologyLabel(topology.kind)} · X {topology.xPoints.length}
          </span>
        )}
        {topologyGraph && (
          <span
            className={`efitStatusPill ${graphIsPartial ? 'divertor-region-wireframe' : 'quality-good'}`}
            title={graphIsPartial ? '存在未解析分离臂或未经科学审查的开放区域；界面仅显示已发布线框证据。' : '拓扑图通过帧级结构、引用与几何边界校验。'}
          >
            拓扑图 v2 · 边界 X {graphBoundaryXPoints.length} · 候选 {graphCandidateXPoints.length} · 分支 {topologyGraph.edges.length}
          </span>
        )}
        {topology && divertorRegion.state !== 'unavailable' && (
          <span
            className={`efitStatusPill divertor-region-${divertorRegion.state}`}
            title={divertorRegion.message}
          >
            边界区域 · {divertorRegion.state === 'filled' ? '已审查闭合' : '仅线框'}
          </span>
        )}
        {snapshot.gapNotice && (
          <span className="efitStatusPill isWarning">
            数据间隙 {snapshot.gapNotice.afterMs}–{snapshot.gapNotice.beforeMs} ms{snapshot.gapNotice.missingCount ? ` · 缺 ${snapshot.gapNotice.missingCount} 帧` : ''}
          </span>
        )}
        {quality?.messages.map((message) => <span className="efitStatusText" key={message}>{message}</span>)}
        {snapshot.error && (
          <span className="efitError" role="alert">
            {snapshot.error}
            <button type="button" onClick={() => {
              store.actions.clearError();
              if (snapshot.manifest && snapshot.activeShot !== null) void store.actions.selectShot(snapshot.activeShot);
              else void store.actions.initialize(preferredShot);
            }}>重试</button>
          </span>
        )}
      </div>

      <div className="efitMetricStrip" aria-label="当前 EFIT 重建参数">
        <div><span>t</span><strong>{finiteText(frame?.timeMs !== undefined ? frame.timeMs / 1000 : undefined, 3, 's')}</strong></div>
        <div><span>Ip</span><strong>{finiteText(frame?.currentA !== undefined ? frame.currentA / 1000 : undefined, 1, 'kA')}</strong></div>
        <div><span>Raxis</span><strong>{finiteText(frame?.rAxisM, 3, 'm')}</strong></div>
        <div><span>Zaxis</span><strong>{finiteText(frame?.zAxisM, 3, 'm')}</strong></div>
        <div><span>B₀</span><strong>{finiteText(frame?.bcentrT, 3, 'T')}</strong></div>
        <div><span>q95</span><strong>{finiteText(frame?.q95, 2, '')}</strong></div>
      </div>

      <div className="efitChartGrid">
        <article className="efitChartCard efitEquilibriumCard">
          <div className="efitCardHeading"><span>01</span><div><h3>R–Z 磁通分带云图与偏滤器拓扑</h3><p>归一化极向磁通 ψN 分带 · LCFS / 分离支 · X 点 · limiter 交点 · 非温度/密度</p></div></div>
          <EfitEquilibriumChart frame={frame} geometry={activeGeometry} />
        </article>
        <article className="efitChartCard efitSignalsCard">
          <div className="efitCardHeading"><span>02</span><div><h3>放电时序</h3><p>Ip · Raxis · Zaxis；点击曲线定位时间</p></div></div>
          <EfitSignalsChart timeline={snapshot.timeline} currentTimeMs={snapshot.currentTimeMs} onSeekTimeMs={(timeMs) => void store.actions.seekTimeMs(timeMs)} />
        </article>
      </div>

      <EfitTimelineControls store={store} snapshot={snapshot} />

      <noscript>
        <p className="efitNoScript">此面板需要 JavaScript 才能播放 EFIT 动画。静态信息：EXL-50U 平衡位形包含 R–Z 磁面、LCFS、限制器、磁轴及 Ip/Raxis/Zaxis 时序；仅在帧内已发布经校验数据时显示 X 点、分离支与 limiter 交点。</p>
      </noscript>
    </section>
  );
}
