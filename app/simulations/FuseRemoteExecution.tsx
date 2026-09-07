'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { downloadJson } from './SimulationPanels';
import {
  assertFuseResultMatchesSpec,
  isFuseJobActive,
  normalizeFuseGatewayEndpoint,
  parseFuseCatalog,
  parseFuseCollectedResult,
  parseFuseJobId,
  parseFuseJobStatus,
  parseRecoveredFuseJobStatus,
  parseFuseSubmission,
  readGatewayJson,
  type FuseCollectedResult,
  type FuseJobStatus,
} from './fuse-remote';
import { parseRunSpec, type RunSpec } from './run-spec';

type CollectedHandler = (result: FuseCollectedResult, activate: boolean) => void;

const ACTIVE_STATES = ['queued', 'starting', 'running', 'cancellation-requested', 'connection-lost'];

function errorLabel(code: string, en: boolean): string {
  const labels: Record<string, [string, string]> = {
    INVALID_GATEWAY_URL: ['网关地址无效。', 'The gateway URL is invalid.'],
    INVALID_FUSE_JOB_ID: ['任务 ID 无效，应为完整的 fuse-diiid-* 标识。', 'Invalid job ID; enter the complete fuse-diiid-* identifier.'],
    GATEWAY_ORIGIN_REQUIRED: ['网关地址只能填写 Origin，不能包含路径、查询参数或账号信息。', 'Enter only the gateway origin, without paths, query parameters or credentials.'],
    SECURE_GATEWAY_REQUIRED: ['远程网关必须使用 HTTPS；HTTP 只允许 localhost 或 127.0.0.1。', 'Remote gateways require HTTPS; HTTP is restricted to localhost or 127.0.0.1.'],
    GATEWAY_PORT_REQUIRED: ['本地网关地址必须包含端口。', 'A loopback gateway URL must include a port.'],
    INCOMPATIBLE_GATEWAY: ['该网关未声明可执行 FUSE。', 'The gateway does not advertise FUSE execution.'],
    AUTH_REQUIRED: ['网关拒绝访问，请检查访问令牌。', 'Gateway authorization failed; check the access token.'],
    ORIGIN_REJECTED: ['当前网页来源未获网关许可。', 'This page origin is not allowed by the gateway.'],
    LOCAL_NETWORK_PERMISSION_OR_GATEWAY_UNAVAILABLE: ['无法连接本机网关：请确认网关已启动，并允许浏览器访问本地网络。', 'Cannot reach the local gateway. Confirm it is running and allow browser Local Network Access.'],
    GATEWAY_UNAVAILABLE: ['无法连接远程 HTTPS 网关，请检查地址、TLS 和网络策略。', 'Cannot reach the remote HTTPS gateway; check its URL, TLS and network policy.'],
    ENGINE_BUSY: ['计算节点已有活动任务，请等待其进入终态。', 'The compute node already has an active job; wait for a terminal state.'],
    ENGINE_BUSY_OR_UNRECONCILED: ['FUSE 工作区正被占用或存在待核对任务，请先在计算节点完成核对。', 'The FUSE workspace is busy or has an unreconciled job; reconcile it on the compute node first.'],
    JOB_NOT_SUCCEEDED: ['任务尚未成功完成，暂不能收集结果。', 'The job has not succeeded, so its result cannot be collected yet.'],
    FUSE_JOB_RESULT_COORDINATE_MISMATCH: ['结果坐标映射身份不一致，已拒绝载入。', 'The result coordinate-map identity did not match and was rejected.'],
    FUSE_JOB_VERIFICATION_MISMATCH: ['网关核验摘要与运行制品不一致，已拒绝载入。', 'Gateway verification did not match the run artifacts and was rejected.'],
    FUSE_JOB_RESULT_RUN_SPEC_UNBOUND: ['结果未绑定完整 RunSpec 制品，已拒绝载入。', 'The result was not bound to its complete RunSpec artifact and was rejected.'],
    FUSE_JOB_RESULT_RUN_SPEC_MISMATCH: ['恢复任务的完整 RunSpec 与当前设置不一致，已拒绝载入。', 'The recovered job RunSpec does not match the current settings and was rejected.'],
    FUSE_JOB_VERIFICATION_UNAVAILABLE: ['当前浏览器无法执行结果摘要校验。', 'This browser cannot perform the result digest verification.'],
    FUSE_JOB_RESULT_RECIPE_MISMATCH: ['恢复任务与当前流程设置不一致，已拒绝载入结果。', 'The recovered job does not match the current recipe settings, so its result was rejected.'],
    FUSE_JOB_RESULT_ENGINE_MISMATCH: ['恢复任务与当前引擎或线程设置不一致，已拒绝载入结果。', 'The recovered job does not match the current engine or thread settings, so its result was rejected.'],
    FUSE_JOB_RESULT_SOLVER_MISMATCH: ['恢复任务与当前求解器设置不一致，已拒绝载入结果。', 'The recovered job does not match the current solver settings, so its result was rejected.'],
    FUSE_JOB_RESULT_MODEL_MISMATCH: ['恢复任务与当前模型设置不一致，已拒绝载入结果。', 'The recovered job does not match the current model settings, so its result was rejected.'],
    GATEWAY_RESPONSE_TOO_LARGE: ['网关响应超过 24 MB 安全上限。', 'The gateway response exceeded the 24 MB safety limit.'],
  };
  return labels[code]?.[en ? 1 : 0] ?? (en ? `Gateway request failed: ${code}` : `网关请求失败：${code}`);
}

