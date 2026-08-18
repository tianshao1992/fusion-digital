'use client';

import type { EChartsCoreOption } from 'echarts/core';
import { useMemo, useState, type KeyboardEvent } from 'react';
import { useI18n } from '../i18n';
import ScientificChart, { LocalizedChartRegion } from './charts/ScientificChart';
import { useChartTheme } from './charts/chart-theme';
import './phase-one-roadmap.css';

type ModuleId = 'physics' | 'engineering' | 'control' | 'diagnostics' | 'energy' | 'auxiliary' | 'hmi' | 'data' | 'integration' | 'ai';
type PhaseOneRole = 'core' | 'support' | 'future';

type RoadmapModule = {
  id: ModuleId;
  no: string;
  cn: string;
  en: string;
  role: PhaseOneRole;
  baselineGates: number;
  phaseOneGates: number;
  baseline: string;
  phaseOne: string;
  gap: string;
  href: string;
};

const modules: RoadmapModule[] = [
  { id: 'physics', no: '01', cn: '物理模拟', en: 'PHYSICS', role: 'core', baselineGates: 2, phaseOneGates: 1, baseline: '已形成物理代码、论文与装置证据地图，并接入 EXL‑50U EFIT 位形逐帧展示。', phaseOne: '围绕单炮建立平衡位形、工况、模型版本和误差说明的一致时间轴，形成可重放的窄域物理孪生。', gap: '仍缺输运、MHD、边界、粒子与中子等高保真模型耦合，以及在线同化、适用域和不确定度闭环。', href: '/physics' },
  { id: 'engineering', no: '02', cn: '工程仿真', en: 'ENGINEERING', role: 'core', baselineGates: 2, phaseOneGates: 1, baseline: '已形成工程知识域、CAD 数字样机、多装置目录和部件级显隐、剖切与透明控制。', phaseOne: '冻结 EXL‑50U 几何、材料、载荷和坐标基线，接入首个可校核 CAE 模型及版本化结果场。', gap: '仍缺电磁—热—结构—流体—中子跨域耦合、网格映射、试验校核、寿命模型和持续 VVUQ。', href: '/engineering' },
  { id: 'control', no: '03', cn: '集成控制', en: 'INTEGRATED CONTROL', role: 'support', baselineGates: 1, phaseOneGates: 1, baseline: '已按 T0–T9 建立控制任务、装置 PCS、论文代码与证据等级图谱。', phaseOne: '先定义状态、目标、约束、执行器和回放接口，完成离线场景复现；一期不让 AI 或网页直连装置。', gap: '仍缺实时状态估计、确定性调度、SIL/HIL、故障注入、保护独立性和经授权的闭环验证。', href: '/control' },
  { id: 'diagnostics', no: '04', cn: '诊断感知', en: 'DIAGNOSTICS & SENSING', role: 'core', baselineGates: 2, phaseOneGates: 1, baseline: '已建立 DG0–DG11 诊断知识域、装置档案、反演证据链和 EFIT 位形/信号联动界面。', phaseOne: '把炮号、采样时间、诊断几何、标定、质量标记和反演版本绑定到同一可追溯观测包。', gap: '仍缺更多诊断原始链路、实时质控、多模态融合、合成诊断、漂移监测和盲测验收。', href: '/diagnostics' },
  { id: 'energy', no: '05', cn: '能量转化', en: 'ENERGY CONVERSION', role: 'future', baselineGates: 0, phaseOneGates: 1, baseline: '总览中已定义包层热取出、热力循环、厂用电和电网的能力边界。', phaseOne: '一期只保留数据与接口占位，明确未来从聚变热源到净电力的输入输出合同。', gap: '仍缺包层与一次/二次回路模型、发电循环、动态效率、储能、厂用电和电网协同的完整验证链。', href: '/#domain-energy' },
  { id: 'auxiliary', no: '06', cn: '辅机模拟', en: 'AUXILIARY SYSTEMS', role: 'future', baselineGates: 0, phaseOneGates: 1, baseline: '总览中已划定真空、低温、加热、燃料、冷却和电源等辅机范围。', phaseOne: '一期在装置资产和接口模型中预留辅机身份、状态、设定值、联锁与负载字段。', gap: '仍缺设备动态、故障传播、联锁逻辑、维护状态、厂用能耗和整厂瞬态联合仿真。', href: '/#domain-auxiliary' },
  { id: 'hmi', no: '07', cn: '人机交互', en: 'HUMAN–MACHINE INTERACTION', role: 'support', baselineGates: 2, phaseOneGates: 1, baseline: '已形成知识检索、三维样机、部件控制、炮号切换、动画回放和证据查看界面。', phaseOne: '把模型、数据、时间轴、告警解释和人工审核组织为面向研究人员的统一工作台。', gap: '仍缺运行员任务分析、告警治理、方案比较、沉浸交互、可用性试验和人在回路授权设计。', href: '/#domain-hmi' },
  { id: 'data', no: '08', cn: '数据基座', en: 'DATA FOUNDATION', role: 'core', baselineGates: 2, phaseOneGates: 1, baseline: '已具备模型清单、公开资产边界、派生数据索引、知识快照、来源链接和基础版本合同。', phaseOne: '统一装置/部件/炮号/时间/坐标/单位标识，固化血缘、校验和、权限与模型—结果版本关系。', gap: '仍缺生产级时序与对象存储、主数据治理、流式接入、质量规则、长期归档、灾备和私有空间。', href: '/data-foundation' },
  { id: 'integration', no: '09', cn: '总体集成', en: 'WHOLE-PLANT INTEGRATION', role: 'support', baselineGates: 1, phaseOneGates: 2, baseline: '已形成十模块总架构、多装置数字样机入口和跨知识域导航，但尚不是整厂协同仿真器。', phaseOne: '以 EXL‑50U 为样板冻结装置包、场景配置、模型 API、结果合同和证据门，跑通一条可复现数字线程。', gap: '仍缺需求与配置管理、联合求解、跨域时间协调、全局不确定度、变更影响和电厂级 VVUQ。', href: '/#domain-integration' },
  { id: 'ai', no: '10', cn: '智能原生', en: 'AI-NATIVE', role: 'core', baselineGates: 2, phaseOneGates: 1, baseline: '已形成证据检索、知识图谱、受控问答、身份/额度设计和智能体候选审核边界。', phaseOne: '让模型只在受治理数据和工具权限内完成检索、分析、代理模型调用与候选建议，并保留人工审核。', gap: '仍缺生产模型服务、评测与漂移监控、私有数据隔离、可靠任务编排、回退机制和独立安全批准。', href: '/ai' },
];

