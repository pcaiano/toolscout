import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

const router=read('compute-router-worker.js');
assert.match(router,/EXECUTION_DAILY_JOB_BUDGET=300/);
assert.match(router,/enqueueAuthorizedExecution/);
assert.match(router,/authorized_http_action/);
assert.match(router,/authorized_verification/);
assert.match(router,/verified_free_auto_adapter_v1/);
assert.match(router,/verified_publication_check_v1/);
assert.match(router,/policy_state='verified'/);
assert.match(router,/a\.confidence>=95/);
assert.match(router,/COALESCE\(c\.cost_amount,0\)=0/);
assert.match(router,/payload_changed/);
assert.match(router,/paid_route_not_authorized/);
assert.match(router,/priority:1200\+num\(a\.distribution_score\)/);
assert.match(router,/priority:1100\+num\(row\.distribution_score\)/);
assert.match(router,/budgetRemaining\(env,'execution',EXECUTION_DAILY_JOB_BUDGET\)/);

const auto=read('distribution-autonomous-worker.js');
assert.match(auto,/external_execution_plane:true,status:'delegated_to_render'/);

const core=read('overflow-compute/research-core.mjs');
assert.match(core,/executeAuthorizedHttpAction/);
assert.match(core,/executeAuthorizedVerification/);
assert.match(core,/authorization_class_rejected/);
assert.match(core,/method_not_authorized/);
assert.match(core,/content_type_not_authorized/);
assert.match(core,/cross_host_redirect_blocked/);
assert.match(core,/invalid_or_private_endpoint/);
assert.doesNotMatch(core,/Authorization['"]/);
assert.doesNotMatch(core,/gmail|smtp|sendgrid|resend/i);

const supervisor=read('growth-supervisor.js');
assert.match(supervisor,/MACHINE_SAFE_EXTERNAL_EXECUTIONS_MAX_24H=300/);
assert.match(supervisor,/reputation_sensitive_external_execution_max_24h/);
assert.match(supervisor,/machine_safe_external_execution_max_24h/);

const truth=read('operational-truth-reconciliation-worker.js');
assert.match(truth,/MACHINE_SAFE_EXTERNAL_MAX_24H=300/);
assert.match(truth,/reputationSensitiveActionMax24h/);
assert.match(truth,/machineSafeExternalActionMax24h/);
assert.match(truth,/cloudflare_authorize_external_execute_cloudflare_verify/);

console.log('External action plane keeps decisions in Cloudflare and bounded execution in Render.');
