'use client';

import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../i18n';
import {
  controlDeviceProfiles,
  controlResearchItems,
  controlTaskMeta,
  type ControlCodeStatus,
  type ControlDeploymentLevel,
  type ControlEvidenceLevel,
  type ControlResearchItem,
  type ControlTaskId,
} from './controlResearch';

const evidenceLabels: Record<ControlEvidenceLevel, string> = {
  E0: '概念 / 需求', E1: '数值验证', E2: '装置离线', E3: '实时 / HIL / 影子', E4: '装置闭环',
};
const deploymentLabels: Record<ControlDeploymentLevel, string> = {
  D1: '研究原型', D2: '离线工作流', D3: '实时 / HIL 试点', D4: '正式在线 / 闭环', D5: '安全关键批准',
};
const codeLabels: Record<ControlCodeStatus, string> = {
  'official-direct': '官方直接实现',
  'official-enabling': '官方使能框架',
  'commercial-enabling': '商业使能软件',
  'community-reproduction': '社区复现',
  'not-public': '未公开',
};
const evidenceLabelsEn: Record<ControlEvidenceLevel, string> = {
  E0: 'Concept / requirement', E1: 'Numerical validation', E2: 'Offline facility evidence', E3: 'Real-time / HIL / shadow', E4: 'Facility closed loop',
};
const deploymentLabelsEn: Record<ControlDeploymentLevel, string> = {
  D1: 'Research prototype', D2: 'Offline workflow', D3: 'Real-time / HIL pilot', D4: 'Operational online / closed loop', D5: 'Approved safety-critical use',
};
const codeLabelsEn: Record<ControlCodeStatus, string> = {
  'official-direct': 'Official direct implementation',
  'official-enabling': 'Official enabling framework',
  'commercial-enabling': 'Commercial enabling software',
  'community-reproduction': 'Community reproduction',
  'not-public': 'Not publicly available',
};

const deviceLabelsEn: Record<string, string> = {
  'CFETR设计': 'CFETR design study',
  'DIII-D及PCS衍生装置': 'DIII-D and PCS-derived facilities',
  'ITER PCSSP模型移植': 'ITER PCSSP model port',
  'ITER设计研究': 'ITER design study',
  '可复用装置模型': 'Reusable facility model',
  '多个实验设施': 'Multiple experimental facilities',
  '多家ITER成员测试设施': 'Multiple ITER-member test facilities',
  '多装置': 'Multi-facility',
  '多装置与模拟链': 'Multi-facility and simulation chain',
  '通用tokamak': 'Generic tokamak',
};

function deviceLabelEn(value: string) {
  const canonical = value.split(/[：:]/)[0].trim();
  return deviceLabelsEn[canonical] ?? canonical;
}

const PAGE_SIZE = 12;

function normalized(value: unknown) {
  return String(value ?? '').toLocaleLowerCase('zh-CN');
}

function corpus(item: ControlResearchItem) {
  return normalized([
    item.id, item.titleZh, item.titleEn, item.organization, item.problem, item.method, item.controlArchitecture,
    item.timescale, item.sensors.join(' '), item.actuators.join(' '), item.devices.join(' '), item.validation,
    item.results, item.maturity, item.limitations, item.twinRelevance, item.tags.join(' '),
    item.papers.map((paper) => `${paper.title} ${paper.authors} ${paper.venue} ${paper.doi ?? ''}`).join(' '),
    item.code.map((code) => `${code.name} ${code.status} ${code.relationship}`).join(' '),
  ].join(' '));
}

