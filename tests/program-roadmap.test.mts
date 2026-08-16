import assert from 'node:assert/strict';
import test from 'node:test';
import { knowledgeModules } from '../app/data/knowledge-modules.ts';
import { knowledgeModuleRoutes, roadmapPhases, technologyDecisions } from '../app/roadmap/program-roadmap-data.ts';

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
    }
  }

  const knownModules = new Set(knowledgeModules.map((module) => module.id));
  const coveredModules = new Set(workPackages.flatMap((item) => item.modules));
  assert.deepEqual(coveredModules, knownModules);
  assert.equal(knowledgeModuleRoutes.length, 10);
  assert.deepEqual(knowledgeModuleRoutes.map((module) => module.id), knowledgeModules.map((module) => module.id));
  assert.equal(new Set(knowledgeModuleRoutes.map((module) => module.route)).size, 10, 'each module must have a distinct navigation target');
});

test('phase scope preserves scientific and machine-control boundaries', () => {
  const phaseOneText = JSON.stringify(roadmapPhases[0]);
  const phaseTwoText = JSON.stringify(roadmapPhases[1]);
  assert.match(phaseOneText, /IMAS/);
  assert.match(phaseOneText, /EFIT \/ PTEFIT/);
  assert.match(phaseOneText, /MIL→SIL→HIL/);
  assert.match(phaseOneText, /CQ \/ VDE \/ halo \/ 涡流/);
  assert.match(phaseOneText, /TQ \/ 表面能量沉积/);
  assert.match(phaseOneText, /单向热—电磁—结构响应/);
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
  const mhdDecision = technologyDecisions.find((decision) => decision.layer === 'EHL‑2 MHD');
  assert.match(mhdDecision?.choice ?? '', /平衡 \/ 剖面.*线性响应.*非线性案例/);
  assert.match(mhdDecision?.rationale ?? '', /候选，须经许可与本地 V&V 冻结/);
});
