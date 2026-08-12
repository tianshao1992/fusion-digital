'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  diagnosticsDeviceProfiles,
  diagnosticsResearchItems,
  diagnosticsTaskMeta,
  type DiagnosticsCodeStatus,
  type DiagnosticsDeploymentLevel,
  type DiagnosticsEvidenceLevel,
  type DiagnosticsTaskId,
  type DiagnosticsTechniqueFamily,
} from './diagnosticsResearch';
import {
  defaultDiagnosticsCatalogState,
  defaultDiagnosticsFilters,
  diagnosticsCodeStatuses,
  diagnosticsDeploymentLevels,
  diagnosticsDeviceNames,
  diagnosticsEvidenceLevels,
  diagnosticsTaskIds,
  diagnosticsTechniqueFamilies,
  parseDiagnosticsCatalogState,
  serializeDiagnosticsCatalogState,
  type DiagnosticsCatalogState,
  type DiagnosticsFilterState,
} from './diagnosticsFilters';

const taskIds = diagnosticsTaskIds;
const techniqueFamilies = diagnosticsTechniqueFamilies;
const evidenceLevels = diagnosticsEvidenceLevels;
const deploymentLevels = diagnosticsDeploymentLevels;
const codeStatuses = diagnosticsCodeStatuses;

const techniqueLabels: Record<DiagnosticsTechniqueFamily, string> = {
  MAGNETIC: '磁 / 感应',
  MICROWAVE: '微波 / 毫米波',
  LASER: '激光 / 散射 / 干涉',
  OPTICAL: '光学 / 光谱 / 成像',
  NUCLEAR_PARTICLE: '核与粒子',
  PROBE_SAMPLING: '探针 / 采样',
  ENGINEERING_SENSOR: '工程传感',
  COMPUTATIONAL: '计算 / 反演 / AI',
};

const evidenceLabels: Record<DiagnosticsEvidenceLevel, string> = {
  E0: '需求 / 概念', E1: '数值 / 合成', E2: '实验室 / 标定', E3: '装置数据 / 交叉验证', E4: '在线 / 常规使用',
};

const deploymentLabels: Record<DiagnosticsDeploymentLevel, string> = {
  D1: '概念 / 需求', D2: '软件 / 实验室原型', D3: '安装 / 联调 / 影子 / HIL', D4: '常规装置工作流', D5: '安全关键批准',
};

const codeStatusLabels: Record<DiagnosticsCodeStatus, string> = {
  'official-direct': '官方直接实现',
  'official-enabling': '官方使能工具',
  'community-reproduction': '社区复现',
  'controlled-access': '受控访问',
  commercial: '商业软件',
  'not-public': '未公开',
};

type Entry = (typeof diagnosticsResearchItems)[number];
type Device = (typeof diagnosticsDeviceProfiles)[number];
type FilterState = DiagnosticsFilterState;

function externalLink(href: string | null | undefined, label: string) {
  return href ? <a href={href} target="_blank" rel="noreferrer">{label}<span aria-hidden="true"> ↗</span></a> : <b>{label}</b>;
}

function taskAssociations(item: Entry) {
  return Array.from(new Set([item.primaryTask, ...item.relatedTasks]));
}

function searchableText(item: Entry) {
  return [
    item.id, item.projectId, item.title, item.titleEn, item.technique, item.problem, item.measurementPrinciple,
    item.temporalScale, item.spatialScale, item.calibration, item.inference, item.validation, item.limitations,
    item.twinRelevance, ...item.quantities, ...item.region, ...item.hardware, ...item.organizations, ...item.tags,
    ...item.techniqueFamilies.flatMap((family) => [family, techniqueLabels[family]]),
    ...taskAssociations(item).flatMap((task) => [task, diagnosticsTaskMeta[task].label, diagnosticsTaskMeta[task].en]),
    ...item.devices.flatMap((device) => [device.name, device.fit, device.validation]),
    ...item.papers.flatMap((paper) => [paper.title, paper.authors, paper.venue, paper.doi, paper.sourceType]),
    ...item.code.flatMap((asset) => [asset.name, asset.status, asset.artifactType, asset.access, asset.relation]),
  ].filter(Boolean).join(' ').toLocaleLowerCase('zh-CN');
}

function normalizeDeviceName(value: string) {
  return value.normalize('NFKC').trim().toLocaleLowerCase('en').replace(/\s+/g, ' ');
}