const moduleEnglish: Record<ModuleId, { baseline: string; phaseOne: string; gap: string }> = {
  physics: {
    baseline: 'A mapped evidence base now links physics codes, publications and device records, with frame-resolved EXL-50U EFIT equilibria integrated into the platform.',
    phaseOne: 'For selected discharges, align equilibrium reconstruction, operating conditions, model versions and error statements on one time base to deliver a replayable, narrow-scope physics twin.',
    gap: 'High-fidelity coupling of transport, MHD stability, plasma–wall boundary, particle and neutronics models remains outstanding, together with online assimilation, explicit domains of applicability and closed-loop uncertainty management.',
  },
  engineering: {
    baseline: 'The engineering knowledge domain, CAD digital mock-up, multi-device catalog and component visibility, sectioning and transparency controls are in place.',
    phaseOne: 'Freeze the EXL-50U geometry, materials, load cases and coordinate conventions; integrate the first auditable CAE model and version-controlled result fields.',
    gap: 'Coupled electromagnetic–thermal–structural–fluid–neutronics analysis, conservative mesh transfer, experimental correlation, lifetime models and continuous VVUQ remain outstanding.',
  },
  control: {
    baseline: 'The evidence graph maps T0–T9 control tasks, device plasma-control systems, publications, software and evidence maturity.',
    phaseOne: 'Define state, objective, constraint, actuator and replay interfaces, then demonstrate offline scenario reproduction. Phase I does not permit AI or the web interface to command the plant directly.',
    gap: 'Real-time state estimation, deterministic scheduling, SIL/HIL, fault injection, independence of protection functions and authorized closed-loop qualification remain outstanding.',
  },
  diagnostics: {
    baseline: 'The DG0–DG11 diagnostic knowledge domain, device profiles, inversion evidence chains and coupled EFIT equilibrium/signal viewer are in place.',
    phaseOne: 'Bind pulse number, sample time, diagnostic geometry, calibration, quality flags and inversion version into one traceable observation package.',
    gap: 'Additional raw diagnostic chains, real-time quality control, multimodal fusion, synthetic diagnostics, drift surveillance and blind-test acceptance remain outstanding.',
  },
  energy: {
    baseline: 'The system map defines the capability boundary for blanket heat extraction, thermodynamic cycles, plant auxiliary power and grid interaction.',
    phaseOne: 'Retain only data-schema and interface placeholders, with an explicit future contract from fusion heat sources to net electric output.',
    gap: 'Validated models for blankets and primary/secondary circuits, power cycles, dynamic efficiency, storage, house loads and grid coordination remain outstanding.',
  },
  auxiliary: {
    baseline: 'The system map bounds vacuum, cryogenic, heating, fuelling, cooling and power-supply auxiliary systems.',
    phaseOne: 'Reserve asset identity, state, set-point, interlock and load fields for auxiliary systems in the device package and interface model.',
    gap: 'Equipment dynamics, fault propagation, interlock logic, maintenance state, house-load accounting and coupled whole-plant transients remain outstanding.',
  },
  hmi: {
    baseline: 'Knowledge search, the 3D mock-up, component controls, pulse selection, time-sequence replay and evidence inspection are available.',
    phaseOne: 'Organize models, data, the common time base, alarm explanations and human review into one researcher-facing workbench.',
    gap: 'Operator task analysis, alarm rationalization, option comparison, immersive interaction, usability trials and human-in-the-loop authorization design remain outstanding.',
  },
  data: {
    baseline: 'Model manifests, public-asset boundaries, derived-data indexes, knowledge snapshots, source links and foundational version contracts are available.',
    phaseOne: 'Unify device, component, pulse, time, coordinate and unit identifiers; enforce provenance, checksums, permissions and model-to-result version relationships.',
    gap: 'Production time-series and object storage, master-data governance, streaming ingestion, quality rules, long-term archive, disaster recovery and private workspaces remain outstanding.',
  },
  integration: {
    baseline: 'A ten-capability architecture, multi-device digital-mock-up entry point and cross-domain navigation exist, but they do not yet constitute a whole-plant co-simulator.',
    phaseOne: 'Use EXL-50U as the reference implementation: freeze the device package, scenario configuration, model APIs, result contracts and evidence gates, then execute one reproducible digital thread end to end.',
    gap: 'Requirements and configuration management, coupled solvers, cross-domain time coordination, system-level uncertainty, change-impact analysis and plant-level VVUQ remain outstanding.',
  },
  ai: {
    baseline: 'Evidence retrieval, the knowledge graph, governed question answering, identity/quota controls and review boundaries for agent-generated candidates are in place.',
    phaseOne: 'Constrain models to governed data and authorized tools for retrieval, analysis, surrogate invocation and candidate recommendations, with retained human review.',
    gap: 'Production model serving, evaluation and drift monitoring, private-data isolation, dependable task orchestration, fallback mechanisms and independent safety approval remain outstanding.',
  },
};

