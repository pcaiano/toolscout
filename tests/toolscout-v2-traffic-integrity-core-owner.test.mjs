import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('confirmed visitor has direct traffic integrity core ownership',()=>{
  const runtime=read('traffic-integrity-worker.js');
  const contract=read('runtime-route-contract.js');
  const compute=read('compute-router-worker.js');

  assert.match(runtime,/export async function handleTrafficIntegrityCoreRoute/);
  assert.match(runtime,/\/api\/confirmed-visitor/);
  assert.match(runtime,/recordConfirmedVisitor/);
  assert.match(contract,/owner:'traffic_integrity_core'/);
  assert.match(compute,/ownership\.owner==='traffic_integrity_core'/);
  assert.match(compute,/handleTrafficIntegrityCoreRoute/);
});

test('generic fallback preserves confirmed visitor injection before guard and live transforms',()=>{
  const compute=read('compute-router-worker.js');
  const base=compute.indexOf('await base.fetch(request,env,ctx)');
  const core=compute.indexOf('await transformTrafficIntegrityCoreResponse(request,response)');
  const guard=compute.indexOf('await transformTrafficIntegrityGuardResponse(request,response)');
  const live=compute.indexOf('await transformTrafficIntegrityLiveResponse(request,response)');
  assert.ok(base>=0&&core>base&&guard>core&&live>guard,'response order must remain base -> traffic core -> guard -> live');
  assert.match(compute,/import base from '\.\/content-engine-intelligence-worker\.js'/);
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
  assert.doesNotMatch(compute,/import base from '\.\/traffic-integrity-worker\.js'/);
});

test('traffic heartbeat is explicitly scheduled and migration-owned',()=>{
  const runtime=read('traffic-integrity-worker.js');
  const schedule=read('runtime-schedule-contract.js');
  const migration=read('migrations/0071_browser_confirmed_visitor_truth.sql');

  assert.match(runtime,/export async function runTrafficIntegrityCoreScheduled/);
  assert.match(runtime,/INSERT INTO traffic_integrity_heartbeat/);
  assert.match(runtime,/DELETE FROM traffic_integrity_heartbeat/);
  assert.match(schedule,/traffic_integrity_heartbeat:\{owner:'traffic_integrity_core'/);
  assert.match(migration,/CREATE TABLE IF NOT EXISTS traffic_integrity_heartbeat/);
  assert.match(migration,/idx_traffic_integrity_heartbeat_created_at/);
  assert.doesNotMatch(runtime,/CREATE TABLE|CREATE INDEX|ALTER TABLE/);
});
