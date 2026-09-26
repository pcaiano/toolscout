import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

const wrangler=read('wrangler.toml');
assert.match(wrangler,/main\s*=\s*"compute-router-worker\.js"/);
assert.match(wrangler,/crons\s*=\s*\["\*\/5 \* \* \* \*"/);

const router=read('compute-router-worker.js');
assert.match(router,/DAILY_JOB_BUDGET=1500/);
assert.match(router,/EXECUTION_DAILY_JOB_BUDGET=800/);
assert.match(router,/const submitLimit=Math\.min\(300,remaining\);/);
assert.match(router,/BATCH_SIZE=25/);
assert.match(router,/MAX_ACTIVE_BATCHES=2/);
assert.match(router,/BATCH_TIMEOUT_MINUTES=3/);
assert.match(router,/githubActionsRole:'disabled_until_october'/);
assert.match(router,/d1ReadModel:'single_row_metrics_plus_two_budget_rows_plus_contact_supply_single_row_plus_distribution_funnel'/);
assert.match(router,/qualifyDistributionSurfaces/);
assert.match(router,/continueDistributionExecutionHandoff/);
assert.match(router,/distributionHandoffSlugs/);
assert.match(router,/validatedOverflowMachineCandidate/);
assert.match(router,/machineCandidatesFoundToday/);
assert.match(router,/formRoutesSeenToday/);
assert.match(router,/authRoutesSeenToday/);
assert.match(router,/captchaRoutesSeenToday/);
assert.match(router,/overflow_queue_refilled/);
assert.match(router,/reconcileMetricAnomaly/);
assert.match(router,/await metricDelta\(env,\{queued:metricQueued,leased:metricLeased,completed:metricCompleted,failed:metricFailed,activeBatches:-1,completedBatches:1,lastCompleted:true\}\)/);
assert.match(router,/if\(!env\.OVERFLOW_COMPUTE_URL\)return\{ok:true,status:'awaiting_external_runtime'\}/);
assert.match(router,/capability-secured|completion_token_hash|invalid_completion_capability/);
assert.match(router,/distribution_route_research/);
assert.match(router,/contact_route_research/);
assert.doesNotMatch(router,/GITHUB_ACTIONS|workflow_dispatch/);

const core=read('overflow-compute/research-core.mjs');
assert.match(core,/ToolScout Overflow Research\/1\.0/);
assert.match(core,/validPublicHttp/);
assert.match(core,/sameHost/);
assert.match(core,/PAYMENT_RE/);
assert.match(core,/RECIPROCAL_RE/);
assert.match(core,/AUTOMATION_BLOCK_RE/);
assert.match(core,/machineFormCandidate/);
assert.match(core,/SAFE_FORM_FIELDS/);
assert.match(core,/machineCandidate/);
assert.match(core,/routeSummary/);
assert.match(core,/product_name/);
assert.match(core,/short_description/);
assert.match(core,/formText/);
assert.doesNotMatch(core,/const AUTH_RE=\/\(login\|log in\|sign in\|create account\|register\|password\)\/i/);

const server=read('overflow-compute/server.mjs');
assert.match(server,/MAX_CONCURRENCY/);
assert.match(server,/active\.size>=4/);
assert.match(server,/\/health/);
assert.match(server,/\/tick/);

const render=read('render.yaml');
assert.match(render,/plan: free/);
assert.match(render,/region: frankfurt/);
assert.match(render,/node overflow-compute\/server\.mjs/);

console.log('External compute overflow v1 policy is intact.');