const capabilityGates = [
  { id: 'G0', label: '知识 / 资产\n基线', labelEn: 'Knowledge / asset\nbaseline' },
  { id: 'G1', label: '数据 / 三维\n回放', labelEn: 'Data / 3D\nreplay' },
  { id: 'G2', label: '可验证窄域\n孪生', labelEn: 'Verifiable\nnarrow-scope twin' },
  { id: 'G3', label: '在线影子 /\n持续 VVUQ', labelEn: 'Online shadow /\ncontinuous VVUQ' },
  { id: 'G4', label: '整机跨域\n协同', labelEn: 'Device-wide\nco-simulation' },
  { id: 'G5', label: '电厂全生命\n周期', labelEn: 'Plant-wide\nlifecycle twin' },
];

const stages = [
  { no: '00', when: '当前基线', whenEn: 'CURRENT BASELINE', title: '知识与数字资产可见', titleEn: 'Knowledge and digital assets are visible', copy: '证据图谱、专业知识域、数字样机、炮数据回放和治理骨架已经形成。', copyEn: 'The evidence graph, domain knowledge, digital mock-up, pulse-data replay and governance framework are established.' },
  { no: '01', when: '一期建设 · R0 → R1', whenEn: 'PHASE I · R0 → R1', title: 'EXL‑50U 可验证窄域孪生', titleEn: 'Verifiable, narrow-scope EXL-50U twin', copy: '当前位于 R0 控制服务化到 R1 窄域数字影子之间：以单装置、单场景和可追溯数据链为边界，先闭合 CAD / CAE / EFIT / 模型 API / 结果分析。', copyEn: 'Advance from R0 controlled services toward an R1 narrow-scope digital shadow. Bound the first closure to one device, defined scenarios and a traceable data chain spanning CAD, CAE, EFIT, model APIs and result analysis.' },
  { no: '02', when: '二期扩展', whenEn: 'PHASE II EXPANSION', title: '多物理与运行协同', titleEn: 'Multiphysics and operational coordination', copy: '扩展更多炮、诊断、工程结果和模型，进入联合仿真、在线校准、SIL/HIL 与持续 VVUQ。', copyEn: 'Extend coverage to additional pulses, diagnostics, engineering results and models, then progress to co-simulation, online calibration, SIL/HIL and continuous VVUQ.' },
  { no: '03', when: '远期目标', whenEn: 'LONG-TERM OBJECTIVE', title: '聚变电厂全生命周期孪生', titleEn: 'Fusion-power-plant lifecycle twin', copy: '补齐能量转化、辅机、维护和整厂决策，贯通设计、建造、运行、升级与退役。', copyEn: 'Complete energy conversion, auxiliary systems, maintenance and whole-plant decision support across design, construction, operation, upgrades and decommissioning.' },
];

