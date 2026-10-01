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

test('Q1 reported rate is preserved but withheld from the unqualified line', () => {
  const row=controlEvidence.stages[2];
  assert.equal(row.reportedRate,73);
  assert.equal(row.ratePending,true);
  assert.equal(Math.round(100*row.success/(row.success+row.failed)),75);
  assert.deepEqual(controlEvidence.stages.map(s=>s.ratePending?null:s.reportedRate),[53,70,null,94]);
});
