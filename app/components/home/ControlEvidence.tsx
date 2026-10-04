'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { EChartsType } from 'echarts/core';
import { controlEvidence, controlTotals } from './home-content';
import { useChartTheme } from '../charts/chart-theme';
import { buildControlChartOption } from './control-chart-option';
import './control-evidence.css';

export function ControlMetrics({ en }: { en: boolean }) {
  const metrics = [
    ['700+', en ? 'Device discharges using the controller' : '次装置放电应用'],
    ['≤ 2 cm', en ? 'Reported plasma-shape error' : '位形控制误差'],
    ['< 10 kA', en ? 'Reported plasma-current error' : '等离子体电流控制误差'],
    ['400–600 kA', en ? 'Plasma-current plateaus covered' : '覆盖等离子体电流平台'],
  ];
  return <div className="fdPerformanceMetrics">{metrics.map(([value, label]) => <div key={value}><strong>{value}</strong><span>{label}</span></div>)}</div>;
}

export default function ControlEvidence({ en }: { en: boolean }) {
  const palette = useChartTheme();
  const labels = en ? ['Success', 'Failed', 'Operation', 'Success rate'] : ['成功', '失败', 'Operation', '成功率'];
  const container = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    let disposed = false;
    let chart: EChartsType | undefined;
    let resize: ResizeObserver | undefined;
    const observer = new IntersectionObserver(async ([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      setReady(false);
      try {
        const [echarts, charts, components, renderers] = await Promise.all([import('echarts/core'), import('echarts/charts'), import('echarts/components'), import('echarts/renderers')]);
        if (disposed) return;
        echarts.use([charts.BarChart, charts.LineChart, components.GridComponent, components.TooltipComponent, components.LegendComponent, components.AriaComponent, renderers.SVGRenderer]);
        chart = echarts.init(element, undefined, { renderer: 'svg' });
        chart.setOption(buildControlChartOption(palette, en));
        resize = new ResizeObserver(() => chart?.resize()); resize.observe(element); setReady(true);
      } catch { /* The source image and complete accessible table remain available. */ }
    }, { rootMargin: '150px' });
    observer.observe(element);
    return () => { disposed = true; observer.disconnect(); resize?.disconnect(); chart?.dispose(); };
  }, [en, palette]);
  return <div className="fdCaseChart fdEvidenceCard" style={{ '--fd-evidence-volume': palette.info, '--fd-evidence-rate': palette.violet } as CSSProperties}>
    <div className="fdChartTitle"><span>{en ? 'CONTROLLER APPLICATIONS / BY STAGE' : '控制器实验应用 / 分阶段统计'}</span><span>{en ? 'Source: team chart' : '来源：团队图表'}</span></div>
    <div className="fdEvidenceLeads">
      <div><span>{en ? 'STAGE APPLICATIONS' : '阶段应用次数'}</span><strong>15 <i aria-hidden="true">→</i> 606</strong><small><b>40.4×</b> {en ? 'first to latest stage' : '首阶段至最新阶段'}</small></div>
      <div><span>{en ? 'SUCCESS RATE' : '成功率'}</span><strong>53% <i aria-hidden="true">→</i> 94%</strong><small><b>+41</b> {en ? 'percentage points' : '个百分点'}</small></div>
    </div>
    <ul className="fdChartLegend" aria-label={en ? 'Chart legend' : '图例'}>{labels.map((label,index)=><li key={label}><i className={'fdLegendKey fdLegendKey'+index} style={{color:[palette.info,palette.accent,palette.subtle,palette.violet][index]}} aria-hidden="true"/>{label}</li>)}</ul>
    <div className="fdChartShell fdEvidencePlot">
      <div className="fdEvidencePlotHeading" aria-hidden="true"><span>{en ? '01 / APPLICATION VOLUME' : '01 / 应用次数'}</span><span>{en ? 'discharges' : '次'}</span></div>
      <div className="fdEvidencePlotHeading fdEvidencePlotHeadingRate" aria-hidden="true"><span>{en ? '02 / SUCCESS RATE' : '02 / 成功率'}</span><span>0–100%</span></div>
      <div ref={container} className="fdControlChart" data-echart="homepage-control-evidence" aria-hidden="true" />
      {!ready && <div className="fdEvidenceFallback">{controlEvidence.stages.map(item => <article key={item.period}><span>{item.period}</span><strong>{item.total} <small>{en ? 'applications' : '次应用'}</small></strong><b>{item.reportedRate}% <small>{en ? 'success rate' : '成功率'}</small></b><p>{labels[0]} {item.success} · {labels[1]} {item.failed}<br/>Operation {item.operation}</p></article>)}</div>}
    </div>
    <p className="fdEvidenceAccessible">{en ? 'EXL-50U stage statistics. ' : 'EXL-50U 分阶段统计。'}{controlEvidence.stages.map(item => `${item.period}: ${en?'total':'总数'} ${item.total}, ${labels[0]} ${item.success}, ${labels[1]} ${item.failed}, Operation ${item.operation}, ${labels[3]} ${item.reportedRate}%. `).join('')}</p>
    <p className="fdChartNotice">{en ? 'Unequal stage windows; the 40.4× comparison is not a time-normalized growth rate.' : '阶段窗口不等长；40.4× 为阶段次数对比，不代表单位时间增长率。'}</p>
    <details className="fdDataNote"><summary>{en ? 'Counts, definitions & original chart' : '展开统计明细与原图'}</summary>
      <p>{en ? 'Metrics apply to tested conditions. Error definitions, evaluation windows and shot-level coverage await supporting data; they are not guarantees for every discharge.' : '指标适用于已测试工况；误差定义、统计窗口及逐炮覆盖范围待补充，不代表对所有放电的性能保证。'}</p>
      <div className="fdTableScroll"><table><caption>{en?'User-supplied stage counts and confirmed rates':'用户提供的分阶段统计与确认成功率'}</caption><thead><tr>{(en?['Period','Total','Success','Failed','Operation','Success rate']:['阶段','总数','成功','失败','Operation','成功率']).map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{controlEvidence.stages.map(item=><tr key={item.period}><th scope="row">{item.period}</th><td>{item.total}</td><td>{item.success}</td><td>{item.failed}</td><td>{item.operation}</td><td>{item.reportedRate}%</td></tr>)}</tbody></table></div>
      <p>{en ? `The four stages contain ${controlTotals.total} entries: ${controlTotals.success} success, ${controlTotals.failed} failed, ${controlTotals.operation} Operation. “700+” describes controller use, not successful takeovers.` : `四阶段合计 ${controlTotals.total} 条：成功 ${controlTotals.success}、失败 ${controlTotals.failed}、Operation ${controlTotals.operation}。“700+”表示控制器应用，不是成功接管次数。`}</p>
      <p>{en?'Source received 1 Oct 2026. All four success rates were confirmed by the user on 5 Oct 2026; this is not an independent audit. Rates are supplied statistics, not recalculated from the count categories. Operation retains the source category; its definition and shot-level deduplication await confirmation. Stage labels are retained without asserting an exact first-shot date.':'资料提供于 2026.10.01；四个阶段成功率已由用户于 2026.10.05 确认，非独立审计结果。成功率按提供的统计值呈现，不由柱状分类次数重新推算。Operation 保留原图分类，定义与逐炮去重待确认；阶段名称沿用原图，不另断言首次放电日期。'}</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="fdSourceChart" src="/images/exl50u-control-20261001.png" width="724" height="494" loading="lazy" alt={en?'Original team chart: applications 15, 70, 95, 606; success rates 53%, 70%, 73%, 94%.':'团队提供的原始四阶段图：应用次数 15、70、95、606，成功率 53%、70%、73%、94%。'}/>
    </details>
  </div>;
}
