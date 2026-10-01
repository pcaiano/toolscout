import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {routeOwner} from '../runtime-route-contract.js';
import {handleDistributionNetworkRoute} from '../distribution-network-worker.js';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Distribution Network routes have direct ToolScout 2.0 ownership',()=>{
  assert.equal(routeOwner('/api/distribution/network/refresh',{method:'POST'}).owner,'distribution_network_runtime');
  assert.equal(routeOwner('/api/distribution/network/metrics',{method:'GET'}).owner,'distribution_network_runtime');
  const compute=read('compute-router-worker.js');
  assert.match(compute,/ownership\.owner==='distribution_network_runtime'/);
  assert.match(compute,/handleDistributionNetworkRoute\(request,env\)/);
});

test('direct Distribution Network owner preserves authorization',async()=>{
  const refresh=await handleDistributionNetworkRoute(new Request('https://trytoolscout.org/api/distribution/network/refresh',{method:'POST'}),{});
  assert.equal(refresh.status,401);
  assert.match(await refresh.text(),/unauthorized/);
  const metrics=await handleDistributionNetworkRoute(new Request('https://trytoolscout.org/api/distribution/network/metrics'),{});
  assert.equal(metrics.status,401);
  assert.match(await metrics.text(),/unauthorized/);
});

test('generic traversal bypasses Distribution Network wrapper after schema migration',()=>{
  const compute=read('compute-router-worker.js');
  const runtime=read('distribution-network-worker.js');
  assert.match(compute,/import base from '\.\/distribution-engine-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/distribution-network-worker\.js'/);
  assert.match(runtime,/export async function handleDistributionNetworkRoute/);
  assert.doesNotMatch(runtime,/CREATE\s+(?:TABLE|INDEX)|ALTER\s+TABLE/i);
});
