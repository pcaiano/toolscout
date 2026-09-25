import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

const sender=read('distribution-sender-worker.js');
assert.match(sender,/EMAIL_TARGET_24H=50/);
assert.match(sender,/EMAIL_MAX_24H=60/);
assert.match(sender,/rolling_24h_email_cap_reached/);
assert.match(sender,/leased_recent/);
assert.match(sender,/reputation_boundary/);

const contract=read('growth-execution-contract.js');
assert.match(contract,/make_sender:12/);

const orchestrator=read('distribution-orchestrator-worker.js');
assert.match(orchestrator,/claimExecutorTasks\(env,'make_sender',\{limit:12,maxInFlight:12/);
assert.match(orchestrator,/batchCapacity:12/);

const router=read('compute-router-worker.js');
assert.match(router,/publisher_role_email_research/);
assert.match(router,/vendor_role_email_research/);
assert.match(router,/public_role_email_discovery_v1/);
assert.match(router,/public_role_email/);
assert.match(router,/idx_distribution_opportunities_overflow/);
assert.match(router,/idx_distribution_submissions_lookup/);
assert.match(router,/idx_distribution_submissions_verify/);
assert.match(router,/idx_distribution_auto_adapters_policy/);

const core=read('overflow-compute/research-core.mjs');
assert.match(core,/ROLE_LOCAL_RE/);
assert.match(core,/researchRoleEmail/);
assert.match(core,/publicRoleEmails/);
assert.match(core,/same-domain|sameHost|hostFamily/);

const supervisor=read('growth-supervisor.js');
assert.match(supervisor,/BASELINE_EXTERNAL_EXECUTIONS_TARGET_24H=50/);
assert.match(supervisor,/BASELINE_EXTERNAL_EXECUTIONS_MAX_24H=60/);
assert.match(supervisor,/BACKLINK_ATTEMPT_TARGET_24H=50/);

const truth=read('operational-truth-reconciliation-worker.js');
assert.match(truth,/ACQUISITION_SURGE_TARGET_24H=50/);
assert.match(truth,/ACQUISITION_SURGE_MAX_24H=60/);

const closed=read('growth-runtime-closed-loop-worker.js');
assert.match(closed,/AUTHORITY_ATTEMPT_TARGET_24H=50/);

const autonomous=read('distribution-autonomous-worker.js');
assert.match(autonomous,/AUTHORITY_ATTEMPT_TARGET_24H=50/);

console.log('Aggressive quality-gated email throughput policy is intact.');