export default function ControlResearchCatalog() {
  const { locale } = useI18n();
  const en = locale === 'en';
  const [query, setQuery] = useState('');
  const [task, setTask] = useState<'all' | ControlTaskId>('all');
  const [device, setDevice] = useState('all');
  const [evidence, setEvidence] = useState<'all' | ControlEvidenceLevel>('all');
  const [deployment, setDeployment] = useState<'all' | ControlDeploymentLevel>('all');
  const [code, setCode] = useState<'all' | ControlCodeStatus>('all');
  const [sort, setSort] = useState<'year-desc' | 'evidence-desc' | 'task'>('evidence-desc');
  const [page, setPage] = useState(0);
  const [deviceQuery, setDeviceQuery] = useState('');
  const [deviceTask, setDeviceTask] = useState<'all' | ControlTaskId>('all');

  const deviceOptions = useMemo(() => Array.from(new Set(controlResearchItems.flatMap((item) => item.devices.map((name) => name.split(/[：:]/)[0].trim())))).filter(Boolean).sort(), []);
  const taskCounts = useMemo(() => Object.fromEntries((Object.keys(controlTaskMeta) as ControlTaskId[]).map((taskId) => [taskId, controlResearchItems.filter((item) => [item.primaryTask, ...item.relatedTasks].includes(taskId)).length])) as Record<ControlTaskId, number>, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedTask = params.get('task');
    const requestedEvidence = params.get('evidence');
    const requestedDeployment = params.get('deployment');
    const validEvidence = requestedEvidence && requestedEvidence in evidenceLabels ? requestedEvidence as ControlEvidenceLevel : null;
    const validDeployment = requestedDeployment && requestedDeployment in deploymentLabels ? requestedDeployment as ControlDeploymentLevel : null;
    if ((!requestedTask || !(requestedTask in controlTaskMeta)) && !validEvidence && !validDeployment) return;
    const frame = window.requestAnimationFrame(() => {
      if (requestedTask && requestedTask in controlTaskMeta) setTask(requestedTask as ControlTaskId);
      if (validEvidence) setEvidence(validEvidence);
      if (validDeployment) setDeployment(validDeployment);
      setPage(0);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const filtered = useMemo(() => {
    const needle = normalized(query.trim());
    const result = controlResearchItems.filter((item) => {
      if (needle && !corpus(item).includes(needle)) return false;
      if (task !== 'all' && ![item.primaryTask, ...item.relatedTasks].includes(task)) return false;
      if (device !== 'all' && !item.devices.some((name) => name.includes(device))) return false;
      if (evidence !== 'all' && item.evidenceLevel !== evidence) return false;
      if (deployment !== 'all' && item.deploymentLevel !== deployment) return false;
      if (code !== 'all' && !item.code.some((artifact) => artifact.status === code)) return false;
      return true;
    });
    return result.sort((a, b) => {
      if (sort === 'year-desc') return b.year - a.year || a.id.localeCompare(b.id);
      if (sort === 'evidence-desc') return Number(b.evidenceLevel[1]) - Number(a.evidenceLevel[1]) || b.year - a.year;
      return Number(a.primaryTask.slice(1)) - Number(b.primaryTask.slice(1)) || b.year - a.year;
    });
  }, [query, task, device, evidence, deployment, code, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const filteredDevices = useMemo(() => {
    const needle = normalized(deviceQuery.trim());
    return controlDeviceProfiles.filter((profile) => {
      if (deviceTask !== 'all' && !profile.primaryTasks.includes(deviceTask)) return false;
      if (!needle) return true;
      return normalized([profile.name, profile.country, profile.organization, profile.status, profile.pcsArchitecture, profile.timing, profile.maturity, profile.gaps, profile.representativeWorks.join(' '), profile.papers.map((paper) => paper.title).join(' '), profile.code.map((artifact) => artifact.name).join(' ')].join(' ')).includes(needle);
    });
  }, [deviceQuery, deviceTask]);

  function reset() {
    setQuery(''); setTask('all'); setDevice('all'); setEvidence('all'); setDeployment('all'); setCode('all'); setSort('evidence-desc'); setPage(0);
  }

  if(en)return <>
    <div className="controlCatalog" id="catalog"><div className="controlCatalogToolbar">
      <label className="controlSearch"><span>Full-text search</span><input type="search" value={query} onChange={event=>{setQuery(event.target.value);setPage(0);}} placeholder="Research record, facility, paper, code, sensor or actuator"/></label>
      <fieldset className="controlTaskFilters"><legend>Control task</legend><button className={task==='all'?'active':''} onClick={()=>{setTask('all');setPage(0);}}>All <b>{controlResearchItems.length}</b></button>{(Object.keys(controlTaskMeta) as ControlTaskId[]).map(taskId=><button key={taskId} className={task===taskId?'active':''} title={controlTaskMeta[taskId].en} onClick={()=>{setTask(taskId);setPage(0);}}>{taskId} <b>{taskCounts[taskId]}</b></button>)}</fieldset>
      <div className="controlSelects"><label><span>Facility</span><select value={device} onChange={event=>{setDevice(event.target.value);setPage(0);}}><option value="all">All facilities</option>{deviceOptions.map(name=><option value={name} key={name}>{deviceLabelEn(name)}</option>)}</select></label><label><span>Evidence level</span><select value={evidence} onChange={event=>{setEvidence(event.target.value as typeof evidence);setPage(0);}}><option value="all">All evidence</option>{(Object.keys(evidenceLabelsEn) as ControlEvidenceLevel[]).map(level=><option value={level} key={level}>{level} · {evidenceLabelsEn[level]}</option>)}</select></label><label><span>Deployment level</span><select value={deployment} onChange={event=>{setDeployment(event.target.value as typeof deployment);setPage(0);}}><option value="all">All deployment levels</option>{(Object.keys(deploymentLabelsEn) as ControlDeploymentLevel[]).map(level=><option value={level} key={level}>{level} · {deploymentLabelsEn[level]}</option>)}</select></label><label><span>Code relationship</span><select value={code} onChange={event=>{setCode(event.target.value as typeof code);setPage(0);}}><option value="all">All code relationships</option>{(Object.keys(codeLabelsEn) as ControlCodeStatus[]).map(status=><option value={status} key={status}>{codeLabelsEn[status]}</option>)}</select></label><label><span>Sort</span><select value={sort} onChange={event=>{setSort(event.target.value as typeof sort);setPage(0);}}><option value="evidence-desc">Evidence first</option><option value="year-desc">Newest first</option><option value="task">Task order</option></select></label><button className="controlReset" onClick={reset}>Reset</button></div>
    </div><div className="controlResultBar"><p><strong>{filtered.length}</strong> records · page {safePage+1} / {pageCount}</p><span>Task filters match both primary and related tasks; every record retains one primary task.</span></div>
    {visible.length?<div className="controlCards">{visible.map(item=><article className="controlResearchCard" key={item.id}><header><div><b>{item.primaryTask}</b><span>{controlTaskMeta[item.primaryTask].en}</span></div><div><i className={`evidence-${item.evidenceLevel.toLowerCase()}`}>{item.evidenceLevel}</i><i title={deploymentLabelsEn[item.deploymentLevel]}>{item.deploymentLevel}</i></div></header><div className="controlIdentity"><p>{item.year} · record {item.id}</p><h3>{item.titleEn?.trim()||`English editorial review pending for ${item.id}`}</h3><div>{item.devices.slice(0,4).map(name=><span key={name}>{deviceLabelEn(name)}</span>)}</div></div><dl className="controlCardCore"><div><dt>Research question</dt><dd>Detailed source-language synthesis awaits expert-reviewed English text.</dd></div><div><dt>Method / architecture</dt><dd>Consult the linked primary sources and code assets; deployment and evidence labels above remain authoritative.</dd></div><div><dt>Time scale</dt><dd>{/^[\x00-\x7Fμ–—·/.\s0-9a-zA-Z]+$/.test(item.timescale)?item.timescale:'Pending English editorial review'}</dd></div></dl><details><summary>Open papers and code evidence</summary><div className="controlDetailGrid"><section><h4>Evidence and boundary</h4><b>{item.evidenceLevel} · {evidenceLabelsEn[item.evidenceLevel]}</b><p>Qualification details and limitations require an expert-approved English translation before publication.</p></section><section><h4>Primary papers / sources</h4><ul>{item.papers.map((paper,index)=><li key={paper.url}><a href={paper.url} target="_blank" rel="noreferrer">Primary source {index+1} ↗</a>{paper.doi&&<small>DOI {paper.doi}</small>}</li>)}</ul></section><section><h4>Code / software relationships</h4><ul>{item.code.map((artifact,index)=><li key={`${artifact.name}-${index}`}>{artifact.url?<a href={artifact.url} target="_blank" rel="noreferrer">{artifact.name} ↗</a>:<b>{artifact.name}</b>}<span className={`code-${artifact.status}`}>{codeLabelsEn[artifact.status]}</span></li>)}</ul></section></div></details></article>)}</div>:<div className="controlEmpty"><h3>No matching records</h3><p>Clear one or more facility, evidence or code filters.</p><button onClick={reset}>Reset filters</button></div>}
    {pageCount>1&&<nav className="controlPagination" aria-label="Control-research pages"><button disabled={safePage===0} onClick={()=>setPage(Math.max(0,safePage-1))}>Previous</button>{Array.from({length:pageCount},(_,index)=><button key={index} className={safePage===index?'active':''} onClick={()=>setPage(index)}>{index+1}</button>)}<button disabled={safePage===pageCount-1} onClick={()=>setPage(Math.min(pageCount-1,safePage+1))}>Next</button></nav>}
    </div>
    <section className="controlDeviceExplorer" id="devices"><div className="controlSectionHead"><p className="controlIndex">DEVICE / PCS VIEW</p><h2>Trace where a control capability runs and how papers and code relate to it</h2><p>Facility profiles locate evidence; using facility data does not by itself mean the capability was deployed on that facility.</p></div><div className="deviceToolbar"><label><span>Facility search</span><input type="search" value={deviceQuery} onChange={event=>setDeviceQuery(event.target.value)} placeholder="TCV, DIII-D, EAST, ITER, EXL-50U…"/></label><label><span>Task coverage</span><select value={deviceTask} onChange={event=>setDeviceTask(event.target.value as typeof deviceTask)}><option value="all">All tasks</option>{(Object.keys(controlTaskMeta) as ControlTaskId[]).map(taskId=><option value={taskId} key={taskId}>{taskId} · {controlTaskMeta[taskId].en}</option>)}</select></label><strong>{filteredDevices.length} profiles</strong></div><div className="controlDeviceGrid">{filteredDevices.map((profile,index)=><article key={profile.id}><header><span>{String(index+1).padStart(2,'0')}</span><b>Facility profile</b></header><h3>{profile.name}</h3><div className="deviceTaskChips">{profile.primaryTasks.map(taskId=><span key={taskId}>{taskId}</span>)}</div><dl><div><dt>Editorial status</dt><dd>Architecture, timing, sensor, actuator, maturity and gap fields await expert-reviewed English text.</dd></div></dl><details><summary>Primary papers and code</summary><h4>Sources</h4><ul>{profile.papers.map((paper,index)=><li key={paper.url}><a href={paper.url} target="_blank" rel="noreferrer">Primary source {index+1} ↗</a></li>)}</ul><h4>Code / software</h4><ul>{profile.code.map((artifact,index)=><li key={`${artifact.name}-${index}`}>{artifact.url?<a href={artifact.url} target="_blank" rel="noreferrer">{artifact.name} ↗</a>:<b>{artifact.name}</b>}<span>{codeLabelsEn[artifact.status]}</span></li>)}</ul></details></article>)}</div></section>
  </>;

  return <>
    <div className="controlCatalog" id="catalog">
      <div className="controlCatalogToolbar">
        <label className="controlSearch"><span>全文检索</span><input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder="工作、装置、论文、代码、传感器或执行器" /></label>
        <fieldset className="controlTaskFilters"><legend>控制任务</legend><button className={task === 'all' ? 'active' : ''} onClick={() => { setTask('all'); setPage(0); }}>全部 <b>{controlResearchItems.length}</b></button>{(Object.keys(controlTaskMeta) as ControlTaskId[]).map((taskId) => <button key={taskId} className={task === taskId ? 'active' : ''} onClick={() => { setTask(taskId); setPage(0); }}>{taskId} <b>{taskCounts[taskId]}</b></button>)}</fieldset>
        <div className="controlSelects">
          <label><span>装置</span><select value={device} onChange={(event) => { setDevice(event.target.value); setPage(0); }}><option value="all">全部装置</option>{deviceOptions.map((name) => <option value={name} key={name}>{name}</option>)}</select></label>
          <label><span>证据等级</span><select value={evidence} onChange={(event) => { setEvidence(event.target.value as typeof evidence); setPage(0); }}><option value="all">全部证据</option>{(Object.keys(evidenceLabels) as ControlEvidenceLevel[]).map((level) => <option value={level} key={level}>{level} · {evidenceLabels[level]}</option>)}</select></label>
          <label><span>部署等级</span><select value={deployment} onChange={(event) => { setDeployment(event.target.value as typeof deployment); setPage(0); }}><option value="all">全部部署</option>{(Object.keys(deploymentLabels) as ControlDeploymentLevel[]).map((level) => <option value={level} key={level}>{level} · {deploymentLabels[level]}</option>)}</select></label>
          <label><span>代码关系</span><select value={code} onChange={(event) => { setCode(event.target.value as typeof code); setPage(0); }}><option value="all">全部代码关系</option>{(Object.keys(codeLabels) as ControlCodeStatus[]).map((status) => <option value={status} key={status}>{codeLabels[status]}</option>)}</select></label>
          <label><span>排序</span><select value={sort} onChange={(event) => { setSort(event.target.value as typeof sort); setPage(0); }}><option value="evidence-desc">证据优先</option><option value="year-desc">年份优先</option><option value="task">任务顺序</option></select></label>
          <button className="controlReset" onClick={reset}>重置</button>
        </div>
      </div>
      <div className="controlResultBar"><p><strong>{filtered.length}</strong> 项工作 · 第 {safePage + 1} / {pageCount} 页</p><span>任务筛选同时命中主任务和关联任务；条目保留唯一主任务。</span></div>
      {visible.length ? <div className="controlCards">{visible.map((item) => <article className="controlResearchCard" key={item.id}>
        <header><div><b>{item.primaryTask}</b><span>{controlTaskMeta[item.primaryTask].label}</span></div><div><i className={`evidence-${item.evidenceLevel.toLowerCase()}`}>{item.evidenceLevel}</i><i title={deploymentLabels[item.deploymentLevel]}>{item.deploymentLevel}</i></div></header>
        <div className="controlIdentity"><p>{item.year} · {item.organization}</p><h3>{item.titleZh}</h3>{item.titleEn && <small>{item.titleEn}</small>}<div>{item.devices.slice(0,4).map((name) => <span key={name}>{name}</span>)}</div></div>
        <dl className="controlCardCore"><div><dt>解决问题</dt><dd>{item.problem}</dd></div><div><dt>方法 / 架构</dt><dd>{item.method}</dd></div><div><dt>时间尺度</dt><dd>{item.timescale}</dd></div></dl>
        <details><summary>展开传感器、执行器、验证、论文与代码</summary><div className="controlDetailGrid">
          <section><h4>控制接口</h4><b>状态 / 传感器</b><p>{item.sensors.join('；') || '未完整公开。'}</p><b>执行器</b><p>{item.actuators.join('；') || '未完整公开。'}</p><b>关联任务</b><p>{item.relatedTasks.map((related) => `${related} ${controlTaskMeta[related].label}`).join('；') || '—'}</p></section>
          <section><h4>验证与边界</h4><b>{item.evidenceLevel} · {evidenceLabels[item.evidenceLevel]}</b><p>{item.validation} {item.results}</p><b>局限</b><p>{item.limitations}</p><b>孪生意义</b><p>{item.twinRelevance}</p></section>
            <section><h4>论文 / 原始来源</h4><ul>{item.papers.map((paper) => <li key={paper.url}><a href={paper.url} target="_blank" rel="noreferrer">{paper.title} ↗</a><span>{paper.year || '—'} · {paper.venue} · {paper.sourceType}</span>{paper.doi && <small>DOI {paper.doi}</small>}</li>)}</ul></section>
          <section><h4>代码 / 软件关系</h4><ul>{item.code.map((artifact,index) => <li key={`${artifact.name}-${index}`}>{artifact.url ? <a href={artifact.url} target="_blank" rel="noreferrer">{artifact.name} ↗</a> : <b>{artifact.name}</b>}<span className={`code-${artifact.status}`}>{codeLabels[artifact.status]}</span><p>{artifact.relationship}</p><small>{artifact.artifactType} · {artifact.access} · {artifact.license}</small></li>)}</ul></section>
        </div></details>
      </article>)}</div> : <div className="controlEmpty"><h3>没有匹配条目</h3><p>可尝试清除装置、证据或代码筛选。</p><button onClick={reset}>重置筛选</button></div>}
      {pageCount > 1 && <nav className="controlPagination" aria-label="控制研究分页"><button disabled={safePage === 0} onClick={() => setPage(Math.max(0, safePage - 1))}>上一页</button>{Array.from({length: pageCount}, (_, index) => <button key={index} className={safePage === index ? 'active' : ''} onClick={() => setPage(index)}>{index + 1}</button>)}<button disabled={safePage === pageCount - 1} onClick={() => setPage(Math.min(pageCount - 1, safePage + 1))}>下一页</button></nav>}
    </div>

    <section className="controlDeviceExplorer" id="devices">
      <div className="controlSectionHead"><p className="controlIndex">DEVICE / PCS VIEW</p><h2>从装置反查：控制能力运行在哪里，论文和代码关系是什么</h2><p>装置档案汇总 PCS 架构、实时周期、主要任务、传感器、执行器、代表论文、可用代码与迁移缺口。控制论文“使用某装置数据”不自动等于该功能已经部署在该装置。</p></div>
      <div className="deviceToolbar"><label><span>装置检索</span><input type="search" value={deviceQuery} onChange={(event) => setDeviceQuery(event.target.value)} placeholder="TCV、DIII-D、EAST、ITER、EXL-50U…" /></label><label><span>任务覆盖</span><select value={deviceTask} onChange={(event) => setDeviceTask(event.target.value as typeof deviceTask)}><option value="all">全部任务</option>{(Object.keys(controlTaskMeta) as ControlTaskId[]).map((taskId) => <option value={taskId} key={taskId}>{taskId} · {controlTaskMeta[taskId].label}</option>)}</select></label><strong>{filteredDevices.length} 个档案</strong></div>
      <div className="controlDeviceGrid">{filteredDevices.map((profile,index) => <article key={profile.id}>
        <header><span>{String(index+1).padStart(2,'0')}</span><b>{profile.country}</b></header><h3>{profile.name}</h3><p className="deviceOrg">{profile.organization}</p><p className="deviceStatus">{profile.status}</p><div className="deviceTaskChips">{profile.primaryTasks.map((taskId) => <span key={taskId}>{taskId}</span>)}</div>
        <dl><div><dt>PCS / 架构</dt><dd>{profile.pcsArchitecture}</dd></div><div><dt>时序</dt><dd>{profile.timing}</dd></div><div><dt>主要状态 / 传感器</dt><dd>{profile.sensors.length ? `${profile.sensors.slice(0,8).join('；')}${profile.sensors.length > 8 ? `；另 ${profile.sensors.length-8} 项` : ''}` : '公开资料未完整列出。'}</dd></div><div><dt>主要执行器</dt><dd>{profile.actuators.length ? `${profile.actuators.slice(0,8).join('；')}${profile.actuators.length > 8 ? `；另 ${profile.actuators.length-8} 项` : ''}` : '公开资料未完整列出。'}</dd></div><div><dt>代表工作</dt><dd>{profile.representativeWorks.length ? `${profile.representativeWorks.slice(0,6).join('；')}${profile.representativeWorks.length > 6 ? `；另 ${profile.representativeWorks.length-6} 项` : ''}` : '参见代表来源。'}</dd></div><div><dt>成熟度</dt><dd>{profile.maturity}</dd></div><div><dt>关键缺口</dt><dd>{profile.gaps}</dd></div></dl>
          <details><summary>论文与代码</summary><h4>代表来源</h4><ul>{profile.papers.map((paper) => <li key={paper.url}><a href={paper.url} target="_blank" rel="noreferrer">{paper.title} ↗</a><span>{paper.year || '—'} · {paper.venue}</span></li>)}</ul><h4>代码 / 软件</h4><ul>{profile.code.map((artifact,index) => <li key={`${artifact.name}-${index}`}>{artifact.url ? <a href={artifact.url} target="_blank" rel="noreferrer">{artifact.name} ↗</a> : <b>{artifact.name}</b>}<span>{codeLabels[artifact.status]} · {artifact.relationship}</span></li>)}</ul></details>
      </article>)}</div>
    </section>
  </>;
}
