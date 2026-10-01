import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('GA4 external acquisition has a direct ToolScout 2.0 owner',()=>{
  const runtime=read('ga4-owner-exclusion-runtime.js');
  const contract=read('runtime-route-contract.js');
  const compute=read('compute-router-worker.js');

  assert.match(runtime,/export async function handleGa4OwnerExclusionRoute/);
  assert.match(runtime,/handleGa4Attribution24hRoute.*from '\.\/ga4-attribution-24h-worker\.js'/);
  assert.match(runtime,/\/analytics\/api\/google\/external-24h/);
  assert.match(runtime,/validCommandCenterSession/);
  assert.match(runtime,/metric:'ga4_external_sessions_24h'/);
  assert.doesNotMatch(runtime,/CREATE TABLE|CREATE INDEX|ALTER TABLE/);

  assert.match(contract,/owner:'analytics_owner_exclusion'/);
  assert.match(compute,/ownership\.owner==='analytics_owner_exclusion'/);
  assert.match(compute,/handleGa4OwnerExclusionRoute/);
});

test('generic fallback preserves owner attribution before SEO and social footer',()=>{
  const compute=read('compute-router-worker.js');
  const base=compute.indexOf('await base.fetch(request,env,ctx)');
  const owner=compute.indexOf('await applyMarkedOwnerAnalytics(request,response)');
  const seo=compute.indexOf('await transformSeoPublicPage(request,response,env)');
  const footer=compute.indexOf('injectToolScoutSocialFooter(response)');
  assert.ok(base>=0&&owner>base&&seo>owner&&footer>seo,'fallback order must remain base -> owner attribution -> SEO -> footer');
  assert.match(compute,/import base from '\.\/distribution-command-worker\.js'/);
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
  assert.doesNotMatch(compute,/import base from '\.\/traffic-integrity-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/owner-exclusion-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/traffic-integrity-guard-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/traffic-integrity-live-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/outbound-integrity-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/visitor-integrity-worker\.js'/);
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
  assert.doesNotMatch(compute,/import base from '\.\/ga4-owner-exclusion-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/ga4-attribution-24h-worker\.js'/);
});

test('owner exclusion calculation preserves the established 24h clean-window semantics',()=>{
  const runtime=read('ga4-owner-exclusion-runtime.js');
  assert.match(runtime,/ownerRows=sources\.filter/);
  assert.match(runtime,/externalSources=sources\.filter/);
  assert.match(runtime,/candidateSessions=Math\.max\(0,totalSessions-ownerSessions\)/);
  assert.match(runtime,/candidateEngagedSessions=Math\.max\(0,totalEngagedSessions-ownerEngagedSessions\)/);
  assert.match(runtime,/learningAllowed:ready/);
  assert.match(runtime,/Country is never used as an exclusion rule/);
});
