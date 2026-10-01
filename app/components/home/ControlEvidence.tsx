'use client';

import { useEffect, useRef, useState } from 'react';
import type { EChartsType } from 'echarts/core';
import { controlEvidence, controlTotals } from './home-content';

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
      try {
        const [echarts, charts, components, renderers] = await Promise.all([import('echarts/core'), import('echarts/charts'), import('echarts/components'), import('echarts/renderers')]);
        if (disposed) return;
        echarts.use([charts.BarChart, charts.LineChart, components.GridComponent, components.TooltipComponent, components.LegendComponent, components.AriaComponent, renderers.SVGRenderer]);
        chart = echarts.init(element, undefined, { renderer: 'svg' });
        const labels = en ? ['Success', 'Failed', 'Operation', 'Reported success rate'] : ['成功', '失败', 'Operation', '原图报告成功率'];
        chart.setOption({
          animation: !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
          aria: { enabled: true },
          grid: { left: 40, right: 40, top: 62, bottom: 42 },
          textStyle: { fontFamily: 'Arial, Microsoft YaHei, sans-serif' },
          legend: { top: 12, textStyle: { color: '#5d5768', fontSize: 12 }, data: labels },
          tooltip: { trigger: 'axis', renderMode: 'richText', formatter: (params: unknown) => {
            const item = controlEvidence.stages[(params as { dataIndex: number }[])[0]?.dataIndex ?? 0];
            return `${item.period}\n${en?'Total':'总数'} ${item.total}\n${labels[0]} ${item.success} · ${labels[1]} ${item.failed} · Operation ${item.operation}\n${en?'Source rate':'原图成功率'} ${item.reportedRate}%${item.ratePending ? (en?' (definition pending)':'（口径待核验）'):''}`;
          } },
          xAxis: { type: 'category', data: controlEvidence.stages.map(item => item.period), axisLine: { lineStyle: { color: '#dad7e1' } }, axisTick: { show: false }, axisLabel: { color: '#635c6e', fontSize: 12, interval: 0 } },
          yAxis: [
            { type: 'value', min: 0, max: 700, interval: 200, axisLabel: { color: '#756d80', fontSize: 12 }, splitLine: { lineStyle: { color: '#e9e5ee' } } },
            { type: 'value', min: 50, max: 100, interval: 10, axisLabel: { color: '#537fb7', formatter: '{value}%', fontSize: 12 }, splitLine: { show: false } },
          ],
          series: [
            ...(['success', 'failed', 'operation'] as const).map((key, index) => ({ name: labels[index], type: 'bar', stack: 'shots', barMaxWidth: 65, itemStyle: { color: ['#72ad44','#ec8832','#a4a4a4'][index] }, data: controlEvidence.stages.map(item => item[key]), label: { show: index === 0, position: 'inside', color: '#fff', fontSize: 13, formatter: (p: {value: number}) => p.value >= 40 ? String(p.value) : '' } })),
            { type: 'bar', barGap: '-100%', barMaxWidth: 65, silent: true, itemStyle: { color: 'transparent' }, data: controlEvidence.stages.map(item => item.total), label: { show: true, position: 'top', color: '#4e72aa', fontSize: 14 } },
            { name: labels[3], type: 'line', yAxisIndex: 1, connectNulls: false, symbolSize: 8, itemStyle: { color: '#5b9fe3' }, lineStyle: { width: 2 }, data: controlEvidence.stages.map(item => item.ratePending ? null : item.reportedRate), label: { show: true, position: 'right', distance: 10, formatter: '{c}%', color: '#347bbd', fontSize: 13 } },
          ],
        });
        resize = new ResizeObserver(() => chart?.resize()); resize.observe(element); setReady(true);
      } catch { /* The source image and complete accessible table remain available. */ }
    }, { rootMargin: '150px' });
    observer.observe(element);
    return () => { disposed = true; observer.disconnect(); resize?.disconnect(); chart?.dispose(); };
  }, [en]);
  return <div className="fdCaseChart">
    <div className="fdChartTitle"><span>{en ? 'CONTROLLER APPLICATIONS / BY STAGE' : '控制器实验应用 / 分阶段统计'}</span><span>{en ? 'Source: team chart' : '来源：团队图表'}</span></div>
    <div className="fdChartShell"><div ref={container} className="fdControlChart" data-echart="homepage-control-evidence" aria-hidden="true" />{!ready && <div className="fdChartFallback" aria-hidden="true">{controlEvidence.stages.map(item => <div key={item.period}><strong>{item.total}</strong><span style={{height:`${item.total/700*210}px`, background:`linear-gradient(to top,#72ad44 0 ${item.success/item.total*100}%,#ec8832 ${item.success/item.total*100}% ${(item.success+item.failed)/item.total*100}%,#a4a4a4 ${(item.success+item.failed)/item.total*100}% 100%)`}}/><small>{item.period}</small></div>)}</div>}</div>
    <p className="fdChartNotice">{en ? `The four stages contain ${controlTotals.total} entries: ${controlTotals.success} success, ${controlTotals.failed} failed, ${controlTotals.operation} Operation. “700+” describes controller use, not successful takeovers.` : `四阶段合计 ${controlTotals.total} 条：成功 ${controlTotals.success}、失败 ${controlTotals.failed}、Operation ${controlTotals.operation}。“700+”表示控制器应用，不是成功接管次数。`}</p>
    <p className="fdChartNotice">{en ? '2026 Q1 rate omitted: the source reports 73%, while 64/(64+21) gives 75.3%. Definition pending; other rates reproduce the source.' : '2026 Q1 折线点暂不显示：原图为 73%，而 64/(64+21) = 75.3%，统计口径待核验；其余比例按原图呈现。'}</p>
    <details className="fdDataNote"><summary>{en ? 'Counts, definitions & original chart' : '展开统计明细与原图'}</summary>
      <div className="fdTableScroll"><table><caption>{en?'User-supplied stage counts':'用户提供的分阶段统计'}</caption><thead><tr>{(en?['Period','Total','Success','Failed','Operation','Source rate']:['阶段','总数','成功','失败','Operation','原图成功率']).map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{controlEvidence.stages.map(item=><tr key={item.period}><th scope="row">{item.period}</th><td>{item.total}</td><td>{item.success}</td><td>{item.failed}</td><td>{item.operation}</td><td>{item.reportedRate}%{item.ratePending ? (en?' · pending':' · 待核验'):''}</td></tr>)}</tbody></table></div>
      <p>{en?'Source received 1 Oct 2026; not a statistical cutoff or an independent audit. Operation is retained as a source category; its definition and shot-level deduplication await confirmation. The source’s initial 2025 Q2 label conflicts with the earlier July narrative, so no exact first-shot date is asserted.':'资料提供于 2026.10.01，不代表统计截止日或独立审计。Operation 保留原图分类，定义与逐炮去重待确认。原图首阶段 2025 Q2 与早前 7 月叙述不一致，因此不另断言首次放电日期。'}</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="fdSourceChart" src="/images/exl50u-control-20261001.png" width="724" height="494" loading="lazy" alt={en?'Original team chart with four stacked bars; Q1 reports 73%, flagged above for reconciliation.':'团队提供的原始四阶段堆叠图，Q1 原报 73%，口径差异见上方说明。'}/>
    </details>
  </div>;
}
