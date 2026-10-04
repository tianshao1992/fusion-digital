import test from 'node:test';
import assert from 'node:assert/strict';
import { controlEvidence, controlTotals } from '../app/components/home/home-content.ts';

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
