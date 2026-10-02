import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {routeOwner} from '../runtime-route-contract.js';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const baseOf=p=>read(p).match(/import\s+base(?:[^\n]*?)?\s+from\s+['"]\.\/([^'"]+)['"]/)?.[1]||null;
const baseChain=(start,max=20)=>{const out=[],seen=new Set();let current=start;while(current&&out.length<max&&!seen.has(current)){seen.add(current);out.push(current);current=baseOf(current)}return out};

test('generic ToolScout 2.0 traversal bypasses dynamic worker',()=>{
  const funnel=read('funnel-worker.js');
  assert.match(funnel,/import base from '\.\/worker\.js'/);
  assert.doesNotMatch(funnel,/import base from '\.\/dynamic-worker\.js'/);
  assert.match(funnel,/import dynamicCompatibility from '\.\/dynamic-worker\.js'/);
  assert.match(funnel,/dynamicCompatibility\.fetch\(request, env, ctx\)/);
  assert.deepEqual(baseChain('compute-router-worker.js').slice(0,3),['compute-router-worker.js','worker.js']);
});

test('dynamic public and tracking routes have explicit ownership',()=>{
  assert.equal(routeOwner('/api/click',{method:'POST'}).owner,'dynamic_runtime');
  assert.equal(routeOwner('/api/search',{method:'POST'}).owner,'dynamic_runtime');
  assert.equal(routeOwner('/api/content-signals',{method:'GET'}).owner,'dynamic_runtime');
  assert.equal(routeOwner('/robots.txt',{method:'GET'}).owner,'dynamic_runtime');
  const compute=read('compute-router-worker.js');
  assert.match(compute,/handleDynamicRuntimeRoute/);
  assert.match(compute,/ownership\.owner==='dynamic_runtime'/);
  const runtime=read('dynamic-worker.js');
  assert.match(runtime,/export async function handleDynamicRuntimeRoute/);
  assert.doesNotMatch(runtime,/CREATE\s+(?:TABLE|INDEX)|ALTER\s+TABLE/i);
});

test('funnel event ingestion is explicit while protected stats retain dynamic compatibility',()=>{
  assert.equal(routeOwner('/api/events',{method:'POST'}).owner,'funnel_runtime');
  assert.equal(routeOwner('/api/events',{method:'OPTIONS'}).owner,'funnel_runtime');
  const compute=read('compute-router-worker.js');
  assert.match(compute,/handleFunnelRuntimeRoute/);
  assert.match(compute,/ownership\.owner==='funnel_runtime'/);
  const funnel=read('funnel-worker.js');
  assert.match(funnel,/export async function handleFunnelRuntimeRoute/);
  assert.match(funnel,/url\.pathname === '\/api\/stats'/);
  assert.match(funnel,/dynamicCompatibility\.fetch\(request, env, ctx\)/);
});
