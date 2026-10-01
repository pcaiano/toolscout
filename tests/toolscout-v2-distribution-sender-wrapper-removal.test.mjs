import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {routeOwner} from '../runtime-route-contract.js';
import {handleDistributionSenderRoute} from '../distribution-sender-worker.js';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('distribution sender surfaces have direct ToolScout 2.0 ownership',()=>{
  for(const path of [
    '/api/distribution/vendor-amplification/ready',
    '/api/distribution/vendor-amplification/public-candidates'
  ])assert.equal(routeOwner(path,{method:'GET'}).owner,'distribution_sender_runtime');

  for(const path of [
    '/api/distribution/outbound-reputation/check',
    '/api/distribution/outbound-reputation/override-validate',
    '/api/distribution/outbound-reputation/override-status',
    '/api/distribution/vendor-amplification/public-status'
  ])assert.equal(routeOwner(path,{method:'POST'}).owner,'distribution_sender_runtime');

  const compute=read('compute-router-worker.js');
  assert.match(compute,/ownership\.owner==='distribution_sender_runtime'/);
  assert.match(compute,/handleDistributionSenderRoute\(request,env,ctx\)/);
});

test('direct sender owner preserves integration and public handoff authorization boundaries',async()=>{
  const ready=await handleDistributionSenderRoute(new Request('https://trytoolscout.org/api/distribution/vendor-amplification/ready'),{});
  assert.equal(ready.status,401);
  assert.match(await ready.text(),/unauthorized/);

  const candidates=await handleDistributionSenderRoute(new Request('https://trytoolscout.org/api/distribution/vendor-amplification/public-candidates'),{});
  assert.equal(candidates.status,401);
  assert.match(await candidates.text(),/unauthorized/);

  const reputation=await handleDistributionSenderRoute(new Request('https://trytoolscout.org/api/distribution/outbound-reputation/check',{method:'POST'}),{});
  assert.equal(reputation.status,401);
  assert.match(await reputation.text(),/unauthorized/);
});

test('generic traversal bypasses sender while public candidates preserve contact refresh composition',()=>{
  const compute=read('compute-router-worker.js');
  const runtime=read('distribution-sender-worker.js');
  assert.match(compute,/import base from '\.\/audience-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/distribution-sender-worker\.js'/);
  assert.match(runtime,/import base from '\.\/audience-worker\.js'/);
  assert.match(runtime,/export async function handleDistributionSenderRoute/);
  assert.match(runtime,/import \{handleDistributionContactRoute\} from '\.\/distribution-contact-worker\.js'/);
  assert.match(runtime,/handleDistributionContactRoute\(refreshRequest,env,ctx\)/);
  assert.doesNotMatch(runtime,/CREATE\s+(?:TABLE|INDEX)|ALTER\s+TABLE/i);
});
