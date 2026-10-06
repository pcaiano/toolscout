import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {routeOwner} from '../runtime-route-contract.js';
import {handleDistributionEmbedRoute} from '../distribution-embed-worker.js';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('distribution public embed surfaces have direct ToolScout 2.0 ownership',()=>{
  for(const path of ['/distribution/publisher-kit','/api/recommend','/embed/toolscout.js','/embed/toolscout-finder.js','/embed/toolscout-compare.js','/embed/toolscout-pick.js','/embed/badge.svg','/distribution/feed.xml']){
    assert.equal(routeOwner(path,{method:'GET'}).owner,'distribution_public_embed');
  }
  assert.equal(routeOwner('/api/distribution/embed-event',{method:'POST'}).owner,'distribution_learning_runtime');
  assert.equal(routeOwner('/api/distribution/embed-event',{method:'OPTIONS'}).owner,'distribution_learning_runtime');
  assert.equal(routeOwner('/api/distribution/feed.json',{method:'GET'}).owner,'traffic_integrity_live');
  assert.equal(routeOwner('/go/embed',{method:'GET'}).owner,'affiliate_redirect');
});

test('direct public embed owner preserves recommendation validation',async()=>{
  const response=await handleDistributionEmbedRoute(new Request('https://trytoolscout.org/api/recommend'),{});
  assert.equal(response.status,400);
  assert.match(await response.text(),/query_required/);
});

test('generic traversal bypasses distribution embed wrapper',()=>{
  const compute=read('compute-router-worker.js');
  const runtime=read('distribution-embed-worker.js');
  assert.doesNotMatch(compute,/import base from /);
  assert.doesNotMatch(compute,/import base from '\.\/distribution-embed-worker\.js'/);
  assert.match(compute,/ownership\.owner==='distribution_public_embed'/);
  assert.match(compute,/publisherKitPublicSurface=ownership\.owner==='distribution_public_embed'/);
  assert.match(compute,/publisherKitPublicSurface\)\{/);
  assert.match(runtime,/export async function handleDistributionEmbedRoute/);
  assert.doesNotMatch(runtime,/CREATE\s+(?:TABLE|INDEX)|ALTER\s+TABLE/i);
});