function hasDevice(item: Entry, device: string) {
  const target = normalizeDeviceName(device);
  return item.devices.some((entry) => normalizeDeviceName(entry.name) === target);
}

function WorkCard({ item, ordinal }: { item: Entry; ordinal: number }) {
  const primaryMeta = diagnosticsTaskMeta[item.primaryTask];
  return (
    <article className="diagnosticsResearchCard">
      <header>
        <div><span>{String(ordinal).padStart(2, '0')}</span><b>{item.id}</b><i>{item.primaryTask}</i></div>
        <div><span className={`diagnosticsBadge evidence-${item.evidenceLevel.toLowerCase()}`}>{item.evidenceLevel} · {evidenceLabels[item.evidenceLevel]}</span><span className="diagnosticsBadge">{item.deploymentLevel} · {deploymentLabels[item.deploymentLevel]}</span></div>
      </header>
      <div className="diagnosticsIdentity">
        <p>{primaryMeta.label} · {item.techniqueFamilies.map((family) => techniqueLabels[family]).join(' · ')}</p>
        <h3>{item.title}</h3>
        <small>{item.titleEn}</small>
        <div>{item.devices.slice(0, 6).map((device) => <span key={device.name}>{device.name}</span>)}</div>
      </div>
      <dl className="diagnosticsCardCore">
        <div><dt>解决问题</dt><dd>{item.problem}</dd></div>
        <div><dt>测量 / 推断路径</dt><dd>{item.measurementPrinciple}</dd></div>
        <div><dt>验证证据</dt><dd>{item.validation}</dd></div>
        <div><dt>数字孪生接口</dt><dd>{item.twinRelevance}</dd></div>
      </dl>
      <details>
        <summary>论文、代码、标定与局限</summary>
        <div className="diagnosticsDetailGrid">
          <section><h4>论文与原始来源</h4><ul>{item.papers.map((paper, index) => <li key={`${paper.title}-${index}`}>{externalLink(paper.url, paper.title)}<span>{paper.authors} · {paper.year} · {paper.venue}</span>{paper.doi && <small>DOI {paper.doi}</small>}</li>)}</ul></section>
          <section><h4>代码 / 软件关系</h4><ul>{item.code.map((asset, index) => <li key={`${asset.name}-${index}`}>{externalLink(asset.url, asset.name)}<span className={`code-${asset.status}`}>{codeStatusLabels[asset.status]}</span><small>{asset.relation}</small></li>)}</ul></section>
          <section><h4>计量与推断</h4><b>标定 / 漂移</b><p>{item.calibration}</p><b>反演 / 计算</b><p>{item.inference}</p><b>时空尺度</b><p>{item.temporalScale}；{item.spatialScale}</p></section>
          <section><h4>适用域与边界</h4><b>被测量</b><p>{item.quantities.join(' · ')}</p><b>硬件</b><p>{item.hardware.join(' · ')}</p><b>局限</b><p>{item.limitations}</p></section>
        </div>
      </details>
    </article>
  );
}

function DeviceCard({ device }: { device: Device }) {
  return (
    <article className="diagnosticsDeviceCard">
      <header><span>{device.countryOrRegion}</span><b>{device.type}</b></header>
      <h3>{device.name}</h3><p className="diagnosticsDeviceOrg">{device.operator}</p>
      <span className="diagnosticsDeviceStatus">{device.status}</span>
      <p className="diagnosticsDeviceSummary">{device.diagnosticSummary}</p>
      <div className="diagnosticsDeviceTasks">{device.primaryTasks.map((task) => <span key={task}>{task}</span>)}</div>
      <dl><div><dt>代表工作</dt><dd>{device.representativeWorkSummaries.join('；')}</dd></div><div><dt>实时接口</dt><dd>{device.realTimeInterfaces.join('；')}</dd></div><div><dt>数据平台</dt><dd>{device.dataPlatform.join('；')}</dd></div></dl>
      <details><summary>展开论文、软件与局限</summary><div className="diagnosticsDeviceDetails"><h4>论文 / 来源</h4><ul>{device.papers.map((paper, index) => <li key={`${paper.title}-${index}`}>{externalLink(paper.url, paper.title)}<span>{paper.year} · {paper.venue}</span></li>)}</ul><h4>代码 / 平台</h4><ul>{device.code.map((asset, index) => <li key={`${asset.name}-${index}`}>{externalLink(asset.url, asset.name)}<span>{codeStatusLabels[asset.status]} · {asset.relation}</span></li>)}</ul><h4>阅读边界</h4><ul>{device.limitations.map((limit) => <li key={limit}>{limit}</li>)}</ul></div></details>
    </article>
  );
}

