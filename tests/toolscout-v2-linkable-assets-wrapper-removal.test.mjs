import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {routeOwner} from '../runtime-route-contract.js';
import {handleLinkableAssetsRoute} from '../distribution-linkable-assets-worker.js';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('linkable assets sync has direct ToolScout 2.0 ownership',()=>{
  assert.equal(routeOwner('/api/distribution/linkable-assets/sync',{method:'POST'}).owner,'distribution_linkable_assets');
  const compute=read('compute-router-worker.js');
  assert.match(compute,/ownership\.owner==='distribution_linkable_assets'/);
  assert.match(compute,/handleLinkableAssetsRoute\(request,env\)/);
});

test('direct linkable assets owner preserves authorization',async()=>{
  const request=new Request('https://trytoolscout.org/api/distribution/linkable-assets/sync',{method:'POST'});
  const response=await handleLinkableAssetsRoute(request,{});
  assert.equal(response.status,401);
  assert.match(await response.text(),/unauthorized/);
});

test('generic traversal bypasses linkable assets wrapper',()=>{
  const compute=read('compute-router-worker.js');
  const runtime=read('distribution-linkable-assets-worker.js');
  assert.match(compute,/import base from '\.\/revenue-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/distribution-linkable-assets-worker\.js'/);
  assert.match(runtime,/export async function handleLinkableAssetsRoute/);
  assert.doesNotMatch(runtime,/CREATE\s+(?:TABLE|INDEX)|ALTER\s+TABLE/i);
});
