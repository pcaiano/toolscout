import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {routeOwner} from '../runtime-route-contract.js';
import {handleAffiliateCoverageRoute} from '../affiliate-coverage-entry-worker.js';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('affiliate coverage endpoints have direct ToolScout 2.0 ownership',()=>{
  for(const path of ['/api/affiliate-workflow/firecrawl','/api/affiliate-replies/ingest','/api/affiliate-coverage/run']){
    assert.equal(routeOwner(path,{method:'POST'}).owner,'affiliate_coverage_runtime');
    assert.equal(routeOwner(path,{method:'GET'}).owner,'affiliate_coverage_runtime');
  }
  const compute=read('compute-router-worker.js');
  assert.match(compute,/ownership\.owner==='affiliate_coverage_runtime'/);
  assert.match(compute,/handleAffiliateCoverageRoute\(request,env\)/);
});

test('direct affiliate coverage owner preserves method and auth boundaries',async()=>{
  const getResponse=await handleAffiliateCoverageRoute(new Request('https://trytoolscout.org/api/affiliate-coverage/run'),{});
  assert.equal(getResponse.status,405);
  assert.match(await getResponse.text(),/method_not_allowed/);

  const postResponse=await handleAffiliateCoverageRoute(new Request('https://trytoolscout.org/api/affiliate-coverage/run',{method:'POST'}),{});
  assert.equal(postResponse.status,401);
  assert.match(await postResponse.text(),/unauthorized/);
});

test('generic traversal bypasses affiliate coverage wrapper after schema migration',()=>{
  const compute=read('compute-router-worker.js');
  const runtime=read('affiliate-coverage-entry-worker.js');
  assert.match(compute,/import base from '\.\/distribution-command-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/affiliate-coverage-entry-worker\.js'/);
  assert.match(runtime,/export async function handleAffiliateCoverageRoute/);
  assert.doesNotMatch(runtime,/CREATE\s+(?:TABLE|INDEX)|ALTER\s+TABLE/i);
});
