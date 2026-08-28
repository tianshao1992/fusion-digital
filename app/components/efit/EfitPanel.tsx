'use client';

import { useEffect, useRef, type KeyboardEvent } from 'react';
import { deriveReviewedDivertorRegion, deriveVerifiedDivertorGraphRegion } from './divertor-region';
import EfitEquilibriumChart, { efitTopologyMessageKey } from './EfitEquilibriumChart';
import { useI18n } from '../../i18n';
import EfitSignalsChart from './EfitSignalsChart';
import EfitTimelineControls from './EfitTimelineControls';
import { efitShotOptionLabel, resolveShotGeometry } from './shot-geometry';
import { trackAnalyticsContent } from '@/app/analytics/client';
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
  title,
}: EfitPanelProps) {
  const { locale, t, content } = useI18n();
  const panelTitle = title ?? t('efit.title');
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
  const magneticAxis = frame ? { rM: frame.rAxisM, zM: frame.zAxisM } : undefined;
  const divertorRegion = topology
    ? deriveReviewedDivertorRegion(topology, activeGeometry?.limiterRzM, magneticAxis)
    : deriveVerifiedDivertorGraphRegion(topologyGraph, magneticAxis);
  const qualityLabel = quality
    ? quality.state === 'good' ? t('efit.good') : quality.state === 'warning' ? t('efit.warning') : t('efit.invalid')
    : '';
  const qualityDetail = quality
    ? [t('efit.quality'), qualityLabel, ...quality.messages.map(content)].filter(Boolean).join(' · ')
    : undefined;
  const topologyLabel = topology ? t(efitTopologyMessageKey(topology.kind)) : t('efit.topology.unknown');
  const topologyXCount = topology?.xPoints.length ?? graphBoundaryXPoints.length;
  const topologyDetail = (topology || topologyGraph)
    ? [
        `${t('efit.topology')}: ${topologyLabel}`,
        topology?.kind === 'near-double-null' ? t('efit.nearDoubleHelp') : null,
        topologyGraph
          ? `${t('efit.graphSummary', { boundary: graphBoundaryXPoints.length, candidate: graphCandidateXPoints.length, branches: topologyGraph.edges.length })} · ${graphIsPartial ? t('efit.graphPartialHelp') : t('efit.graphValidHelp')}`
          : null,
        (topology || topologyGraph) && divertorRegion.state !== 'unavailable'
          ? `${t('efit.boundaryRegion')}: ${divertorRegion.state === 'filled'
            ? t(divertorRegion.code === 'closed-published-graph-boundary' ? 'efit.graphVerifiedClosed' : 'efit.reviewedClosed')
            : t('efit.wireframeOnly')} · ${content(divertorRegion.message)}`
          : null,
      ].filter(Boolean).join(' · ')
    : undefined;
  const gapLabel = snapshot.gapNotice
    ? snapshot.gapNotice.missingCount
      ? `${t('efit.missingFrames', { count: snapshot.gapNotice.missingCount })} · ${snapshot.gapNotice.afterMs}–${snapshot.gapNotice.beforeMs} ms`
      : t('efit.dataGap', { after: snapshot.gapNotice.afterMs, before: snapshot.gapNotice.beforeMs })
    : null;

  return (
    <section
      className={`efitPanel ${className}`.trim()}
      aria-labelledby="efit-panel-heading"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <header className="efitPanelHeader">
        <div>
          <span className="efitEyebrow">EXL-50U · EFIT</span>
          <h2 id="efit-panel-heading">{panelTitle}</h2>
        </div>
        <label className="efitShotSelect">
          <span>{t('efit.shot')}</span>
          <select
            value={snapshot.activeShot ?? ''}
            disabled={!snapshot.manifest || snapshot.status === 'loading-index'}
            onChange={(event) => {
              const shot = Number(event.currentTarget.value);
              trackAnalyticsContent('efit-shot', String(shot));
              void store.actions.selectShot(shot);
            }}
          >
            {!snapshot.manifest && <option value="">{t('efit.loading')}</option>}
            {snapshot.manifest?.shots.map((shot) => (
              <option key={shot.shot} value={shot.shot}>
                {efitShotOptionLabel(shot, (count) => t('efit.frames', { count: count.toLocaleString(locale) }))}
              </option>
            ))}
          </select>
        </label>
      </header>

      <div className="efitStatusRail" aria-live="polite">
        {snapshot.status !== 'ready' && snapshot.status !== 'idle' && snapshot.status !== 'error' && (
          <span className="efitStatusPill isLoading">{snapshot.status === 'loading-index' ? t('efit.loadingIndex') : snapshot.status === 'loading-shot' ? t('efit.loadingShot') : t('efit.loadingFrame')}</span>
        )}
        {quality && <span className={`efitStatusPill quality-${quality.state}`} title={qualityDetail} aria-label={qualityDetail}>{qualityLabel}</span>}
        {snapshot.activeShot !== null && !activeGeometry && (
          <span className="efitStatusPill quality-invalid">{t('efit.geometryMissing')}</span>
        )}
        {(topology || topologyGraph) && (
          <span
            className={`efitStatusPill topology-${topology?.kind ?? 'unknown'}`}
            title={topologyDetail}
            aria-label={topologyDetail}
          >
            {topologyLabel} · X{topologyXCount}
          </span>
        )}
        {snapshot.gapNotice && (
          <span className="efitStatusPill isWarning" title={snapshot.gapNotice.reason ? content(snapshot.gapNotice.reason) : undefined}>
            {gapLabel}
          </span>
        )}
        {snapshot.error && (
          <span className="efitError" role="alert">
            {content(snapshot.error)}
            <button type="button" onClick={() => {
              store.actions.clearError();
              if (snapshot.manifest && snapshot.activeShot !== null) void store.actions.selectShot(snapshot.activeShot);
              else void store.actions.initialize(preferredShot);
            }}>{t('efit.retry')}</button>
          </span>
        )}
      </div>

      <div className="efitMetricStrip" aria-label={t('efit.metricsAria')}>
        <div><span>t</span><strong>{finiteText(frame?.timeMs !== undefined ? frame.timeMs / 1000 : undefined, 3, 's')}</strong></div>
        <div><span>Ip</span><strong>{finiteText(frame?.currentA !== undefined ? frame.currentA / 1000 : undefined, 1, 'kA')}</strong></div>
        <div><span>Raxis</span><strong>{finiteText(frame?.rAxisM, 3, 'm')}</strong></div>
        <div><span>Zaxis</span><strong>{finiteText(frame?.zAxisM, 3, 'm')}</strong></div>
        <div><span>B₀</span><strong>{finiteText(frame?.bcentrT, 3, 'T')}</strong></div>
        <div><span>q95</span><strong>{finiteText(frame?.q95, 2, '')}</strong></div>
      </div>

      <div className="efitChartGrid">
        <article className="efitChartCard efitEquilibriumCard" title={t('efit.equilibriumCardCopy')} aria-label={`${t('efit.equilibriumCard')}. ${t('efit.equilibriumCardCopy')}`}>
          <div className="efitCardHeading"><span>01</span><div><h3>{t('efit.equilibriumCard')}</h3></div></div>
          <EfitEquilibriumChart frame={frame} geometry={activeGeometry} />
        </article>
        <article className="efitChartCard efitSignalsCard" aria-label={`${t('efit.timelineCard')}. ${t('efit.timelineCardCopy')}`}>
          <div className="efitCardHeading"><span>02</span><div><h3>{t('efit.timelineCard')}</h3></div></div>
          <EfitSignalsChart timeline={snapshot.timeline} currentTimeMs={snapshot.currentTimeMs} onSeekTimeMs={(timeMs) => void store.actions.seekTimeMs(timeMs)} />
        </article>
      </div>

      <EfitTimelineControls store={store} snapshot={snapshot} />

      <noscript>
        <p className="efitNoScript">{t('efit.noScript')}</p>
      </noscript>
    </section>
  );
}
