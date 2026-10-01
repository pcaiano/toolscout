import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Command Center truth health has a direct ToolScout 2.0 owner',()=>{
  const runtime=read('command-center-truth-consolidation-worker.js');
  const contract=read('runtime-route-contract.js');
  const compute=read('compute-router-worker.js');

  assert.match(runtime,/export async function handleCommandCenterTruthHealthRoute/);
  assert.match(runtime,/\/api\/command-center-truth-health/);
  assert.match(runtime,/canonicalCommercialTruth:'D1 browser-confirmed'/);
  assert.match(runtime,/northStar:'removed_as_redundant'/);
  assert.match(runtime,/trafficTruth:'consolidated'/);

  assert.match(contract,/owner:'command_center_truth_health'/);
  assert.match(compute,/ownership\.owner==='command_center_truth_health'/);
  assert.match(compute,/handleCommandCenterTruthHealthRoute/);
});

test('generic traversal bypasses truth consolidation wrapper',()=>{
  const compute=read('compute-router-worker.js');
  assert.match(compute,/import base from '\.\/distribution-vendor-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/posthog-behavior-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/visitor-accuracy-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/visitor-dashboard-metrics-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/lemlist-profile-correction-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/discovery-attribution-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/discovery-attribution-health-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/command-center-truth-consolidation-worker\.js'/);
});

test('legacy commercial truth consolidation remains compatibility-only',()=>{
  const runtime=read('command-center-truth-consolidation-worker.js');
  assert.match(runtime,/canonicalCommercialTruth/);
  assert.match(runtime,/consolidateStats/);
  assert.match(runtime,/data-toolscout-command-truth="1"/);
  assert.doesNotMatch(runtime,/CREATE TABLE|CREATE INDEX|ALTER TABLE/);
});
