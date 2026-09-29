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
  assert.equal(routeOwner('/api/distribution/authority/closed-loop-health',{method:'GET'}).owner,'authority_health');
  assert.equal(routeOwner('/api/distribution/authority/close-loop',{method:'POST'}).owner,'growth_runtime_closed_loop');
  assert.ok(routeContract().earlyDispatchOwners.includes('growth_runtime_closed_loop'));
  assert.equal(routeOwner('/api/growth/supervisor/public',{method:'GET'}).owner,'distribution_orchestrator');
  assert.equal(routeOwner('/news/zapier-next-gen-zaps-mcp',{method:'GET'}).owner,'public_editorial_site');
  assert.equal(routeOwner('/software-trends-index',{method:'GET'}).owner,'public_editorial_site');
  assert.equal(routeOwner('/software-trends-index.json',{method:'GET'}).owner,'public_editorial_site');
  assert.equal(routeOwner('/mcp',{method:'POST'}).owner,'agent_protocol_core');
  assert.equal(routeOwner('/a2a',{method:'POST'}).owner,'agent_protocol_core');
  assert.equal(routeOwner('/.well-known/agent-card.json',{method:'GET'}).owner,'agent_protocol_core');
  assert.equal(routeOwner('/.well-known/toolscout-distribution.json',{method:'GET'}).owner,'machine_discovery_catalog');
  assert.equal(routeOwner('/.well-known/api-catalog',{method:'GET'}).owner,'machine_discovery_catalog');
  assert.equal(routeOwner('/api/distribution/priorities/public-reconcile',{method:'POST'}).owner,'distribution_orchestrator');
  assert.equal(routeOwner('/analytics/api/chairman-queue',{method:'GET'}).owner,'analytics_chairman');
  assert.equal(routeOwner('/analytics/api/stats',{method:'GET'}).owner,'analytics_stats');
  assert.equal(routeOwner('/analytics/api/human-actions',{method:'GET'}).owner,'analytics_human_actions');
  assert.equal(routeOwner('/analytics/api/human-actions/credential',{method:'POST'}).owner,'command_center');
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
  assert.match(src,/ownership\.owner==='public_editorial_site'/);
  assert.match(src,/ownership\.owner==='agent_protocol_core'/);
  assert.match(src,/ownership\.owner==='machine_discovery_catalog'/);
  assert.match(src,/ownership\.owner==='analytics_chairman'/);
  assert.match(src,/ownership\.owner==='analytics_stats'/);
  assert.match(src,/ownership\.owner==='analytics_human_actions'/);
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
  const analytics=read('command-center-resilient-worker.js');
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
  assert.match(analytics,/export async function handleAnalyticsStatsReadRoute/);
  assert.match(analytics,/X-ToolScout-Read-Mode':'read-only/);
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


test('analytics read runtime uses migrated strict-human schema and no runtime DDL',()=>{
  const analytics=read('command-center-resilient-worker.js');
  assert.doesNotMatch(analytics,/CREATE TABLE|CREATE INDEX|ALTER TABLE/);
  assert.match(analytics,/strict_human_analytics_schema_not_migrated/);
});


test('catalog runtime schema is migration-owned, not request-owned',()=>{
  const catalog=read('catalog-autonomy-worker.js');
  assert.doesNotMatch(catalog,/CREATE TABLE|CREATE INDEX|ALTER TABLE/);
  assert.match(catalog,/catalog_runtime_schema_not_migrated/);
  const migration=read('migrations/0091_catalog_runtime_schema.sql');
  assert.match(migration,/CREATE TABLE IF NOT EXISTS catalog_runtime_state/);
  assert.match(migration,/CREATE TABLE IF NOT EXISTS catalog_runtime_candidates/);
  assert.match(migration,/CREATE TABLE IF NOT EXISTS catalog_quality_audit/);
});
