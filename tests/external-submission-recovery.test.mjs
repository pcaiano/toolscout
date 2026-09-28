import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const router=read('compute-router-worker.js');
const core=read('overflow-compute/research-core.mjs');

assert.match(router,/httpStatus===401\|\|httpStatus===403/);
assert.match(router,/policy_state='revalidation_required'/);
assert.match(router,/external_submission_recovery/);
assert.match(router,/route-recovery:v\$\{DISTRIBUTION_CLASSIFIER_VERSION\}/);
assert.match(router,/revalidate_401_403_reject_same_route_v2/);
assert.match(router,/Human Gate is genuinely required/);
assert.match(router,/Human work remains disabled unless fresh exact-route evidence/);
assert.match(router,/policy_state='transport_rejected'/);
assert.match(router,/rejected_adapter_replay_suppressed/);
assert.match(router,/same transport route that already returned HTTP 401\/403/);
assert.match(router,/adapter_changed_after_revalidation/);
assert.match(router,/previouslyRejected=recovering\|\|adapterPolicyState==='transport_rejected'/);
assert.match(core,/ok:true,accepted,httpStatus,targetUrl:endpoint/);
assert.match(core,/transport_completed_external_acceptance_separate_v1/);

console.log('PASS external 401/403 submissions invalidate stale adapters and return to fresh route research');
