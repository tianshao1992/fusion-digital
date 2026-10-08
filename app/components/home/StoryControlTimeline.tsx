'use client';

import { useEffect, useRef, useState } from 'react';
import { controlEvidence, controlTotals } from './home-content';

const phases = [
  { title: ['从第一次验证开始', 'The first validation'], copy: ['单点位形控制验证，让强化学习走进真实装置。', 'Single-point shape-control validation brings reinforcement learning to the device.'] },
  { title: ['从接入，走向批量验证', 'From integration to repeatability'], copy: ['平台接入与批量验证，逐步扩展位形控制的应用。', 'Platform integration and batch validation expand the use of shape control.'] },
  { title: ['在物理实验中扩大应用', 'Supporting more physics experiments'], copy: ['规模化应用，以变目标控制支持锁模等物理实验。', 'Larger-scale application and variable targets support locked-mode and other physics studies.'] },
  { title: ['从实验方法，成为日常能力', 'Becoming an everyday capability'], copy: ['随装置升级持续打磨，支持高参数实验与常态化运行。', 'Continued refinement supports high-parameter experiments and routine operation.'] },
];

export default function StoryControlTimeline({ en }: { en: boolean }) {
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [visible, setVisible] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReducedMotion(media.matches);
    sync(); media.addEventListener('change', sync);
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: .2 });
    if (panel.current) observer.observe(panel.current);
    return () => { media.removeEventListener('change', sync); observer.disconnect(); };
  }, []);
  useEffect(() => {
    if (!playing || !visible || reducedMotion) return;
    const timer = window.setTimeout(() => {
      if (active < 3) setActive(active + 1);
      else setPlaying(false);
    }, 2800);
    return () => window.clearTimeout(timer);
  }, [active, playing, visible, reducedMotion]);
  const stage = controlEvidence.stages[active];
  const choose = (index: number) => { setActive(index); setPlaying(false); };
  const toggle = () => {
    if (reducedMotion) { choose((active + 1) % 4); return; }
    if (!playing && active === 3) setActive(0);
    setPlaying(!playing);
  };
  const points = controlEvidence.stages.map((s, i) => `${85 + i * 135},${352 - s.reportedRate * .7}`);
  return <div className="ssTimeline" ref={panel} data-active-stage={active} data-playing={playing && visible && !reducedMotion}>
    <div className="ssTimelineHeader"><span>2025 — 2026</span><button type="button" onClick={toggle}>{reducedMotion ? (en ? 'Next stage' : '下一阶段') : playing ? (en ? 'Pause' : '暂停') : active === 3 ? (en ? 'Replay' : '重播') : (en ? 'Play' : '播放')}</button></div>
    <div className="ssStageCopy" aria-live={playing ? 'off' : 'polite'}><span>{stage.period}</span><h3>{phases[active].title[en ? 1 : 0]}</h3><p>{phases[active].copy[en ? 1 : 0]}</p></div>
    <svg className="ssGrowthPlot" viewBox="0 0 580 388" role="img" aria-labelledby="growth-title growth-desc">
      <title id="growth-title">{en ? 'Controller applications and success rate by stage' : '智能控制分阶段应用次数与成功率'}</title>
      <desc id="growth-desc">{controlEvidence.stages.map(s => `${s.period}: ${s.total} ${en ? 'applications' : '次应用'}, ${s.reportedRate}%.`).join(' ')}</desc>
      <g fontSize="12" fill="var(--color-ink-muted)"><text x="12" y="22">{en ? 'APPLICATIONS BY STAGE' : '阶段应用次数'}</text><text x="558" y="52" textAnchor="end">700</text><text x="558" y="227" textAnchor="end">0</text><text x="12" y="266">{en ? 'SUCCESS RATE' : '阶段成功率'}</text><text x="558" y="287" textAnchor="end">100%</text><text x="558" y="352" textAnchor="end">0%</text></g>
      <g stroke="var(--color-border)" strokeWidth="1"><path d="M35 55H525M35 223H525M35 282H525M35 352H525"/></g>
      {controlEvidence.stages.map((s, i) => {
        const height = s.total / 700 * 168;
        return <g key={s.period} className={i <= active ? 'ssPlotStage is-shown' : 'ssPlotStage'} data-period={s.period}>
          <rect className="ssBarGhost" x={60 + i * 135} y={223 - height} width="50" height={height} rx="2"/>
          <rect className="ssBar" x={60 + i * 135} y={i <= active ? 223 - height : 223} width="50" height={i <= active ? height : 0} rx="2"/>
          <text className="ssBarValue" x={85 + i * 135} y={210 - height} textAnchor="middle">{s.total}</text>
          <text className="ssPeriod" x={85 + i * 135} y="245" textAnchor="middle">{s.period}</text>
        </g>;
      })}
      <polyline points={points.join(' ')} fill="none" stroke="var(--color-border)" strokeWidth="1.5"/>
      {points.slice(1).map((point, i) => <path key={i} className={i < active ? 'ssRateLine is-shown' : 'ssRateLine'} d={`M${points[i]} L${point}`} pathLength="1" fill="none" stroke="var(--color-accent-strong)" strokeWidth="2.5"/>)}
      {controlEvidence.stages.map((s, i) => <g key={s.period} className={i <= active ? 'ssRatePoint is-shown' : 'ssRatePoint'}><circle cx={85 + i * 135} cy={352 - s.reportedRate * .7} r={i === active ? 5 : 3}/><text x={85 + i * 135} y={340 - s.reportedRate * .7} textAnchor="middle">{s.reportedRate}%</text></g>)}
    </svg>
    <div className="ssTimelineControl"><label htmlFor="control-stage">{en ? 'Drag through the journey' : '拖动，回看成长过程'}</label><input id="control-stage" aria-label={en ? 'Control development stage' : '智能控制发展阶段'} aria-valuetext={`${stage.period} ${phases[active].title[en ? 1 : 0]}`} type="range" min="0" max="3" step="1" value={active} onChange={e => choose(Number(e.target.value))}/><div>{controlEvidence.stages.map((s, i) => <button type="button" key={s.period} onClick={() => choose(i)} aria-pressed={i === active}>{s.period}</button>)}</div></div>
    <details className="ssEvidenceNote"><summary>{en ? 'Source & stage definitions' : '统计来源与阶段说明'}</summary><p>{en ? `User-provided team statistics: ${controlTotals.total} stage entries, ${controlTotals.success} success, ${controlTotals.failed} failed, ${controlTotals.operation} Operation. Rates 53%, 70%, 73%, 94% were confirmed on 5 Oct 2026 and are not recomputed from categories. Stages have unequal time windows. 94% is the latest stage, not the overall rate.` : `团队提供的阶段统计：合计 ${controlTotals.total} 条，成功 ${controlTotals.success}、失败 ${controlTotals.failed}、Operation ${controlTotals.operation}。53%、70%、73%、94% 已于 2026.10.05 确认，沿用提供值，不由分类重新推算。阶段窗口不等长；94% 为末阶段成功率，不是全期成功率。`}</p><p>{en ? '700+ refers to applications, not successful takeovers. Performance metrics describe tested conditions; statistical definitions and shot-level coverage remain to be supplied. The animation reveals discrete stages, not continuous measurements.' : '700+ 指控制器应用，不是成功接管次数。误差指标对应已测试工况，统计定义与逐炮覆盖范围待补充。动画仅逐阶段呈现数据，不表示连续实测过程。'}</p><a href="/control/exl50u">{en ? 'Full case and original chart' : '完整案例与原始图表'}</a></details>
  </div>;
}
