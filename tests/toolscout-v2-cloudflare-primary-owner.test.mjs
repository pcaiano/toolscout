import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Cloudflare Primary runtime routes are explicitly dispatched by compute',()=>{
  const compute=read('compute-router-worker.js');
  const primary=read('cloudflare-primary-runtime-worker.js');

  assert.match(compute,/import base from '\.\/distribution-orchestrator-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/posthog-behavior-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/visitor-accuracy-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/visitor-dashboard-metrics-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/lemlist-profile-correction-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/discovery-attribution-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/discovery-attribution-health-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/command-center-truth-consolidation-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/command-center-autoload-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/command-center-resilient-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/command-center-human-truth-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/command-center-human-truth-final-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/command-center-human-truth-details-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/command-center-human-truth-chart-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/owner-exclusion-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/traffic-integrity-guard-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/traffic-integrity-live-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/outbound-integrity-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/visitor-integrity-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/traffic-integrity-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/command-center-integrity-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/mission-integrity-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/mission-integrity-v2-worker\.js'/);
  assert.match(compute,/handleMissionIntegrityRoute.*from '\.\/mission-integrity-v2-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/command-center-final-integrity-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/command-center-light-theme-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/growth-runtime-integrity-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/growth-runtime-closed-loop-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/growth-runtime-observability-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/growth-runtime-authority-drain-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/gsc-command-center-trend-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/gsc-command-center-visible-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/command-center-health-language-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/command-center-ga4-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/d1-read-budget-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/ga4-attribution-24h-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/ga4-owner-exclusion-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/cloudflare-primary-runtime-worker\.js'/);
  assert.match(compute,/handleCloudflarePrimaryRuntimeRoute/);
  assert.match(compute,/runCloudflarePrimaryScheduled/);
  assert.match(compute,/u\.pathname==='\/api\/runtime\/executors'/);
  assert.match(compute,/u\.pathname==='\/api\/runtime\/cloudflare-primary-cycle'/);

  assert.match(primary,/export async function handleCloudflarePrimaryRuntimeRoute/);
  assert.match(primary,/export async function runCloudflarePrimaryScheduled/);
  assert.match(primary,/return null;/);
  assert.doesNotMatch(primary,/CREATE TABLE|CREATE INDEX|ALTER TABLE/);
});

test('Cloudflare Primary scheduled extraction preserves coordinator order',()=>{
  const compute=read('compute-router-worker.js');
  const primary=read('cloudflare-primary-runtime-worker.js');

  assert.match(primary,/const gsc=await runtimeGscRefresh/);
  assert.match(primary,/mission:'primary_growth_cycle'/);
  assert.match(primary,/base\.scheduled\(event,env,ctx\)/);
  assert.match(primary,/if\(ctx\?\.waitUntil\)ctx\.waitUntil\(inherited\)/);

  const primaryIndex=compute.indexOf('runCloudflarePrimaryScheduled(scheduledEvent,env,ctx)');
  const seoIndex=compute.indexOf('runSeoRuntimeScheduled(scheduledEvent,env,ctx)');
  assert.ok(primaryIndex>=0&&seoIndex>primaryIndex,'SEO scheduled refresh must follow Cloudflare Primary scheduling');
  assert.match(compute,/const seo=primaryRaw\.then/);
});

test('Cloudflare Primary schema prerequisite remains migration-owned',()=>{
  const primary=read('cloudflare-primary-runtime-worker.js');
  const migration=read('migrations/0098_growth_asset_cache_schema.sql');
  assert.match(primary,/growth_asset_cache_schema_not_migrated/);
  assert.match(migration,/CREATE TABLE IF NOT EXISTS growth_asset_cache/);
});
