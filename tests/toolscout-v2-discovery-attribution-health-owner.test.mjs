import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('discovery attribution health has a direct ToolScout 2.0 owner',()=>{
  const runtime=read('discovery-attribution-health-worker.js');
  const contract=read('runtime-route-contract.js');
  const compute=read('compute-router-worker.js');

  assert.match(runtime,/export async function handleDiscoveryAttributionHealthRoute/);
  assert.match(runtime,/\/api\/discovery-attribution-health/);
  assert.match(contract,/owner:'discovery_attribution_health'/);
  assert.match(compute,/ownership\.owner==='discovery_attribution_health'/);
  assert.match(compute,/handleDiscoveryAttributionHealthRoute/);
});

test('discovery attribution health payload is read-only and stable',async()=>{
  const {handleDiscoveryAttributionHealthRoute}=await import('../discovery-attribution-health-worker.js');
  const response=await handleDiscoveryAttributionHealthRoute(new Request('https://trytoolscout.org/api/discovery-attribution-health'));
  assert.equal(response.status,200);
  assert.equal(response.headers.get('cache-control'),'no-store');
  const data=await response.json();
  assert.equal(data.ok,true);
  assert.equal(data.service,'toolscout-discovery-attribution');
  assert.equal(data.version,1);
  assert.deepEqual(data.categories,['search','ai_referral','distribution','social','dark_direct_deep','direct_home','tracked_campaign','other_referral']);
});

test('generic traversal bypasses discovery attribution health wrapper',()=>{
  const compute=read('compute-router-worker.js');
  assert.match(compute,/import base from '\.\/posthog-behavior-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/visitor-accuracy-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/visitor-dashboard-metrics-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/lemlist-profile-correction-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/discovery-attribution-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/discovery-attribution-health-worker\.js'/);
});

test('health owner ignores unrelated routes and methods',async()=>{
  const {handleDiscoveryAttributionHealthRoute}=await import('../discovery-attribution-health-worker.js');
  assert.equal(await handleDiscoveryAttributionHealthRoute(new Request('https://trytoolscout.org/api/other')),null);
  assert.equal(await handleDiscoveryAttributionHealthRoute(new Request('https://trytoolscout.org/api/discovery-attribution-health',{method:'POST'})),null);
});
