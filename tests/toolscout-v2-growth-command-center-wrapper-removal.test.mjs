import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {routeOwner} from '../runtime-route-contract.js';
import {handleGrowthCommandCenterActionRoute} from '../growth-command-center-v2-worker.js';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Command Center growth actions have direct ToolScout 2.0 ownership',()=>{
  for(const path of ['/analytics/api/reputation-review','/analytics/api/distribution-human-action']){
    const owner=routeOwner(path,{method:'POST'});
    assert.equal(owner.owner,'command_center_growth_actions');
    assert.equal(owner.plane,'executor');
  }
  const compute=read('compute-router-worker.js');
  assert.match(compute,/ownership\.owner==='command_center_growth_actions'/);
  assert.match(compute,/handleGrowthCommandCenterActionRoute\(request,env\)/);
});

test('direct growth action handler preserves session gate before state mutation',async()=>{
  for(const path of ['/analytics/api/reputation-review','/analytics/api/distribution-human-action']){
    const request=new Request('https://trytoolscout.org'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
    const response=await handleGrowthCommandCenterActionRoute(request,{});
    assert.equal(response.status,401);
    assert.match(await response.text(),/command_center_session_expired/);
  }
});

test('generic request traversal bypasses the growth Command Center wrapper',()=>{
  const compute=read('compute-router-worker.js');
  const runtime=read('growth-command-center-v2-worker.js');
  assert.match(compute,/import base from '\.\/distribution-radar-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/growth-command-center-v2-worker\.js'/);
  assert.match(runtime,/export async function handleGrowthCommandCenterActionRoute/);
  assert.doesNotMatch(runtime,/CREATE\s+(?:TABLE|INDEX)|ALTER\s+TABLE/i);
});
