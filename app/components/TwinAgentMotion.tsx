'use client';

import { useId } from 'react';
import './twin-agent-motion.css';
import { useI18n } from '@/app/i18n';

const ARTWORK = '/figures/fusion-twin-agent-governed-loop-image2-v1.webp';

export default function TwinAgentMotion({ compact = false }: { compact?: boolean }) {
  const { locale } = useI18n();
  const en = locale === 'en';
  const titleId = useId();
  const descriptionId = useId();
  const description = en
    ? 'Diagnostic evidence synchronizes a fusion device with an uncertainty-aware digital twin. AI agents retrieve, simulate and plan in shadow mode; deterministic safety controls and human authorization remain the only path to plant action.'
    : '诊断证据将聚变装置与具备不确定度表征的数字孪生同步；AI 智能体只在影子模式下检索、仿真和规划，任何装置动作仍必须经过确定性安全控制与人工授权。';

  const stages = en
    ? [
        ['01', 'Physical fusion system', 'Plasma · magnets · diagnostics'],
        ['02', 'Evidence-synchronized twin', 'State estimation · prediction · UQ'],
        ['03', 'Governed agent system', 'Retrieval · simulation · planning'],
      ]
    : [
        ['01', '聚变物理装置', '等离子体 · 磁体 · 诊断'],
        ['02', '证据同步数字孪生', '状态估计 · 预测 · 不确定度'],
        ['03', '受治理智能体系统', '检索 · 仿真 · 规划'],
      ];

  return (
    <figure className={`taMotion${compact ? ' compact' : ''}`} aria-labelledby={titleId} aria-describedby={descriptionId}>
      <header className="taTop">
        <span id={titleId}>FUSION · TWIN · AGENT LOOP</span>
        <b>{en ? 'SHADOW MODE · HUMAN AUTHORITY' : '影子运行 · 人类最终授权'}</b>
      </header>

      <div className="taArtwork" aria-hidden="true">
        <img src={ARTWORK} alt="" width="1586" height="992" loading="eager" decoding="async" />
        <span className="taArtworkTag">{en ? 'AI-NATIVE FUSION DIGITAL TWIN' : '智能原生聚变数字孪生'}</span>
      </div>

      <div className="taStages">
        {stages.map(([index, title, detail]) => (
          <section key={index}>
            <span>{index}</span>
            <div><h3>{title}</h3><p>{detail}</p></div>
          </section>
        ))}
      </div>

      <div className="taReturn">
        <span>{en ? 'AI recommendation' : 'AI 建议'}</span>
        <i />
        <strong>{en ? 'Deterministic safety envelope · authorization gate · human approval' : '确定性安全包络 · 权限门 · 人工批准'}</strong>
        <i />
        <span>{en ? 'Validated action' : '验证后动作'}</span>
      </div>

      <figcaption id={descriptionId} className="taBottom">{description}</figcaption>
    </figure>
  );
}
