import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Command Center GA4 exposes one explicit request handler',()=>{
  const runtime=read('command-center-ga4-worker.js');
  assert.match(runtime,/export async function handleCommandCenterGa4Route/);
  assert.match(runtime,/\/analytics\/api\/google\/connect/);
  assert.match(runtime,/\/api\/google-analytics\/callback/);
  assert.match(runtime,/\/analytics\/api\/google\/disconnect/);
  assert.match(runtime,/\/analytics\/api\/google\/acquisition/);
  assert.match(runtime,/\/analytics\/api\/commerce/);
  assert.match(runtime,/googleAnalyticsConnectResponse/);
  assert.match(runtime,/googleAnalyticsCallbackResponse/);
  assert.match(runtime,/googleAnalyticsDisconnectResponse/);
  assert.doesNotMatch(runtime,/CREATE TABLE|CREATE INDEX|ALTER TABLE/);
});

test('Google Analytics callback is direct while owner-only operations stay behind D1 budget',()=>{
  const contract=read('runtime-route-contract.js');
  const compute=read('compute-router-worker.js');
  assert.match(contract,/id:'google_analytics_callback'/);
  assert.match(contract,/owner:'google_analytics_callback'/);
  assert.match(compute,/ownership\.owner==='google_analytics_callback'/);
  assert.match(compute,/handleCommandCenterGa4Route/);
  assert.match(contract,/id:'d1_read_budget_get'/);
  assert.match(contract,/id:'d1_read_budget_post'/);
});

test('D1 budget composes owner-authenticated GA4 operations from explicit handler',()=>{
  const budget=read('d1-read-budget-worker.js');
  assert.match(budget,/handleCommandCenterGa4Route/);
  assert.match(budget,/validCommandCenterSession\(request,env\)\?withOwnerAccessHeader\(request\):request/);
  assert.match(budget,/return handleCommandCenterGa4Route\(forwarded,env,ctx\)/);
});

test('generic traversal bypasses Command Center GA4 wrapper',()=>{
  const compute=read('compute-router-worker.js');
  assert.match(compute,/import base from '\.\/affiliate-coverage-entry-worker\.js'/);
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
  assert.doesNotMatch(compute,/import base from '\.\/growth-runtime-observability-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/growth-runtime-authority-drain-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/gsc-command-center-trend-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/gsc-command-center-visible-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/command-center-health-language-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/command-center-ga4-worker\.js'/);
});
