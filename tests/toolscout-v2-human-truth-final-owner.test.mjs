import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('human truth final health has a direct owner',()=>{
  const runtime=read('command-center-human-truth-final-worker.js');
  const contract=read('runtime-route-contract.js');
  const compute=read('compute-router-worker.js');

  assert.match(runtime,/export async function handleHumanTruthFinalRoute/);
  assert.match(runtime,/\/api\/command-center-human-truth-final-health/);
  assert.match(runtime,/canonicalMetric:'strict verified human sessions'/);
  assert.match(runtime,/canonicalSource:'D1 traffic_human_evidence'/);
  assert.match(runtime,/acceptedEvidence:\['trusted_interaction','verified_outbound_navigation'\]/);
  assert.match(runtime,/browserValidatedDiagnosticOnly:true/);
  assert.match(contract,/owner:'human_truth_final_health'/);
  assert.match(compute,/ownership\.owner==='human_truth_final_health'/);
  assert.match(compute,/handleHumanTruthFinalRoute/);
});

test('generic traversal bypasses human truth final decorator',()=>{
  const compute=read('compute-router-worker.js');
  assert.match(compute,/import base from '\.\/distribution-linkable-assets-worker\.js'/);
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
});

test('legacy final-truth UI remains compatibility-only',()=>{
  const runtime=read('command-center-human-truth-final-worker.js');
  assert.match(runtime,/data-toolscout-human-truth-final/);
  assert.match(runtime,/ANALYTICS_PATHS/);
  assert.match(runtime,/Strict verified human sessions/);
  assert.doesNotMatch(runtime,/CREATE TABLE|CREATE INDEX|ALTER TABLE/);
});
