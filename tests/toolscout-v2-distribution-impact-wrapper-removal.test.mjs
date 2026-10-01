import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {routeOwner} from '../runtime-route-contract.js';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('distribution impact legacy surfaces are already direct-owned',()=>{
  assert.equal(routeOwner('/api/stats',{method:'GET'}).owner,'admin_stats');
  assert.equal(routeOwner('/analytics/api/stats',{method:'GET'}).owner,'analytics_stats');
  assert.equal(routeOwner('/analytics',{method:'GET'}).owner,'command_center_direct');
  assert.equal(routeOwner('/analytics-v2',{method:'GET'}).owner,'command_center_direct');
});

test('generic request traversal bypasses the distribution impact presentation wrapper',()=>{
  const compute=read('compute-router-worker.js');
  assert.match(compute,/import base from '\.\/affiliate-workflow-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/distribution-impact-entry-worker\.js'/);
});

test('removed distribution impact wrapper is presentation-only and schema-clean',()=>{
  const runtime=read('distribution-impact-entry-worker.js');
  assert.match(runtime,/u\.pathname==='\/api\/stats'/);
  assert.match(runtime,/u\.pathname==='\/analytics\/api\/stats'/);
  assert.match(runtime,/distributionImpactSection/);
  assert.doesNotMatch(runtime,/CREATE\s+(?:TABLE|INDEX)|ALTER\s+TABLE/i);
});