export default function DiagnosticsResearchCatalog({ initialState = defaultDiagnosticsCatalogState }: { initialState?: DiagnosticsCatalogState }) {
  const [query, setQuery] = useState(initialState.query);
  const [filters, setFilters] = useState<FilterState>(initialState.filters);
  const [page, setPage] = useState(initialState.page);
  const [deviceQuery, setDeviceQuery] = useState('');
  const [deviceTask, setDeviceTask] = useState<'all' | DiagnosticsTaskId>('all');
  const pageSize = 12;

  useEffect(() => {
    const restoreFromHistory = () => {
      const next = parseDiagnosticsCatalogState(new URLSearchParams(window.location.search));
      setQuery(next.query);
      setFilters(next.filters);
      setPage(next.page);
    };
    window.addEventListener('popstate', restoreFromHistory);
    return () => window.removeEventListener('popstate', restoreFromHistory);
  }, []);

  const taskCounts = useMemo(() => Object.fromEntries(taskIds.map((task) => [task, diagnosticsResearchItems.filter((item) => taskAssociations(item).includes(task)).length])) as Record<DiagnosticsTaskId, number>, []);
  const deviceNames = diagnosticsDeviceNames;
  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN');
    return diagnosticsResearchItems.filter((item) => {
      if (filters.task !== 'all' && !taskAssociations(item).includes(filters.task)) return false;
      if (filters.technique !== 'all' && !(item.techniqueFamilies as readonly DiagnosticsTechniqueFamily[]).includes(filters.technique)) return false;
      if (filters.device !== 'all' && !hasDevice(item, filters.device)) return false;
      if (filters.evidence !== 'all' && item.evidenceLevel !== filters.evidence) return false;
      if (filters.deployment !== 'all' && item.deploymentLevel !== filters.deployment) return false;
      if (filters.code !== 'all' && !item.code.some((asset) => asset.status === filters.code)) return false;
      return !normalizedQuery || searchableText(item).includes(normalizedQuery);
    });
  }, [query, filters]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  useEffect(() => {
    const params = serializeDiagnosticsCatalogState({ query, filters, page: currentPage });
    const next = `${window.location.pathname}${params.size ? `?${params}` : ''}${window.location.hash}`;
    window.history.replaceState(window.history.state, '', next);
  }, [query, filters, currentPage]);
  const filteredDevices = useMemo(() => {
    const normalized = deviceQuery.trim().toLocaleLowerCase('zh-CN');
    return diagnosticsDeviceProfiles.filter((device) => {
      if (deviceTask !== 'all' && !(device.primaryTasks as readonly DiagnosticsTaskId[]).includes(deviceTask)) return false;
      return !normalized || [device.name, device.countryOrRegion, device.operator, device.type, device.status, device.diagnosticSummary, ...device.representativeWorkSummaries, ...device.sensors].join(' ').toLocaleLowerCase('zh-CN').includes(normalized);
    });
  }, [deviceQuery, deviceTask]);

  const updateFilter = <K extends keyof FilterState>(key: K, value: FilterState[K]) => { setFilters((current) => ({ ...current, [key]: value })); setPage(1); };
  const reset = () => { setQuery(''); setFilters(defaultDiagnosticsFilters); setPage(1); };

  return (
    <div className="diagnosticsCatalog">
      <div className="diagnosticsCatalogToolbar" aria-label="诊断研究目录筛选器">
        <label className="diagnosticsSearch"><span>检索问题、仪器、装置、被测量、论文或代码</span><input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="例如：Thomson、EAST、中子谱、标定、IMAS……" /></label>
        <fieldset className="diagnosticsTaskFilters"><legend>DG0–DG11 任务（计入主任务与关联任务）</legend><button type="button" className={filters.task === 'all' ? 'active' : ''} aria-pressed={filters.task === 'all'} onClick={() => updateFilter('task', 'all')}>全部 <b>{diagnosticsResearchItems.length}</b></button>{taskIds.map((task) => <button type="button" className={filters.task === task ? 'active' : ''} aria-pressed={filters.task === task} onClick={() => updateFilter('task', task)} title={diagnosticsTaskMeta[task].label} key={task}>{task} <b>{taskCounts[task]}</b></button>)}</fieldset>
        <div className="diagnosticsSelects">
          <label><span>技术族</span><select value={filters.technique} onChange={(event) => updateFilter('technique', event.target.value as FilterState['technique'])}><option value="all">全部技术族</option>{techniqueFamilies.map((family) => <option value={family} key={family}>{techniqueLabels[family]}</option>)}</select></label>
          <label><span>适配 / 验证装置</span><select value={filters.device} onChange={(event) => updateFilter('device', event.target.value)}><option value="all">全部装置</option>{deviceNames.map((device) => <option value={device} key={device}>{device}</option>)}</select></label>
          <label><span>科学证据 E</span><select value={filters.evidence} onChange={(event) => updateFilter('evidence', event.target.value as FilterState['evidence'])}><option value="all">全部证据</option>{evidenceLevels.map((level) => <option value={level} key={level}>{level} · {evidenceLabels[level]}</option>)}</select></label>
          <label><span>部署责任 D</span><select value={filters.deployment} onChange={(event) => updateFilter('deployment', event.target.value as FilterState['deployment'])}><option value="all">全部部署等级</option>{deploymentLevels.map((level) => <option value={level} key={level}>{level} · {deploymentLabels[level]}</option>)}</select></label>
          <label><span>代码关系</span><select value={filters.code} onChange={(event) => updateFilter('code', event.target.value as FilterState['code'])}><option value="all">全部代码状态</option>{codeStatuses.map((status) => <option value={status} key={status}>{codeStatusLabels[status]}</option>)}</select></label>
          <button className="diagnosticsReset" type="button" onClick={reset}>清除筛选</button>
        </div>
      </div>
      <div className="diagnosticsResultBar" aria-live="polite"><p>显示 <strong>{filtered.length}</strong> / {diagnosticsResearchItems.length} 项工作</p><span>第 {currentPage} / {pageCount} 页 · 每页 {pageSize} 项</span></div>
      {visible.length > 0 ? <div className="diagnosticsCards">{visible.map((item, index) => <WorkCard item={item} ordinal={(currentPage - 1) * pageSize + index + 1} key={item.id} />)}</div> : <div className="diagnosticsEmpty"><h3>没有符合条件的工作</h3><p>尝试减少筛选条件，或清除筛选重新浏览。</p><button type="button" onClick={reset}>清除筛选</button></div>}
      {pageCount > 1 && <nav className="diagnosticsPagination" aria-label="研究目录分页"><button type="button" disabled={currentPage === 1} onClick={() => setPage(Math.max(1, currentPage - 1))}>上一页</button>{Array.from({ length: pageCount }, (_, index) => index + 1).map((value) => <button type="button" className={currentPage === value ? 'active' : ''} aria-current={currentPage === value ? 'page' : undefined} onClick={() => setPage(value)} key={value}>{value}</button>)}<button type="button" disabled={currentPage === pageCount} onClick={() => setPage(Math.min(pageCount, currentPage + 1))}>下一页</button></nav>}

      <section className="diagnosticsDeviceExplorer" id="devices">
        <div className="diagnosticsSectionHead"><p className="diagnosticsIndex">DEVICE VIEW</p><h2>从装置反查诊断能力、代表工作、实时接口与公开边界。</h2><p>装置档案用于定位证据，不声称每套系统在所有实验周期同时可用。请展开卡片回到论文、数据平台或软件关系。</p></div>
        <div className="diagnosticsDeviceToolbar"><label><span>检索装置、机构、传感器或平台</span><input type="search" value={deviceQuery} onChange={(event) => setDeviceQuery(event.target.value)} placeholder="例如：EXL-50U、W7-X、红外、MDSplus……" /></label><label><span>按任务筛选</span><select value={deviceTask} onChange={(event) => setDeviceTask(event.target.value as 'all' | DiagnosticsTaskId)}><option value="all">全部任务</option>{taskIds.map((task) => <option value={task} key={task}>{task} · {diagnosticsTaskMeta[task].label}</option>)}</select></label><strong>{filteredDevices.length} / {diagnosticsDeviceProfiles.length} 个装置</strong></div>
        <div className="diagnosticsDeviceGrid">{filteredDevices.map((device) => <DeviceCard device={device} key={device.id} />)}</div>
      </section>
    </div>
  );
}
