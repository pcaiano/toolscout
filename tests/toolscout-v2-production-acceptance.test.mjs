import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  handleToolScoutV2ClosureRoute,
  TOOLSCOUT_V2_DEPLOYMENT_FINGERPRINT,
  TOOLSCOUT_V2_RELEASE,
  TOOLSCOUT_V2_RELEASE_PHASE
} from '../toolscout-v2-closure-runtime.js';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Phase 260 exposes a stable final ToolScout 2.0 release fingerprint without rewriting closure history',async()=>{
  assert.equal(TOOLSCOUT_V2_RELEASE,'toolscout-2.0-final');
  assert.equal(TOOLSCOUT_V2_RELEASE_PHASE,260);
  assert.equal(TOOLSCOUT_V2_DEPLOYMENT_FINGERPRINT,'toolscout-2.0-final-phase-260');
  const response=await handleToolScoutV2ClosureRoute(new Request('https://trytoolscout.org/api/runtime/closure-health'));
  const data=await response.json();
  assert.equal(data.phase,107);
  assert.equal(data.release,'toolscout-2.0-final');
  assert.equal(data.releasePhase,260);
  assert.equal(data.deploymentFingerprint,'toolscout-2.0-final-phase-260');
  assert.equal(data.productionClosure.status,'architecture_closed');
  assert.equal(data.productionClosure.releaseStatus,'production_accepted');
});

test('Phase 260 production acceptance is fail-closed on structural execution defects',()=>{
  const workflow=read('.github/workflows/toolscout-v2-production-acceptance.yml');
  const evaluator=read('scripts/evaluate-v2-production-acceptance.mjs');
  assert.match(workflow,/ToolScout 2\.0 Phase 260 - production acceptance deploy/);
  assert.match(workflow,/verify-v2-live-smoke\.mjs/);
  assert.match(workflow,/evaluate-v2-production-acceptance\.mjs/);
  assert.match(workflow,/probe-v2-operational-health\.mjs/);
  assert.match(workflow,/unsupported_search_contracts/);
  assert.match(workflow,/stale_stalled_contracts/);
  assert.match(workflow,/search_execution_state_without_evidence/);
  assert.match(evaluator,/evaluateIntegrityPayload/);
  assert.match(evaluator,/unsupported active search execution contracts/);
  assert.match(evaluator,/stalled execution contracts older than six hours/);
  assert.match(evaluator,/active search execution state missing source evidence timestamp/);
});

test('Phase 260 acceptance deploy preserves the existing public and commercial invariants',()=>{
  const workflow=read('.github/workflows/toolscout-v2-production-acceptance.yml');
  assert.match(workflow,/validate-v2-preservation\.mjs/);
  assert.match(workflow,/Wrangler dry-run build/);
  assert.match(workflow,/Apply D1 migrations/);
  assert.match(workflow,/Deploy final ToolScout 2\.0 Worker/);
});
