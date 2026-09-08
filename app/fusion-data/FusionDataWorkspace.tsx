'use client';

import type { EChartsCoreOption } from 'echarts/core';
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
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
      <h2>{error ? (en ? 'The reviewed data package could not be opened.' : '无法打开已审核数据包。') : (en ? 'Loading the selected EXL-50U record' : '正在加载选中的 EXL-50U 装置记录')}</h2>
      <p>{error ?? (en ? 'Compressed bytes and decoded content are checked against SHA-256 before display.' : '显示前会分别校验压缩字节与解压内容的 SHA-256。')}</p>
    </div>
  </section>;
}

// Two independent requests: a failed comparison must not hide the primary shot.
// A bounded cache avoids re-downloading recently viewed records, not the catalog.
function useSnapshotRecord(manifest: SnapshotManifest | null, pulse: number | null, cacheRef: RefObject<Map<number, SnapshotShot>>) {
  const [result, setResult] = useState<{ pulse: number; shot: SnapshotShot | null; error: string | null } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!manifest || pulse === null) return;
    const cache = cacheRef.current;
    const controller = new AbortController();
    void (async () => {
      try {
        const record = cache.get(pulse) ?? await loadSnapshotShot(manifest, pulse, (input, init) => fetch(input, { ...init, signal: controller.signal }));
        if (controller.signal.aborted) return;
        cache.delete(pulse);
        cache.set(pulse, record);
        if (cache.size > 8) cache.delete(cache.keys().next().value!);
        setResult({ pulse, shot: record, error: null });
      } catch (cause) {
        if (!controller.signal.aborted) setResult({ pulse, shot: null, error: cause instanceof Error ? cause.message : String(cause) });
      }
    })();
    return () => controller.abort();
  }, [manifest, pulse, attempt, cacheRef]);
  return {
    shot: result?.pulse === pulse ? result.shot : null,
    error: result?.pulse === pulse ? result.error : null,
    retry: () => { setResult(null); setAttempt((value) => value + 1); },
  };
}

