import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Command Center autoload health has a direct ToolScout 2.0 owner',()=>{
  const runtime=read('command-center-autoload-worker.js');
  const contract=read('runtime-route-contract.js');
  const compute=read('compute-router-worker.js');

  assert.match(runtime,/export async function handleCommandCenterAutoloadHealthRoute/);
  assert.match(runtime,/\/api\/command-center-autoload-health/);
  assert.match(runtime,/version:5/);
  assert.match(runtime,/trafficTruthFirst:true/);
  assert.match(runtime,/chairmanSecond:true/);
  assert.match(runtime,/trafficTrendSeries:3/);
  assert.match(runtime,/trafficTrendDualAxis:true/);

  assert.match(contract,/owner:'command_center_autoload_health'/);
  assert.match(compute,/ownership\.owner==='command_center_autoload_health'/);
  assert.match(compute,/handleCommandCenterAutoloadHealthRoute/);
});

test('generic traversal bypasses the autoload presentation wrapper',()=>{
  const compute=read('compute-router-worker.js');
  assert.match(compute,/import base from '\.\/content-engine-intelligence-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/posthog-behavior-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/visitor-accuracy-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/visitor-dashboard-metrics-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/lemlist-profile-correction-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/discovery-attribution-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/discovery-attribution-health-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/command-center-truth-consolidation-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/command-center-autoload-worker\.js'/);
});

test('legacy autoload UI remains compatibility-only',()=>{
  const runtime=read('command-center-autoload-worker.js');
  assert.match(runtime,/data-toolscout-command-autoload="5"/);
  assert.match(runtime,/\/analytics\/api\/stats/);
  assert.match(runtime,/response=await decorate\(response\)/);
  assert.doesNotMatch(runtime,/CREATE TABLE|CREATE INDEX|ALTER TABLE/);
});