function stateLabel(state: string, en: boolean): string {
  const labels: Record<string, [string, string]> = {
    queued: ['排队中', 'Queued'], starting: ['启动中', 'Starting'], running: ['计算中', 'Running'],
    'cancellation-requested': ['正在请求取消', 'Cancellation requested'], succeeded: ['计算成功', 'Succeeded'], failed: ['计算失败', 'Failed'],
    'timed-out': ['已超时', 'Timed out'], cancelled: ['已取消', 'Cancelled'], 'collection-failed': ['制品核验失败', 'Artifact verification failed'],
    'reconciliation-required': ['需要人工核对', 'Reconciliation required'], 'connection-lost': ['连接暂时中断', 'Connection temporarily lost'],
  };
  return labels[state]?.[en ? 1 : 0] ?? state;
}

export function useFuseRemoteExecution(en: boolean, onCollected: CollectedHandler) {
  const [endpoint, setEndpointState] = useState('http://127.0.0.1:8791');
  const [token, setTokenState] = useState('');
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [job, setJob] = useState<FuseJobStatus | null>(null);
  const [completed, setCompleted] = useState<FuseCollectedResult | null>(null);
  const [recoveryId, setRecoveryId] = useState('');
  const attempt = useRef<{ key: string; body: string } | null>(null);
  const submittedSpec = useRef<RunSpec | null>(null);
  const delivered = useRef<string | null>(null);
  const collectedHandler = useRef(onCollected);
  useEffect(() => { collectedHandler.current = onCollected; }, [onCollected]);

  const request = useCallback(async (route: string, method = 'GET', body?: string, key?: string, signal?: AbortSignal): Promise<unknown> => {
    const base = normalizeFuseGatewayEndpoint(endpoint);
    const url = new URL(base);
    const loopback = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
    const init: RequestInit & { targetAddressSpace?: 'local' } = {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(key ? { 'Idempotency-Key': key } : {}),
      },
      body,
      signal,
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
      ...(loopback ? { targetAddressSpace: 'local' as const } : {}),
    };
    let response: Response;
    try { response = await fetch(`${base}${route}`, init); }
    catch { throw new Error(loopback ? 'LOCAL_NETWORK_PERMISSION_OR_GATEWAY_UNAVAILABLE' : 'GATEWAY_UNAVAILABLE'); }
    const value = await readGatewayJson(response);
    if (!response.ok) {
      const code = value && typeof value === 'object' && typeof (value as { error?: unknown }).error === 'string' ? (value as { error: string }).error : `HTTP_${response.status}`;
      throw new Error(code);
    }
    return value;
  }, [endpoint, token]);

  const collect = useCallback(async (id: string, signal?: AbortSignal) => {
    const result = await parseFuseCollectedResult(await request(`/v1/jobs/${encodeURIComponent(id)}/result`, 'GET', undefined, undefined, signal));
    if (result.run.id !== id) throw new Error('FUSE_JOB_RESULT_IDENTITY_MISMATCH');
    if (!submittedSpec.current) throw new Error('MISSING_SUBMITTED_RUN_SPEC');
    assertFuseResultMatchesSpec(result, submittedSpec.current);
    setCompleted(result);
    if (delivered.current !== id) {
      delivered.current = id;
      collectedHandler.current(result, false);
    }
    return result;
  }, [request]);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (!job) throw new Error('NO_ACTIVE_JOB');
    const next = parseFuseJobStatus(await request(`/v1/jobs/${encodeURIComponent(job.id)}`, 'GET', undefined, undefined, signal));
    if (next.id !== job.id) throw new Error('JOB_IDENTITY_MISMATCH');
    if (next.state === 'succeeded') await collect(next.id, signal);
    setJob(next);
    return next;
  }, [collect, job, request]);

  useEffect(() => {
    if (!job || !ACTIVE_STATES.includes(job.state)) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void refresh(controller.signal).catch(error => {
        if (controller.signal.aborted) return;
        const code = error instanceof Error ? error.message : 'REQUEST_FAILED';
        setNotice(errorLabel(code, en));
        setJob(current => current?.id === job.id ? { ...current, state: 'connection-lost' } : current);
      });
    }, 2500);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [en, job, refresh]);

  async function action(work: () => Promise<void>) {
    setBusy(true); setNotice('');
    try { await work(); }
    catch (error) { setNotice(errorLabel(error instanceof Error ? error.message : 'REQUEST_FAILED', en)); }
    finally { setBusy(false); }
  }

  const setEndpoint = (value: string) => { setEndpointState(value); setConnected(false); attempt.current = null; };
  const setToken = (value: string) => { setTokenState(value); setConnected(false); };
  const invalidateAttempt = () => { attempt.current = null; };
  const active = isFuseJobActive(job);

  return {
    endpoint, token, connected, busy, notice, job, completed, active, recoveryId,
    setEndpoint, setToken, setRecoveryId, invalidateAttempt,
    testConnection: () => action(async () => {
      const catalog = parseFuseCatalog(await request('/v1/catalog'));
      setConnected(true);
      setNotice(en ? `Authenticated FUSE gateway connected · concurrency ${catalog.concurrency}.` : `FUSE 鉴权网关已连接 · 并发上限 ${catalog.concurrency}。`);
    }),
    submit: (spec: RunSpec) => action(async () => {
      const validatedSpec = parseRunSpec(spec);
      const body = JSON.stringify({ spec: validatedSpec });
      if (new TextEncoder().encode(body).length > 16 * 1024) throw new Error('RUN_SPEC_TOO_LARGE');
      if (!attempt.current || attempt.current.body !== body) attempt.current = { key: crypto.randomUUID(), body };
      const submitted = parseFuseSubmission(await request('/v1/jobs', 'POST', body, attempt.current.key));
      setCompleted(null); delivered.current = null;
      submittedSpec.current = validatedSpec;
      setJob({ id: submitted.id, state: 'queued' });
      attempt.current = null;
      setNotice(en ? 'FUSE job accepted. Status will refresh automatically.' : 'FUSE 任务已受理，将自动刷新状态。');
    }),
    recover: (id: string, spec: RunSpec) => action(async () => {
      const expectedId = parseFuseJobId(id);
      const expectedSpec = parseRunSpec(spec);
      const next = parseRecoveredFuseJobStatus(expectedId, await request(`/v1/jobs/${encodeURIComponent(expectedId)}`));
      attempt.current = null;
      delivered.current = null;
      submittedSpec.current = expectedSpec;
      setCompleted(null);
      setConnected(true);
      setJob(next);
      setRecoveryId(expectedId);
      if (next.state === 'succeeded') await collect(expectedId);
      setNotice(next.state === 'succeeded'
        ? (en ? 'Recovered job verified and its safe result was loaded.' : '已核验恢复任务并载入安全结果。')
        : isFuseJobActive(next)
          ? (en ? 'FUSE job recovered. Status polling will continue.' : '已恢复 FUSE 任务，将继续自动轮询状态。')
          : (en ? `Recovered job status: ${stateLabel(next.state, true)}.` : `已读取恢复任务状态：${stateLabel(next.state, false)}。`));
    }),
    refresh: () => action(async () => { const next = await refresh(); setNotice(en ? `Status refreshed: ${stateLabel(next.state, true)}.` : `状态已刷新：${stateLabel(next.state, false)}。`); }),
    cancel: () => action(async () => {
      if (!job) throw new Error('NO_ACTIVE_JOB');
      await request(`/v1/jobs/${encodeURIComponent(job.id)}/cancel`, 'POST');
      setJob({ ...job, state: 'cancellation-requested' });
      setNotice(en ? 'Cancellation requested; wait for a terminal status.' : '已请求取消，请等待终态确认。');
    }),
    explore: () => { if (completed) collectedHandler.current(completed, true); },
  };
}

