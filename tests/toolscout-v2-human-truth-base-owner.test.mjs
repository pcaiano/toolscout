import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('base human truth health has a direct ToolScout 2.0 owner',()=>{
  const runtime=read('command-center-human-truth-worker.js');
  const contract=read('runtime-route-contract.js');
  const compute=read('compute-router-worker.js');

  assert.match(runtime,/export async function handleHumanTruthBaseRoute/);
  assert.match(runtime,/\/api\/command-center-human-truth-health/);
  assert.match(runtime,/canonicalVisitorSource:'D1 first-party visitor IDs'/);
  assert.match(runtime,/defaultWindow:'last24'/);
  assert.match(runtime,/chartPosition:'top'/);

  assert.match(contract,/owner:'human_truth_base_health'/);
  assert.match(compute,/ownership\.owner==='human_truth_base_health'/);
  assert.match(compute,/handleHumanTruthBaseRoute/);
});

test('generic traversal bypasses the base human truth decorator',()=>{
  const compute=read('compute-router-worker.js');
  assert.match(compute,/import base from '\.\/distribution-throughput-worker\.js'/);
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
});

test('legacy human truth presentation stays compatibility-only',()=>{
  const runtime=read('command-center-human-truth-worker.js');
  assert.match(runtime,/data-toolscout-human-truth="1"/);
  assert.match(runtime,/ANALYTICS_PATHS/);
  assert.match(runtime,/return decorate\(response\)/);
  assert.doesNotMatch(runtime,/CREATE TABLE|CREATE INDEX|ALTER TABLE/);
});