const roleLabels: Record<PhaseOneRole, string> = {
  core: '一期主线',
  support: '一期支撑',
  future: '后续为主',
};

const roleLabelsEn: Record<PhaseOneRole, string> = {
  core: 'Phase I mainline',
  support: 'Phase I enabling capability',
  future: 'Primarily post-Phase I',
};

function readModuleId(params: unknown): ModuleId | null {
  if (!params || typeof params !== 'object') return null;
  const data = (params as { data?: unknown }).data;
  if (!data || typeof data !== 'object') return null;
  const moduleId = (data as { moduleId?: unknown }).moduleId;
  return typeof moduleId === 'string' && modules.some((item) => item.id === moduleId) ? moduleId as ModuleId : null;
}

export default function PhaseOneRoadmap() {
  const { locale } = useI18n();
  const isEnglish = locale === 'en';
  const chartTheme = useChartTheme();
  const [selectedId, setSelectedId] = useState<ModuleId>('data');
  const selected = modules.find((item) => item.id === selectedId) ?? modules[0];

  const option = useMemo<EChartsCoreOption>(() => {
    const chartModules = [...modules].reverse();
    const colors = chartTheme.mode === 'dark'
      ? { baseline: '#65e6d2', phase: '#ff8738', gap: '#263a32' } as const
      : { baseline: '#a8c8b5', phase: '#df9b7e', gap: '#ded7cd' } as const;
    const labels = isEnglish
      ? { baseline: 'Established', phase: 'Phase I', gap: 'Later' } as const
      : { baseline: '已形成', phase: '一期', gap: '后续' } as const;
    const cells = chartModules.flatMap((item, row) => capabilityGates.map((gate, column) => {
      const status = column < item.baselineGates ? 'baseline' : column < item.baselineGates + item.phaseOneGates ? 'phase' : 'gap';
      return {
        value: [column, row, status === 'baseline' ? 2 : status === 'phase' ? 1 : 0],
        moduleId: item.id,
        gateId: gate.id,
        status,
        statusLabel: labels[status],
        itemStyle: {
          color: colors[status],
          borderColor: item.id === selectedId ? chartTheme.text : chartTheme.background,
          borderWidth: item.id === selectedId ? 2 : 4,
          opacity: status === 'gap' ? 0.78 : 0.96,
        },
        label: { color: status === 'gap' ? chartTheme.muted : chartTheme.text },
      };
    }));
    return {
      animationDuration: 520,
      aria: {
        enabled: true,
        decal: { show: true },
        description: isEnglish
          ? 'FusionDigital Phase I roadmap. Ten capabilities progress through six discrete gates. Teal marks the established baseline, orange marks Phase I closure, and grey-green marks capabilities remaining after Phase I.'
          : 'FusionDigital 第一期路线图。十个模块依次通过六个离散能力门；青色表示已形成的基线，橙色表示一期要闭合的能力，灰绿色表示一期之后仍需建设的能力。',
      },
      grid: { left: 142, right: 24, top: 55, bottom: 70, containLabel: false },
      tooltip: {
        trigger: 'item',
        confine: true,
        backgroundColor: chartTheme.tooltipBackground,
        borderColor: chartTheme.tooltipBorder,
        textStyle: { color: chartTheme.tooltipText },
        formatter: (params: unknown) => {
          if (!params || typeof params !== 'object') return '';
          const data = (params as { data?: unknown }).data;
          if (!data || typeof data !== 'object') return '';
          const datum = data as { moduleId?: string; gateId?: string; statusLabel?: string };
          const item = modules.find((candidate) => candidate.id === datum.moduleId);
          const gate = capabilityGates.find((candidate) => candidate.id === datum.gateId);
          return item && gate
            ? isEnglish
              ? `<b>${item.no} · ${item.en}</b><br/>${gate.id} · ${gate.labelEn.replace('\n', ' ')}<br/>Status: ${datum.statusLabel}`
              : `<b>${item.no} · ${item.cn}</b><br/>${gate.id} · ${gate.label.replace('\n', ' ')}<br/>状态：${datum.statusLabel}`
            : '';
        },
      },
      xAxis: {
        type: 'category',
        data: capabilityGates.map((gate) => `${gate.id}\n${isEnglish ? gate.labelEn : gate.label}`),
        name: isEnglish ? 'Capabilities accumulate by gate: do not enter a later gate before satisfying its predecessor →' : '能力逐级累积：没有通过前一门，就不进入后一门 →', nameLocation: 'middle', nameGap: 52,
        axisLine: { lineStyle: { color: chartTheme.line } },
        axisTick: { show: false },
        axisLabel: { color: chartTheme.muted, fontSize: 9, lineHeight: 14, interval: 0 },
        splitLine: { show: false },
        nameTextStyle: { color: chartTheme.muted, fontSize: 9, fontWeight: 700 },
      },
      yAxis: {
        type: 'category',
        data: chartModules.map((item) => `${item.no}  ${isEnglish ? item.en : item.cn}`),
        axisLine: { show: false }, axisTick: { show: false },
        axisLabel: { color: chartTheme.text, fontSize: 11, fontWeight: 700, margin: 15 },
      },
      series: [
        {
          name: isEnglish ? 'Ten-capability gate matrix' : '十模块能力门', type: 'heatmap', data: cells,
          label: {
            show: true,
            color: chartTheme.text,
            fontSize: 8,
            fontWeight: 900,
            formatter: (params: unknown) => {
              if (!params || typeof params !== 'object') return '';
              const data = (params as { data?: unknown }).data;
              if (!data || typeof data !== 'object') return '';
              return String((data as { statusLabel?: unknown }).statusLabel ?? '');
            },
          },
          emphasis: { itemStyle: { shadowBlur: 16, shadowColor: chartTheme.accent } },
          markArea: {
            silent: true,
            label: { show: true, color: chartTheme.accent, fontSize: 9, fontWeight: 800 },
            data: [
              [{ name: isEnglish ? 'Phase I capability boundary G0–G2' : '第一期能力边界 G0—G2', xAxis: 0 }, { xAxis: 2 }],
              [{ name: isEnglish ? 'Post-Phase I capability gap G3–G5' : '一期后能力缺口 G3—G5', xAxis: 3, itemStyle: { color: chartTheme.infoSoft } }, { xAxis: 5 }],
            ],
          },
        },
      ],
    };
  }, [chartTheme, isEnglish, selectedId]);

  function selectFromKeyboard(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    let next = index;
    if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = modules.length - 1;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + modules.length) % modules.length;
    else next = (index + 1) % modules.length;
    setSelectedId(modules[next].id);
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button')[next]?.focus();
  }

  return (
    <LocalizedChartRegion><section className="phaseOneRoadmap" id="roadmap" aria-labelledby="phase-one-roadmap-title">
      <header className="phaseOneRoadmapIntro">
        <div>
          <p className="sectionIndex">05 / PHASE I IN THE FULL PROGRAM</p>
          <h2 id="phase-one-roadmap-title">{isEnglish
            ? <>Close one trustworthy digital thread in Phase I,<br/>not an entire fusion-power-plant twin at once.</>
            : <>一期先闭合一条可信数字线程，<br/>不是一次建成完整的聚变电厂孪生。</>}</h2>
          <p>{isEnglish
            ? 'Phase I uses EXL-50U as the first reference asset, joining domain knowledge, CAD, CAE interfaces, time-resolved EFIT discharge data, model invocation, result analysis and evidence governance into a reproducible narrow-scope twin. The matrix maps that route to all ten capabilities and explicitly preserves work that remains beyond Phase I.'
            : '一期以 EXL‑50U 为首个装置载体，把知识、CAD、CAE 接口、EFIT 炮数据、模型调用、结果分析与证据治理连成可复现的窄域孪生。下图把这条路线严格映射到总览的十个模块，并把一期之后尚未建设的部分保留下来。'}</p>
        </div>
        <aside aria-label={isEnglish ? 'Scope of Phase I within the full program' : '一期在总体规划中的范围摘要'}>
          <strong>PHASE I CUTLINE</strong>
          <p>{isEnglish ? 'Phase I acceptance gate: one asset identity, one controlled version baseline, one discharge time base, replayable model execution, traceable results and retained human review.' : '一期交付门：同一装置身份、同一版本基线、同一炮时间轴、可重放模型调用、可追溯结果和人工审核。'}</p>
          <div><span><b>10</b>{isEnglish ? 'capabilities mapped' : '模块全量对位'}</span><span><b>05</b>{isEnglish ? 'mainline capabilities' : '一期主线'}</span><span><b>03</b>{isEnglish ? 'enabling capabilities' : '结构支撑'}</span><span><b>02</b>{isEnglish ? 'post-Phase I priorities' : '后续重点'}</span></div>
        </aside>
      </header>

      <ol className="phaseOneStages" aria-label={isEnglish ? 'Four-stage route from the current baseline to a whole-plant digital twin' : '从当前基线到整厂数字孪生的四阶段路线'}>
        {stages.map((stage, index) => <li key={stage.no} className={index === 1 ? 'isPhaseOne' : ''}>
          <span>{stage.no}</span><small>{isEnglish ? stage.whenEn : stage.when}</small><h3>{isEnglish ? stage.titleEn : stage.title}</h3><p>{isEnglish ? stage.copyEn : stage.copy}</p>
        </li>)}
      </ol>

      <div className="phaseOneMainline" aria-label={isEnglish ? 'Phase I mainline for a verifiable narrow-scope digital twin' : '第一期可验证窄域数字孪生主线'}>
        <b>{isEnglish ? 'PHASE I MAINLINE · CAPABILITY BOUNDARY G0–G2' : 'PHASE I MAINLINE · 一期能力边界 G0—G2'}</b>
        <p><span>{isEnglish ? '08 Data foundation' : '08 数据基座'}</span><i>→</i><span>{isEnglish ? '01 Physics / 02 Engineering' : '01 物理 / 02 工程'}</span><i>→</i><span>{isEnglish ? '04 Diagnostic validation' : '04 诊断验证'}</span><i>→</i><span>{isEnglish ? '10 Governed agents' : '10 受控代理'}</span><i>→</i><span>{isEnglish ? '07 Visual interaction' : '07 可视交互'}</span></p>
        <small>{isEnglish
          ? <><strong>09 Whole-plant integration</strong> orchestrates the device package, interfaces and evidence gates; <strong>03 Integrated control</strong> is limited to a governed interface in Phase I; <strong>05 / 06</strong> become substantive work after Phase I.</>
          : <><strong>09 总体集成</strong>负责装置包、接口与证据门编排；<strong>03 集成控制</strong>一期只保留受控接口；<strong>05 / 06</strong>进入后续主体建设。</>}</small>
      </div>

      <div className="phaseOneRoadmapWorkspace">
        <article className="phaseOneChartPanel">
          <header>
            <div><p>TEN-CAPABILITY SCOPE MAP</p><h3>{isEnglish ? 'Phase I entry points and remaining gaps' : '一期切入点与后续缺口'}</h3></div>
            <div className="phaseOneLegend" aria-label={isEnglish ? 'Legend' : '图例'}><span className="baseline">{isEnglish ? 'Established baseline' : '现有基线'}</span><span className="phase">{isEnglish ? 'Phase I closure' : '一期建设'}</span><span className="gap">{isEnglish ? 'Post-Phase I gap' : '一期后缺口'}</span></div>
          </header>
          <ScientificChart
            id="phase-one-roadmap"
            option={option}
            ariaLabel={isEnglish ? 'Six-gate matrix showing how ten digital-twin capabilities progress from a knowledge and asset baseline toward a whole-plant lifecycle twin. Select a cell or use the capability buttons for details.' : '十个数字孪生模块从知识资产基线到电厂全生命周期的六能力门矩阵。点击单元格或使用下方模块按钮查看详情。'}
            fallbackSrc=""
            fallbackAlt={isEnglish ? 'Text alternative for the ten-capability Phase I roadmap' : '十个模块的一期路线文字版'}
            className="phaseOneEchart"
            height={610}
            dark
            onChartClick={(params) => {
              const moduleId = readModuleId(params);
              if (moduleId) setSelectedId(moduleId);
            }}
            fallback={<ol className="phaseOneChartFallback" aria-label={isEnglish ? 'Text version of the ten-capability roadmap' : '十模块路线文字版'}>{modules.map((item) => <li key={item.id}><b>{item.no} · {isEnglish ? item.en : item.cn}</b><span>{isEnglish ? roleLabelsEn[item.role] : roleLabels[item.role]}</span><p>{isEnglish ? moduleEnglish[item.id].phaseOne : item.phaseOne}</p></li>)}</ol>}
          />
          <p className="phaseOneScaleNote">{isEnglish ? 'The six gates express dependency order and scope boundaries, not percentage complete, technology readiness level, budget allocation or a schedule commitment. The existence of a web page is not evidence that an engineering capability has passed acceptance.' : '六个能力门表达依赖顺序与建设边界，不是项目完成率、TRL、预算比例或工期承诺；“页面已存在”也不等同于工程能力已验收。'}</p>
          <nav className="phaseOneModuleNav" aria-label={isEnglish ? 'Select a capability to inspect Phase I work and remaining gaps' : '选择一个模块查看一期工作和后续缺口'}>
            {modules.map((item, index) => <button
              type="button"
              key={item.id}
              data-roadmap-module-id={item.id}
              className={`${item.id === selected.id ? 'isActive ' : ''}${item.role}`}
              aria-pressed={item.id === selected.id}
              onClick={() => setSelectedId(item.id)}
              onKeyDown={(event) => selectFromKeyboard(event, index)}
            ><b>{item.no}</b><span>{isEnglish ? item.en : item.cn}</span></button>)}
          </nav>
        </article>

        <aside className="phaseOneModuleDetail" aria-live="polite" aria-label={isEnglish ? `${selected.en} roadmap details` : `${selected.cn}路线详情`}>
          <div className="phaseOneModuleHeading"><span>{selected.no}</span><div><small>{isEnglish ? roleLabelsEn[selected.role] : roleLabels[selected.role]}</small><h3>{isEnglish ? selected.en : selected.cn}</h3>{!isEnglish && <p>{selected.en}</p>}</div></div>
          <section className="isDelivered"><b>{isEnglish ? 'Established baseline' : '已形成的基线'}</b><p>{isEnglish ? moduleEnglish[selected.id].baseline : selected.baseline}</p></section>
          <section className="isPhase"><b>{isEnglish ? 'Closure required in Phase I' : '一期要闭合'}</b><p>{isEnglish ? moduleEnglish[selected.id].phaseOne : selected.phaseOne}</p></section>
          <section className="isGap"><b>{isEnglish ? 'Remaining after Phase I' : '一期后仍欠缺'}</b><p>{isEnglish ? moduleEnglish[selected.id].gap : selected.gap}</p></section>
          <a href={selected.href}>{isEnglish ? 'Open the corresponding knowledge domain →' : '查看对应知识模块 →'}</a>
        </aside>
      </div>

      <table className="srOnly">
        <caption>{isEnglish ? 'Mapping between Phase I work and the ten system capabilities' : '第一期建设与十个总览模块对应关系'}</caption>
        <thead><tr><th>{isEnglish ? 'No.' : '编号'}</th><th>{isEnglish ? 'Capability' : '模块'}</th><th>{isEnglish ? 'Phase I role' : '一期角色'}</th><th>{isEnglish ? 'Established' : '已形成'}</th><th>{isEnglish ? 'Phase I closure' : '一期建设'}</th><th>{isEnglish ? 'Remaining gap' : '后续缺口'}</th></tr></thead>
        <tbody>{modules.map((item) => <tr key={item.id}><td>{item.no}</td><th>{isEnglish ? item.en : item.cn}</th><td>{isEnglish ? roleLabelsEn[item.role] : roleLabels[item.role]}</td><td>{isEnglish ? moduleEnglish[item.id].baseline : item.baseline}</td><td>{isEnglish ? moduleEnglish[item.id].phaseOne : item.phaseOne}</td><td>{isEnglish ? moduleEnglish[item.id].gap : item.gap}</td></tr>)}</tbody>
      </table>

      <footer className="phaseOneBoundary"><b>{isEnglish ? 'PHASE I CAPABILITY BOUNDARY' : '一期能力边界'}</b><p>{isEnglish ? 'The delivery standard is traceable, replayable and independently auditable. This roadmap does not claim a real-time device closed loop, a nuclear-safety conclusion or a complete whole-plant twin. AI produces only constrained analysis and candidate recommendations; control actions and released results still require independent verification and human authorization.' : '当前路线以“可追溯、可重放、可校核”为交付标准。它不宣称已形成实时装置闭环、核安全结论或完整整厂数字孪生；AI 只生成受约束的分析与候选建议，控制和发布仍经过独立验证与人工授权。'}</p><a href="/roadmap">{isEnglish ? 'Open the complete EXL-50U / EHL-2 two-phase roadmap →' : '打开 EXL‑50U / EHL‑2 完整两期路线 →'}</a></footer>
    </section></LocalizedChartRegion>
  );
}