export type FuseRemoteController = ReturnType<typeof useFuseRemoteExecution>;

export default function FuseRemoteExecution({ en, spec, valid, remote }: { en: boolean; spec: RunSpec; valid: boolean; remote: FuseRemoteController }) {
  const t = (zh: string, english: string) => en ? english : zh;
  const tokenReady = remote.token.length >= 32;
  return <section className="simRemoteGateway" aria-label={t('FUSE 远程计算', 'FUSE remote computation')}>
    <div className="simRemoteHeading"><div><p className="simMiniLabel">AUTHENTICATED COMPUTE CONTROL</p><h4>{t('连接本机或远程 FUSE 计算节点', 'Connect a local or remote FUSE compute node')}</h4></div><span className={remote.connected ? 'simGood' : 'simWarning'}>● {remote.connected ? t('已鉴权连接', 'Authenticated') : t('尚未连接', 'Not connected')}</span></div>
    <p>{t('浏览器只发送经过白名单校验的 RunSpec，计算代码、模型权重、日志和原生 HDF5 均保留在计算机上；完成后仅回传安全结果投影。', 'The browser sends only an allowlisted RunSpec. Compute code, model weights, logs and native HDF5 remain on the compute node; only safe result projections return.')}</p>
    <div className="simRecipeForm simGatewayForm"><label>{t('网关地址', 'Gateway URL')}<input value={remote.endpoint} disabled={remote.active} spellCheck={false} onChange={event => remote.setEndpoint(event.target.value)} /><small>{t('本机 HTTP loopback，或经 TLS 反向代理/私有网络暴露的 HTTPS Origin', 'HTTP loopback, or an HTTPS origin exposed through your TLS proxy/private network')}</small></label><label>{t('访问令牌', 'Access token')}<input type="password" autoComplete="off" value={remote.token} disabled={remote.active} onChange={event => remote.setToken(event.target.value)} /><small>{t('仅保留在当前页面内存，刷新即清除', 'Kept only in page memory and cleared on refresh')}</small></label></div>
    <div className="simActionRow"><button className="simButton" disabled={remote.busy || remote.active || !tokenReady} onClick={remote.testConnection}>{t('测试鉴权连接', 'Test authenticated connection')}</button><button className="simButton simButtonPrimary" disabled={!remote.connected || remote.busy || remote.active || !valid} onClick={() => remote.submit(spec)}>{remote.busy ? t('处理中…', 'Working…') : t('启动 FUSE 计算', 'Start FUSE run')}</button>{remote.job && <button className="simButton" disabled={remote.busy} onClick={remote.refresh}>{t('刷新状态', 'Refresh status')}</button>}{remote.active && <button className="simButton" disabled={remote.busy || remote.job?.state === 'cancellation-requested'} onClick={remote.cancel}>{t('请求取消', 'Request cancellation')}</button>}</div>
    <div className="simRecipeForm simGatewayForm"><label>{t('恢复已有任务', 'Recover an existing job')}<input value={remote.recoveryId} disabled={remote.busy || remote.active} maxLength={101} autoComplete="off" spellCheck={false} placeholder="fuse-diiid-…" onChange={event => remote.setRecoveryId(event.target.value)} /><small>{t('输入完整任务 ID；当前参数表单将作为预期 RunSpec，结果不一致时拒绝载入', 'Enter the complete job ID. The current parameter form is the expected RunSpec; mismatched results are rejected.')}</small></label></div>
    <div className="simActionRow"><button className="simButton" disabled={remote.busy || remote.active || !tokenReady || !valid || !remote.recoveryId.trim()} onClick={() => remote.recover(remote.recoveryId, spec)}>{t('查询并恢复任务', 'Query and recover job')}</button></div>
    {remote.job && <div className="simRemoteJob" role="status"><span className={remote.job.state === 'succeeded' ? 'simGood' : ['failed','timed-out','collection-failed','reconciliation-required'].includes(remote.job.state) ? 'simWarning' : ''}>{stateLabel(remote.job.state, en)}</span><code>{remote.job.id}</code>{remote.job.elapsedSeconds !== undefined && <small>{remote.job.elapsedSeconds.toFixed(1)} s</small>}{remote.job.latestStage && <small className="simRemoteStage">{t('当前阶段', 'Latest stage')} · {remote.job.latestStage.name} / {remote.job.latestStage.state}</small>}{remote.job.reason && <small className="simRemoteReason">{remote.job.reason}</small>}</div>}
    {remote.completed && <div className="simCollectedResult"><strong>{t('安全结果已载入当前浏览器会话', 'Safe result loaded into this browser session')}</strong><p>{remote.completed.coordinateMap ? t('计算节点已核验本地原始制品；浏览器对运行记录、物理场和磁通坐标映射执行了数据契约及身份字段检查。', 'The compute node verified local native artifacts; the browser checked contracts and identity fields for the run record, physics fields and flux-coordinate map.') : t('计算节点已核验本地原始制品，浏览器已加载运行记录和物理场；未返回磁通坐标映射，因此 Te/Ti/ne 二维和三维云图不可用。', 'The compute node verified local native artifacts and the browser loaded the run record and physics fields. No flux-coordinate map was returned, so Te/Ti/ne 2D and 3D clouds are unavailable.')}</p><div className="simActionRow"><button className="simButton simButtonPrimary" onClick={remote.explore}>{t('查看新运行结果', 'Explore new result')}</button><button className="simButton" onClick={() => downloadJson(remote.completed!.run, `${remote.completed!.run.id}.json`)}>{t('下载运行记录', 'Download run record')}</button><button className="simButton" onClick={() => downloadJson(remote.completed!.physics, `${remote.completed!.run.id}-physics.json`)}>{t('下载物理投影', 'Download physics projection')}</button>{remote.completed.coordinateMap && <button className="simButton" onClick={() => downloadJson(remote.completed!.coordinateMap!, `${remote.completed!.run.id}-coordinate-map.json`)}>{t('下载坐标映射', 'Download coordinate map')}</button>}</div></div>}
    {remote.notice && <p className="simRemoteNotice" role="status">{remote.notice}</p>}
    <p className="simRemoteBoundary">{t('公开匿名站不提供匿名计算权限。公网 HTTPS 页面访问本机网关可能需要浏览器“本地网络访问”授权；远程 HTTPS 网关及 TLS 代理需由您自行部署和维护。会话结果尚未入库，刷新页面即丢失。', 'The anonymous public site never grants anonymous compute access. An HTTPS page may require browser Local Network Access permission to reach loopback. You must deploy and maintain any remote HTTPS gateway and TLS proxy. Session results are not catalogued and disappear on refresh.')}</p>
  </section>;
}
