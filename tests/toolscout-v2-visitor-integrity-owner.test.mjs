import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('visitor identity health has a direct ToolScout 2.0 owner',()=>{
  const runtime=read('visitor-integrity-worker.js');
  const contract=read('runtime-route-contract.js');
  const compute=read('compute-router-worker.js');

  assert.match(runtime,/export async function handleVisitorIntegrityRoute/);
  assert.match(runtime,/\/api\/visitor-session-identity-health/);
  assert.match(runtime,/sessionIdentityHealth\(env\)/);
  assert.match(contract,/owner:'visitor_integrity'/);
  assert.match(compute,/ownership\.owner==='visitor_integrity'/);
  assert.match(compute,/handleVisitorIntegrityRoute/);
});

test('visitor event context is prepared before lower runtime execution',()=>{
  const compute=read('compute-router-worker.js');
  const prep=compute.indexOf('prepareVisitorIntegrityEvent(request,url)');
  const lower=compute.indexOf('await base.fetch(request,env,ctx)');
  const link=compute.indexOf('applyVisitorIntegrityLink(request,env,url,response,visitorEvent)');
  assert.ok(prep>=0&&lower>prep&&link>lower,'event context must be prepared before base fetch and linked after persistence');
});

test('generic response stages preserve visitor -> canonical -> owner -> SEO -> footer ordering',()=>{
  const compute=read('compute-router-worker.js');
  const lower=compute.indexOf('await base.fetch(request,env,ctx)');
  const link=compute.indexOf('applyVisitorIntegrityLink(request,env,url,response,visitorEvent)');
  const visitor=compute.indexOf('decorateVisitorIntegrityResponse(request,url,response)');
  const canonical=compute.indexOf('transformPublicCanonicalResponse(request,response)');
  const owner=compute.indexOf('applyMarkedOwnerAnalytics(request,response)');
  const seo=compute.indexOf('transformSeoPublicPage(request,response,env)');
  const footer=compute.indexOf('injectToolScoutSocialFooter(response)');
  assert.ok(lower>=0&&link>lower&&visitor>link&&canonical>visitor&&owner>canonical&&seo>owner&&footer>seo);
  assert.match(compute,/import base from '\.\/command-center-human-truth-final-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/command-center-human-truth-details-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/command-center-human-truth-chart-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/traffic-integrity-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/owner-exclusion-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/traffic-integrity-guard-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/traffic-integrity-live-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/outbound-integrity-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/visitor-integrity-worker\.js'/);
});

test('visitor cookie mirroring and first-valid-link identity rules are preserved',()=>{
  const runtime=read('visitor-integrity-worker.js');
  assert.match(runtime,/toolscout_visitor/);
  assert.match(runtime,/one_session_one_visitor_first_valid_link_wins/);
  assert.match(runtime,/request\.clone\(\)\.text\(\)/);
  assert.match(runtime,/event_type!=='page_confirmed'/);
  assert.match(runtime,/funnel_events WHERE session_id=\? AND event_type='page_confirmed'/);
  assert.match(runtime,/data-toolscout-visitor-cookie/);
  assert.doesNotMatch(runtime,/CREATE TABLE|CREATE INDEX|ALTER TABLE/);
});
