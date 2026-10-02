import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {routeOwner} from '../runtime-route-contract.js';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('generic ToolScout 2.0 public fallback has zero base traversal',()=>{
  const compute=read('compute-router-worker.js');
  assert.doesNotMatch(compute,/import\s+base\s+from/);
  assert.match(compute,/env\.ASSETS\s*\?\s*await env\.ASSETS\.fetch\(request\)/);
  const audit=read('scripts/audit-runtime-architecture.mjs');
  assert.match(audit,/const MAX_LEGACY_EDGES=0;/);
  assert.match(audit,/const expectedTerminus=edges===0\?ENTRY:'worker\.js';/);
});

test('remaining core behavior has explicit route ownership',()=>{
  assert.equal(routeOwner('/api/opportunities/refresh',{method:'POST'}).owner,'core_runtime');
  assert.equal(routeOwner('/unowned-preflight',{method:'OPTIONS'}).owner,'core_runtime');
  const compute=read('compute-router-worker.js');
  assert.match(compute,/handleCoreRuntimeRoute/);
  assert.match(compute,/ownership\.owner==='core_runtime'/);
  const core=read('worker.js');
  assert.match(core,/export async function handleCoreRuntimeRoute/);
  assert.match(core,/url\.pathname==='\/api\/opportunities\/refresh'/);
  assert.match(core,/request\.method==='OPTIONS'/);
});

test('protected compatibility modules may still import worker without restoring generic traversal',()=>{
  const funnel=read('funnel-worker.js');
  const dynamic=read('dynamic-worker.js');
  assert.match(funnel,/import base from '\.\/worker\.js'/);
  assert.match(dynamic,/import base from '\.\/worker\.js'/);
  const compute=read('compute-router-worker.js');
  assert.doesNotMatch(compute,/import base from '\.\/worker\.js'/);
});
