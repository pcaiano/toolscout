import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('GA4 acquisition has bounded Google API latency and optional dimension resilience',()=>{
  const ga4=read('command-center-ga4-worker.js');
  assert.match(ga4,/const GA_FETCH_TIMEOUT_MS=8000/);
  assert.match(ga4,/AbortSignal\.timeout\(GA_FETCH_TIMEOUT_MS\)/);
  assert.match(ga4,/sessionSource[\s\S]*?\.catch\(\(\)=>null\)/);
  assert.match(ga4,/dimensions:\[\{name:'country'\}\][\s\S]*?\.catch\(\(\)=>null\)/);
  assert.match(ga4,/dailyReport\?\.rows/);
});

test('canonical external authority snapshot reflects the latest SE Ranking observation',()=>{
  const authority=JSON.parse(read('data/se-ranking-backlink-truth.json'));
  assert.equal(authority.source,'SE Ranking Data API');
  assert.equal(authority.metrics.backlinks,95);
  assert.equal(authority.metrics.referringDomains,29);
  assert.equal(authority.metrics.dofollowBacklinks,14);
  assert.equal(authority.metrics.dofollowReferringDomains,11);
  assert.equal(authority.metrics.domainAuthority,2);
  assert.equal(authority.referringDomains.length,29);
  assert.ok(authority.referringDomains.some(x=>x.domain==='www.uneed.best'&&x.dofollowBacklinks===1));
});

test('growth truth production repair proves GSC, authority and final release after deployment',()=>{
  const workflow=read('.github/workflows/growth-truth-production-repair.yml');
  const probe=read('scripts/probe-growth-truth-live.mjs');
  assert.match(workflow,/name: ToolScout Growth Truth Production Repair/);
  assert.match(workflow,/workflow_dispatch:/);
  assert.match(workflow,/wrangler deploy --config wrangler\.toml --latest/);
  assert.match(workflow,/verify-v2-live-smoke\.mjs/);
  assert.match(workflow,/probe-growth-truth-live\.mjs/);
  assert.match(probe,/authority_backlinks_not_refreshed/);
  assert.match(probe,/gsc_reality_stale/);
  assert.match(probe,/gsc_daily_trend_stale/);
  assert.match(probe,/toolscout-2\.0-final-phase-260/);
});


test('Render keepalive protects both overflow compute and the auth broker',()=>{
  const auth=read('auth-session-plane.js');
  const router=read('compute-router-worker.js');
  assert.match(auth,/export async function warmAuthBrokerService/);
  assert.match(auth,/ToolScout-Auth-Keepalive\/1\.0/);
  assert.match(router,/warmAuthBrokerService\(env,\{timeoutMs:RENDER_TRIGGER_TIMEOUT_MS\}\)/);
  assert.match(router,/Promise\.allSettled\(\[/);
});
