import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { knowledgeModules } from '../app/data/knowledge-modules.ts';
import {
  knowledgeModuleRoutes,
  programPillars,
  programSupportLinks,
  roadmapPhases,
  technologyDecisions,
} from '../app/roadmap/program-roadmap-data.ts';

test('two-phase roadmap is bounded, complete and linked to all ten modules', () => {
  assert.equal(roadmapPhases.length, 2);
  const [phaseOne, phaseTwo] = roadmapPhases;
  assert.equal(phaseOne.device, 'EXL‑50U');
  assert.equal(phaseOne.axisMax, 12);
  assert.equal(phaseTwo.device, 'EHL‑2');
  assert.equal(phaseTwo.axisMax, 6);

  const workPackages = roadmapPhases.flatMap((phase) => phase.workPackages);
  assert.equal(new Set(workPackages.map((item) => item.id)).size, workPackages.length);
  for (const phase of roadmapPhases) {
    const knownGates = new Set(phase.gates.map((gate) => gate.id));
    assert.ok(phase.workPackages.length >= 6);
    assert.ok(phase.gates.length >= 5);
    assert.ok(phase.exclusions.length >= 3);
    assert.equal(phase.timeSemantics, 'inclusive-periods');
    for (const item of phase.workPackages) {
      assert.ok(item.start >= 1 && item.start <= item.end && item.end <= phase.axisMax);
      assert.ok(item.end - item.start + 1 >= 1, 'displayed work-package periods are inclusive');
      assert.ok(item.deliverable.length > 20);
      assert.ok(item.evidence.length > 20);
      assert.ok(item.modules.length > 0);
      assert.ok(item.pillars.length > 0);
      assert.ok(['关键路径', '条件式交付', '拓展研究'].includes(item.commitment));
      assert.ok(item.gateIds.every((gateId) => knownGates.has(gateId)), `${item.id} has an unknown explicit gate`);
    }
  }

  const knownModules = new Set(knowledgeModules.map((module) => module.id));
  const coveredModules = new Set(workPackages.flatMap((item) => item.modules));
  assert.deepEqual(coveredModules, knownModules);
  assert.equal(knowledgeModuleRoutes.length, 10);
  assert.deepEqual(knowledgeModuleRoutes.map((module) => module.id), knowledgeModules.map((module) => module.id));
  assert.equal(new Set(knowledgeModuleRoutes.map((module) => module.route)).size, 10, 'each module must have a distinct navigation target');
});

test('five professional pillars form a complete, evidence-gated path to both programme goals', () => {
  assert.deepEqual(programPillars.map((pillar) => pillar.id), ['physics', 'engineering', 'control', 'diagnostics', 'data']);
  assert.equal(new Set(programPillars.map((pillar) => pillar.id)).size, 5);
  const knownModules = new Set(knowledgeModules.map((module) => module.id));
  const routeStepIds = new Set<string>();
  for (const pillar of programPillars) {
    assert.ok(pillar.mission.length > 30);
    assert.ok(pillar.physicsQuestion.length > 30);
    assert.ok(pillar.phase1.includes('EXL') || pillar.phase1.length > 60);
    assert.ok(pillar.phase2.includes('EHL') || pillar.phase2.length > 60);
    assert.ok(pillar.inputs.length >= 4);
    assert.ok(pillar.outputs.length >= 4);
    assert.ok(pillar.verification.length >= 4);
    assert.ok(pillar.boundary.length > 30);
    assert.ok(pillar.route.length >= 4);
    assert.ok(pillar.modules.every((module) => knownModules.has(module)));
    for (const step of pillar.route) {
      assert.ok(!routeStepIds.has(step.id), `duplicate route step ${step.id}`);
      routeStepIds.add(step.id);
      assert.ok(step.phases.length > 0);
      assert.ok(step.phases.every((phase) => phase === 'phase-1' || phase === 'phase-2'));
      assert.ok(step.selection.length > 30);
      assert.ok(step.boundary.length >= 12);
    }
  }

  const nodeIds = new Set<string>([
    'mission', 'integration', 'phase-1-goal', 'phase-2-goal', 'long-term-goal',
    ...programPillars.map((pillar) => pillar.id),
  ]);
  assert.equal(new Set(programSupportLinks.map((link) => `${link.source}->${link.target}`)).size, programSupportLinks.length);
  for (const link of programSupportLinks) {
    assert.ok(nodeIds.has(link.source), `unknown source ${link.source}`);
    assert.ok(nodeIds.has(link.target), `unknown target ${link.target}`);
    assert.ok(link.payload.length > 4);
  }
  const reachable = (start: string) => {
    const visited = new Set([start]);
    const queue = [start];
    while (queue.length) {
      const source = queue.shift()!;
      for (const link of programSupportLinks.filter((candidate) => candidate.source === source)) {
        if (!visited.has(link.target)) {
          visited.add(link.target);
          queue.push(link.target);
        }
      }
    }
    return visited;
  };
  for (const pillar of programPillars) {
    const paths = reachable(pillar.id);
    assert.ok(paths.has('phase-1-goal'), `${pillar.id} does not support phase I`);
    assert.ok(paths.has('phase-2-goal'), `${pillar.id} does not support phase II`);
    assert.ok(paths.has('long-term-goal'), `${pillar.id} does not reach the long-term target`);
    for (const phase of roadmapPhases) {
      assert.ok(phase.workPackages.some((item) => item.id !== phase.workPackages.at(-1)?.id && item.pillars.includes(pillar.id)), `${pillar.id} lacks a non-final ${phase.id} work package`);
    }
  }
  for (const [source, target] of [['physics', 'control'], ['physics', 'engineering'], ['diagnostics', 'physics'], ['diagnostics', 'control']]) {
    assert.ok(programSupportLinks.some((link) => link.source === source && link.target === target && link.kind === 'coupling'), `missing ${source}->${target} professional coupling`);
  }
});

