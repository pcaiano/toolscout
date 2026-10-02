import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('owner exclusion status and retrospective audit have one direct owner',()=>{
  const runtime=read('owner-exclusion-worker.js');
  const contract=read('runtime-route-contract.js');
  const compute=read('compute-router-worker.js');

  assert.match(runtime,/export async function handleOwnerExclusionRoute/);
  assert.match(runtime,/\/analytics\/api\/owner-exclusion/);
  assert.match(runtime,/\/analytics\/api\/owner-retrospective-audit/);
  assert.match(contract,/owner:'owner_exclusion'/);
  assert.match(compute,/ownership\.owner==='owner_exclusion'/);
  assert.match(compute,/handleOwnerExclusionRoute/);
});

test('owner exclusion preserves session and owner-cookie protection',()=>{
  const runtime=read('owner-exclusion-worker.js');
  assert.match(runtime,/validSession\(request,env\)/);
  assert.match(runtime,/toolscout_owner=1/);
  assert.match(runtime,/canonicalHumanTrafficExcluded:verifiedOwner/);
  assert.match(runtime,/if\(!await validSession\(request,env\)\|\|!hasOwnerCookie\(request\)\)/);
});

test('retrospective audit remains migration-owned',()=>{
  const runtime=read('owner-exclusion-worker.js');
  const migration=read('migrations/0099_owner_retrospective_audits_schema.sql');
  assert.doesNotMatch(runtime,/CREATE TABLE|CREATE INDEX|ALTER TABLE/);
  assert.match(runtime,/owner_retrospective_audits_schema_not_migrated/);
  assert.match(migration,/CREATE TABLE IF NOT EXISTS owner_retrospective_audits/);
});

test('generic traversal bypasses owner exclusion wrapper',()=>{
  const compute=read('compute-router-worker.js');
  assert.match(compute,/import base from '\.\/revenue-worker\.js'/);
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
});
