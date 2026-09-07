'use client';
import { useEffect, useRef, useState } from 'react';
import { defaultEngineSpec, parseEngineSpec, parseProfileSnapshot, type EngineRunSpec, type ProfileSnapshot, type TransportResult } from './contracts';
import { activeJob, jobId, matchResult, normalizeEndpoint, parseJob, parseSubmission, parseUpload, requestCompute, snapshotDigest, UPLOAD_LIMIT, type ComputeJob } from './compute-client';
import { parseVerifiedTransportGeometry, type TransportGeometry } from './geometry';
import { download } from './display';

export default function RunConfiguration({ result, en, onCollected }: { result: TransportResult; en: boolean; onCollected: (result: TransportResult, geometry: TransportGeometry | null, geometrySha256: string | null) => void }) {
  const t = (zh: string, english: string) => en ? english : zh;
  const [parameters, setParameters] = useState(result.parameters), [resources, setResources] = useState({ cpus: 4, timeoutSeconds: 1800 });
  const [snapshot, setSnapshot] = useState<ProfileSnapshot | null>(result.referenceProfiles);
  const [token, setToken] = useState(''), [endpoint, setEndpoint] = useState('http://127.0.0.1:8792');
  const [connected, setConnected] = useState(false), [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  const [job, setJob] = useState<ComputeJob | null>(null), [recoverId, setRecoverId] = useState(''), [uncertain, setUncertain] = useState(false);
  const [completed, setCompleted] = useState<{ result: TransportResult; geometry: TransportGeometry | null; geometrySha256: string | null } | null>(null);
  const attempt = useRef<{ key: string; body: string } | null>(null), submittedSpec = useRef<EngineRunSpec | undefined>(undefined), restored = useRef(false);
  const storageKey = `fusiondigital.compute.torax.${result.recipe}`;
  const locked = busy || activeJob(job) || uncertain;
  const request = (route: string, options: Parameters<typeof requestCompute>[3] = {}) => requestCompute(endpoint, token, route, options);
  async function spec(): Promise<EngineRunSpec> {
    const input = snapshot ? { profileSnapshotSha256: await snapshotDigest(snapshot) } : null;
    return parseEngineSpec({ ...defaultEngineSpec(result.recipe, input), parameters, resources });
  }
  useEffect(() => {
    if (restored.current) return;
    const timer = setTimeout(() => { restored.current = true; try {
      const receipt = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null');
      if (!receipt || !jobId(receipt.id) || parseEngineSpec(receipt.spec).recipe !== result.recipe) return;
      setRecoverId(receipt.id); setEndpoint(normalizeEndpoint(receipt.endpoint));
      setNotice(t('发现上次任务。输入令牌后连接并恢复任务。', 'Previous job found. Enter the token, connect, then recover.'));
    } catch { /* Storage is optional. */ } }, 0);
    return () => clearTimeout(timer);
  }, [storageKey, result.recipe, en]); // eslint-disable-line react-hooks/exhaustive-deps
  async function refresh(id: string, signal?: AbortSignal) {
    const next = parseJob(await request(`/v1/jobs/${id}`, { signal }), id);
    if (next.state === 'succeeded' && next.processStopped) {
      const collected = matchResult(await request(`/v1/jobs/${id}/result`, { signal }), id, submittedSpec.current);
      if (collected.recipe !== result.recipe) throw new Error('SELECT_MATCHING_RECIPE_FIRST');
      let geometry: TransportGeometry | null = null, geometrySha256: string | null = null;
      try {
        const verified = parseVerifiedTransportGeometry(await request(`/v1/jobs/${id}/geometry`, { signal }), id, collected.provenance.nativeSha256);
        geometry = verified.geometry; geometrySha256 = verified.geometrySha256;
      } catch (error) {
        if (signal?.aborted) throw error;
        geometry = null; setNotice(t('结果已返回；截面几何不可用，可查看时间—半径图。', 'Results received; section geometry is unavailable. Time–radius fields remain available.'));
      }
      setCompleted({ result: collected, geometry, geometrySha256 });
    }
    setJob(next);
  }
  useEffect(() => {
    if (!connected || !job || !['queued', 'starting', 'running', 'cancellation-requested'].includes(job.state)) return;
    const abort = new AbortController();
    const timer = setTimeout(() => refresh(job.id, abort.signal).catch(error => {
      if (!abort.signal.aborted) { setJob({ ...job, state: 'connection-lost' }); setNotice(`${t('连接中断，节点任务可能仍在运行。重新连接后刷新状态。', 'Disconnected; the node may still be running. Reconnect and refresh.')} ${error.message}`); }
    }), 2000);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [job, connected]); // eslint-disable-line react-hooks/exhaustive-deps
  async function action(work: () => Promise<void>) {
    setBusy(true); setNotice('');
    try { await work(); } catch (error) { setNotice(error instanceof Error ? error.message : 'REQUEST_FAILED'); } finally { setBusy(false); }
  }
  async function importFile(file: File | undefined, profileOnly = false) {
    if (!file) return;
    if (file.size > UPLOAD_LIMIT) throw new Error('UPLOAD_TOO_LARGE');
    if (profileOnly) {
      if (result.recipe !== 'fuse-profile-handoff') throw new Error('PROFILE_RECIPE_REQUIRED');
      setSnapshot(parseProfileSnapshot(JSON.parse(await file.text())));
    } else {
      const upload = await parseUpload(await file.text());
      if (upload.spec.recipe !== result.recipe) throw new Error('SELECT_MATCHING_RECIPE_FIRST');
      setParameters(upload.spec.parameters); setResources(upload.spec.resources); setSnapshot(upload.snapshot);
    }
    setNotice(result.recipe === 'fuse-profile-handoff'
      ? t('本地结构与摘要已校验；启动时节点还会核验 FUSE 发布来源。', 'Local structure and digest checked; the node also verifies the published FUSE source at launch.')
      : t('文件结构与运行规格已校验；启动时节点会重新校验。', 'File structure and run specification checked; the node validates them again at launch.'));
  }
  async function submit() {
    if (!attempt.current) {
      const nextSpec = await spec(); submittedSpec.current = nextSpec;
      const body = JSON.stringify({ spec: nextSpec, ...(snapshot ? { snapshot } : {}) });
      if (new TextEncoder().encode(body).length > 128_000) throw new Error('UPLOAD_TOO_LARGE');
      await request('/v1/validate', { method: 'POST', body });
      attempt.current = { key: crypto.randomUUID(), body };
    }
    setUncertain(true);
    const id = parseSubmission(await request('/v1/jobs', { method: 'POST', ...attempt.current }));
    setUncertain(false); attempt.current = null; setCompleted(null); setRecoverId(id); setJob({ id, state: 'queued', processStopped: false });
    try { sessionStorage.setItem(storageKey, JSON.stringify({ id, endpoint: normalizeEndpoint(endpoint), spec: submittedSpec.current })); } catch { /* A receipt can also be downloaded. */ }
  }
  const stateLabels: Record<string, [string, string]> = { queued: ['已受理', 'Accepted'], starting: ['准备环境', 'Preparing'], running: ['计算中', 'Running'], 'cancellation-requested': ['等待停止确认', 'Waiting for stop'], succeeded: ['计算完成', 'Succeeded'], failed: ['计算失败', 'Failed'], 'timed-out': ['已超时', 'Timed out'], cancelled: ['已取消', 'Cancelled'], 'connection-lost': ['连接中断', 'Disconnected'], 'reconciliation-required': ['需核对计算进程', 'Reconciliation required'], 'collection-failed': ['结果校验失败', 'Collection failed'] };
  return <section className="transportPanel transportCompute"><h3>{t('配置与启动计算', 'Configure & start computation')}</h3><p>{t('参数和输入数据发送至计算节点；代码、环境和原始文件保留在节点上。', 'Parameters and input data go to the compute node; code, environment and native files stay there.')}</p>
    <fieldset disabled={locked}><legend>{t('计算参数', 'Simulation parameters')}</legend><div className="transportForm">
      {([['duration', t('模拟时长 (s)', 'Duration (s)'), .01, 400, .01], ['radialCells', t('径向单元', 'Radial cells'), 10, 100, 1], ['heatingScale', t('辅助加热倍率', 'Auxiliary heating scale'), .5, 1.5, .1]] as const).map(([key, name, min, max, step]) => <label key={key}>{name}<input type="number" value={parameters[key]} min={min} max={max} step={step} disabled={key === 'heatingScale' && result.recipe === 'step-flat-top'} onChange={e => setParameters({ ...parameters, [key]: Number(e.target.value) })} /></label>)}
      <label>{t('CPU 核数', 'CPU cores')}<input type="number" min={1} max={8} step={1} value={resources.cpus} onChange={e => setResources({ ...resources, cpus: Number(e.target.value) })} /></label><label>{t('计算超时 (s)', 'Wall timeout (s)')}<input type="number" min={30} max={3600} step={30} value={resources.timeoutSeconds} onChange={e => setResources({ ...resources, timeoutSeconds: Number(e.target.value) })} /></label>
    </div></fieldset>
    <p className="transportNote">{t('STEP 保留原加热源。模拟时长不缩放既有输入时序；电阻率倍率保持演示场景设置。', 'STEP retains configured heating. Duration does not rescale input schedules; demonstration resistivity multipliers are retained.')}</p>
    <div className="transportControls"><label className="transportUpload">{t('导入运行包 JSON', 'Import run package JSON')}<input type="file" accept="application/json,.json" disabled={locked} onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; void action(() => importFile(file)); }} /></label><button className="transportButton" disabled={busy} onClick={() => action(async () => download(`${result.recipe}-upload.json`, JSON.stringify({ schema: 'torax-run-upload.v1', spec: await spec(), snapshot }, null, 2)))}>{t('下载运行包', 'Download run package')}</button></div>
    {result.recipe === 'fuse-profile-handoff' && <div className="transportInputSummary"><label className="transportUpload">{t('导入节点发布的 FUSE 剖面 JSON', 'Import node-published FUSE profile JSON')}<input type="file" accept="application/json,.json" disabled={locked} onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; void action(() => importFile(file, true)); }} /></label><p>{t('节点只接受与其已验证 FUSE 发布投影完全一致的 Te / Ti / ne 剖面；任意修改或未知来源都会拒绝。固定 DIII-D-like 圆截面接收模型，不传递磁平衡。温度 eV，密度 m⁻³，ρtor,norm 从 0 到 1。', 'The node accepts only Te / Ti / ne profiles identical to its verified published FUSE projection; modified values and unknown sources are rejected. The receiving model is fixed DIII-D-like circular geometry, without equilibrium transfer. Temperature eV, density m⁻³, ρtor,norm spans 0 to 1.')}</p>{snapshot && <p><code>{snapshot.source.runId}</code> · {snapshot.rho.length} {t('径向点', 'radial points')}</p>}<button className="transportButton" disabled={!connected || locked} onClick={() => action(async () => setSnapshot(parseProfileSnapshot(await request('/v1/inputs/fuse-profile'))))}>{t('读取节点 FUSE 剖面', 'Load node FUSE profiles')}</button></div>}
    <fieldset><legend>{t('计算节点', 'Compute node')}</legend><div className="transportForm"><label>{t('网关地址', 'Gateway URL')}<input value={endpoint} disabled={locked} spellCheck={false} onChange={e => { setEndpoint(e.target.value); setConnected(false); }} /></label><label>{t('访问令牌', 'Access token')}<input type="password" autoComplete="off" value={token} disabled={busy} onChange={e => { setToken(e.target.value); setConnected(false); }} /></label></div></fieldset>
    <p className="transportNote">{t('当前电脑：http://127.0.0.1:8792；其他节点：HTTPS 地址。令牌仅存于页面内存，任务回执保留在浏览器会话。公网页面访问本机可能需要浏览器本地网络权限。', 'This computer: http://127.0.0.1:8792; other nodes: HTTPS origin. Tokens stay in page memory; receipts stay in the browser session. Public pages may require local-network permission.')}</p>
    <div className="transportControls"><button className="transportButton" disabled={busy} onClick={() => action(async () => { const catalog = await request('/v1/catalog') as { schema?: string; executionEngineIds?: string[] }; if (catalog.schema !== 'engine-catalog.v1' || !Array.isArray(catalog.executionEngineIds) || !catalog.executionEngineIds.includes('torax')) throw new Error('INCOMPATIBLE_GATEWAY'); setConnected(true); setNotice(t('计算节点已连接。', 'Compute node connected.')); })}>{t('连接计算节点', 'Connect compute node')}</button><button className="transportButton primary" disabled={!connected || busy || activeJob(job)} onClick={() => action(submit)}>{uncertain ? t('重试确认提交', 'Retry confirmation') : t('上传并启动计算', 'Upload & start computation')}</button>{job && <button className="transportButton" disabled={busy || !connected} onClick={() => action(() => refresh(job.id))}>{t('刷新状态', 'Refresh status')}</button>}{activeJob(job) && <button className="transportButton" disabled={busy || !connected} onClick={() => action(async () => { await request(`/v1/jobs/${job!.id}/cancel`, { method: 'POST' }); setJob({ ...job!, state: 'cancellation-requested' }); })}>{t('取消计算', 'Cancel computation')}</button>}</div>
    {uncertain && <p role="alert">{t('尚未收到提交确认。请保留页面并重试确认，避免重复计算。', 'Submission unconfirmed. Keep this page and retry confirmation to avoid duplicate computation.')}</p>}
    <details className="transportGateway"><summary>{t('恢复已有任务', 'Recover an existing job')}</summary><div className="transportControls"><label>{t('任务编号', 'Job ID')}<input value={recoverId} disabled={busy || activeJob(job) || uncertain} onChange={e => setRecoverId(e.target.value)} /></label><button className="transportButton" disabled={!connected || busy || activeJob(job) || uncertain} onClick={() => action(async () => { if (!jobId(recoverId)) throw new Error('INVALID_JOB_ID'); let saved; try { saved = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null'); } catch { saved = null; } submittedSpec.current = saved?.id === recoverId && saved?.endpoint === normalizeEndpoint(endpoint) ? parseEngineSpec(saved.spec) : undefined; await refresh(recoverId); })}>{t('恢复任务', 'Recover job')}</button></div></details>
    {job && <div className="transportJobStatus" role="status"><strong>{(stateLabels[job.state] ?? [job.state, job.state])[en ? 1 : 0]}</strong><code>{job.id}</code><span>{t('计算耗时', 'Elapsed')} {Math.round(job.elapsedSeconds ?? 0)} s</span><button className="transportButton" onClick={() => download(`${job.id}-receipt.json`, JSON.stringify({ id: job.id, endpoint: normalizeEndpoint(endpoint), spec: submittedSpec.current }, null, 2))}>{t('下载任务回执', 'Download receipt')}</button></div>}
    {completed && <div className="transportControls"><button className="transportButton primary" onClick={() => onCollected(completed.result, completed.geometry, completed.geometrySha256)}>{t('查看新计算结果', 'Explore new results')}</button><button className="transportButton" onClick={() => download(`${completed.result.id}.json`, JSON.stringify(completed.result, null, 2))}>{t('下载完整结果', 'Download full result')}</button></div>}{notice && <p className="transportNotice" role="status">{notice}</p>}
  </section>;
}
