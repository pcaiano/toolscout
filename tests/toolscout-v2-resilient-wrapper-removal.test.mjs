import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('resilient wrapper responsibilities remain direct-owned',()=>{
  const contract=read('runtime-route-contract.js');
  const compute=read('compute-router-worker.js');

  assert.match(contract,/owner:'command_center_resilient_health'/);
  assert.match(contract,/owner:'analytics_chairman'/);
  assert.match(contract,/owner:'analytics_stats'/);

  assert.match(compute,/ownership\.owner==='command_center_resilient_health'/);
  assert.match(compute,/ownership\.owner==='analytics_chairman'/);
  assert.match(compute,/ownership\.owner==='analytics_stats'/);

  assert.match(compute,/handleCommandCenterResilientHealthRoute/);
  assert.match(compute,/handleAnalyticsChairmanRoute/);
  assert.match(compute,/handleAnalyticsStatsReadRoute/);
});

test('generic traversal bypasses command-center-resilient wrapper',()=>{
  const compute=read('compute-router-worker.js');
  assert.match(compute,/import base from '\.\/distribution-command-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/posthog-behavior-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/visitor-accuracy-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/visitor-dashboard-metrics-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/lemlist-profile-correction-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/discovery-attribution-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/discovery-attribution-health-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/command-center-truth-consolidation-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/command-center-autoload-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/command-center-resilient-worker\.js'/);
});

test('resilient snapshot implementation remains available to the direct stats owner',()=>{
  const resilient=read('command-center-resilient-worker.js');
  assert.match(resilient,/export async function resilientSnapshot/);
  assert.match(resilient,/export async function handleAnalyticsStatsReadRoute/);
  assert.match(resilient,/handleCommandCenterResilientHealthRoute/);
  assert.doesNotMatch(resilient,/CREATE TABLE|CREATE INDEX|ALTER TABLE/);
});
