import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('human truth details health has a direct owner',()=>{
  const runtime=read('command-center-human-truth-details-worker.js');
  const contract=read('runtime-route-contract.js');
  const compute=read('compute-router-worker.js');

  assert.match(runtime,/export async function handleHumanTruthDetailsRoute/);
  assert.match(runtime,/\/api\/command-center-human-truth-details-health/);
  assert.match(runtime,/canonicalMetric:'human sessions'/);
  assert.match(runtime,/supportingUniqueVisitorMetric:true/);
  assert.match(runtime,/visitorCountries:true/);
  assert.match(runtime,/affiliateCoverageStatus:true/);
  assert.match(contract,/owner:'human_truth_details_health'/);
  assert.match(compute,/ownership\.owner==='human_truth_details_health'/);
  assert.match(compute,/handleHumanTruthDetailsRoute/);
});

test('generic traversal bypasses human truth details decorator',()=>{
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
  assert.doesNotMatch(compute,/import base from '\.\/command-center-human-truth-final-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/command-center-human-truth-details-worker\.js'/);
});

test('legacy details augmentation remains compatibility-only',()=>{
  const runtime=read('command-center-human-truth-details-worker.js');
  assert.match(runtime,/augmentAffiliateStatus/);
  assert.match(runtime,/data-toolscout-human-truth-details/);
  assert.match(runtime,/ANALYTICS_PATHS/);
  assert.doesNotMatch(runtime,/CREATE TABLE|CREATE INDEX|ALTER TABLE/);
});
