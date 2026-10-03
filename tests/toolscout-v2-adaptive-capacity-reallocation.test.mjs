import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {senderCapacityDirective} from '../sender-capacity-policy.js';

const orchestrator=fs.readFileSync(new URL('../distribution-orchestrator-worker.js',import.meta.url),'utf8');
const executionContract=fs.readFileSync(new URL('../growth-execution-contract.js',import.meta.url),'utf8');
const supervisor=fs.readFileSync(new URL('../growth-supervisor.js',import.meta.url),'utf8');
const commandCenter=fs.readFileSync(new URL('../command-center-simplified-view.js',import.meta.url),'utf8');

test('sender capacity policy reallocates only when no admissible or in-flight supply exists',()=>{
  const exhausted=senderCapacityDirective({readyContacts:0,inFlight:0,supplyReadyEmail:0,discoveredUnrouted:14,cooldown:41,readyRoutes:74});
  assert.equal(exhausted.exhausted,true);
  assert.equal(exhausted.email_outreach_capacity,0);
  assert.equal(exhausted.reallocation.make_sender,'paused_no_admissible_supply');
  assert.equal(exhausted.reallocation.self_service_distribution,'priority_boosted');
  assert.equal(exhausted.reallocation.authority_non_email,'priority_boosted');
  assert.equal(exhausted.reallocation.search_content,'continue_at_full_capacity');

  const ready=senderCapacityDirective({readyContacts:2,inFlight:0,supplyReadyEmail:1});
  assert.equal(ready.exhausted,false);
  assert.equal(ready.email_outreach_capacity,2);
  assert.equal(ready.reallocation.make_sender,'enabled_bounded');

  const inFlight=senderCapacityDirective({readyContacts:0,inFlight:1,supplyReadyEmail:0});
  assert.equal(inFlight.exhausted,false);
});

test('Growth Brain and execution cycle share sender capacity truth',()=>{
  assert.match(supervisor,/senderCapacitySnapshot\(env\)/);
  assert.match(supervisor,/reallocate_sender_capacity_to_self_service_authority_and_search/);
  assert.match(supervisor,/email_outreach_capacity:0/);
  assert.match(orchestrator,/senderSupplyExhausted=Boolean\(senderCapacity\?\.exhausted\)/);
  assert.match(orchestrator,/sender_supply_exhausted_capacity_reallocated/);
  assert.match(orchestrator,/capacityReallocation:\{active:senderSupplyExhausted/);
  assert.match(orchestrator,/CASE executor WHEN 'distribution_network' THEN 0 WHEN 'distribution_autonomous' THEN 1 WHEN 'content_issue' THEN 2/);
});

test('Command Center shows reallocation instead of treating zero email supply as a blocked system',()=>{
  assert.match(commandCenter,/Sender supply exhausted · capacity reallocated/);
  assert.match(commandCenter,/Adaptive sender capacity/);
  assert.match(commandCenter,/Capacity reassigned to self-service distribution, authority and search\/content/);
});

test('sender exhaustion materially reallocates bounded capacity to autonomous authority work',()=>{
  assert.match(orchestrator,/AUTONOMOUS_REALLOCATED_BATCH_LIMIT=4/);
  assert.match(orchestrator,/autonomousBatchLimit=senderSupplyExhausted\?AUTONOMOUS_REALLOCATED_BATCH_LIMIT:1/);
  assert.match(orchestrator,/runInternal\('distribution_autonomous',[\s\S]+?\{limit:autonomousBatchLimit,maxInFlight:autonomousBatchLimit\}\)/);
  assert.match(orchestrator,/taskIds:\[task\.task_id\]/);
  assert.match(orchestrator,/adaptiveAuthorityBatch:senderSupplyExhausted/);
});

test('adaptive authority batch overrides the admission cap instead of being re-capped at one',()=>{
  assert.match(executionContract,/rebalanceExecutionAdmission\(env,\{readyCaps=\{\}\}=\{\}\)/);
  assert.match(executionContract,/readyCaps\?\.\[executor\]\?\?READY_CAPS\[executor\]/);
  assert.match(executionContract,/admissionCap=null/);
  assert.match(executionContract,/\{\[executor\]:requestedAdmissionCap\}/);
  assert.match(orchestrator,/admissionCap:batchLimit/);
});
