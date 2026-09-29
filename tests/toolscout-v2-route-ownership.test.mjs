import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {routeOwner,routeContract} from '../runtime-route-contract.js';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('route contract assigns one explicit owner to migrated control routes',()=>{
  assert.equal(routeOwner('/api/distribution/operating-decisions',{method:'GET'}).owner,'distribution_priority');
  assert.equal(routeOwner('/api/distribution/operating-decisions/rebalance',{method:'POST'}).owner,'distribution_priority');
  assert.equal(routeOwner('/api/engine-evidence',{method:'POST'}).owner,'mission_integrity');
  assert.equal(routeOwner('/api/compute/health',{method:'GET'}).owner,'compute_router');
  assert.equal(routeOwner('/api/seo/runtime-health',{method:'GET'}).owner,'seo_runtime');
  assert.equal(routeOwner('/api/distribution/authority/vetted-health',{method:'GET'}).owner,'authority_acquisition');
  assert.equal(routeOwner('/api/distribution/authority/closed-loop-health',{method:'GET'}).owner,'growth_runtime_authority_drain');
  assert.equal(routeOwner('/api/distribution/authority/close-loop',{method:'POST'}).owner,'growth_runtime_closed_loop');
  assert.ok(routeContract().earlyDispatchOwners.includes('growth_runtime_closed_loop'));
  assert.equal(routeOwner('/api/growth/supervisor/public',{method:'GET'}).owner,'distribution_orchestrator');
  assert.equal(routeOwner('/api/distribution/priorities/public-reconcile',{method:'POST'}).owner,'distribution_orchestrator');
  assert.equal(routeContract().invariant,'one_declared_owner_per_route_group');
});

test('unknown routes remain on the legacy fallback during staged migration',()=>{
  const route=routeOwner('/some-unmigrated-path',{method:'GET'});
  assert.equal(route.owner,'legacy_chain');
  assert.equal(route.plane,'legacy');
});

test('compute entrypoint early-dispatches only explicitly migrated owners',()=>{
  const src=read('compute-router-worker.js');
  assert.match(src,/earlyOwnedRoute/);
  assert.match(src,/ownership\.owner==='distribution_priority'/);
  assert.match(src,/ownership\.owner==='distribution_orchestrator'/);
  assert.match(src,/ownership\.owner==='seo_runtime'/);
  assert.match(src,/ownership\.owner==='authority_acquisition'/);
  assert.match(src,/ownership\.owner==='mission_integrity'/);
  assert.match(src,/ownership\.owner==='growth_runtime_closed_loop'/);
  assert.match(src,/X-ToolScout-Route-Owner/);
  assert.match(src,/\/api\/runtime\/route-contract/);
  assert.match(src,/\/api\/runtime\/route-owner/);
  assert.match(src,/return base\.fetch\(request,env,ctx\)/);
});

test('migrated route owners expose null-returning direct handlers',()=>{
  const priority=read('distribution-priority-worker.js');
  const orchestrator=read('distribution-orchestrator-worker.js');
  const seo=read('seo-cloudflare-runtime-worker.js');
  const authority=read('authority-acquisition-worker.js');
  const evidence=read('mission-integrity-v2-worker.js');
  const closedLoop=read('growth-runtime-closed-loop-worker.js');
  assert.match(priority,/export async function handleDistributionPriorityRoute/);
  assert.match(priority,/return null;/);
  assert.match(orchestrator,/export async function handleDistributionOrchestratorRoute/);
  assert.match(orchestrator,/return null;/);
  assert.match(seo,/export async function handleSeoRuntimeRoute/);
  assert.match(seo,/return null;/);
  assert.match(authority,/export async function handleAuthorityAcquisitionRoute/);
  assert.match(authority,/return null;/);
  assert.match(evidence,/export async function handleMissionIntegrityRoute/);
  assert.match(evidence,/return null;/);
  assert.match(closedLoop,/export async function handleGrowthClosedLoopRoute/);
  assert.match(closedLoop,/return null;/);
});

test('mission integrity runtime no longer creates schema',()=>{
  const evidence=read('mission-integrity-v2-worker.js');
  assert.doesNotMatch(evidence,/CREATE TABLE|CREATE INDEX/);
  assert.match(evidence,/mission_integrity_schema_not_migrated/);
});


test('Growth Planner runtime no longer creates schema',()=>{
  const planner=read('distribution-orchestrator-worker.js');
  assert.doesNotMatch(planner,/CREATE TABLE|CREATE INDEX|ALTER TABLE/);
  assert.match(planner,/growth_planner_schema_not_migrated/);
});
