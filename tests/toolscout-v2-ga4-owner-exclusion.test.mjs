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
  assert.match(compute,/import base from '\.\/gsc-command-center-trend-worker\.js'/);
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