test('cross-phase technology steps do not contradict the promised delivery scope', () => {
  const step = (pillarId: string, stepId: string) => programPillars.find((pillar) => pillar.id === pillarId)?.route.find((item) => item.id === stepId);
  assert.ok(step('engineering', 'ENG-4')?.phases.includes('phase-1'), 'phase I structural response must be visible');
  assert.ok(step('control', 'CTL-4')?.phases.includes('phase-1'), 'phase I conditional controller-HIL must be visible');
  assert.ok(step('diagnostics', 'DIA-3')?.phases.includes('phase-1'), 'phase I synthetic magnetics must be visible');
  assert.ok(step('data', 'DAT-4')?.phases.includes('phase-1'), 'phase I evidence workbench must be visible');
  assert.equal(step('engineering', 'ENG-3B')?.status, '关键路径', 'phase II low-energy/Joule temperature check must remain a first-plasma gate');
  assert.equal(step('engineering', 'ENG-3C')?.status, '拓展研究', 'phase II high-power PFC/TQ analysis must stay outside the first-plasma gate');
  const completeText = JSON.stringify(programPillars);
  assert.match(completeText, /RZIP 是刚性等离子体控制模型，不是 MHD/);
  assert.match(completeText, /电磁载荷是并行来源|电磁载荷是并行/);
  assert.match(completeText, /合成数据不得混入实验命名空间/);
  assert.match(completeText, /浏览器、知识图谱和大模型永远没有控机写通道/);
  assert.match(completeText, /高功率仅作离线包络/);
  assert.equal(roadmapPhases[1].workPackages.find((item) => item.id === 'P2-2')?.commitment, '条件式交付');
  assert.deepEqual(roadmapPhases[1].workPackages.find((item) => item.id === 'P2-2')?.gateIds, [], 'offline MHD evidence must not become an implicit first-plasma gate');
  assert.equal(roadmapPhases[1].workPackages.find((item) => item.id === 'P2-3')?.commitment, '条件式交付');
  assert.deepEqual(roadmapPhases[1].workPackages.find((item) => item.id === 'P2-3')?.gateIds, [], 'formed-plasma H&CD studies must not become an implicit startup gate');
  assert.ok(roadmapPhases[1].workPackages.find((item) => item.id === 'P2-0')?.pillars.includes('engineering'));
});

test('phase scope preserves scientific and machine-control boundaries', () => {
  const phaseOneText = JSON.stringify(roadmapPhases[0]);
  const phaseTwoText = JSON.stringify(roadmapPhases[1]);
  assert.match(phaseOneText, /IMAS/);
  assert.match(phaseOneText, /EFIT \/ PTEFIT/);
  assert.match(phaseOneText, /MIL→SIL（HIL 条件式）/);
  assert.match(phaseOneText, /CQ \/ VDE \/ halo \/ 涡流/);
  assert.match(phaseOneText, /TQ \/ 表面能量沉积/);
  assert.match(phaseOneText, /CQ \/ VDE \/ halo \/ 涡流.*结构动力响应/);
  assert.match(phaseOneText, /TQ \/ 表面能量沉积.*热应力/);
  assert.match(phaseOneText, /不由网页、知识图谱或大模型向 PCS/);
  assert.match(phaseTwoText, /first-plasma|first plasma/);
  assert.match(phaseTwoText, /MHD/);
  assert.match(phaseTwoText, /GENRAY\+CQL3D/);
  assert.match(phaseTwoText, /17 MW NBI/);
  assert.match(phaseTwoText, /shadow twin/);
  assert.match(phaseTwoText, /burn-through/);
  assert.match(phaseTwoText, /RZIP 只作刚性等离子体控制模型/);
  assert.match(phaseTwoText, /HIL 取决于硬件可用性/);
  assert.ok(technologyDecisions.some((decision) => decision.choice.includes('MDSplus')));
  assert.ok(technologyDecisions.some((decision) => decision.choice.includes('IMAS')));
  assert.ok(technologyDecisions.some((decision) => decision.rationale.includes('硬实时继续使用装置原生 PCS 接口')));
  assert.ok(technologyDecisions.some((decision) => decision.choice.includes('as-shot 逆问题重构')));
  const mhdDecision = technologyDecisions.find((decision) => decision.layer === 'EHL‑2 MHD');
  assert.match(mhdDecision?.choice ?? '', /平衡 \/ 剖面.*线性响应.*非线性案例/);
  assert.match(mhdDecision?.rationale ?? '', /候选，须经许可与本地 V&V 冻结/);
});

test('roadmap preserves complete non-JavaScript and accessible responsive fallbacks', () => {
  const component = readFileSync(new URL('../app/roadmap/ProgramRoadmapCharts.tsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../app/roadmap/roadmap.css', import.meta.url), 'utf8');
  assert.match(component, /<noscript><style>/);
  assert.match(component, /\.scientificChartStatus\{display:none!important\}/);
  assert.match(component, /programNoScriptPillars/);
  assert.match(css, /noscript \.programNoScriptPillars\{display:grid/);
  assert.match(css, /--focus-ring/);
  assert.doesNotMatch(css, /--color-focus-ring/);
  assert.match(component, /fontSize: 11/);
});
