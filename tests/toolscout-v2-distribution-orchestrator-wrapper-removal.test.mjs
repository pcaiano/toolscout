import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {routeOwner} from '../runtime-route-contract.js';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('distribution orchestrator routes remain direct-owned',()=>{
  for(const [path,method] of [
    ['/api/distribution/orchestrate','POST'],
    ['/api/distribution/economic-learning','POST'],
    ['/api/distribution/editorial-queue','GET'],
    ['/api/distribution/priorities/public-reconcile','POST'],
    ['/api/growth/search-directives','GET'],
    ['/api/growth/execution','GET'],
    ['/api/growth/supervisor/public','GET']
  ]){
    assert.equal(routeOwner(path,{method}).owner,'distribution_orchestrator');
  }
  const compute=read('compute-router-worker.js');
  assert.match(compute,/ownership\.owner==='distribution_orchestrator'/);
  assert.match(compute,/handleDistributionOrchestratorRoute\(request,env,ctx\)/);
});

test('generic traversal bypasses distribution orchestrator wrapper',()=>{
  const compute=read('compute-router-worker.js');
  const runtime=read('distribution-orchestrator-worker.js');
  assert.match(compute,/import base from '\.\/funnel-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/distribution-orchestrator-worker\.js'/);
  assert.match(runtime,/export async function handleDistributionOrchestratorRoute/);
  assert.doesNotMatch(runtime,/CREATE\s+(?:TABLE|INDEX)|ALTER\s+TABLE/i);
});

test('scheduler remains explicit at compute-router level',()=>{
  const compute=read('compute-router-worker.js');
  assert.match(compute,/async scheduled\(scheduledEvent,env,ctx\)/);
  assert.match(compute,/runGrowthScheduler\(scheduledEvent,env,ctx\)/);
  assert.match(compute,/runCloudflarePrimaryScheduled\(scheduledEvent,env,ctx\)/);
});