export default function FusionDataWorkspace() {
  const { locale } = useI18n();
  const en = locale === 'en';
  const palette = useChartTheme();
  const [manifest, setManifest] = useState<SnapshotManifest | null>(null);
  const cache = useRef(new Map<number, SnapshotShot>());
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [campaign, setCampaign] = useState('all');
  const [signalGroup, setSignalGroup] = useState<'diagnostics' | 'equilibrium'>('diagnostics');
  const [selectedPulse, setSelectedPulse] = useState<number | null>(null);
  const [comparePulse, setComparePulse] = useState<number | null>(null);
  const [selectedSignalId, setSelectedSignalId] = useState('plasma-current');
  const [selectedTime, setSelectedTime] = useState(.3);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const nextManifest = await loadSnapshotManifest((input, init) => fetch(input, { ...init, signal: controller.signal }));
        if (controller.signal.aborted) return;
        setManifest(nextManifest);
        setSelectedPulse(Math.max(...nextManifest.shots.map(({ pulse }) => pulse)));
      } catch (cause) {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    })();
    return () => controller.abort();
  }, []);

  const primary = useSnapshotRecord(manifest, selectedPulse, cache);
  const comparison = useSnapshotRecord(manifest, comparePulse !== selectedPulse ? comparePulse : null, cache);
  const shot = primary.shot;
  const compareShot = comparison.shot;
  const commonIds = useMemo(() => shot ? commonSignalIds(shot, compareShot) : [], [compareShot, shot]);
  const visibleSignals = useMemo(() => shot?.signals.filter((signal) => (signal.dataItem === 'equilibrium') === (signalGroup === 'equilibrium')) ?? [], [shot, signalGroup]);
  const selectedSignal = shot?.signals.find(({ id }) => id === selectedSignalId) ?? shot?.signals[0] ?? null;
  const selectedSample = selectedSignal ? nearestSample(selectedSignal, selectedTime) : null;
  const selectedTimeDelta = selectedSample ? selectedSample[0] - selectedTime : null;
  const globalTimeRange = useMemo<[number, number]>(() => {
    if (!visibleSignals.length) return [0, 1];
    const all = [...visibleSignals, ...(compareShot?.signals.filter((signal) => visibleSignals.some((primary) => primary.id === signal.id && primary.unit === signal.unit)) ?? [])];
    return [
      Math.min(...all.map(({ sampling }) => sampling.timeRange[0])),
      Math.max(...all.map(({ sampling }) => sampling.timeRange[1])),
    ];
  }, [visibleSignals, compareShot]);

  const filteredShots = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return [...(manifest?.shots ?? [])].reverse().filter((record) => (campaign === 'all' || (record.campaignDate ?? 'previous') === campaign) && (!needle || `${record.pulse} ${record.datasetIds.join(' ')}`.toLowerCase().includes(needle)));
  }, [search, manifest, campaign]);

  const pulseOption = useMemo<EChartsCoreOption>(() => {
    if (!shot) return {};
    const signals = visibleSignals;
    const grid = signals.map((_, index) => ({ left: 105, right: 30, top: 24 + index * 110, height: 70 }));
    const xAxis = signals.map((_, index) => ({
      type: 'value', min: globalTimeRange[0], max: globalTimeRange[1], gridIndex: index,
      axisLabel: { show: index === signals.length - 1, formatter: '{value} s' },
      axisTick: { show: index === signals.length - 1 }, splitLine: { show: true },
    }));
    const yAxis = signals.map((signal, index) => ({
      type: 'value', gridIndex: index, scale: true,
      name: `${en ? signal.labelEn : signal.label}\n${signal.unit}`,
      nameLocation: 'middle', nameGap: 70, nameTextStyle: { fontSize: 12, lineHeight: 16 },
      axisLabel: { fontSize: 11 }, splitNumber: 2,
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
      const counterpart = commonIds.includes(signal.id) ? compareShot.signals.find(({ id }) => id === signal.id) : null;
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
  }, [commonIds, compareShot, en, globalTimeRange, palette, selectedTime, shot, visibleSignals]);

  if (!manifest) return <LoadingState en={en} error={error} />;

  const selectedManifestShot = manifest.shots.find(({ pulse }) => pulse === selectedPulse);
  const offline = shot?.source.projection === 'offline IMAS H5 time-series extraction';
  const projectionLabel = offline ? (en ? 'Offline IMAS H5 extraction' : 'IMAS H5 离线提取') : (en ? 'Read-only MDSplus projection' : 'MDSplus 只读时序投影');

  function selectShot(pulse: number) {
    setSelectedPulse(pulse);
    if (comparePulse === pulse) setComparePulse(null);
    setSelectedSignalId('plasma-current');
    setSelectedTime(.3);
  }

  function handleChartClick(params: unknown) {
    const value = (params as ChartClick).value;
    if (Array.isArray(value) && Number.isFinite(Number(value[0]))) setSelectedTime(Number(value[0]));
  }

  return <section className="fusionWorkspace" aria-label={en ? 'EXL-50U public data snapshot' : 'EXL-50U 公开数据快照'}>
    <div className="fusionWorkspaceToolbar">
      <div><span>{en ? 'SOURCE' : '来源'}</span><b>EXL-50U · IMAS H5</b></div>
      <div><span>{en ? 'PROJECTION' : '投影'}</span><b>{shot ? projectionLabel : '—'}</b></div>
      <div><span>{en ? 'VERSION' : '版本'}</span><b>{manifest.snapshotId}</b></div>
      <div><span>{en ? 'SHOT SHA-256' : '炮次 SHA-256'}</span><b>{selectedManifestShot ? `${shortHash(selectedManifestShot.contentSha256)}…` : '—'}</b></div>
      <strong><i /> {en ? 'SNAPSHOT · NOT LIVE' : '固定快照 · 非实时'}</strong>
    </div>

    <div className="fusionWorkspaceGrid">
      <aside className="fusionShotRail">
        <div className="fusionPanelHeading"><div><span>01</span><h2>{en ? 'Published shots' : '已发布炮次'}</h2></div><small>{filteredShots.length}/{manifest.shots.length}</small></div>
        <label className="fusionShotSearch"><span className="srOnly">{en ? 'Filter shots or datasets' : '筛选炮次或数据集'}</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={en ? 'Shot or IDS…' : '炮号或 IDS…'} /></label>
        <label className="fusionCampaignFilter"><span>{en ? 'Experiment batch (log date)' : '实验批次（日志日期）'}</span><select value={campaign} onChange={(event) => setCampaign(event.target.value)}><option value="all">{en ? 'All shots' : '全部炮次'}</option>{[...new Set(manifest.shots.flatMap(({ campaignDate }) => campaignDate ? [campaignDate] : []))].sort().reverse().map((date) => <option key={date} value={date}>{date}</option>)}<option value="previous">{en ? 'Previous snapshot' : '原有快照'}</option></select></label>
        <div className="fusionShotList">
          {filteredShots.map((record) => <div className="fusionShotRow" key={record.pulse}>
            <button className="fusionShotSelect" type="button" aria-pressed={record.pulse === selectedPulse} onClick={() => selectShot(record.pulse)}>
              <span className="fusionQuality fusionQuality--unknown" aria-hidden="true" />
              <span><b>EXL #{record.pulse}</b><small>{record.signalCount} {en ? 'signals' : '条信号'} · {record.campaignDate?.slice(5) ?? (en ? 'previous' : '原有')}</small>{record.missingDataItems?.includes('equilibrium') && <small>{en ? 'Equilibrium unavailable' : '缺少平衡重建'}</small>}</span>
              <em>{record.campaignDate ? 'H5' : 'MDS'}</em>
            </button>
            <button className="fusionCompareButton" type="button" disabled={record.pulse === selectedPulse} aria-pressed={record.pulse === comparePulse} aria-label={en ? `Compare shot ${record.pulse}` : `对比炮 ${record.pulse}`} onClick={() => setComparePulse((current) => current === record.pulse ? null : record.pulse)}>{record.pulse === comparePulse ? '−' : '+'}</button>
          </div>)}
        </div>
        {filteredShots.length === 0 && <p className="fusionLoadNotice">{en ? 'No matching shots. Change the filter.' : '没有匹配的炮次，请调整筛选条件。'}</p>}
        <div className="fusionRailNote"><b>{en ? 'PUBLIC SNAPSHOT BOUNDARY' : '公开快照边界'}</b><p>{en ? 'The browser never connects to the internal archive. Nulls are preserved; no interpolation, quality inference, or peak claim is added.' : '浏览器不连接内网档案。缺失值保持为 null；不插值、不推断质量、不声称权威峰值。'}</p></div>
      </aside>

      <div className="fusionMainPanels">
        {!shot || !selectedSignal ? <><LoadingState en={en} error={primary.error} />{primary.error && <button className="fusionRetry" type="button" onClick={primary.retry}>{en ? 'Retry selected shot' : '重试当前炮次'}</button>}</> : <>
        <div className="fusionShotHeader">
          <div><span>EXL-50U · {en ? 'facility record' : '装置记录'}</span><h2>Shot {shot.pulse}{compareShot && <em>vs {compareShot.pulse}</em>}</h2></div>
          <dl>
            <div><dt>{en ? 'signals' : '信号'}</dt><dd>{shot.signals.length}</dd></div>
            <div><dt>{en ? 'snapshot' : '快照'}</dt><dd>{manifest.snapshotId.split('-').at(-1)}</dd></div>
            <div><dt>{en ? 'generated' : '生成'}</dt><dd>{formatSnapshotDate(manifest.generatedAt, en)}</dd></div>
          </dl>
        </div>
        {comparePulse !== null && !compareShot && <div className="fusionLoadNotice" role="status">{comparison.error ? `${en ? 'Comparison failed' : '对比炮加载失败'} #${comparePulse}: ${comparison.error}` : `${en ? 'Loading comparison' : '正在加载对比炮'} #${comparePulse}`}{comparison.error && <button type="button" onClick={comparison.retry}>{en ? 'Retry' : '重试'}</button>}</div>}
        <nav className="fusionSignalGroups" aria-label={en ? 'Signal group' : '信号分组'}>{(['diagnostics', 'equilibrium'] as const).map((group) => <button type="button" key={group} aria-pressed={signalGroup === group} onClick={() => { setSignalGroup(group); setSelectedSignalId(group === 'equilibrium' ? 'magnetic-axis-r' : 'plasma-current'); setSelectedTime(.3); }}>{group === 'diagnostics' ? (en ? 'Currents & probe' : '电流与探针') : (en ? 'Equilibrium reconstruction' : '平衡重建')}</button>)}</nav>

        <article className="fusionPanel fusionPulsePanel">
          <div className="fusionPanelHeading"><div><span>02</span><h2>{signalGroup === 'equilibrium' ? (en ? 'Reconstructed time series' : '平衡重建时序') : (en ? 'Measured time series' : '实测时序')}</h2></div><small>{compareShot ? (en ? `solid #${shot.pulse} · dotted #${compareShot.pulse}` : `实线 #${shot.pulse} · 点线 #${compareShot.pulse}`) : (en ? 'shared physical time · no interpolation' : '共享物理时间 · 未插值')}</small></div>
          {visibleSignals.length === 0 ? <div className="fusionLoadNotice">{selectedManifestShot?.missingDataItems?.includes('equilibrium') ? (en ? 'No recommended equilibrium dataset was available in the captured catalog for this shot.' : '该炮的已下载目录中没有可用的推荐平衡数据集。') : (en ? 'Equilibrium was not exported in this earlier snapshot.' : '该原有快照未导出平衡重建数据。')}{en ? ' No substituted curves are displayed.' : ' 不以其他炮或合成曲线替代。'}</div> : <ScientificChart
            id="fusion-real-discharge-overview"
            option={pulseOption}
            ariaLabel={en ? 'EXL-50U signals using independent sampled time bases' : '使用各自采样时间基的 EXL-50U 实际信号'}
            fallbackSrc=""
            fallbackAlt=""
            height={visibleSignals.length * 110 + 55}
            eager
            onChartClick={handleChartClick}
            keepFallbackAccessible
            fallback={<table><caption>{en ? 'Nearest published samples' : '最近发布样本'}</caption><thead><tr><th>{en ? 'Signal' : '信号'}</th><th>{en ? 'Time' : '时间'}</th><th>{en ? 'Value' : '值'}</th></tr></thead><tbody>{shot.signals.map((signal) => { const sample = nearestSample(signal, selectedTime); return <tr key={signal.id}><th>{en ? signal.labelEn : signal.label}</th><td>{sample?.[0].toFixed(6) ?? '—'} s</td><td>{formatValue(sample?.[1] ?? null, locale)} {signal.unit}</td></tr>; })}</tbody></table>}
          />}
          <nav className="fusionCoverageTrack" aria-label={en ? 'Signal acquisition windows' : '信号采集时窗'}><span>{en ? 'WINDOWS' : '时窗'}</span>{shot.signals.map((signal) => <button type="button" key={signal.id} aria-pressed={signal.id === selectedSignal.id} onClick={() => setSelectedSignalId(signal.id)}><b>{en ? signal.labelEn : signal.label}</b><time>{signal.sampling.timeRange[0].toFixed(3)} → {signal.sampling.timeRange[1].toFixed(3)} s</time></button>)}</nav>
        </article>

        <div className="fusionAnalysisGrid">
          <article className="fusionPanel">
            <div className="fusionPanelHeading"><div><span>03</span><h2>{en ? 'Dataset identity' : '数据集身份'}</h2></div><small>IDS / occurrence / run</small></div>
            <div className="fusionDatasetCards">{shot.signals.map((signal) => <button type="button" key={signal.id} aria-pressed={signal.id === selectedSignal.id} onClick={() => setSelectedSignalId(signal.id)}><i style={{ background: signal.color }} /><span><b>{en ? signal.labelEn : signal.label}</b><small>{signal.dataset.id}</small></span><em>{signal.unit}</em></button>)}</div>
          </article>
          <article className="fusionPanel">
            <div className="fusionPanelHeading"><div><span>04</span><h2>{en ? 'Sampling disclosure' : '采样披露'}</h2></div><small>{en ? 'source → published' : '源数据 → 发布快照'}</small></div>
            <div className="fusionSamplingTable"><table><thead><tr><th>{en ? 'Signal' : '信号'}</th><th>{en ? 'source' : '原始'}</th><th>{en ? 'published' : '发布'}</th><th>{en ? 'missing' : '缺失'}</th></tr></thead><tbody>{shot.signals.map((signal) => <tr key={signal.id}><th>{en ? signal.labelEn : signal.label}</th><td>{signal.sampling.sourcePoints.toLocaleString()}</td><td>{signal.sampling.publishedPoints.toLocaleString()}</td><td>{signal.sampling.missingValues}</td></tr>)}</tbody></table><p>{offline ? (en ? 'Offline source-index subsampling (up to 800 points), preserving gap boundaries. Peaks may be omitted.' : '离线按源索引抽样（每条最多 800 点），保留缺失边界。可能遗漏峰值。') : (en ? 'Read-only gateway downsampling.' : '只读网关降采样。')}{en ? ' Independent clocks, no interpolation; outside coverage shows no value.' : ' 独立时间基、不插值；超出采集时窗不显示数值。'}</p></div>
          </article>
        </div>

        <article className="fusionPanel">
          <div className="fusionPanelHeading"><div><span>05</span><h2>{en ? 'Products not included' : '本快照未包含的产品'}</h2></div><small>{en ? 'fail closed' : '缺失即停用'}</small></div>
          <div className="fusionUnavailableGrid">
            {[
              [en ? '2D equilibrium / LCFS' : '二维位形 / LCFS', 'equilibrium.profiles_2d'],
              [en ? 'Controller targets / actions' : '控制目标 / 控制动作', 'controller'],
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
        </>}
      </div>

      {shot && selectedSignal && <aside className="fusionInspector">
        <div className="fusionPanelHeading"><div><span>06</span><h2>{en ? 'Evidence inspector' : '证据检查器'}</h2></div><small>{selectedTime.toFixed(3)} s</small></div>
        <section><span>{en ? 'SHOT IDENTITY' : '炮次身份'}</span><dl><div><dt>facility</dt><dd>{shot.facility}</dd></div><div><dt>pulse</dt><dd>{shot.pulse}</dd></div><div><dt>snapshot</dt><dd>{shot.snapshotId}</dd></div><div><dt>state</dt><dd><b className="fusionBadge">not live</b></dd></div></dl></section>
        <section className="fusionIdsBrowser"><span>{en ? 'PUBLISHED SIGNALS' : '已发布信号'}</span><div>{shot.signals.map((signal) => <button type="button" key={signal.id} aria-pressed={signal.id === selectedSignal.id} onClick={() => setSelectedSignalId(signal.id)}><b>{en ? signal.labelEn : signal.label}</b><small>{signal.path}</small></button>)}</div></section>
        <section><span>{en ? 'NEAREST SAMPLE' : '最近样本'}</span><dl><div><dt>{en ? 'name' : '名称'}</dt><dd>{en ? selectedSignal.labelEn : selectedSignal.label}</dd></div><div><dt>{en ? 'value' : '值'}</dt><dd>{formatValue(selectedSample?.[1] ?? null, locale)} {selectedSignal.unit}</dd></div><div><dt>{en ? 'sample time' : '样本时间'}</dt><dd>{selectedSample?.[0].toFixed(6) ?? '—'} s</dd></div><div><dt>Δt</dt><dd>{selectedTimeDelta === null ? '—' : `${selectedTimeDelta >= 0 ? '+' : ''}${selectedTimeDelta.toFixed(6)} s`}</dd></div><div><dt>{en ? 'quality' : '质量'}</dt><dd>{en ? 'Unknown · quality bits not included' : '未知 · 快照未纳入质量位'}</dd></div></dl></section>
        <section><span>{en ? 'TRACE' : '溯源'}</span><dl><div><dt>dataset_id</dt><dd>{selectedSignal.dataset.id}</dd></div><div><dt>IDS</dt><dd>{selectedSignal.dataset.idsName}</dd></div><div><dt>occ / run</dt><dd>{selectedSignal.dataset.occurrence} / {selectedSignal.dataset.run}</dd></div><div><dt>signal</dt><dd>{selectedSignal.path}</dd></div><div><dt>unit</dt><dd>{selectedSignal.unit}</dd></div><div><dt>{en ? 'points' : '点数'}</dt><dd>{selectedSignal.sampling.sourcePoints.toLocaleString()} → {selectedSignal.sampling.publishedPoints.toLocaleString()}</dd></div><div><dt>sample SHA</dt><dd>{shortHash(selectedSignal.sampleSha256)}…</dd></div></dl></section>
        {selectedSignal.origin && <section><span>{en ? 'SOURCE H5' : '源 H5'}</span><dl><div><dt>SHA-256</dt><dd>{selectedSignal.origin.h5Sha256}</dd></div><div><dt>field</dt><dd>{selectedSignal.origin.field}</dd></div><div><dt>time field</dt><dd>{selectedSignal.origin.timeField} (s)</dd></div><div><dt>index</dt><dd>{selectedSignal.origin.channelIndex ?? '—'}</dd></div></dl></section>}
        <section><span>{en ? 'PROVENANCE' : '血缘'}</span><ol><li><b>01</b>{en ? 'Authoritative IMAS H5 dataset' : '权威 IMAS H5 数据集'}</li><li><b>02</b>{projectionLabel}</li><li><b>03</b>{en ? 'Allowlisted, hashed public snapshot' : '白名单导出与哈希校验的公开快照'}</li></ol></section>
        <section className="fusionReferenceLinks"><span>{en ? 'DOWNLOAD / CONTRACT' : '下载 / 合同'}</span><a href={`/data/exl50u-mdsplus-snapshot-v1/${selectedManifestShot?.path}`} download>{en ? 'Reviewed raw-gzip shot ↓' : '已审核原始 gzip 炮次包 ↓'}</a><a href={SNAPSHOT_MANIFEST_URL} target="_blank" rel="noreferrer">manifest.json ↗</a></section>
      </aside>}
    </div>
  </section>;
}
