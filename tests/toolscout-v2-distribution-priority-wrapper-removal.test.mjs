import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {routeOwner} from '../runtime-route-contract.js';
import {handleDistributionPriorityRoute} from '../distribution-priority-worker.js';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('distribution priority routes remain direct-owned',()=>{
  assert.equal(routeOwner('/api/distribution/operating-decisions',{method:'GET'}).owner,'distribution_priority');
  assert.equal(routeOwner('/api/distribution/operating-decisions/rebalance',{method:'POST'}).owner,'distribution_priority');
  const compute=read('compute-router-worker.js');
  assert.match(compute,/handleDistributionPriorityRoute\(request,env\)/);
  assert.match(compute,/import \{handleDistributionPriorityRoute\} from '\.\/distribution-priority-worker\.js'/);
});

test('generic traversal bypasses distribution priority wrapper',()=>{
  const compute=read('compute-router-worker.js');
  const runtime=read('distribution-priority-worker.js');
  assert.match(compute,/import base from '\.\/distribution-radar-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/distribution-priority-worker\.js'/);
  assert.match(runtime,/export async function handleDistributionPriorityRoute/);
  assert.doesNotMatch(runtime,/CREATE\s+(?:TABLE|INDEX)|ALTER\s+TABLE/i);
});

test('direct priority owner preserves authorization',async()=>{
  const getResponse=await handleDistributionPriorityRoute(new Request('https://trytoolscout.org/api/distribution/operating-decisions'),{});
  assert.equal(getResponse.status,401);
  assert.match(await getResponse.text(),/unauthorized/);

  const postResponse=await handleDistributionPriorityRoute(new Request('https://trytoolscout.org/api/distribution/operating-decisions/rebalance',{method:'POST'}),{});
  assert.equal(postResponse.status,401);
  assert.match(await postResponse.text(),/unauthorized/);
});
