'use client';

import { useState } from 'react';
import { TwinValueDiagram } from './StoryScienceGraphics';
import './agent-learning-cycle.css';

const stages = [
  {
    id: 'verify', title: ['验证', 'Validate'],
    action: ['调用孪生，让候选策略接受检验。', 'Call the twin. Put a candidate policy to the test.'],
    nodes: [['提出候选策略', 'Propose a policy'], ['回放 · 物理校验', 'Replay · physics checks'], ['独立实验对照', 'Independent evidence']],
    result: ['评测报告与适用边界', 'Evaluation report & valid operating range'],
    context: ['智能体组织测试，数字孪生推演响应，再与未参与校准的实验数据比较。', 'The agent organizes tests, the twin predicts the response, and held-out experiments provide an independent comparison.'],
  },
  {
    id: 'extend', title: ['外推', 'Explore'],
    action: ['识别未知，选择最值得做的下一次实验。', 'Find the unknown. Choose the next informative experiment.'],
    nodes: [['发现证据缺口', 'Find evidence gaps'], ['多保真推演筛选', 'Multi-fidelity screening'], ['建议新实验', 'Propose a new test']],
    result: ['待验证的实验候选', 'An experiment candidate, not a verified result'],
    context: ['智能体综合不确定性、物理约束与实验成本筛选工况；新实验经专家确认后检验外推。', 'The agent balances uncertainty, physical constraints and experimental cost. Expert-approved experiments test the extrapolation.'],
  },
  {
    id: 'evolve', title: ['进化', 'Evolve'],
    action: ['改进的不只是模型，还有智能体自身。', 'Improve the model—and how the agent itself works.'],
    nodes: [['归因失败与偏差', 'Learn from failures'], ['改写工具与工作流', 'Revise tools & workflow'], ['独立回归评测', 'Independent evaluation']],
    result: ['通过才更新 Aₙ₊₁；否则保留 Aₙ', 'Promote Aₙ₊₁ only if it passes; otherwise retain Aₙ'],
    context: ['实验反馈校准孪生，也驱动智能体提出自身改进。候选版本必须通过独立评测，才能进入下一轮。', 'Experiment feedback calibrates the twin and informs changes to the agent. A candidate revision must pass independent evaluation before the next cycle.'],
  },
] as const;

