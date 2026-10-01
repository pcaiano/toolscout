import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {handleMonthMetricsHealthRoute} from '../visitor-dashboard-metrics-worker.js';
import {routeOwner} from '../runtime-route-contract.js';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('month metrics health has a direct ToolScout 2.0 owner',async()=>{
  assert.equal(routeOwner('/api/month-metrics-health',{method:'GET'}).owner,'month_metrics_health');
  const response=await handleMonthMetricsHealthRoute(new Request('https://trytoolscout.org/api/month-metrics-health'));
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{ok:true,service:'toolscout-month-metrics',version:1});
  assert.equal(response.headers.get('Cache-Control'),'no-store');
});

test('month metrics health owner ignores unrelated routes and methods',async()=>{
  assert.equal(await handleMonthMetricsHealthRoute(new Request('https://trytoolscout.org/api/not-month-metrics')),null);
  assert.equal(await handleMonthMetricsHealthRoute(new Request('https://trytoolscout.org/api/month-metrics-health',{method:'POST'})),null);
});

test('generic traversal bypasses legacy month metrics decoration wrapper',()=>{
  const compute=read('compute-router-worker.js');
  const runtime=read('visitor-dashboard-metrics-worker.js');
  assert.match(compute,/import base from '\.\/distribution-network-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/posthog-behavior-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/visitor-accuracy-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/visitor-dashboard-metrics-worker\.js'/);
  assert.match(compute,/handleMonthMetricsHealthRoute/);
  assert.match(compute,/ownership\.owner==='month_metrics_health'/);
  assert.match(runtime,/data-toolscout-month-metrics/);
  assert.doesNotMatch(runtime,/CREATE TABLE|CREATE INDEX|ALTER TABLE/);
});

test('Command Center page ownership keeps the old metrics script outside generic traversal',()=>{
  assert.equal(routeOwner('/analytics',{method:'GET'}).owner,'command_center_direct');
  assert.equal(routeOwner('/analytics/',{method:'GET'}).owner,'command_center_direct');
});
