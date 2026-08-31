'use client';

import type { EChartsCoreOption } from 'echarts/core';
import { useEffect, useMemo, useState } from 'react';
import ScientificChart from '../components/charts/ScientificChart';
import { useChartTheme } from '../components/charts/chart-theme';
import { useI18n } from '../i18n';
import {
  commonSignalIds,
  loadSnapshotManifest,
  loadSnapshotShot,
  nearestSample,
  SNAPSHOT_MANIFEST_URL,
  type SnapshotManifest,
  type SnapshotShot,
} from './snapshotFusionData';

type ChartClick = { value?: unknown };

function shortHash(value: string) {
  return value.slice(0, 12);
}

function formatSnapshotDate(value: string, en: boolean) {
  return new Intl.DateTimeFormat(en ? 'en-CA' : 'zh-CN', {
    dateStyle: 'medium',
    timeZone: 'Asia/Shanghai',
  }).format(new Date(value));
}

function formatValue(value: number | null, locale: 'zh-CN' | 'en') {
  if (value === null) return '—';
  return new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'zh-CN', {
    maximumFractionDigits: 5,
    notation: Math.abs(value) >= 1e6 || (Math.abs(value) > 0 && Math.abs(value) < 1e-3) ? 'scientific' : 'standard',
  }).format(value);
}

function LoadingState({ en, error }: { en: boolean; error: string | null }) {
  return <section className="fusionWorkspace" aria-live="polite">
    <div className="fusionPanel fusionSnapshotState">
      <b>{error ? (en ? 'SNAPSHOT UNAVAILABLE' : '快照不可用') : (en ? 'VERIFYING SNAPSHOT' : '正在校验快照')}</b>
      <h2>{error ? (en ? 'The reviewed data package could not be opened.' : '无法打开已审核数据包。') : (en ? 'Loading four EXL-50U facility records' : '正在加载 4 炮 EXL-50U 装置记录')}</h2>
      <p>{error ?? (en ? 'Compressed bytes and decoded content are checked against SHA-256 before display.' : '显示前会分别校验压缩字节与解压内容的 SHA-256。')}</p>
    </div>
  </section>;
}