/** Small qualitative diagrams: no numeric score or live model execution is implied. */
function StageGraphic({ index, en }: { index: number; en: boolean }) {
  const descriptions = en ? [
    'Predicted response and independent observations are compared, rather than assumed to agree.',
    'A validated region and uncertain candidates outside it; one candidate is selected for a new experiment.',
    'Agent A n proposes a revision, tests it, and promotes the next version only if it passes; rejected revisions retain the old version.',
  ] : [
    '模型预测与独立观测对照；偏差是需要检验的对象，而不是预设一致。',
    '已验证区域之外仍存在不确定性；智能体选择候选工况，交给新实验检验。',
    '智能体 A n 提出改进，独立评测通过才进入下一版本；未通过则保留旧版本。',
  ];
  return <svg className="alGraphic" viewBox="0 0 240 104" role="img" aria-label={descriptions[index]}>
    {index === 0 ? <>
      <path className="alAxis" d="M14 10V78H225"/>
      <path className="alBand" d="M18 64C48 57 67 19 100 28S148 60 181 23L221 14V32L184 41C150 76 125 48 100 44S48 73 18 78Z"/>
      <path className="alModel" d="M18 71C48 65 67 29 100 36S147 68 182 32L221 23"/>
      {[[31,64],[67,47],[106,34],[149,57],[190,26]].map(([x,y]) => <circle key={x} className="alSample" cx={x} cy={y} r="3.5"/>)}
      <path className="alResidual" d="M67 38V47M149 46V57"/>
      <text x="16" y="98">{en ? 'Prediction × observation' : '模型预测 × 独立观测'}</text>
    </> : index === 1 ? <>
      <path className="alAxis" d="M14 10V78H225"/>
      <path className="alBand" d="M18 65C62 32 105 64 138 37S184 23 221 9V68C181 50 162 77 133 62S68 53 18 78Z"/>
      <path className="alModel" d="M18 71C58 43 89 60 113 54"/>
      <path className="alCandidate" d="M113 54C150 38 178 23 221 37"/>
      <path className="alAxis" strokeDasharray="3 4" d="M113 10V78"/>
      <circle className="alOpenSample" cx="155" cy="39" r="5"/><circle className="alSelected" cx="185" cy="31" r="6"/><circle className="alOpenSample" cx="215" cy="35" r="5"/>
      <text x="16" y="98">{en ? 'Known → candidate' : '已知边界 → 待验证工况'}</text>
    </> : <>
      <path className="alModel" d="M46 37H86M133 37H175"/>
      <path className="alArrow" d="m79 33 7 4-7 4m89-8 7 4-7 4"/>
      <rect className="alNode" x="8" y="19" width="40" height="36" rx="5"/><text className="alVersion" x="28" y="42" textAnchor="middle">Aₙ</text>
      <path className="alNode" d="m110 10 29 27-29 27-29-27Z"/><text x="110" y="41" textAnchor="middle">{en ? 'Test' : '评测'}</text>
      <rect className="alNextNode" x="174" y="19" width="58" height="36" rx="5"/><text className="alVersion" x="203" y="42" textAnchor="middle">Aₙ₊₁</text>
      <text x="152" y="18" textAnchor="middle">{en ? 'Pass' : '通过'}</text>
      <path className="alResidual" d="M110 66V80H28V59m-4 7 4-7 4 7"/>
      <text x="104" y="99" textAnchor="middle">{en ? 'Otherwise retain Aₙ' : '未通过，保留 Aₙ'}</text>
    </>}
  </svg>;
}

export default function AgentLearningCycle({ en }: { en: boolean }) {
  const [selected, setSelected] = useState(0);
  const t = (copy: readonly [string, string]) => copy[en ? 1 : 0];
  const stage = stages[selected];
  return <div className="alCycle" data-phase={stage.id}>
    <div className="alOverview">
      <p className="alEyebrow">FusionEvolve <span>×</span> FusionDigital</p>
      <TwinValueDiagram en={en} phase={selected}/>
      <div className="alContext" role="status" aria-live="polite" aria-atomic="true" id="agent-cycle-context">
        <span>{en ? 'AGENT IN ACTION' : '智能体如何行动'} / 0{selected + 1}</span>
        <p>{t(stage.context)}</p>
      </div>
    </div>
    <div className="alStages" role="group" aria-label={en ? 'Agent validation, exploration and evolution' : '智能体的验证、外推与进化'}>
      {stages.map((item, index) => <article key={item.id} className="alStage" data-active={selected === index} data-agent-phase={item.id}>
        <h3 className="alStageHeading"><button type="button" className="alStageSelect" aria-pressed={selected === index} aria-controls="agent-cycle-context" onClick={() => setSelected(index)}>
          <span className="alNumber">0{index + 1}</span><span className="alTitle">{t(item.title)}</span><span className="alAction">{t(item.action)}</span>
        </button></h3>
        <div className="alStageBody">
          <ol className="alSteps" aria-label={en ? `${t(item.title)} workflow` : `${t(item.title)}流程`}>{item.nodes.map((node, i) => <li key={node[1]}><span aria-hidden="true">{i + 1}</span>{t(node)}</li>)}</ol>
          <StageGraphic index={index} en={en}/>
        </div>
        <p className="alResult"><span>{en ? 'OUTPUT' : '产出'}</span>{t(item.result)}</p>
      </article>)}
      <p className="alCycleReturn"><span aria-hidden="true">↶</span>{en ? 'New evidence → twin calibration + agent revision → next validation cycle' : '新证据 → 孪生校准 + 智能体改进 → 下一轮验证'}</p>
    </div>
  </div>;
}
