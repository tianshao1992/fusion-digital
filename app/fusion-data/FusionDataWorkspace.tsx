'use client';

import type { EChartsCoreOption } from 'echarts/core';
import { useMemo, useState } from 'react';
import ScientificChart from '../components/charts/ScientificChart';
import { useChartTheme } from '../components/charts/chart-theme';
import { useI18n } from '../i18n';
import { EquilibriumChart, QualityHeatmap, RadialProfileChart } from './FusionDataCharts';
import ParaViewEmbed from './ParaViewEmbed';
import { mockFusionShots } from './mockFusionData';

type FusionDataWorkspaceProps = {
  paraViewUrl: string | null;
};

type ChartClick = {
  value?: unknown;
};

function nearestIndex(times: number[], target: number) {
  return times.reduce((best, time, index) => Math.abs(time - target) < Math.abs(times[best] - target) ? index : best, 0);
}

export default function FusionDataWorkspace({ paraViewUrl }: FusionDataWorkspaceProps) {
  const { locale } = useI18n();
  const en = locale === 'en';
  const palette = useChartTheme();
  const [search, setSearch] = useState('');
  const [selectedShotId, setSelectedShotId] = useState(mockFusionShots[0].summary.id);
  const [compareShotId, setCompareShotId] = useState<string | null>(mockFusionShots[1].summary.id);
  const [selectedSignalId, setSelectedSignalId] = useState('ip');
  const [selectedIndex, setSelectedIndex] = useState(28);
  const filteredShots = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return mockFusionShots.filter(({ summary }) => !needle || `${summary.id} ${summary.scenario} ${summary.scenarioEn} ${summary.tags.join(' ')}`.toLowerCase().includes(needle));
  }, [search]);
  const shot = mockFusionShots.find(({ summary }) => summary.id === selectedShotId) ?? mockFusionShots[0];
  const compareShot = mockFusionShots.find(({ summary }) => summary.id === compareShotId && summary.id !== shot.summary.id) ?? null;
  const times = shot.signals[0].points.map(({ time }) => time);
  const selectedTime = times[Math.min(selectedIndex, times.length - 1)];
  const selectedSignal = shot.signals.find(({ id }) => id === selectedSignalId) ?? shot.signals[0];
  const selectedPoint = selectedSignal.points[Math.min(selectedIndex, selectedSignal.points.length - 1)];

  const pulseOption = useMemo<EChartsCoreOption>(() => {
    const grid = shot.signals.map((_, index) => ({ left: 64, right: 24, top: 22 + index * 76, height: 48 }));
    const xAxis = shot.signals.map((_, index) => ({
      type: 'value', min: 0, max: shot.summary.duration, gridIndex: index,
      axisLabel: { show: index === shot.signals.length - 1, formatter: '{value} s' },
      axisTick: { show: index === shot.signals.length - 1 },
      splitLine: { show: true },
    }));
    const yAxis = shot.signals.map((signal, index) => ({
      type: 'value', gridIndex: index, scale: true, name: `${en ? signal.labelEn : signal.label}\n${signal.unit}`,
      nameLocation: 'middle', nameGap: 43, nameTextStyle: { fontSize: 9, lineHeight: 13 },
      axisLabel: { fontSize: 9 }, splitNumber: 2,
    }));
    const primarySeries = shot.signals.map((signal, index) => ({
      id: `${shot.summary.id}-${signal.id}`,
      name: `${shot.summary.id} · ${en ? signal.labelEn : signal.label}`,
      type: 'line', xAxisIndex: index, yAxisIndex: index,
      data: signal.points.map((point) => [point.time, point.value]),
      showSymbol: false, connectNulls: false, smooth: false, sampling: 'lttb',
      lineStyle: { width: signal.authority === 'reconstructed' ? 1.8 : 2.2, type: signal.authority === 'reconstructed' ? 'dashed' : 'solid', color: signal.color },
      itemStyle: { color: signal.color },
      markLine: { silent: true, symbol: 'none', label: { show: index === 0, formatter: `${selectedTime.toFixed(2)} s` }, lineStyle: { color: palette.accent, width: 1 }, data: [{ xAxis: selectedTime }] },
    }));
    const comparisonSeries = compareShot?.signals.map((signal, index) => ({
      id: `${compareShot.summary.id}-${signal.id}`,
      name: `${compareShot.summary.id} · ${en ? signal.labelEn : signal.label}`,
      type: 'line', xAxisIndex: index, yAxisIndex: index,
      data: signal.points.map((point) => [point.time, point.value]),
      showSymbol: false, connectNulls: false, smooth: false, sampling: 'lttb',
      lineStyle: { width: 1.25, type: 'dotted', color: signal.color, opacity: 0.62 },
      itemStyle: { color: signal.color, opacity: 0.62 },
    })) ?? [];
    return {
      aria: { enabled: true, decal: { show: true } },
      animationDuration: 280,
      axisPointer: { link: [{ xAxisIndex: 'all' }], label: { show: true, precision: 2 } },
      tooltip: { trigger: 'axis', confine: true, valueFormatter: (value: unknown) => typeof value === 'number' ? value.toFixed(3) : String(value ?? '—') },
      grid, xAxis, yAxis,
      dataZoom: [
        { type: 'inside', xAxisIndex: [0, 1, 2, 3], filterMode: 'none' },
        { type: 'slider', xAxisIndex: [0, 1, 2, 3], bottom: 4, height: 18, borderColor: palette.line, fillerColor: palette.infoSoft },
      ],
      series: [...comparisonSeries, ...primarySeries],
    };
  }, [compareShot, en, palette, selectedTime, shot]);

  function handleChartClick(params: unknown) {
    const value = (params as ChartClick).value;
    if (!Array.isArray(value)) return;
    const time = Number(value[0]);
    if (Number.isFinite(time)) setSelectedIndex(nearestIndex(times, time));
  }

  return <section className="fusionWorkspace" aria-label={en ? 'Fusion data workspace' : '聚变数据工作台'}>
    <div className="fusionWorkspaceToolbar">
      <div><span>{en ? 'SOURCE' : '数据源'}</span><b>MockFusionDataProvider</b></div>
      <div><span>IMAS DD</span><b>4.1.0 · mapping-preview</b></div>
      <div><span>{en ? 'VIEWER' : '查看器'}</span><b>{paraViewUrl ? 'trame · configured' : 'trame · disconnected'}</b></div>
      <strong><i /> {en ? 'SYNTHETIC DATA ONLY' : '仅合成模拟数据'}</strong>
    </div>
    <div className="fusionWorkspaceGrid">
      <aside className="fusionShotRail">
        <div className="fusionPanelHeading"><div><span>01</span><h2>{en ? 'Shots' : '炮次'}</h2></div><small>{filteredShots.length}/{mockFusionShots.length}</small></div>
        <label className="fusionShotSearch"><span className="srOnly">{en ? 'Search synthetic shots' : '搜索模拟炮次'}</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={en ? 'Filter shots, tags…' : '筛选炮次、标签…'} /></label>
        <div className="fusionShotList">
          {filteredShots.map(({ summary }) => <div className="fusionShotRow" key={summary.id}>
            <button className="fusionShotSelect" type="button" aria-pressed={summary.id === shot.summary.id} onClick={() => { setSelectedShotId(summary.id); setSelectedIndex(28); setSelectedSignalId('ip'); if (compareShotId === summary.id) setCompareShotId(null); }}>
              <span className={`fusionQuality fusionQuality--${summary.quality}`} aria-hidden="true" />
              <span><b>{summary.id}</b><small>{en ? summary.scenarioEn : summary.scenario}</small></span>
              <em>r{summary.run}</em>
            </button>
            <button className="fusionCompareButton" type="button" disabled={summary.id === shot.summary.id} aria-pressed={summary.id === compareShot?.summary.id} aria-label={en ? `Compare ${summary.id}` : `对比 ${summary.id}`} title={en ? 'Pin as comparison shot' : '设为对比炮次'} onClick={() => setCompareShotId((current) => current === summary.id ? null : summary.id)}>{summary.id === compareShot?.summary.id ? '−' : '+'}</button>
          </div>)}
        </div>
        <div className="fusionRailNote"><b>MOCK / SYNTHETIC</b><p>{en ? 'Deterministic fixtures for UI development. They are not ITER or facility observations.' : '用于界面开发的确定性测试数据，不是 ITER 或装置实验观测。'}</p></div>
      </aside>

      <div className="fusionMainPanels">
        <div className="fusionShotHeader">
          <div><span>{shot.summary.facility}</span><h2>{shot.summary.id} <b>{en ? shot.summary.scenarioEn : shot.summary.scenario}</b>{compareShot && <em>vs {compareShot.summary.id}</em>}</h2></div>
          <dl><div><dt>{en ? 'pulse / run' : '炮号 / 运行'}</dt><dd>{shot.summary.pulse} / {shot.summary.run}</dd></div><div><dt>{en ? 'peak Ip' : '峰值 Ip'}</dt><dd>{shot.summary.peakCurrent} MA</dd></div><div><dt>{en ? 'peak Pohm' : '峰值 Pohm'}</dt><dd>{shot.summary.peakHeatingPower} MW</dd></div></dl>
        </div>
        <article className="fusionPanel fusionPulsePanel">
          <div className="fusionPanelHeading"><div><span>02</span><h2>{en ? 'Discharge overview' : '放电总览'}</h2></div><small>{compareShot ? (en ? `solid ${shot.summary.id} · dotted ${compareShot.summary.id}` : `实线 ${shot.summary.id} · 点线 ${compareShot.summary.id}`) : (en ? 'linked zoom · click to seek' : '联动缩放 · 点击定位')}</small></div>
          <ScientificChart
            id="fusion-discharge-overview"
            option={pulseOption}
            ariaLabel={en ? 'Four linked synthetic discharge signals with a shared time cursor and optional shot comparison' : '四条共享时间游标并可对比炮次的合成放电信号'}
            fallbackSrc=""
            fallbackAlt=""
            height={354}
            eager
            onChartClick={handleChartClick}
            keepFallbackAccessible
            fallback={<table><caption>{en ? 'Selected synthetic signal values' : '当前合成信号值'}</caption><thead><tr><th>{en ? 'Signal' : '信号'}</th><th>{en ? 'Value' : '数值'}</th><th>{en ? 'Quality' : '质量'}</th></tr></thead><tbody>{shot.signals.map((signal) => { const point = signal.points[selectedIndex]; return <tr key={signal.id}><th>{en ? signal.labelEn : signal.label}</th><td>{point?.value ?? '—'} {signal.unit}</td><td>{point?.quality ?? 'missing'}</td></tr>; })}</tbody></table>}
          />
          <nav className="fusionEventTrack" aria-label={en ? 'Discharge events' : '放电事件'}><span>{en ? 'EVENTS' : '事件'}</span>{shot.events.map((event) => <button type="button" key={event.id} onClick={() => setSelectedIndex(nearestIndex(times, event.time))}><time>{event.time.toFixed(2)} s</time><b>{en ? event.labelEn : event.label}</b></button>)}</nav>
        </article>
        <div className="fusionAnalysisGrid">
          <article className="fusionPanel">
            <div className="fusionPanelHeading"><div><span>03</span><h2>{en ? 'Equilibrium · R–Z' : '平衡位形 · R–Z'}</h2></div><small>equilibrium / ψN / LCFS</small></div>
            <EquilibriumChart shot={shot} selectedIndex={selectedIndex} en={en} />
          </article>
          <article className="fusionPanel">
            <div className="fusionPanelHeading"><div><span>04</span><h2>{en ? 'Core profiles' : '芯部剖面'}</h2></div><small>core_profiles / ρtor,norm</small></div>
            <RadialProfileChart shot={shot} selectedIndex={selectedIndex} en={en} />
          </article>
        </div>
        <article className="fusionPanel fusionQualityPanel">
          <div className="fusionPanelHeading"><div><span>05</span><h2>{en ? 'Diagnostic quality matrix' : '诊断质量矩阵'}</h2></div><small>{en ? 'click a cell to seek' : '点击单元格定位时间'}</small></div>
          <QualityHeatmap shot={shot} selectedIndex={selectedIndex} en={en} onSeek={setSelectedIndex} />
        </article>
        <ParaViewEmbed endpoint={paraViewUrl} shot={shot} selectedIndex={selectedIndex} selectedTime={selectedTime} en={en} />
        <div className="fusionTimebar">
          <button type="button" onClick={() => setSelectedIndex((value) => Math.max(0, value - 1))} aria-label={en ? 'Previous time step' : '上一个时间步'}>‹</button>
          <output>{selectedTime.toFixed(2)} s</output>
          <input aria-label={en ? 'Shared time cursor' : '共享时间游标'} type="range" min={0} max={times.length - 1} value={selectedIndex} onChange={(event) => setSelectedIndex(Number(event.target.value))} />
          <button type="button" onClick={() => setSelectedIndex((value) => Math.min(times.length - 1, value + 1))} aria-label={en ? 'Next time step' : '下一个时间步'}>›</button>
          <span>{en ? 'nearest sample · no interpolation' : '最近采样点 · 未插值'}</span>
        </div>
      </div>

      <aside className="fusionInspector">
        <div className="fusionPanelHeading"><div><span>07</span><h2>{en ? 'Inspector' : '检查器'}</h2></div><small>{selectedTime.toFixed(2)} s</small></div>
        <section><span>{en ? 'IDENTITY' : '数据身份'}</span><dl><div><dt>facility</dt><dd>{shot.summary.facility}</dd></div><div><dt>pulse / run</dt><dd>{shot.summary.pulse} / {shot.summary.run}</dd></div><div><dt>processing run</dt><dd>{shot.summary.processingRun}</dd></div><div><dt>authority</dt><dd><b className="fusionBadge">synthetic</b></dd></div></dl></section>
        <section className="fusionIdsBrowser"><span>IMAS IDS</span><div>{shot.signals.map((signal) => <button type="button" key={signal.id} aria-pressed={signal.id === selectedSignal.id} onClick={() => setSelectedSignalId(signal.id)}><b>{signal.imas.ids}</b><small>{signal.imas.path}</small></button>)}</div></section>
        <section><span>{en ? 'SELECTED SIGNAL' : '当前信号'}</span><dl><div><dt>{en ? 'name' : '名称'}</dt><dd>{en ? selectedSignal.labelEn : selectedSignal.label}</dd></div><div><dt>{en ? 'value' : '数值'}</dt><dd>{selectedPoint.value ?? '—'} {selectedSignal.unit}</dd></div><div><dt>{en ? 'quality' : '质量'}</dt><dd>{selectedPoint.quality}</dd></div><div><dt>IDS path</dt><dd>{selectedSignal.imas.ids}/{selectedSignal.imas.path}</dd></div><div><dt>MDSplus node</dt><dd>{selectedSignal.mdsplus.node}</dd></div><div><dt>{en ? 'unit mapping' : '单位映射'}</dt><dd>{selectedSignal.sourceUnit} → {selectedSignal.unit} · ×{selectedSignal.sourceToValueScale}</dd></div><div><dt>value space</dt><dd>{selectedSignal.valueSpace}</dd></div><div><dt>authority</dt><dd>{selectedSignal.authority}</dd></div></dl></section>
        <section><span>IMAS / MDSplus</span><dl><div><dt>DD version</dt><dd>{selectedSignal.imas.ddVersion}</dd></div><div><dt>backend</dt><dd>{selectedSignal.mdsplus.gatewayAlias}</dd></div><div><dt>mapping</dt><dd>{shot.provenance.mappingVersion}</dd></div><div><dt>time mode</dt><dd>homogeneous_time = {selectedSignal.imas.homogeneousTime}</dd></div><div><dt>sampling</dt><dd>{selectedSignal.samplePolicy} · no interpolation</dd></div><div><dt>gaps</dt><dd>{selectedSignal.connectAcrossGaps ? 'connected' : 'not connected'}</dd></div></dl></section>
        <section><span>{en ? 'PROVENANCE' : '血缘'}</span><ol><li><b>01</b>{en ? 'Synthetic source fixture' : '合成源测试夹具'}</li><li><b>02</b>{en ? 'IMAS mapping preview' : 'IMAS 映射预览'}</li><li><b>03</b>{en ? 'Read-only browser projection' : '只读浏览器投影'}</li></ol></section>
        <section className="fusionReferenceLinks"><span>{en ? 'REFERENCE IMPLEMENTATION' : '参考实现'}</span><a href="https://github.com/iterorganization/IMAS-ParaView" target="_blank" rel="noreferrer">ITER IMAS-ParaView ↗</a><a href="https://imas-data-dictionary.readthedocs.io/en/latest/" target="_blank" rel="noreferrer">IMAS Data Dictionary ↗</a><a href="https://kitware.github.io/trame/" target="_blank" rel="noreferrer">Kitware trame ↗</a></section>
      </aside>
    </div>
  </section>;
}
