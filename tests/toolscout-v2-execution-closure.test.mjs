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
  assert.match(autonomous,/async function reconcileTerminalOpenHumanGates/);
  assert.match(autonomous,/g\.status='open'/);
  assert.match(autonomous,/o\.status IN \('submitted','pending_review','scheduled','verified','live','policy_blocked','rejected','skipped','unavailable_free'\)/);
  assert.match(autonomous,/const achieved=\['verified','live'\]\.includes\(s\)/);
  assert.match(autonomous,/const status=achieved\?'resolved':'cancelled'/);
  assert.doesNotMatch(autonomous,/o\.status IN \([^\n]*'auth_required'[^\n]*\)/);
  assert.doesNotMatch(autonomous,/o\.status IN \([^\n]*'human_action_required'[^\n]*\)/);
});

test('terminal gate reconciliation runs before restoring active open-gate states',()=>{
  const terminal=autonomous.indexOf('const terminalOpenHumanGates=await reconcileTerminalOpenHumanGates(env)');
  const open=autonomous.indexOf('const openHumanGateStates=await reconcileOpenHumanGateStates(env)');
  assert.ok(terminal>0);
  assert.ok(open>terminal);
  assert.match(autonomous,/terminalOpenHumanGates,openHumanGateStates,orphanHumanStates/);
});

const scheduler=fs.readFileSync(new URL('../growth-scheduler.js',import.meta.url),'utf8');
const scheduleContract=fs.readFileSync(new URL('../runtime-schedule-contract.js',import.meta.url),'utf8');

test('route-state reconciliation has an hourly owner without duplicating heavy network discovery',()=>{
  assert.match(network,/export async function reconcileDistributionNetworkState/);
  assert.match(network,/mode:'d1_reconciliation_only'/);
  assert.match(network,/externalDiscovery:false/);
  assert.match(scheduler,/reconcileDistributionNetworkState/);
  assert.match(scheduler,/mission:'route_state_reconciliation'/);
  assert.match(scheduler,/if\(twoHourly\)[\s\S]*?runDistributionNetworkCycle[\s\S]*?\}else\{[\s\S]*?reconcileDistributionNetworkState/);
  assert.match(scheduleContract,/distribution_route_state_reconciliation:\{owner:'growth_scheduler',cron:TOOLSCOUT_CRONS\.hourly,subcadence:'odd_hours'/);
});
