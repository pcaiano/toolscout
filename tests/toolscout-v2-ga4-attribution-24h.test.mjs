import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('GA4 rolling 24h acquisition has a direct route owner',()=>{
  const runtime=read('ga4-attribution-24h-worker.js');
  const contract=read('runtime-route-contract.js');
  const compute=read('compute-router-worker.js');

  assert.match(runtime,/export async function handleGa4Attribution24hRoute/);
  assert.match(runtime,/\/analytics\/api\/google\/acquisition-24h/);
  assert.match(runtime,/validCommandCenterSession/);
  assert.match(runtime,/acquisition24h\(env,request\)/);
  assert.doesNotMatch(runtime,/CREATE TABLE|CREATE INDEX|ALTER TABLE/);

  assert.match(contract,/owner:'analytics_attribution_24h'/);
  assert.match(compute,/ownership\.owner==='analytics_attribution_24h'/);
  assert.match(compute,/handleGa4Attribution24hRoute/);
});

test('generic fallback bypasses the GA4 attribution decorator',()=>{
  const compute=read('compute-router-worker.js');
  assert.match(compute,/import base from '\.\/traffic-integrity-live-worker\.js'/);
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
  assert.doesNotMatch(compute,/import base from '\.\/ga4-attribution-24h-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/ga4-owner-exclusion-worker\.js'/);
});

test('GA4 attribution semantics retain source landing country and rolling 24h evidence',()=>{
  const runtime=read('ga4-attribution-24h-worker.js');
  assert.match(runtime,/sessionSource/);
  assert.match(runtime,/sessionMedium/);
  assert.match(runtime,/sessionDefaultChannelGroup/);
  assert.match(runtime,/landingPagePlusQueryString/);
  assert.match(runtime,/country/);
  assert.match(runtime,/now\.getTime\(\)-24\*3600000/);
  assert.match(runtime,/window:'rolling_24h'/);
  assert.match(runtime,/Direct can include visits whose referrer or campaign information was unavailable/);
});

test('owner exclusion composes from the direct GA4 attribution handler',()=>{
  const owner=read('ga4-owner-exclusion-runtime.js');
  assert.match(owner,/handleGa4Attribution24hRoute/);
  assert.doesNotMatch(owner,/attributionCore\.fetch/);
});
