import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {routeOwner} from '../runtime-route-contract.js';
import {handleDistributionEngineRoute} from '../distribution-engine-worker.js';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('distribution event has direct ToolScout 2.0 ownership while stats and Command Center retain current owners',()=>{
  assert.equal(routeOwner('/api/distribution-event',{method:'POST'}).owner,'distribution_engine_runtime');
  assert.equal(routeOwner('/api/stats',{method:'GET'}).owner,'admin_stats');
  assert.equal(routeOwner('/analytics.html',{method:'GET'}).owner,'command_center_direct');

  const compute=read('compute-router-worker.js');
  assert.match(compute,/ownership\.owner==='distribution_engine_runtime'/);
  assert.match(compute,/handleDistributionEngineRoute\(request,env,ctx\)/);
});

test('direct distribution event owner preserves admin authorization',async()=>{
  const response=await handleDistributionEngineRoute(
    new Request('https://trytoolscout.org/api/distribution-event',{method:'POST'}),
    {}
  );
  assert.equal(response.status,401);
  assert.match(await response.text(),/unauthorized/);
});

test('generic traversal bypasses distribution engine while production stats and Command Center stay directly owned',()=>{
  const compute=read('compute-router-worker.js');
  const runtime=read('distribution-engine-worker.js');
  const contract=read('runtime-route-contract.js');

  assert.match(compute,/import base from '\.\/affiliate-workflow-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/distribution-engine-worker\.js'/);
  assert.match(runtime,/import base from '\.\/affiliate-workflow-worker\.js'/);
  assert.match(runtime,/export async function handleDistributionEngineRoute/);
  assert.doesNotMatch(runtime,/CREATE\s+(?:TABLE|INDEX)|ALTER\s+TABLE/i);

  assert.match(contract,/owner:'admin_stats'.*\/api\/stats/);
  assert.match(contract,/owner:'command_center_direct'.*\/analytics\.html/);
});
