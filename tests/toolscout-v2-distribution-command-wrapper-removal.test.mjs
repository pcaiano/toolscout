import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {routeOwner} from '../runtime-route-contract.js';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('distribution command legacy surfaces are already direct-owned',()=>{
  assert.equal(routeOwner('/api/stats',{method:'GET'}).owner,'admin_stats');
  assert.equal(routeOwner('/analytics/api/stats',{method:'GET'}).owner,'analytics_stats');
  assert.equal(routeOwner('/analytics',{method:'GET'}).owner,'command_center_direct');
  assert.equal(routeOwner('/command-center',{method:'GET'}).owner,'command_center_direct');
});

test('generic traversal bypasses distribution command presentation wrapper',()=>{
  const compute=read('compute-router-worker.js');
  assert.match(compute,/import base from '\.\/distribution-submission-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/distribution-command-worker\.js'/);
});

test('removed distribution command wrapper remains schema-clean',()=>{
  const runtime=read('distribution-command-worker.js');
  assert.doesNotMatch(runtime,/CREATE\s+(?:TABLE|INDEX)|ALTER\s+TABLE/i);
  assert.match(runtime,/u\.pathname==='\/analytics\/api\/stats'/);
  assert.match(runtime,/u\.pathname==='\/api\/stats'/);
});
