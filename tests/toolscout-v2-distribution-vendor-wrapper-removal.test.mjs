import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {routeOwner} from '../runtime-route-contract.js';
import {handleDistributionVendorRoute} from '../distribution-vendor-worker.js';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('vendor amplification queue and refresh have direct ToolScout 2.0 ownership',()=>{
  assert.equal(routeOwner('/api/distribution/vendor-amplification',{method:'GET'}).owner,'distribution_vendor_runtime');
  assert.equal(routeOwner('/api/distribution/vendor-amplification/refresh',{method:'POST'}).owner,'distribution_vendor_runtime');
  assert.equal(routeOwner('/api/stats',{method:'GET'}).owner,'admin_stats');

  const compute=read('compute-router-worker.js');
  assert.match(compute,/ownership\.owner==='distribution_vendor_runtime'/);
  assert.match(compute,/handleDistributionVendorRoute\(request,env,ctx\)/);
});

test('direct vendor owner preserves admin authorization',async()=>{
  const queue=await handleDistributionVendorRoute(new Request('https://trytoolscout.org/api/distribution/vendor-amplification'),{});
  assert.equal(queue.status,401);
  assert.match(await queue.text(),/unauthorized/);

  const refresh=await handleDistributionVendorRoute(
    new Request('https://trytoolscout.org/api/distribution/vendor-amplification/refresh',{method:'POST'}),
    {}
  );
  assert.equal(refresh.status,401);
  assert.match(await refresh.text(),/unauthorized/);
});

test('generic traversal bypasses vendor while contact composes vendor stats and scheduling explicitly',()=>{
  const compute=read('compute-router-worker.js');
  const runtime=read('distribution-vendor-worker.js');
  const contact=read('distribution-contact-worker.js');

  assert.doesNotMatch(compute,/import base from /);
  assert.doesNotMatch(compute,/import base from '\.\/distribution-vendor-worker\.js'/);
  assert.match(runtime,/import base from '\.\/revenue-worker\.js'/);
  assert.match(runtime,/export async function handleDistributionVendorRoute/);
  assert.match(runtime,/export async function runDistributionVendorScheduled/);
  assert.match(runtime,/import \{runDistributionRadarScheduled\} from '\.\/distribution-radar-worker\.js'/);
  assert.match(runtime,/await runDistributionRadarScheduled\(event,env,ctx\)/);
  assert.doesNotMatch(runtime,/CREATE\s+(?:TABLE|INDEX)|ALTER\s+TABLE/i);

  assert.match(contact,/import \{handleDistributionVendorRoute,runDistributionVendorScheduled\} from '\.\/distribution-vendor-worker\.js'/);
  assert.match(contact,/handleDistributionVendorRoute\(request,env,ctx\)/);
  assert.match(contact,/await runDistributionVendorScheduled\(event,env,ctx\)/);
});
