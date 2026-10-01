import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {routeOwner} from '../runtime-route-contract.js';
import {handleDistributionRadarRoute} from '../distribution-radar-worker.js';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('distribution radar feeds and refresh have direct ToolScout 2.0 ownership',()=>{
  assert.equal(routeOwner('/api/distribution/feed.json',{method:'GET'}).owner,'distribution_radar_runtime');
  assert.equal(routeOwner('/api/distribution/feed.xml',{method:'GET'}).owner,'distribution_radar_runtime');
  assert.equal(routeOwner('/api/distribution/radar/refresh',{method:'POST'}).owner,'distribution_radar_runtime');

  const compute=read('compute-router-worker.js');
  assert.match(compute,/ownership\.owner==='distribution_radar_runtime'/);
  assert.match(compute,/handleDistributionRadarRoute\(request,env,ctx\)/);
});

test('radar feeds remain public while refresh preserves admin authorization',async()=>{
  const refresh=await handleDistributionRadarRoute(
    new Request('https://trytoolscout.org/api/distribution/radar/refresh',{method:'POST'}),
    {}
  );
  assert.equal(refresh.status,401);
  assert.match(await refresh.text(),/unauthorized/);
});

test('generic traversal bypasses radar while vendor composes radar scheduling explicitly',()=>{
  const compute=read('compute-router-worker.js');
  const runtime=read('distribution-radar-worker.js');
  const vendor=read('distribution-vendor-worker.js');

  assert.match(compute,/import base from '\.\/distribution-engine-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/distribution-radar-worker\.js'/);
  assert.match(runtime,/import base from '\.\/distribution-engine-worker\.js'/);
  assert.match(runtime,/export async function handleDistributionRadarRoute/);
  assert.match(runtime,/export async function runDistributionRadarScheduled/);
  assert.doesNotMatch(runtime,/CREATE\s+(?:TABLE|INDEX)|ALTER\s+TABLE/i);

  assert.match(vendor,/import \{runDistributionRadarScheduled\} from '\.\/distribution-radar-worker\.js'/);
  assert.match(vendor,/await runDistributionRadarScheduled\(event,env,ctx\)/);
});
