import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {routeOwner} from '../runtime-route-contract.js';
import {handleDistributionContactRoute} from '../distribution-contact-worker.js';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('contact scan and vendor status have direct ToolScout 2.0 ownership',()=>{
  assert.equal(routeOwner('/api/distribution/vendor-amplification/contact-scan',{method:'POST'}).owner,'distribution_contact_runtime');
  assert.equal(routeOwner('/api/distribution/vendor-amplification/status',{method:'POST'}).owner,'distribution_contact_runtime');
  assert.equal(routeOwner('/api/distribution/vendor-amplification/ready',{method:'GET'}).owner,'distribution_sender_runtime');
  assert.equal(routeOwner('/api/stats',{method:'GET'}).owner,'admin_stats');

  const compute=read('compute-router-worker.js');
  assert.match(compute,/ownership\.owner==='distribution_contact_runtime'/);
  assert.match(compute,/handleDistributionContactRoute\(request,env,ctx\)/);
});

test('direct contact owner preserves integration authorization',async()=>{
  const scan=await handleDistributionContactRoute(
    new Request('https://trytoolscout.org/api/distribution/vendor-amplification/contact-scan',{method:'POST'}),
    {}
  );
  assert.equal(scan.status,401);
  assert.match(await scan.text(),/unauthorized/);

  const status=await handleDistributionContactRoute(
    new Request('https://trytoolscout.org/api/distribution/vendor-amplification/status',{method:'POST'}),
    {}
  );
  assert.equal(status.status,401);
  assert.match(await status.text(),/unauthorized/);
});

test('generic traversal bypasses contact while sender and learning compose contact behavior explicitly',()=>{
  const compute=read('compute-router-worker.js');
  const runtime=read('distribution-contact-worker.js');
  const sender=read('distribution-sender-worker.js');
  const learning=read('distribution-learning-worker.js');

  assert.match(compute,/import base from '\.\/distribution-vendor-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/distribution-contact-worker\.js'/);
  assert.match(runtime,/import base from '\.\/distribution-vendor-worker\.js'/);
  assert.match(runtime,/export async function handleDistributionContactRoute/);
  assert.match(runtime,/export async function runDistributionContactScheduled/);
  assert.doesNotMatch(runtime,/CREATE\s+(?:TABLE|INDEX)|ALTER\s+TABLE/i);

  assert.match(sender,/import \{handleDistributionContactRoute\} from '\.\/distribution-contact-worker\.js'/);
  assert.match(sender,/handleDistributionContactRoute\(refreshRequest,env,ctx\)/);

  assert.match(learning,/import \{runDistributionContactScheduled\} from '\.\/distribution-contact-worker\.js'/);
  assert.match(learning,/return runDistributionContactScheduled\(event,env,ctx\)/);
});
