'use client';
import { useState } from 'react';
import { loadScientificJson as loadScientificPayload } from '../physics';
import { download } from '../platform/display';
import published from '../data/control-runs.json';
import exampleCatalog from '../data/control-examples.json';
import type { ControlExampleEntry } from './examples';
import ControlExampleView from './ControlExampleView';
import { defaultControlSpec, parseControlResult, type ControlEngine, type ControlResult, type ControlRunEntry } from './contracts';
import { assessControlCoupling, controlSnapshot } from './coupling';
import ControlRunConfiguration from './ControlRunConfiguration';
import ControlResultView from './ControlResultView';
const loadScientificJson = (artifact: ControlRunEntry['artifact']) => loadScientificPayload(artifact, new AbortController().signal);

export default function ControlWorkspace({ engine, en, active = true }: { engine: ControlEngine; en: boolean; active?: boolean }) {
  const t = (zh: string, english: string) => en ? english : zh;
  const [tab, setTab] = useState('results');
  const example = (exampleCatalog as ControlExampleEntry[]).find(e => e.engineId === engine);
  const [result, setResult] = useState<ControlResult | null>(null);
  const [sampleIndex, setSampleIndex] = useState(0);
  const [error, setError] = useState('');
  const entries = (published as ControlRunEntry[]).filter(e => e.engineId === engine);
  const install = (r: ControlResult) => { setResult(r); setSampleIndex(0); setTab('results'); };
  return <main className="transportStudio"><header className="transportHeading"><div><p className="transportEyebrow">EXL-50U · VIRTUAL DISCHARGE</p><h1>{engine.toUpperCase()} <span>{t('控制仿真工作台', 'Control simulation studio')}</span></h1><p>{t('回放历史示例，探索控制响应，或连接计算节点运行。', 'Replay archived examples, explore control response, or connect a compute node.')}</p><p>{t('新运行默认时长', 'Default duration for new runs')}: {defaultControlSpec(engine).parameters.durationSeconds * 1000} ms · {t('需连接计算节点执行；历史示例保留原始时长。', 'Requires a compute node; archived examples retain their original duration.')}</p></div><span className="transportBadge">SIMULATED</span></header>
    <div className="transportTabs" role="tablist" aria-label={t('控制仿真视图', 'Control simulation views')}>{[['results', '示例与响应', 'Examples & response'], ['run', '配置与运行', 'Configure & run'], ['interface', 'TORAX 接口', 'TORAX interface']].map(([id, zh, english]) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{t(zh, english)}</button>)}</div>
    <div hidden={tab !== 'run'}><ControlRunConfiguration engine={engine} en={en} onResult={install} /><section className="transportPanel"><h2>{t('已发布运行', 'Published runs')}</h2>{entries.map(e => <button key={e.id} onClick={() => { setError(''); void loadScientificJson(e.artifact).then(parseControlResult).then(r => { if (r.id !== e.id || r.engine.id !== e.engineId || r.recipe !== e.recipe || r.origin !== e.origin) throw new Error('CONTROL_RESULT_BINDING'); install(r); }).catch(() => setError('CONTROL_ARTIFACT_VALIDATION_FAILED')); }}>{en ? e.labelEn : e.labelZh}</button>)}{entries.length === 0 && <p>{t('本版尚无通过新合同校验的公开云端运行。连接计算节点后可执行与回读；正式公开需要经过制品审核和发布。', 'No public cloud run has passed the new contract in this release. Connect a compute node to execute and collect results; public artifacts require review and publication.')}</p>}</section></div>
    <div hidden={tab !== 'results'}>{result ? <><button className="transportButton" onClick={() => setResult(null)}>{t('返回历史示例', 'Back to archived example')}</button><ControlResultView result={result} en={en} index={sampleIndex} onIndex={setSampleIndex} /></> : example ? <ControlExampleView key={example.id} entry={example} en={en} active={active && tab === 'results'} /> : <section className="transportPanel"><h2>{t('尚未加载结果', 'No result loaded')}</h2><p>{t('请先完成云端运行，或选择已发布算例。不使用占位曲线。', 'Complete a cloud run or select a published case. No placeholder curves are generated.')}</p></section>}</div>
    <div hidden={tab !== 'interface'}><section className="transportPanel"><h2>{engine.toUpperCase()} ⇄ TORAX</h2><p>{t('本版提供接口证据和缺项清单，不执行耦合推进。TORAX 剖面、控制响应与磁平衡使用独立合同；现有 FUSE → TORAX 路径保持不变。', 'This release provides interface evidence and missing requirements, not coupled execution. TORAX profiles, control response and equilibrium use separate contracts; the existing FUSE → TORAX path is unchanged.')}</p>{[assessControlCoupling(result, 'torax', sampleIndex), assessControlCoupling(null, engine)].map(a => <div key={a.direction}><h3>{a.direction} · BLOCKED</h3><ul>{a.requirements.map(r => <li key={r.id}>{r.status === 'satisfied' ? '✓' : '○'} {en ? r.en : r.zh}</li>)}</ul></div>)}<p>{t('下一步：单向初始化映射 → 同装置算例验证 → 守恒与耦合步长测试 → 双向联合推进。不能仅用 Te/Ti/ne 推算总压力，也不能把未知磁通单位的 Fx 当作 TORAX 几何。', 'Next: one-way initialization mapping → common-device validation → conservation and coupling-step tests → joint advancement. Te/Ti/ne alone do not determine total pressure; Fx with unknown units is not TORAX geometry.')}</p><button disabled={!result} onClick={() => result && download(result.id + '-interface.json', JSON.stringify(controlSnapshot(result, sampleIndex), null, 2))}>{t('导出当前时刻接口证据', 'Export interface evidence at selected time')}</button></section></div>
    {error && <p role="alert">{error}</p>}
  </main>;
}
