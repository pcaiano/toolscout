import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {routeOwner} from '../runtime-route-contract.js';
import {handleDistributionDiscoveryRoute} from '../distribution-discovery-worker.js';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('distribution discovery refresh has direct ToolScout 2.0 ownership',()=>{
  assert.equal(routeOwner('/api/distribution/discovery/refresh',{method:'POST'}).owner,'distribution_discovery_runtime');
  const compute=read('compute-router-worker.js');
  assert.match(compute,/ownership\.owner==='distribution_discovery_runtime'/);
  assert.match(compute,/handleDistributionDiscoveryRoute\(request,env,ctx\)/);
});

test('direct discovery owner preserves authorization',async()=>{
  const response=await handleDistributionDiscoveryRoute(
    new Request('https://trytoolscout.org/api/distribution/discovery/refresh',{method:'POST'}),
    {}
  );
  assert.equal(response.status,401);
  assert.match(await response.text(),/unauthorized/);
});

test('generic traversal bypasses discovery wrapper while autonomous and submission compose it explicitly',()=>{
  const compute=read('compute-router-worker.js');
  const discovery=read('distribution-discovery-worker.js');
  const autonomous=read('distribution-autonomous-worker.js');
  const submission=read('distribution-submission-worker.js');

  assert.doesNotMatch(compute,/import base from /);
  assert.doesNotMatch(compute,/import base from '\.\/distribution-discovery-worker\.js'/);

  assert.match(discovery,/export async function handleDistributionDiscoveryRoute/);
  assert.match(discovery,/export async function runDistributionDiscoveryScheduled/);
  assert.match(discovery,/import base from '\.\/revenue-worker\.js'/);
  assert.match(discovery,/import \{runDistributionLearningScheduled\} from '\.\/distribution-learning-worker\.js'/);
  assert.match(discovery,/await runDistributionLearningScheduled\(event,env,ctx\)/);
  assert.doesNotMatch(discovery,/CREATE\s+(?:TABLE|INDEX)|ALTER\s+TABLE/i);

  assert.match(autonomous,/import \{handleDistributionDiscoveryRoute\} from '\.\/distribution-discovery-worker\.js'/);
  assert.match(autonomous,/handleDistributionDiscoveryRoute\(new Request\('https:\/\/trytoolscout\.org\/api\/distribution\/discovery\/refresh'/);

  assert.match(submission,/import base from '\.\/distribution-learning-worker\.js'/);
  assert.match(submission,/import \{runDistributionDiscoveryScheduled\} from '\.\/distribution-discovery-worker\.js'/);
  assert.match(submission,/await runDistributionDiscoveryScheduled\(event,env,ctx\)/);
});


test('recursive discovery drains a freshness-rotated D1 frontier and rejects asset noise',()=>{
  const discovery=read('distribution-discovery-worker.js');
  const config=JSON.parse(read('data/distribution-discovery-sources.json'));
  assert.ok(Number(config.guardrails?.max_fetches_per_run||0)>=16);
  assert.match(discovery,/ensureConfiguredSources\(env,c\.sources\|\|\[\]\)/);
  assert.match(discovery,/SOURCE_RESCAN_HOURS=6/);
  assert.match(discovery,/CASE WHEN s\.last_scanned_at IS NULL THEN 0 ELSE 1 END/);
  assert.match(discovery,/STATIC_SOURCE_PATH_RE/);
  assert.match(discovery,/wp-content/);
  assert.match(discovery,/storage/);
  assert.match(discovery,/recursive_source_noise_pruned/);
  assert.match(discovery,/!item\?\.usable\)\{if\(item\?\.attempted\)await markScanned/);
});
