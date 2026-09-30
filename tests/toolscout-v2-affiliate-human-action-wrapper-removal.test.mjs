import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {routeOwner} from '../runtime-route-contract.js';
import {handleAffiliateHumanActionRoute} from '../affiliate-human-action-entry-worker.js';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('audience and affiliate human actions have direct ToolScout 2.0 ownership',()=>{
  assert.equal(routeOwner('/api/audience-health',{method:'GET'}).owner,'affiliate_human_actions');
  for(const path of ['/analytics/api/audience-action','/api/audience-suggestion','/analytics/api/affiliate-human-action']){
    assert.equal(routeOwner(path,{method:'POST'}).owner,'affiliate_human_actions');
  }
  const compute=read('compute-router-worker.js');
  assert.match(compute,/ownership\.owner==='affiliate_human_actions'/);
  assert.match(compute,/handleAffiliateHumanActionRoute\(request,env\)/);
});

test('direct human action owner preserves authentication boundaries',async()=>{
  for(const path of ['/analytics/api/audience-action','/analytics/api/affiliate-human-action']){
    const request=new Request('https://trytoolscout.org'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
    const response=await handleAffiliateHumanActionRoute(request,{});
    assert.equal(response.status,401);
    assert.match(await response.text(),/command_center_session_expired/);
  }
  const ingest=new Request('https://trytoolscout.org/api/audience-suggestion',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
  const ingestResponse=await handleAffiliateHumanActionRoute(ingest,{});
  assert.equal(ingestResponse.status,401);
});

test('generic request traversal bypasses affiliate human action wrapper',()=>{
  const compute=read('compute-router-worker.js');
  const runtime=read('affiliate-human-action-entry-worker.js');
  assert.match(compute,/import base from '\.\/human-action-entry-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/affiliate-human-action-entry-worker\.js'/);
  assert.match(runtime,/export async function handleAffiliateHumanActionRoute/);
  assert.doesNotMatch(runtime,/CREATE\s+(?:TABLE|INDEX)|ALTER\s+TABLE/i);
});
