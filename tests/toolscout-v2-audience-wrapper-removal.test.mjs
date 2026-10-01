import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {routeOwner} from '../runtime-route-contract.js';
import {handleAudienceRoute} from '../audience-worker.js';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Audience Engine surfaces have direct ToolScout 2.0 ownership',()=>{
  for(const path of [
    '/api/audience/platform-capabilities',
    '/api/audience/dev-comments/candidates',
    '/api/audience/bluesky-reply/health'
  ])assert.equal(routeOwner(path,{method:'GET'}).owner,'audience_runtime');

  for(const path of [
    '/api/audience-event',
    '/api/audience/dev-comment/observe',
    '/api/audience/bluesky-reply/prepare'
  ])assert.equal(routeOwner(path,{method:'POST'}).owner,'audience_runtime');

  assert.equal(routeOwner('/api/stats',{method:'GET'}).owner,'admin_stats');
  assert.equal(routeOwner('/analytics.html',{method:'GET'}).owner,'command_center_direct');

  const compute=read('compute-router-worker.js');
  assert.match(compute,/ownership\.owner==='audience_runtime'/);
  assert.match(compute,/handleAudienceRoute\(request,env,ctx\)/);
});

test('public capability surface remains public and Bluesky prepare keeps ingest-token authorization',async()=>{
  const capabilities=await handleAudienceRoute(
    new Request('https://trytoolscout.org/api/audience/platform-capabilities'),
    {}
  );
  assert.equal(capabilities.status,200);
  const body=await capabilities.json();
  assert.equal(body.ok,true);

  const prepare=await handleAudienceRoute(
    new Request('https://trytoolscout.org/api/audience/bluesky-reply/prepare',{method:'POST'}),
    {}
  );
  assert.equal(prepare.status,401);
  assert.match(await prepare.text(),/unauthorized/);
});

test('generic traversal bypasses audience while protected stats and Command Center retain direct owners',()=>{
  const compute=read('compute-router-worker.js');
  const runtime=read('audience-worker.js');
  const contract=read('runtime-route-contract.js');

  assert.match(compute,/import base from '\.\/affiliate-workflow-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/audience-worker\.js'/);
  assert.match(runtime,/import base from '\.\/affiliate-workflow-worker\.js'/);
  assert.match(runtime,/export async function handleAudienceRoute/);
  assert.doesNotMatch(runtime,/CREATE\s+(?:TABLE|INDEX)|ALTER\s+TABLE/i);

  assert.match(contract,/owner:'admin_stats'.*\/api\/stats/);
  assert.match(contract,/owner:'command_center_direct'.*\/analytics\.html/);
});