export default function FusionDataWorkspace() {
  const { locale } = useI18n();
  const en = locale === 'en';
  const palette = useChartTheme();
  const [manifest, setManifest] = useState<SnapshotManifest | null>(null);
  const [shots, setShots] = useState<SnapshotShot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedPulse, setSelectedPulse] = useState<number | null>(null);
  const [comparePulse, setComparePulse] = useState<number | null>(null);
  const [selectedSignalId, setSelectedSignalId] = useState('plasma-current');
  const [selectedTime, setSelectedTime] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const nextManifest = await loadSnapshotManifest((input, init) => fetch(input, { ...init, signal: controller.signal }));
        const records = await Promise.all(nextManifest.shots.map(({ pulse }) => loadSnapshotShot(
          nextManifest,
          pulse,
          (input, init) => fetch(input, { ...init, signal: controller.signal }),
        )));
        if (controller.signal.aborted) return;
        setManifest(nextManifest);
        setShots(records);
        setSelectedPulse(records[0]?.pulse ?? null);
        setComparePulse(records[1]?.pulse ?? null);
      } catch (cause) {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    })();
    return () => controller.abort();
  }, []);

  const shot = shots.find(({ pulse }) => pulse === selectedPulse) ?? shots[0] ?? null;
  const compareShot = shots.find(({ pulse }) => pulse === comparePulse && pulse !== shot?.pulse) ?? null;
  const commonIds = useMemo(() => shot ? commonSignalIds(shot, compareShot) : [], [compareShot, shot]);
  const selectedSignal = shot?.signals.find(({ id }) => id === selectedSignalId) ?? shot?.signals[0] ?? null;
  const selectedSample = selectedSignal ? nearestSample(selectedSignal, selectedTime) : null;
  const selectedTimeDelta = selectedSample ? selectedSample[0] - selectedTime : null;
  const globalTimeRange = useMemo<[number, number]>(() => {
    if (!shot) return [-4, 4];
    return [
      Math.min(...shot.signals.map(({ sampling }) => sampling.timeRange[0])),
      Math.max(...shot.signals.map(({ sampling }) => sampling.timeRange[1])),
    ];
  }, [shot]);

  const filteredShots = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return shots.filter((record) => !needle || `${record.pulse} ${record.signals.map((signal) => `${signal.dataItem} ${signal.dataset.id}`).join(' ')}`.toLowerCase().includes(needle));
  }, [search, shots]);

  const pulseOption = useMemo<EChartsCoreOption>(() => {
    if (!shot) return {};
    const signalIds = commonIds.length ? commonIds : shot.signals.map(({ id }) => id);
    const signals = signalIds.map((id) => shot.signals.find((signal) => signal.id === id)!).filter(Boolean);
    const grid = signals.map((_, index) => ({ left: 86, right: 24, top: 20 + index * 82, height: 52 }));
    const xAxis = signals.map((_, index) => ({
      type: 'value', min: globalTimeRange[0], max: globalTimeRange[1], gridIndex: index,
      axisLabel: { show: index === signals.length - 1, formatter: '{value} s' },
      axisTick: { show: index === signals.length - 1 }, splitLine: { show: true },
    }));
    const yAxis = signals.map((signal, index) => ({
      type: 'value', gridIndex: index, scale: true,
      name: `${en ? signal.labelEn : signal.label}\n${signal.unit}`,
      nameLocation: 'middle', nameGap: 56, nameTextStyle: { fontSize: 9, lineHeight: 13 },
      axisLabel: { fontSize: 9 }, splitNumber: 2,
    }));
    const primary = signals.map((signal, index) => ({
      id: `${shot.pulse}-${signal.id}`,
      name: `#${shot.pulse} · ${en ? signal.labelEn : signal.label}`,
      type: 'line', xAxisIndex: index, yAxisIndex: index,
      data: signal.samples,
      showSymbol: false, connectNulls: false, smooth: false,
      lineStyle: { width: 2.1, color: signal.color }, itemStyle: { color: signal.color },
      markLine: {
        silent: true, symbol: 'none', label: { show: index === 0, formatter: `${selectedTime.toFixed(3)} s` },
        lineStyle: { color: palette.accent, width: 1 }, data: [{ xAxis: selectedTime }],
      },
    }));
    const comparison = compareShot ? signals.flatMap((signal, index) => {
      const counterpart = compareShot.signals.find(({ id }) => id === signal.id);
      return counterpart ? [{
        id: `${compareShot.pulse}-${counterpart.id}`,
        name: `#${compareShot.pulse} · ${en ? counterpart.labelEn : counterpart.label}`,
        type: 'line', xAxisIndex: index, yAxisIndex: index,
        data: counterpart.samples,
        showSymbol: false, connectNulls: false, smooth: false,
        lineStyle: { width: 1.3, type: 'dotted', color: counterpart.color, opacity: .7 },
        itemStyle: { color: counterpart.color, opacity: .7 },
      }] : [];
    }) : [];
    return {
      aria: { enabled: true, decal: { show: true } },
      animationDuration: 220,
      axisPointer: { link: [{ xAxisIndex: 'all' }], label: { show: true, precision: 4 } },
      tooltip: { trigger: 'axis', confine: true },
      grid, xAxis, yAxis,
      dataZoom: [
        { type: 'inside', xAxisIndex: signals.map((_, index) => index), filterMode: 'none' },
        { type: 'slider', xAxisIndex: signals.map((_, index) => index), bottom: 3, height: 17, borderColor: palette.line, fillerColor: palette.infoSoft },
      ],
      series: [...comparison, ...primary],
    };
  }, [commonIds, compareShot, en, globalTimeRange, palette, selectedTime, shot]);

  if (!manifest || !shot || !selectedSignal) return <LoadingState en={en} error={error} />;

  const selectedManifestShot = manifest.shots.find(({ pulse }) => pulse === shot.pulse);

  function selectShot(pulse: number) {
    const next = shots.find((candidate) => candidate.pulse === pulse);
    if (!next) return;
    setSelectedPulse(pulse);
    if (comparePulse === pulse) setComparePulse(null);
    setSelectedSignalId(next.signals[0]?.id ?? 'plasma-current');
    const minimum = Math.min(...next.signals.map(({ sampling }) => sampling.timeRange[0]));
    const maximum = Math.max(...next.signals.map(({ sampling }) => sampling.timeRange[1]));
    setSelectedTime(Math.min(maximum, Math.max(minimum, 0)));
  }

  function handleChartClick(params: unknown) {
    const value = (params as ChartClick).value;
    if (Array.isArray(value) && Number.isFinite(Number(value[0]))) setSelectedTime(Number(value[0]));
  }

  return <section className="fusionWorkspace" aria-label={en ? 'EXL-50U public data snapshot' : 'EXL-50U 公开数据快照'}>
    <div className="fusionWorkspaceToolbar">
      <div><span>{en ? 'SOURCE' : '来源'}</span><b>EXL-50U · IMAS H5</b></div>
      <div><span>{en ? 'PROJECTION' : '投影'}</span><b>{en ? 'read-only MDSplus snapshot' : 'MDSplus 只读快照'}</b></div>
      <div><span>{en ? 'VERSION' : '版本'}</span><b>{manifest.snapshotId}</b></div>
      <div><span>{en ? 'SHOT SHA-256' : '炮次 SHA-256'}</span><b>{selectedManifestShot ? `${shortHash(selectedManifestShot.contentSha256)}…` : '—'}</b></div>
      <strong><i /> {en ? 'SNAPSHOT · NOT LIVE' : '固定快照 · 非实时'}</strong>
    </div>

    <div className="fusionWorkspaceGrid">
      <aside className="fusionShotRail">
        <div className="fusionPanelHeading"><div><span>01</span><h2>{en ? 'Reviewed shots' : '已审核炮次'}</h2></div><small>{filteredShots.length}/{shots.length}</small></div>
        <label className="fusionShotSearch"><span className="srOnly">{en ? 'Filter shots or datasets' : '筛选炮次或数据集'}</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={en ? 'Shot or IDS…' : '炮号或 IDS…'} /></label>
        <div className="fusionShotList">
          {filteredShots.map((record) => <div className="fusionShotRow" key={record.pulse}>
            <button className="fusionShotSelect" type="button" aria-pressed={record.pulse === shot.pulse} onClick={() => selectShot(record.pulse)}>
              <span className="fusionQuality fusionQuality--unknown" aria-hidden="true" />
              <span><b>EXL #{record.pulse}</b><small>{record.signals.length} {en ? 'published signals' : '条发布信号'}</small></span>
              <em>r{record.signals[0].dataset.run}</em>
            </button>
            <button className="fusionCompareButton" type="button" disabled={record.pulse === shot.pulse} aria-pressed={record.pulse === compareShot?.pulse} aria-label={en ? `Compare shot ${record.pulse}` : `对比炮 ${record.pulse}`} onClick={() => setComparePulse((current) => current === record.pulse ? null : record.pulse)}>{record.pulse === compareShot?.pulse ? '−' : '+'}</button>
          </div>)}
        </div>
        <div className="fusionRailNote"><b>{en ? 'PUBLIC SNAPSHOT BOUNDARY' : '公开快照边界'}</b><p>{en ? 'The browser never connects to the internal archive. Nulls are preserved; no interpolation, quality inference, or peak claim is added.' : '浏览器不连接内网档案。缺失值保持为 null；不插值、不推断质量、不声称权威峰值。'}</p></div>
      </aside>

      <div className="fusionMainPanels">
        <div className="fusionShotHeader">
          <div><span>EXL-50U · {en ? 'facility record' : '装置记录'}</span><h2>Shot {shot.pulse}{compareShot && <em>vs {compareShot.pulse}</em>}</h2></div>
          <dl>
            <div><dt>{en ? 'signals' : '信号'}</dt><dd>{shot.signals.length}</dd></div>
            <div><dt>{en ? 'snapshot' : '快照'}</dt><dd>{manifest.snapshotId.split('-').at(-1)}</dd></div>
            <div><dt>{en ? 'generated' : '生成'}</dt><dd>{formatSnapshotDate(manifest.generatedAt, en)}</dd></div>
          </dl>
        </div>

        <article className="fusionPanel fusionPulsePanel">
          <div className="fusionPanelHeading"><div><span>02</span><h2>{en ? 'Measured time series' : '实测时序'}</h2></div><small>{compareShot ? (en ? `solid #${shot.pulse} · dotted #${compareShot.pulse}` : `实线 #${shot.pulse} · 点线 #${compareShot.pulse}`) : (en ? 'shared physical time · no interpolation' : '共享物理时间 · 未插值')}</small></div>
          <ScientificChart
            id="fusion-real-discharge-overview"
            option={pulseOption}
            ariaLabel={en ? 'Four real EXL-50U signals using independent sampled time bases' : '四条使用各自采样时间基的 EXL-50U 实际信号'}
            fallbackSrc=""
            fallbackAlt=""
            height={388}
            eager
            onChartClick={handleChartClick}
            keepFallbackAccessible
            fallback={<table><caption>{en ? 'Nearest published samples' : '最近发布样本'}</caption><thead><tr><th>{en ? 'Signal' : '信号'}</th><th>{en ? 'Time' : '时间'}</th><th>{en ? 'Value' : '值'}</th></tr></thead><tbody>{shot.signals.map((signal) => { const sample = nearestSample(signal, selectedTime); return <tr key={signal.id}><th>{en ? signal.labelEn : signal.label}</th><td>{sample?.[0].toFixed(6) ?? '—'} s</td><td>{formatValue(sample?.[1] ?? null, locale)} {signal.unit}</td></tr>; })}</tbody></table>}
          />
          <nav className="fusionCoverageTrack" aria-label={en ? 'Signal acquisition windows' : '信号采集时窗'}><span>{en ? 'WINDOWS' : '时窗'}</span>{shot.signals.map((signal) => <button type="button" key={signal.id} aria-pressed={signal.id === selectedSignal.id} onClick={() => setSelectedSignalId(signal.id)}><b>{signal.dataItem}</b><time>{signal.sampling.timeRange[0].toFixed(3)} → {signal.sampling.timeRange[1].toFixed(3)} s</time></button>)}</nav>
        </article>

        <div className="fusionAnalysisGrid">
          <article className="fusionPanel">
            <div className="fusionPanelHeading"><div><span>03</span><h2>{en ? 'Dataset identity' : '数据集身份'}</h2></div><small>IDS / occurrence / run</small></div>
            <div className="fusionDatasetCards">{shot.signals.map((signal) => <button type="button" key={signal.id} aria-pressed={signal.id === selectedSignal.id} onClick={() => setSelectedSignalId(signal.id)}><i style={{ background: signal.color }} /><span><b>{signal.dataItem}</b><small>{signal.dataset.id}</small></span><em>{signal.unit}</em></button>)}</div>
          </article>
          <article className="fusionPanel">
            <div className="fusionPanelHeading"><div><span>04</span><h2>{en ? 'Sampling disclosure' : '采样披露'}</h2></div><small>{en ? 'source → published' : '源数据 → 发布快照'}</small></div>
            <div className="fusionSamplingTable"><table><thead><tr><th>IDS</th><th>{en ? 'source' : '原始'}</th><th>{en ? 'published' : '发布'}</th><th>{en ? 'missing' : '缺失'}</th></tr></thead><tbody>{shot.signals.map((signal) => <tr key={signal.id}><th>{signal.dataItem}</th><td>{signal.sampling.sourcePoints.toLocaleString()}</td><td>{signal.sampling.publishedPoints.toLocaleString()}</td><td>{signal.sampling.missingValues}</td></tr>)}</tbody></table><p>{en ? 'Gateway downsampling only; the browser applies nearest-sample selection and never fills gaps.' : '仅由受控网关降采样；浏览器仅选取最近样本，不填补缺口。'}</p></div>
          </article>
        </div>

        <article className="fusionPanel">
          <div className="fusionPanelHeading"><div><span>05</span><h2>{en ? 'Products not included' : '本快照未包含的产品'}</h2></div><small>{en ? 'fail closed' : '缺失即停用'}</small></div>
          <div className="fusionUnavailableGrid">
            {[
              [en ? 'Equilibrium / LCFS' : '平衡位形 / LCFS', 'equilibrium'],
              [en ? 'Core profiles' : '芯部剖面', 'core_profiles'],
              [en ? 'Diagnostic quality bits' : '诊断质量位', 'validity / error'],
              [en ? 'CAE / 3D fields' : 'CAE / 三维场', 'VTK / trame'],
            ].map(([label, code]) => <div key={code}><b>{label}</b><code>{code}</code><span>{en ? 'not exported · no synthetic fallback' : '未导出 · 不使用合成回退'}</span></div>)}
          </div>
        </article>

        <div className="fusionTimebar">
          <button type="button" onClick={() => setSelectedTime((value) => Math.max(globalTimeRange[0], value - .01))} aria-label={en ? 'Move time backward' : '时间向前移'}>‹</button>
          <output>{selectedTime.toFixed(3)} s</output>
          <input aria-label={en ? 'Shared physical time cursor' : '共享物理时间游标'} type="range" min={globalTimeRange[0]} max={globalTimeRange[1]} step="0.001" value={selectedTime} onChange={(event) => setSelectedTime(Number(event.target.value))} />
          <button type="button" onClick={() => setSelectedTime((value) => Math.min(globalTimeRange[1], value + .01))} aria-label={en ? 'Move time forward' : '时间向后移'}>›</button>
          <span>{en ? 'nearest sample on each independent time base' : '每条信号在独立时间基上取最近样本'}</span>
        </div>
      </div>

      <aside className="fusionInspector">
        <div className="fusionPanelHeading"><div><span>06</span><h2>{en ? 'Evidence inspector' : '证据检查器'}</h2></div><small>{selectedTime.toFixed(3)} s</small></div>
        <section><span>{en ? 'SHOT IDENTITY' : '炮次身份'}</span><dl><div><dt>facility</dt><dd>{shot.facility}</dd></div><div><dt>pulse</dt><dd>{shot.pulse}</dd></div><div><dt>snapshot</dt><dd>{shot.snapshotId}</dd></div><div><dt>state</dt><dd><b className="fusionBadge">not live</b></dd></div></dl></section>
        <section className="fusionIdsBrowser"><span>{en ? 'PUBLISHED SIGNALS' : '已发布信号'}</span><div>{shot.signals.map((signal) => <button type="button" key={signal.id} aria-pressed={signal.id === selectedSignal.id} onClick={() => setSelectedSignalId(signal.id)}><b>{signal.dataItem}</b><small>{signal.path}</small></button>)}</div></section>
        <section><span>{en ? 'NEAREST SAMPLE' : '最近样本'}</span><dl><div><dt>{en ? 'name' : '名称'}</dt><dd>{en ? selectedSignal.labelEn : selectedSignal.label}</dd></div><div><dt>{en ? 'value' : '值'}</dt><dd>{formatValue(selectedSample?.[1] ?? null, locale)} {selectedSignal.unit}</dd></div><div><dt>{en ? 'sample time' : '样本时间'}</dt><dd>{selectedSample?.[0].toFixed(6) ?? '—'} s</dd></div><div><dt>Δt</dt><dd>{selectedTimeDelta === null ? '—' : `${selectedTimeDelta >= 0 ? '+' : ''}${selectedTimeDelta.toFixed(6)} s`}</dd></div><div><dt>{en ? 'quality' : '质量'}</dt><dd>unknown · source bit unavailable</dd></div></dl></section>
        <section><span>{en ? 'TRACE' : '溯源'}</span><dl><div><dt>dataset_id</dt><dd>{selectedSignal.dataset.id}</dd></div><div><dt>IDS</dt><dd>{selectedSignal.dataset.idsName}</dd></div><div><dt>occ / run</dt><dd>{selectedSignal.dataset.occurrence} / {selectedSignal.dataset.run}</dd></div><div><dt>signal</dt><dd>{selectedSignal.path}</dd></div><div><dt>unit</dt><dd>{selectedSignal.unit}</dd></div><div><dt>{en ? 'points' : '点数'}</dt><dd>{selectedSignal.sampling.sourcePoints.toLocaleString()} → {selectedSignal.sampling.publishedPoints.toLocaleString()}</dd></div><div><dt>sample SHA</dt><dd>{shortHash(selectedSignal.sampleSha256)}…</dd></div></dl></section>
        <section><span>{en ? 'PROVENANCE' : '血缘'}</span><ol><li><b>01</b>{en ? 'Authoritative IMAS H5 dataset' : '权威 IMAS H5 数据集'}</li><li><b>02</b>{en ? 'Read-only MDSplus time-series projection' : 'MDSplus 只读时序投影'}</li><li><b>03</b>{en ? 'Allowlisted, hashed public snapshot' : '白名单导出与哈希校验的公开快照'}</li></ol></section>
        <section className="fusionReferenceLinks"><span>{en ? 'DOWNLOAD / CONTRACT' : '下载 / 合同'}</span><a href={`/data/exl50u-mdsplus-snapshot-v1/${selectedManifestShot?.path}`} download>{en ? 'Reviewed raw-gzip shot ↓' : '已审核原始 gzip 炮次包 ↓'}</a><a href={SNAPSHOT_MANIFEST_URL} target="_blank" rel="noreferrer">manifest.json ↗</a></section>
      </aside>
    </div>
  </section>;
}
