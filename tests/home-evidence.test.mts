import test from 'node:test';
import assert from 'node:assert/strict';
import { controlEvidence, controlTotals } from '../app/components/home/home-content.ts';
import { buildFieldMesh, controlIllustration, schematicPerturbation, torusVertex } from '../app/components/home/architecture-visual-data.ts';

test('reported stage counts reconcile without turning applications into successes', () => {
  assert.deepEqual(controlEvidence.stages.map(s=>[s.total,s.success,s.failed,s.operation]), [[15,8,7,0],[70,44,19,7],[95,64,21,10],[606,562,33,11]]);
  for (const row of controlEvidence.stages) assert.equal(row.total, row.success+row.failed+row.operation);
  assert.deepEqual(controlTotals,{total:786,success:678,failed:80,operation:28});
  assert.equal(controlEvidence.applicationFloor,700);
  assert.equal(controlEvidence.verified,false);
});

test('user-confirmed success rates are preserved independently from category arithmetic', () => {
  const row=controlEvidence.stages[2];
  assert.equal(row.reportedRate,73);
  assert.equal(Math.round(100*row.success/(row.success+row.failed)),75);
  assert.deepEqual(controlEvidence.stages.map(s=>s.reportedRate),[53,70,73,94]);
  assert.equal(controlEvidence.rateConfirmedOn,'2026-10-05');
  assert.equal(controlEvidence.rateProvenance,'user-confirmed');
  assert.equal(controlEvidence.verified,false,'User confirmation must not become an independent audit claim');
});

test('headline comparisons describe stages, not normalized time growth or compounded rates', () => {
  const first=controlEvidence.stages[0], last=controlEvidence.stages.at(-1)!;
  assert.equal(last.total/first.total,40.4);
  assert.equal(last.reportedRate-first.reportedRate,41);
});

test('illustrative MHD mesh has two cut faces and remains finite inside its canvas', () => {
  const mesh = buildFieldMesh();
  assert.equal(mesh.length, 64 * 96 + 2 * 14 * 72);
  assert.equal(new Set(mesh.filter(cell => cell.cap).map(cell => cell.phi)).size, 2);
  for (const [index, cell] of mesh.entries()) {
    if (index) assert.ok(cell.depth >= mesh[index - 1].depth);
    assert.equal(cell.vertices.length, 4);
    for (const point of cell.vertices) {
      assert.ok(Number.isFinite(point.depth));
      assert.ok(point.x > 0 && point.x < 360);
      assert.ok(point.y > 0 && point.y < 210);
    }
  }
  const start = torusVertex(1, 0, 0), end = torusVertex(1, Math.PI * 2, 0);
  for (const axis of ['x', 'y', 'depth'] as const) assert.ok(Math.abs(start[axis] - end[axis]) < 1e-10);
});

test('analytic perturbation evolves with time but has no solver time or measured units', () => {
  for (const rho of [0, .2, .5, 1]) for (const theta of [0, 1, 3, 6]) for (const phase of [0, .5, 10, 100]) {
    const value = schematicPerturbation(rho, theta, .8, phase);
    assert.ok(Number.isFinite(value) && Math.abs(value) <= 1);
  }
  assert.notEqual(schematicPerturbation(.8, 1, 1, 0), schematicPerturbation(.8, 1, 1, 1));
  assert.equal(Math.abs(schematicPerturbation(0, 1, 1, 0)), 0);
});

test('control illustration remains a normalized synthetic tracking signal', () => {
  assert.equal(controlIllustration.length, 101);
  assert.deepEqual([...new Set(controlIllustration.map(p => p.target))], [.38, .72, .5]);
  for (const point of controlIllustration) {
    assert.ok(point.t >= 0 && point.t <= 1);
    assert.ok(point.response > 0 && point.response < 1);
    assert.equal(point.error, point.response - point.target);
    assert.deepEqual(Object.keys(point), ['t', 'target', 'response', 'error']);
  }
  assert.ok(Math.abs(controlIllustration.at(-1)!.error) < .01);
});
