import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {routeOwner} from '../runtime-route-contract.js';
import {handleContentEngineIntelligenceRoute} from '../content-engine-intelligence-worker.js';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Content Engine intelligence routes have direct ToolScout 2.0 ownership',()=>{
  assert.equal(routeOwner('/api/content-engine/intelligence/refresh',{method:'POST'}).owner,'content_engine_intelligence');
  assert.equal(routeOwner('/api/content-engine/brief',{method:'GET'}).owner,'content_engine_intelligence');
  assert.equal(routeOwner('/api/content-engine/intelligence/metrics',{method:'GET'}).owner,'content_engine_intelligence');
  assert.equal(routeOwner('/go/example',{method:'GET'}).owner,'affiliate_redirect');
});

test('direct Content Engine refresh preserves proof authentication',async()=>{
  const request=new Request('https://trytoolscout.org/api/content-engine/intelligence/refresh',{method:'POST'});
  const response=await handleContentEngineIntelligenceRoute(request,{});
  assert.equal(response.status,401);
  assert.match(await response.text(),/unauthorized/);
});

test('generic traversal bypasses Content Engine wrapper after schema migration',()=>{
  const compute=read('compute-router-worker.js');
  const runtime=read('content-engine-intelligence-worker.js');
  assert.match(compute,/import base from '\.\/distribution-orchestrator-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/content-engine-intelligence-worker\.js'/);
  assert.match(compute,/ownership\.owner==='content_engine_intelligence'/);
  assert.match(runtime,/export async function handleContentEngineIntelligenceRoute/);
  assert.doesNotMatch(runtime,/CREATE\s+(?:TABLE|INDEX)|ALTER\s+TABLE/i);
});
