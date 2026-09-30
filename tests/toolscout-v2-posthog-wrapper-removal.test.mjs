import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {routeOwner} from '../runtime-route-contract.js';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('generic request traversal bypasses PostHog behavior wrapper',()=>{
  const compute=read('compute-router-worker.js');
  assert.match(compute,/import base from '\.\/command-center-affiliate-table-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/posthog-behavior-worker\.js'/);
});

test('PostHog scheduled behavior remains intact in compatibility chain',()=>{
  const posthog=read('posthog-behavior-worker.js');
  const delegate=posthog.indexOf("base.scheduled?await base.scheduled(event,env,ctx):undefined");
  const behavior=posthog.indexOf("ctx.waitUntil(applyDistributionBehaviorPriorities(env)");
  assert.ok(delegate>=0&&behavior>delegate,'lower scheduled chain must run before behavior priority sidecar');
  assert.match(posthog,/applyDistributionBehaviorPriorities\(env\)/);
});

test('direct Command Center owners keep old PostHog page decoration outside generic traversal',()=>{
  assert.equal(routeOwner('/analytics',{method:'GET'}).owner,'command_center_direct');
  assert.equal(routeOwner('/analytics/api/stats',{method:'GET'}).owner,'analytics_stats');
  const posthog=read('posthog-behavior-worker.js');
  assert.match(posthog,/data-widget=\"product-behavior\"/);
  assert.match(posthog,/productBehavior:await behaviorSnapshot\(env\)/);
});
