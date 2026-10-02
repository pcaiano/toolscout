import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {routeOwner} from '../runtime-route-contract.js';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const baseOf=p=>read(p).match(/import\s+base(?:,[^\n]*?)?\s+from\s+['"]\.\/([^'"]+)['"]/)?.[1]||null;
const baseChain=(start,max=20)=>{const out=[],seen=new Set();let current=start;while(current&&out.length<max&&!seen.has(current)){seen.add(current);out.push(current);current=baseOf(current)}return out};

test('generic ToolScout 2.0 traversal bypasses catalog autonomy',()=>{
  const funnel=read('funnel-worker.js');
  assert.match(funnel,/import base from '\.\/worker\.js'/);
  assert.doesNotMatch(funnel,/import base from '\.\/catalog-autonomy-worker\.js'/);
  assert.doesNotMatch(funnel,/import base from '\.\/dynamic-worker\.js'/);
  assert.deepEqual(baseChain('compute-router-worker.js').slice(0,4),['compute-router-worker.js','worker.js']);
});

test('catalog autonomy control routes have an explicit owner',()=>{
  assert.equal(routeOwner('/api/catalog-autonomy/status',{method:'GET'}).owner,'catalog_autonomy_runtime');
  assert.equal(routeOwner('/api/catalog-autonomy/run',{method:'POST'}).owner,'catalog_autonomy_runtime');
  assert.equal(routeOwner('/api/catalog-inventory',{method:'GET'}).owner,'catalog_autonomy_runtime');
  assert.equal(routeOwner('/data/catalog-inventory.json',{method:'GET'}).owner,'catalog_autonomy_runtime');
  const compute=read('compute-router-worker.js');
  assert.match(compute,/handleCatalogAutonomyRoute/);
  assert.match(compute,/ownership\.owner==='catalog_autonomy_runtime'/);
  const runtime=read('catalog-autonomy-worker.js');
  assert.match(runtime,/export async function handleCatalogAutonomyRoute/);
  assert.doesNotMatch(runtime,/CREATE\s+(?:TABLE|INDEX)|ALTER\s+TABLE/i);
});
