import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {routeOwner} from '../runtime-route-contract.js';
import {handleDistributionThroughputRoute} from '../distribution-throughput-worker.js';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('distribution throughput endpoints have direct ToolScout 2.0 ownership',()=>{
  assert.equal(routeOwner('/api/distribution/autonomous/refresh',{method:'POST'}).owner,'distribution_throughput_runtime');
  assert.equal(routeOwner('/api/distribution/submissions/execute',{method:'POST'}).owner,'distribution_throughput_runtime');
  assert.equal(routeOwner('/api/distribution/delivery/metrics',{method:'GET'}).owner,'distribution_throughput_runtime');
  const compute=read('compute-router-worker.js');
  assert.match(compute,/ownership\.owner==='distribution_throughput_runtime'/);
  assert.match(compute,/handleDistributionThroughputRoute\(request,env,ctx\)/);
});

test('direct throughput owner preserves authorization boundary',async()=>{
  const metrics=await handleDistributionThroughputRoute(new Request('https://trytoolscout.org/api/distribution/delivery/metrics'),{});
  assert.equal(metrics.status,401);
  assert.match(await metrics.text(),/unauthorized/);

  const refresh=await handleDistributionThroughputRoute(new Request('https://trytoolscout.org/api/distribution/autonomous/refresh',{method:'POST'}),{});
  assert.equal(refresh.status,401);
  assert.match(await refresh.text(),/unauthorized/);
});

test('generic traversal bypasses distribution throughput wrapper',()=>{
  const compute=read('compute-router-worker.js');
  const runtime=read('distribution-throughput-worker.js');
  assert.match(compute,/import base from '\.\/distribution-discovery-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/distribution-throughput-worker\.js'/);
  assert.match(runtime,/export async function handleDistributionThroughputRoute/);
  assert.match(runtime,/import \{handleAutonomousDistributionRoute\} from '\.\/distribution-autonomous-worker\.js'/);
  assert.match(runtime,/\?\(await handleAutonomousDistributionRoute\(request,env,ctx\)\)\|\|await base\.fetch\(request,env,ctx\)/);
  assert.match(runtime,/await normalizeIndexNowAttemptTimestamps\(env\)/);
  assert.doesNotMatch(runtime,/CREATE\s+(?:TABLE|INDEX)|ALTER\s+TABLE/i);
});
