import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('human truth chart health has a direct owner',()=>{
  const runtime=read('command-center-human-truth-chart-worker.js');
  const contract=read('runtime-route-contract.js');
  const compute=read('compute-router-worker.js');

  assert.match(runtime,/export async function handleHumanTruthChartRoute/);
  assert.match(runtime,/\/api\/command-center-human-truth-chart-health/);
  assert.match(runtime,/chart:'human-visitors-top'/);
  assert.match(runtime,/dualAxis:true/);
  assert.match(runtime,/monetizedSeries:'dashed-square-markers'/);
  assert.match(contract,/owner:'human_truth_chart_health'/);
  assert.match(compute,/ownership\.owner==='human_truth_chart_health'/);
  assert.match(compute,/handleHumanTruthChartRoute/);
});

test('generic traversal bypasses human truth chart decorator',()=>{
  const compute=read('compute-router-worker.js');
  assert.match(compute,/import base from '\.\/distribution-embed-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/posthog-behavior-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/visitor-accuracy-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/visitor-dashboard-metrics-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/lemlist-profile-correction-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/discovery-attribution-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/discovery-attribution-health-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/command-center-truth-consolidation-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/command-center-autoload-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/command-center-resilient-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/command-center-human-truth-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/command-center-human-truth-final-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/command-center-human-truth-details-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/command-center-human-truth-chart-worker\.js'/);
});

test('legacy chart decorator remains compatibility-only',()=>{
  const runtime=read('command-center-human-truth-chart-worker.js');
  assert.match(runtime,/data-toolscout-human-truth-chart/);
  assert.match(runtime,/ANALYTICS_PATHS/);
  assert.match(runtime,/const response=await base\.fetch/);
  assert.doesNotMatch(runtime,/CREATE TABLE|CREATE INDEX|ALTER TABLE/);
});
