import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const audit=read('.github/workflows/toolscout-v2-integrity-audit.yml');
const contract=read('docs/TOOLSCOUT-2.0-RUNTIME-CONTRACT.md');
const deploy=read('.github/workflows/deploy-worker.yml');

test('permanent ToolScout 2.0 audit enforces execution and runtime integrity',()=>{
  assert.match(audit,/workflow_dispatch:/);
  assert.match(audit,/missing_contracts/);
  assert.match(audit,/missing_executors/);
  assert.match(audit,/orphan_nonterminal_contracts/);
  assert.match(audit,/stale_compute_leases/);
  assert.match(audit,/invalid_human_gates/);
  assert.match(audit,/architecture_incidents_open/);
  assert.match(audit,/critical mission outside cadence/);
  assert.match(audit,/validate-v2-preservation\.mjs/);
});

test('runtime contract keeps canonical business sources and non-blocking human gates explicit',()=>{
  assert.match(contract,/GA4 is canonical for visitors and sessions/);
  assert.match(contract,/Google Search Console is canonical/);
  assert.match(contract,/server redirect ledger is canonical for outbound clicks and monetized outbound clicks/);
  assert.match(contract,/Missing canonical source data must be shown as unavailable/);
  assert.match(contract,/Human gates are non-blocking sidecars/);
  assert.match(contract,/Discovered email is not the same as sender-admissible supply/);
});

test('final guarded deploy is armed for Phase 243',()=>{
  assert.match(deploy,/ToolScout 2\.0 Phase 243 - final integrity cutover/);
});
