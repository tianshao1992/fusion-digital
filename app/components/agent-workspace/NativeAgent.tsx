'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useI18n } from '@/app/i18n';
import type { NativeAgentConnection, NativeAgentResponse } from '@/app/agent/native-contracts';
import { runNativeTask } from '@/app/agent/native-client';
import type { SiteActionContext, SiteActionReceipt } from '@/app/agent/site-actions';
import type { CanvasArtifactInput } from '@/app/agent/local-canvas';
import { useSiteOperations } from './SiteOperations';
import './native-agent.css';

type Task = { id: string; question: string; state: 'thinking' | 'executing' | 'completed' | 'failed' | 'cancelled';
  round: number; answer: string; provider?: string; model?: string; currentTool?: string; receipts: SiteActionReceipt[] };

export default function NativeAgent({ onBusyChange, onCanvasArtifact, onOpenReference }: {
  onBusyChange: (busy: boolean) => void; onCanvasArtifact: (artifact: CanvasArtifactInput) => void; onOpenReference: () => void;
}) {
  const { locale } = useI18n();
  const en = locale === 'en';
  const operations = useSiteOperations();
  const [connection, setConnection] = useState<NativeAgentConnection | null>(null);
  const [connected, setConnected] = useState(false);
  const [provider, setProvider] = useState('');
  const [draft, setDraft] = useState('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [busy, setBusy] = useState(false);
  const [snapshot, setSnapshot] = useState<SiteActionContext | null>(null);
  const [connectionError, setConnectionError] = useState('');
  const controllerRef = useRef<AbortController | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const taskEpoch = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/agent/native', { signal: controller.signal, credentials: 'same-origin' })
      .then(async response => {
        if (!response.ok) throw new Error('Connection unavailable');
        const data = await response.json() as NativeAgentConnection;
        if (!Array.isArray(data.providers)) throw new Error('Invalid connection');
        setConnection(data);
        setProvider(data.defaultProvider ?? '');
      }).catch(() => { if (!controller.signal.aborted) setConnectionError(en ? 'Could not check the model connection.' : '暂时无法检查模型连接。'); });
    return () => controller.abort();
  }, [en]);

  useEffect(() => {
    onBusyChange(busy);
  }, [busy, onBusyChange]);

  useEffect(() => {
    const update = () => { if (operations) setSnapshot(operations.getContext()); };
    const timer = window.setInterval(update, 1_500);
    return () => window.clearInterval(timer);
  }, [operations]);

  useEffect(() => {
    const epoch = taskEpoch.current;
    queueMicrotask(() => {
      if (taskEpoch.current === epoch) setTasks(current => current.map(task => task.state === 'thinking' || task.state === 'executing'
        ? { ...task, state: 'cancelled', answer: en ? 'Language changed. The task stopped; applied steps are retained.' : '语言已切换，任务已停止；已执行步骤保留。' } : task));
    });
    // A language change ends the old task; late results cannot overwrite the new language.
    return () => { taskEpoch.current += 1; controllerRef.current?.abort(); operations?.cancel(); };
  }, [en, operations]);

  useEffect(() => {
    if (!busy) return;
    const interrupt = (event: Event) => {
      if (!event.isTrusted || !(event.target instanceof Element) || event.target.closest('.agentWorkspaceRoot')) return;
      controllerRef.current?.abort();
      operations?.cancel();
    };
    const events = ['pointerdown', 'keydown', 'wheel'] as const;
    events.forEach(name => window.addEventListener(name, interrupt, { capture: true, passive: true }));
    return () => events.forEach(name => window.removeEventListener(name, interrupt, true));
  }, [busy, operations]);

  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' }); }, [tasks]);

  async function submit(event?: FormEvent, suggested?: string) {
    event?.preventDefault();
    const question = (suggested ?? draft).trim().slice(0, 600);
    if (!operations || controllerRef.current || !question || !connected || !connection?.available) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    const epoch = taskEpoch.current;
    const id = crypto.randomUUID();
    const patch = (update: Partial<Task>) => {
      if (taskEpoch.current === epoch) setTasks(current => current.map(task => task.id === id ? { ...task, ...update } : task));
    };
    const receipts: SiteActionReceipt[] = [];
    const history = tasks.slice(-3).flatMap(task => [{ role: 'user' as const, content: task.question },
      { role: 'assistant' as const, content: JSON.stringify({ status: task.state, summary: task.answer.slice(0, 1800), results: task.receipts }) }]);
    setTasks(current => [...current.slice(-7), { id, question, state: 'thinking', round: 0, answer: '', receipts: [] }]);
    setDraft('');
    setBusy(true);
    try {
      await runNativeTask({ question, locale: en ? 'en' : 'zh', provider, history, runtime: operations,
        signal: controller.signal, onEvent: event => {
          if (taskEpoch.current !== epoch) return;
          if (event.phase === 'thinking') patch({ state: 'thinking', round: event.round, currentTool: undefined });
          else if (event.phase === 'executing') patch({ state: 'executing', currentTool: event.response.toolCall?.name,
            provider: event.response.provider, model: event.response.model, round: event.response.round });
          else if (event.phase === 'observed') { receipts.push(event.receipt); patch({ receipts: [...receipts] }); setSnapshot(event.context); }
          else patch({ state: event.response.status as Task['state'], answer: finalAnswer(event.response),
            provider: event.response.provider, model: event.response.model, currentTool: undefined });
        } });
    } catch (error) {
      patch({ state: controller.signal.aborted ? 'cancelled' : 'failed', currentTool: undefined,
        answer: controller.signal.aborted ? (en ? 'Stopped. Applied steps remain visible below.' : '任务已停止，已执行步骤保留在下方。')
          : error instanceof Error ? error.message : (en ? 'Task failed.' : '任务未完成。') });
    } finally {
      if (controllerRef.current === controller) { controllerRef.current = null; setBusy(false); }
    }
  }

  function stop() { controllerRef.current?.abort(); operations?.cancel(); }
  async function undo() {
    if (!operations || busy) return;
    const controller = new AbortController();
    const id = crypto.randomUUID();
    controllerRef.current = controller;
    setBusy(true);
    try {
      const receipts = await operations.execute({ version: 1, actions: [{ type: 'site.undo' }] }, {
        runId: id, expected: operations.getContext(), signal: controller.signal,
      });
      setTasks(current => [...current.slice(-7), { id, question: en ? 'Undo last action' : '撤销上一步',
        state: receipts[0]?.status === 'applied' ? 'completed' : 'failed', round: 0,
        answer: en ? 'Executed directly from the undo control.' : '通过撤销按钮直接执行。', receipts }]);
    } finally { controllerRef.current = null; setBusy(false); }
  }

  const prompts = en ? ['Show the EXL-50U assembly from above, then make it semi-transparent.', 'Open fusion data, inspect the shots and show shot 21102.', 'Read this page and explain what you can operate.']
    : ['带我看 EXL-50U 总装，从顶部观察，再设为半透明。', '进入聚变数据，查看可用炮次并切换到 21102。', '先看看当前页面，再告诉我你可以操作哪些内容。'];
  const model = connection?.providers.find(item => item.id === provider);
  const checkingConnection = connection === null && !connectionError;
  const connectionUnavailable = connection?.available === false || Boolean(connectionError);
  return <section className="nativeAgent" aria-label={en ? 'Website agent' : '全站智能体'}>
    <div className="nativeAgentConnection" data-connected={connected && connection?.available}>
      <div><b>{connected && connection?.available ? (en ? 'Model connected' : '模型已连接') : (en ? 'Connect a model' : '连接模型')}</b>
        <span>{model ? `${model.label} · ${model.model}` : checkingConnection ? (en ? 'Checking availability…' : '正在检查可用模型…')
          : connectionError ? (en ? 'Model connection temporarily unavailable' : '模型连接暂不可用')
            : connection?.available ? (en ? 'Choose an available model' : '请选择可用模型')
              : (en ? 'Model connections are not enabled on this site' : '当前站点未开放模型连接')}</span></div>
      {connection?.available && <button type="button" disabled={busy} onClick={() => setConnected(value => !value)}>{connected ? (en ? 'Disconnect' : '断开') : (en ? 'Connect' : '连接模型')}</button>}
      {connection?.available && <label>{en ? 'Model provider' : '模型供应商'}<select value={provider} disabled={busy} onChange={event => { setProvider(event.target.value); setConnected(false); }}>
        {connection.providers.filter(item => item.available).map(item => <option key={item.id} value={item.id}>{item.label} · {item.model}</option>)}
      </select></label>}
      <p>{connection?.available
        ? en ? 'The model receives the current page and tool results, chooses actions and continues until finished. You can stop at any time.' : '模型读取当前页面和执行结果，自主选择工具并连续完成任务。你可以随时停止。'
        : connectionError || connection?.reason || (en ? 'Checking the model connection…' : '正在检查模型连接…')}</p>
      {!connection?.available && <small>{en ? 'Native execution needs a configured model. Local shortcuts remain available in the other tab.' : '智能体执行需要可用模型。另一个标签仍可使用检索和本地快捷操作。'}</small>}
      {connectionUnavailable && <button type="button" disabled={busy} onClick={onOpenReference}>{en ? 'Open research and shortcuts' : '使用检索与快捷操作'}</button>}
    </div>
    <details className="nativeAgentObservation"><summary>{en ? 'Current page' : '当前页面'} · {snapshot?.page?.title || snapshot?.path || '/'}</summary>
      <p>{en ? 'Available actions' : '当前可用操作'}：{snapshot?.capabilities.length ?? 0} · {en ? 'Page controls' : '页面控件'}：{snapshot?.page?.controls.length ?? 0}</p>
      <ul>{snapshot?.page?.controls.slice(0, 12).map(control => <li key={control.id}>{control.label}</li>)}</ul>
    </details>
    <div className="nativeAgentLog" ref={logRef} role="log" aria-live="polite" aria-label={en ? 'Task history' : '任务记录'}>
      {!tasks.length && <div className="nativeAgentEmpty"><span>✦</span><h3>{en ? 'Describe the result you want.' : '告诉我你要达到的结果。'}</h3>
        <p>{en ? 'Navigate pages, inspect content, change CAD views and select data in one task.' : '跨页面浏览、读取内容、调整 CAD 视角、选择数据，可以交给同一个任务。'}</p>
        {prompts.map(prompt => <button key={prompt} type="button" disabled={!connected || busy} onClick={() => void submit(undefined, prompt)}>{prompt}<span aria-hidden="true">↗</span></button>)}
      </div>}
      {tasks.map(task => <article className="nativeAgentTask" key={task.id} data-state={task.state}>
        <h3>{task.question}</h3><div className="nativeAgentTaskStatus"><b>{stateLabel(task.state, en)}</b><small>{task.model ? `${task.provider} · ${task.model}` : ''}{task.round ? ` · ${en ? 'Round' : '第'} ${task.round}${en ? '' : ' 轮'}` : ''}</small></div>
        {task.currentTool && <p className="nativeAgentExecuting">{en ? 'Using' : '正在调用'} {task.currentTool}</p>}
        {task.receipts.length > 0 && <ol aria-label={en ? 'Tool results' : '工具执行结果'}>{task.receipts.map(receipt => <li key={receipt.actionId} data-status={receipt.status}>
          <b>{receipt.status === 'applied' ? '✓' : receipt.status === 'cancelled' ? '■' : '!'}</b><span>{receipt.message}</span></li>)}</ol>}
        {task.answer && <p className="nativeAgentAnswer">{task.answer}</p>}
        {task.answer && <button className="nativeAgentToCanvas" type="button" onClick={() => onCanvasArtifact({kind: 'markdown', title: task.question,
          content: [task.answer, ...task.receipts.map(receipt => `- ${receipt.status}: ${receipt.message}`)].join('\n\n'), sourceTurnId: task.id, citations: []})}>{en ? 'Send to Canvas' : '发送到 Canvas'}</button>}
      </article>)}
    </div>
    <form className="nativeAgentComposer" onSubmit={event => void submit(event)}>
      <label htmlFor="native-agent-goal">{en ? 'Task goal' : '任务目标'}</label>
      <textarea id="native-agent-goal" rows={3} maxLength={600} value={draft} onChange={event => setDraft(event.target.value)} placeholder={en ? 'Describe what you want me to do on this website…' : '描述你希望我在网站上完成什么…'} />
      <div><button type="button" disabled={busy || !tasks.some(task => task.receipts.some(receipt => receipt.status === 'applied'))} onClick={() => void undo()}>{en ? 'Undo last action' : '撤销上一步'}</button>
        {busy ? <button className="nativeAgentStop" type="button" onClick={stop}>{en ? 'Stop task' : '停止任务'}</button>
          : <button className="nativeAgentSubmit" type="submit" disabled={!connected || !connection?.available || !draft.trim()}>{en ? 'Run task' : '开始任务'} ↗</button>}</div>
      <small>{en ? 'Closing this panel keeps the task running. Applied actions are recorded individually.' : '收起面板后任务继续；每一步操作都有实际执行记录。'}</small>
    </form>
  </section>;
}

function finalAnswer(result: NativeAgentResponse) { return result.error?.message || result.answer; }
function stateLabel(state: Task['state'], en: boolean) {
  const labels = { thinking: ['正在观察与规划', 'Observing and planning'], executing: ['正在操作页面', 'Operating the page'], completed: ['模型已结束任务', 'Model finished'], failed: ['任务未完成', 'Task not completed'], cancelled: ['已停止', 'Stopped'] };
  return labels[state]?.[en ? 1 : 0] || state;
}
