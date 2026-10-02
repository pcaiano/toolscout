import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {routeOwner} from '../runtime-route-contract.js';
import {handleToolScoutV2ClosureRoute,TOOLSCOUT_V2_DEPLOYMENT_FINGERPRINT} from '../toolscout-v2-closure-runtime.js';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Phase 107 closure health is direct-owned before generic runtime prefix',async()=>{
  assert.equal(routeOwner('/api/runtime/closure-health',{method:'GET'}).owner,'toolscout_v2_closure');
  const response=await handleToolScoutV2ClosureRoute(new Request('https://trytoolscout.org/api/runtime/closure-health'));
  assert.equal(response.status,200);
  assert.equal(response.headers.get('x-toolscout-route-owner'),'toolscout_v2_closure');
  assert.equal(response.headers.get('x-toolscout-runtime'),TOOLSCOUT_V2_DEPLOYMENT_FINGERPRINT);
  const data=await response.json();
  assert.equal(data.architecture,'toolscout-2.0');
  assert.equal(data.phase,107);
  assert.equal(data.legacyEdges,0);
  assert.equal(data.routeOwnership.legacyDeclaredGroups,0);
  assert.equal(data.routeOwnership.directCoveragePct,100);
  assert.equal(data.productionClosure.status,'architecture_closed');
});

test('Phase 107 closure health is read-only and wired by the compute entrypoint',()=>{
  const runtime=read('toolscout-v2-closure-runtime.js');
  const compute=read('compute-router-worker.js');
  assert.doesNotMatch(runtime,/CREATE\s+(?:TABLE|INDEX)|ALTER\s+TABLE|\.run\(|\.batch\(/i);
  assert.match(compute,/handleToolScoutV2ClosureRoute/);
  assert.match(compute,/ownership\.owner==='toolscout_v2_closure'/);
});
