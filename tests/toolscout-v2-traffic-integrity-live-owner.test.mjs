import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('distribution feeds have explicit live traffic ownership',()=>{
  const runtime=read('traffic-integrity-live-worker.js');
  const contract=read('runtime-route-contract.js');
  const compute=read('compute-router-worker.js');

  assert.match(runtime,/export async function handleTrafficIntegrityLiveRoute/);
  assert.match(runtime,/\/api\/distribution\/feed\.json/);
  assert.match(runtime,/\/api\/distribution\/feed\.xml/);
  assert.match(runtime,/prioritizedDistributionFeed/);
  assert.match(contract,/owner:'traffic_integrity_live'/);
  assert.match(compute,/ownership\.owner==='traffic_integrity_live'/);
  assert.match(compute,/handleTrafficIntegrityLiveRoute/);
});

test('page-confirmed browser gate remains before lower runtime persistence',()=>{
  const runtime=read('traffic-integrity-live-worker.js');
  const compute=read('compute-router-worker.js');
  assert.match(runtime,/export async function gateTrafficIntegrityEvent/);
  assert.match(runtime,/event_type!=='page_confirmed'/);
  assert.match(runtime,/browser_proof_required/);
  const gate=compute.indexOf('await gateTrafficIntegrityEvent(request)');
  const base=compute.indexOf('await base.fetch(request,env,ctx)');
  assert.ok(gate>=0&&base>gate,'page confirmation gate must run before lower runtime');
});

test('public response stage keeps traffic transforms before visitor and later outer transforms',()=>{
  const runtime=read('traffic-integrity-live-worker.js');
  const compute=read('compute-router-worker.js');
  assert.match(runtime,/export async function transformTrafficIntegrityLiveResponse/);
  assert.match(runtime,/applySeoUplift/);
  assert.match(runtime,/applyCommercialCluster/);
  assert.match(runtime,/data-toolscout-confirmed-visitor-late-retry/);

  const traffic=compute.indexOf('await transformTrafficIntegrityLiveResponse(request,response)');
  const visitor=compute.indexOf('await applyVisitorIntegrityLink(request,env,url,response,visitorEvent)');
  const canonical=compute.indexOf('await transformPublicCanonicalResponse(request,response)');
  const owner=compute.indexOf('await applyMarkedOwnerAnalytics(request,response)');
  const seo=compute.indexOf('await transformSeoPublicPage(request,response,env)');
  const footer=compute.indexOf('injectToolScoutSocialFooter(response)');
  assert.ok(traffic>=0&&visitor>traffic&&canonical>visitor&&owner>canonical&&seo>owner&&footer>seo,
    'response order must remain traffic -> visitor -> canonical -> owner -> SEO -> footer');
});

test('generic traversal bypasses the live traffic wrapper',()=>{
  const compute=read('compute-router-worker.js');
  assert.match(compute,/import base from '\.\/funnel-worker\.js'/);
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
});
