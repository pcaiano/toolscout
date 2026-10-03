import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const network=fs.readFileSync(new URL('../distribution-network-worker.js',import.meta.url),'utf8');
const autonomous=fs.readFileSync(new URL('../distribution-autonomous-worker.js',import.meta.url),'utf8');

test('alternate-route research has a bounded SLA and cannot remain researching forever',()=>{
  assert.match(network,/const ROUTE_RESEARCH_STALE_HOURS=6/);
  assert.match(network,/const MAX_ROUTE_RESEARCH_ATTEMPTS=3/);
  assert.match(network,/active_job\.status IN \('queued','leased'\)/);
  assert.match(network,/j\.status IN \('completed','failed'\)/);
  assert.match(network,/staleResearch=row\.status==='researching'/);
  assert.match(network,/next='retry_due'/);
  assert.match(network,/next='exhausted'/);
  assert.match(network,/attempts=MAX\(attempts,\?\)/);
  assert.match(network,/SET status='skipped',human_required=0,next_action=\?/);
});

test('human gates are closed only after their opportunity is terminal or superseding',()=>{
  const start=autonomous.indexOf('async function reconcileTerminalOpenHumanGates');
  const end=autonomous.indexOf('async function reconcileOrphanHumanStates',start);
  assert.ok(start>=0&&end>start);
  const terminalReconcile=autonomous.slice(start,end);
  assert.match(terminalReconcile,/g\.status='open'/);
  assert.match(terminalReconcile,/o\.status IN \('submitted','pending_review','scheduled','verified','live','policy_blocked','rejected','skipped','unavailable_free'\)/);
  assert.match(terminalReconcile,/const achieved=\['verified','live'\]\.includes\(s\)/);
  assert.match(terminalReconcile,/const status=achieved\?'resolved':'cancelled'/);
  assert.doesNotMatch(terminalReconcile,/o\.status IN \([^\n]*'auth_required'[^\n]*\)/);
  assert.doesNotMatch(terminalReconcile,/o\.status IN \([^\n]*'human_action_required'[^\n]*\)/);
});

test('terminal gate reconciliation runs before restoring active open-gate states',()=>{
  const terminal=autonomous.indexOf('const terminalOpenHumanGates=await reconcileTerminalOpenHumanGates(env)');
  const open=autonomous.indexOf('const openHumanGateStates=await reconcileOpenHumanGateStates(env)');
  assert.ok(terminal>0);
  assert.ok(open>terminal);
  assert.match(autonomous,/terminalOpenHumanGates,openHumanGateStates,orphanHumanStates/);
});
