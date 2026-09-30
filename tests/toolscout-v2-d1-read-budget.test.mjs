import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('only still-live D1 budget routes are explicitly owned',()=>{
  const runtime=read('d1-read-budget-worker.js');
  const contract=read('runtime-route-contract.js');
  const compute=read('compute-router-worker.js');

  assert.match(runtime,/export async function handleD1ReadBudgetRoute/);
  assert.match(contract,/id:'d1_read_budget_get'/);
  assert.match(contract,/id:'d1_read_budget_post'/);
  assert.match(contract,/owner:'d1_read_budget'/);
  assert.match(compute,/ownership\.owner==='d1_read_budget'/);
  assert.match(compute,/handleD1ReadBudgetRoute/);

  for(const path of [
    '/analytics/api/ga4-health',
    '/analytics/api/google/connect',
    '/analytics/api/google/acquisition',
    '/analytics/api/commerce',
    '/api/autonomous-growth-health',
    '/api/distribution/discovery-health',
    '/analytics/api/google/disconnect'
  ]) assert.ok(contract.includes(path),path+' must stay in the explicit D1 budget contract');
});

test('D1 budget preserves credential forwarding and owner access bridge',()=>{
  const runtime=read('d1-read-budget-worker.js');
  assert.match(runtime,/validCommandCenterSession\(request,env\)\?withOwnerAccessHeader\(request\):request/);
  assert.match(runtime,/Cf-Access-Authenticated-User-Email/);
  assert.match(runtime,/pcaiano@gmail\.com/);
  assert.match(runtime,/handleCommandCenterGa4Route\(forwarded,env,ctx\)/);
  assert.match(runtime,/import base from '\.\/gsc-command-center-visible-worker\.js'/);
  assert.match(runtime,/handleCommandCenterGa4Route.*from '\.\/command-center-ga4-worker\.js'/);
});

test('D1 budget preserves circuit breaker and cache semantics for the two live cached health reads',()=>{
  const runtime=read('d1-read-budget-worker.js');
  assert.match(runtime,/\/api\/autonomous-growth-health/);
  assert.match(runtime,/\/api\/distribution\/discovery-health/);
  assert.match(runtime,/return cachedRead\(request,env,ctx,READ_TTLS\.get\(url\.pathname\),'public'\)/);
  assert.match(runtime,/d1_read_budget_circuit_open/);
  assert.match(runtime,/X-ToolScout-D1-Cache/);
  assert.match(runtime,/COALESCED/);
  assert.match(runtime,/CIRCUIT_TTL_SECONDS = 300/);
});

test('generic request traversal bypasses the D1 budget wrapper',()=>{
  const compute=read('compute-router-worker.js');
  assert.match(compute,/import base from '\.\/gsc-command-center-visible-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/command-center-health-language-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/command-center-ga4-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/d1-read-budget-worker\.js'/);
});
