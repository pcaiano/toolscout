import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {routeOwner} from '../runtime-route-contract.js';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const baseOf=p=>read(p).match(/import\s+base(?:[^\n]*?)?\s+from\s+['"]\.\/([^'"]+)['"]/)?.[1]||null;
const baseChain=(start,max=20)=>{const out=[],seen=new Set();let current=start;while(current&&out.length<max&&!seen.has(current)){seen.add(current);out.push(current);current=baseOf(current)}return out};

test('generic ToolScout 2.0 traversal bypasses funnel and reaches the core worker directly',()=>{
  const compute=read('compute-router-worker.js');
  assert.doesNotMatch(compute,/import base from /);
  assert.doesNotMatch(compute,/import base from '\.\/funnel-worker\.js'/);
  assert.deepEqual(baseChain('compute-router-worker.js').slice(0,1),['compute-router-worker.js']);
});

test('funnel remains bounded to explicit event ownership and protected stats compatibility',()=>{
  assert.equal(routeOwner('/api/events',{method:'POST'}).owner,'funnel_runtime');
  assert.equal(routeOwner('/api/events',{method:'OPTIONS'}).owner,'funnel_runtime');
  assert.equal(routeOwner('/api/stats',{method:'GET'}).owner,'admin_stats');

  const compute=read('compute-router-worker.js');
  assert.match(compute,/handleFunnelRuntimeRoute/);
  assert.match(compute,/ownership\.owner==='funnel_runtime'/);

  const revenue=read('revenue-worker.js');
  assert.match(revenue,/import base from '\.\/funnel-worker\.js'/);

  const funnel=read('funnel-worker.js');
  assert.match(funnel,/import base from '\.\/worker\.js'/);
  assert.match(funnel,/import dynamicCompatibility from '\.\/dynamic-worker\.js'/);
  assert.match(funnel,/url\.pathname === '\/api\/stats'/);
  assert.doesNotMatch(funnel,/CREATE\s+(?:TABLE|INDEX)|ALTER\s+TABLE/i);
});
