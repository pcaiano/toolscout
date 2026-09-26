import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');

const auth=read('auth-automation.js');
assert.match(auth,/automationClass='public_automatic'/);
assert.match(auth,/automationClass='token_automatic'/);
assert.match(auth,/automationClass='session_automatic'/);
assert.match(auth,/automationClass='session_bootstrap_sidecar'/);
assert.match(auth,/automationClass='human_challenge_sidecar'/);
assert.match(auth,/automationClass='human_manual_sidecar'/);
assert.match(auth,/Human bootstrap is isolated from autonomous throughput/);
assert.match(auth,/non-blocking human sidecar/);

const autonomous=read('distribution-autonomous-worker.js');
assert.match(autonomous,/human_gate_execution_policy:'non_blocking_sidecar_v2'/);
assert.match(autonomous,/const QUALIFY_LIMIT=24;/);
assert.match(autonomous,/const EXECUTION_LIMIT=12;/);
assert.match(autonomous,/export async function qualifyDistributionSurfaces/);
assert.match(autonomous,/research_result_targeted_handoff/);
assert.match(autonomous,/\['submitted','queued_external','pending_review','verified'\]/);
assert.doesNotMatch(autonomous,/\['submitted','ready'\]/);

const router=read('compute-router-worker.js');
assert.match(router,/EXECUTION_DAILY_JOB_BUDGET=800/);
assert.match(router,/const submitLimit=Math\.min\(300,remaining\);/);
assert.match(router,/jobType:'authorized_http_action'/);
assert.match(router,/authorizationClass:'verified_free_auto_adapter_v1'/);
assert.match(router,/j\.job_type='distribution_route_research'/);
assert.match(router,/queued\.status IN \('queued_external','submitted','pending_review','verified'\)/);
assert.match(router,/continueDistributionExecutionHandoff/);
assert.match(router,/distribution_research_execution_handoff/);

const dashboard=read('distribution-engine-worker.js');
assert.match(dashboard,/executionLanes/);
assert.match(dashboard,/Machine ready/);
assert.match(dashboard,/Bootstrap sidecar/);
assert.match(dashboard,/Human challenge/);
assert.match(dashboard,/Submission queue/);

const config=JSON.parse(read('data/distribution-submission-adapters.json'));
assert.equal(config.policy.human_gate_execution_policy,'non_blocking_sidecar_v2');
assert.equal(config.policy.execution_strategy,'lane_routed_outcome_weighted');
assert.equal(config.policy.eligible_surface_policy,'execute_all_qualified_zero_cost_surfaces');
assert.ok(config.policy.human_assisted_only.includes('captcha'));
assert.ok(config.policy.bootstrap_once_then_resume.includes('account_creation'));
assert.ok(!config.policy.never_automatic.includes('captcha'));
assert.ok(!config.policy.never_automatic.includes('account_creation'));
assert.ok(config.policy.never_automatic.includes('payment'));

console.log('Distribution executor lanes route machine, bootstrap, challenge and manual work without blocking autonomous throughput.');
