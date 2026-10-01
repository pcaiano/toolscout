import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {routeOwner} from '../runtime-route-contract.js';
import {handleAutonomousDistributionRoute} from '../distribution-autonomous-worker.js';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('autonomous distribution metrics have direct ToolScout 2.0 ownership',()=>{
  assert.equal(routeOwner('/api/distribution/autonomy/metrics',{method:'GET'}).owner,'distribution_autonomous_runtime');
  assert.equal(routeOwner('/api/distribution/autonomous/refresh',{method:'POST'}).owner,'distribution_throughput_runtime');
  const compute=read('compute-router-worker.js');
  assert.match(compute,/ownership\.owner==='distribution_autonomous_runtime'/);
  assert.match(compute,/handleAutonomousDistributionRoute\(request,env,ctx\)/);
});

test('direct autonomous owner preserves authorization',async()=>{
  const metrics=await handleAutonomousDistributionRoute(new Request('https://trytoolscout.org/api/distribution/autonomy/metrics'),{});
  assert.equal(metrics.status,401);
  assert.match(await metrics.text(),/unauthorized/);

  const refresh=await handleAutonomousDistributionRoute(new Request('https://trytoolscout.org/api/distribution/autonomous/refresh',{method:'POST'}),{});
  assert.equal(refresh.status,401);
  assert.match(await refresh.text(),/unauthorized/);
});

test('throughput explicitly composes autonomous refresh while generic traversal bypasses autonomous wrapper',()=>{
  const compute=read('compute-router-worker.js');
  const throughput=read('distribution-throughput-worker.js');
  const runtime=read('distribution-autonomous-worker.js');
  assert.match(compute,/import base from '\.\/distribution-radar-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/distribution-autonomous-worker\.js'/);
  assert.match(throughput,/import base from '\.\/distribution-discovery-worker\.js'/);
  assert.match(throughput,/import \{handleAutonomousDistributionRoute\} from '\.\/distribution-autonomous-worker\.js'/);
  assert.match(throughput,/handleAutonomousDistributionRoute\(request,env,ctx\)/);
  assert.match(runtime,/export async function handleAutonomousDistributionRoute/);
  assert.match(runtime,/import \{handleDistributionDiscoveryRoute\} from '\.\/distribution-discovery-worker\.js'/);
  assert.match(runtime,/await handleDistributionDiscoveryRoute\(new Request\('https:\/\/trytoolscout\.org\/api\/distribution\/discovery\/refresh'/);
  assert.doesNotMatch(runtime,/CREATE\s+(?:TABLE|INDEX)|ALTER\s+TABLE/i);
});
