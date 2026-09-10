'use client';
import { useEffect, useState } from 'react';
import { download } from '../platform/display';
import { defaultControlSpec, isControlId, parseControlJob, parseControlSpec, recipeFor, type ControlEngine, type ControlJob, type ControlResult } from './contracts';
import { ControlRequestRejected, matchControlResult, requestControl } from './client';
import { normalizeEndpoint } from '../platform/compute-client';

const terminal = new Set(['succeeded', 'failed', 'timed-out', 'cancelled', 'collection-failed']);
export default function ControlRunConfiguration({ engine, en, onResult }: { engine: ControlEngine; en: boolean; onResult: (r: ControlResult) => void }) {
  const t = (zh: string, english: string) => en ? english : zh;
  const [duration, setDuration] = useState('.016');
  const [endpoint, setEndpoint] = useState('');
  const [token, setToken] = useState('');
  const [connected, setConnected] = useState(false);
  const [job, setJob] = useState<ControlJob | null>(null);
  const [resumeId, setResumeId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [intent, setIntent] = useState<{ key: string; body: string; endpoint: string } | null>(null);
  const active = !!job && (!terminal.has(job.state) || !job.processStopped);
  const makeSpec = () => { const s = defaultControlSpec(engine); s.parameters.durationSeconds = Number(duration); return parseControlSpec(s); };
  const act = async (fn: () => Promise<void>) => { setBusy(true); setError(''); try { await fn(); } catch (e) { setError(e instanceof Error && /^[A-Z0-9_]{1,100}$/.test(e.message) ? e.message : 'CONNECTION_OR_RESPONSE_FAILED'); } finally { setBusy(false); } };
  useEffect(() => {
    if (!job || !connected || !active) return;
    const controller = new AbortController();
    const timer = setInterval(() => { void requestControl(endpoint, token, `/v1/jobs/${job.id}`, { signal: controller.signal }).then(v => { setJob(parseControlJob(v, job.id)); setError(''); }).catch(() => { if (!controller.signal.aborted) setError('CONNECTION_LOST_STATUS_UNKNOWN'); }); }, 2000);
    return () => { clearInterval(timer); controller.abort(); };
  }, [job, connected, active, endpoint, token]);
  return <><div className="transportTwoColumns"><section className="transportPanel"><h2>{t('有界运行配置', 'Bounded run configuration')}</h2><p>{en ? recipeFor(engine).scopeEn : recipeFor(engine).scopeZh}</p><p>{t('不要求复现 EFIT 对应炮。初态来自容器内固定算例；第一版仅开放零电压基线，未启用策略训练。', 'EFIT shot reproduction is not required. The container provides a fixed initial state. This release admits a zero-voltage baseline only, without policy training.')}</p><label>{t('模拟时长 / s', 'Simulation duration / s')} <input type="number" value={duration} min="0.001" max="0.5" step="0.001" disabled={!!intent || active || busy} onChange={e => setDuration(e.target.value)} /></label><p>Δt = 0.001 s · {recipeFor(engine).channels} V channels · VS: plant internal</p><button onClick={() => void act(async () => download(`${engine}-runspec.json`, JSON.stringify(makeSpec(), null, 2)))}>{t('导出运行配置', 'Export run configuration')}</button><p>{t('命令、发送值与实际施加值分别记录；没有 plant 回读的实际施加值保持缺失。', 'Commanded, sent and applied values are separate. Applied values without plant readback remain missing.')}</p></section>
    <section className="transportPanel"><h2>{t('专用云计算网关', 'Dedicated cloud compute gateway')}</h2><p>{t('网站只提供只读制品。Docker 在受控计算主机运行；连接信息由运维提供，令牌仅保留在页面内存。', 'The website serves read-only artifacts. Docker runs on an operator-managed compute host; credentials remain in page memory.')}</p><label>{t('网关 HTTPS 地址', 'Gateway HTTPS origin')} <input type="url" value={endpoint} placeholder="https://compute.example.org" disabled={active || busy || !!intent} onChange={e => { setEndpoint(e.target.value); setConnected(false); }} /></label><label>{t('访问令牌', 'Access token')} <input type="password" autoComplete="off" value={token} disabled={busy} onChange={e => { setToken(e.target.value); setConnected(false); }} /></label><div className="transportActions"><button disabled={busy} onClick={() => void act(async () => { const c = await requestControl(endpoint, token, '/v1/catalog'); if (c?.schema !== 'engine-catalog.v1' || !Array.isArray(c.executionEngineIds) || !c.executionEngineIds.includes(engine)) throw new Error('CONTROL_ENGINE_NOT_CONFIGURED'); setConnected(true); })}>{connected ? t('已连接', 'Connected') : t('检查连接', 'Check connection')}</button><button disabled={!connected || busy || active} onClick={() => void act(async () => {
      const current = intent ?? { key: crypto.randomUUID(), body: JSON.stringify({ spec: makeSpec() }), endpoint: normalizeEndpoint(endpoint) }; setIntent(current);
      let v;
      try { v = await requestControl(endpoint, token, '/v1/jobs', { method: 'POST', body: current.body, key: current.key }); }
      catch (e) { if (e instanceof ControlRequestRejected) setIntent(null); throw e; }
      if (!isControlId(v?.id) || !v.id.startsWith(engine + '-')) throw new Error('INVALID_SUBMISSION');
      setResumeId(v.id); setJob(parseControlJob(await requestControl(endpoint, token, `/v1/jobs/${v.id}`), v.id));
    })}>{intent ? t('重试同一提交', 'Retry same submission') : t('提交云端运行', 'Submit cloud run')}</button></div><p>{t('网络错误不自动重跑。重试复用同一幂等键；刷新页面前请保存任务编号。', 'Network errors do not rerun the solver. Retry reuses the idempotency key; save the job ID before reloading.')}</p><label>{t('已有任务编号', 'Existing job ID')} <input value={resumeId} disabled={active || busy} onChange={e => setResumeId(e.target.value)} /></label><button disabled={!connected || busy || active} onClick={() => void act(async () => { if (!isControlId(resumeId) || !resumeId.startsWith(engine + '-')) throw new Error('INVALID_JOB_ID'); setJob(parseControlJob(await requestControl(endpoint, token, `/v1/jobs/${resumeId}`), resumeId)); setIntent(null); })}>{t('恢复查询', 'Resume status')}</button></section></div>
    {job && <section className="transportPanel" aria-live="polite"><h2>{t('运行状态', 'Run status')}: {job.state}</h2><p><code>{job.id}</code> · {job.elapsedSeconds.toFixed(1)} s · {t('进程已结束', 'Process stopped')}: {String(job.processStopped)}</p>{job.reason && <p>{job.reason}</p>}<div className="transportActions"><button disabled={busy || !connected} onClick={() => void act(async () => setJob(parseControlJob(await requestControl(endpoint, token, `/v1/jobs/${job.id}`), job.id)))}>{t('刷新', 'Refresh')}</button><button disabled={busy || !connected || !active} onClick={() => void act(async () => setJob(parseControlJob(await requestControl(endpoint, token, `/v1/jobs/${job.id}/cancel`, { method: 'POST' }), job.id)))}>{t('请求取消', 'Request cancellation')}</button><button disabled={busy || !connected || !terminal.has(job.state)} onClick={() => void act(async () => onResult(matchControlResult(await requestControl(endpoint, token, `/v1/jobs/${job.id}/result`), job.id, intent ? JSON.parse(intent.body).spec : undefined)))}>{t('校验并读取结果', 'Validate & load result')}</button><button disabled={busy || active} onClick={() => { setJob(null); setIntent(null); }}>{t('准备新的运行', 'Prepare a new run')}</button></div></section>}
    {intent && <button onClick={() => download(`${engine}-pending-request.json`, JSON.stringify(intent, null, 2))}>{t('保存待确认请求（不含令牌）', 'Save pending request (without token)')}</button>}
    {error && <p role="alert">{error}</p>}
  </>;
}
