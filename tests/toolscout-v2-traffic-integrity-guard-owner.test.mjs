import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('traffic forensics has explicit guard ownership',()=>{
  const runtime=read('traffic-integrity-guard-worker.js');
  const contract=read('runtime-route-contract.js');
  const compute=read('compute-router-worker.js');

  assert.match(runtime,/export async function handleTrafficIntegrityGuardRoute/);
  assert.match(runtime,/\/api\/traffic-forensics-48h/);
  assert.match(contract,/owner:'traffic_integrity_guard'/);
  assert.match(compute,/ownership\.owner==='traffic_integrity_guard'/);
  assert.match(compute,/handleTrafficIntegrityGuardRoute/);
});

test('event guard still runs before lower event persistence',()=>{
  const runtime=read('traffic-integrity-guard-worker.js');
  const compute=read('compute-router-worker.js');
  assert.match(runtime,/export async function processTrafficIntegrityGuardEvent/);
  assert.match(runtime,/browser_validation_required/);
  assert.match(runtime,/parallel_multi_page_zero_interaction/);
  assert.match(runtime,/trusted_interaction_required/);
  const process=compute.indexOf('processTrafficIntegrityGuardEvent(request,env,ctx');
  const lower=compute.indexOf('protectedLegacyBase.fetch(nextRequest,env,ctx)');
  assert.ok(process>=0&&lower>process,'guard must own the event path before lower persistence');
});

test('guard HTML transform remains before live traffic and outer response stages',()=>{
  const runtime=read('traffic-integrity-guard-worker.js');
  const compute=read('compute-router-worker.js');
  assert.match(runtime,/export async function transformTrafficIntegrityGuardResponse/);
  assert.match(runtime,/data-toolscout-browser-guard="2"/);
  const guard=compute.indexOf('await transformTrafficIntegrityGuardResponse(request,response)');
  const live=compute.indexOf('await transformTrafficIntegrityLiveResponse(request,response)');
  const visitor=compute.indexOf('await applyVisitorIntegrityLink(request,env,url,response,visitorEvent)');
  assert.ok(guard>=0&&live>guard&&visitor>live,'response order must remain guard -> live traffic -> visitor');
});

test('traffic guard cleanup is explicit and generic traversal bypasses the wrapper',()=>{
  const runtime=read('traffic-integrity-guard-worker.js');
  const compute=read('compute-router-worker.js');
  assert.match(runtime,/export async function runTrafficIntegrityGuardScheduled/);
  assert.match(runtime,/DELETE FROM traffic_guard_events WHERE created_at<datetime\('now','-7 days'\)/);
  assert.match(compute,/runTrafficIntegrityGuardScheduled/);
  assert.match(compute,/import base from '\.\/distribution-priority-worker\.js'/);
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
});
