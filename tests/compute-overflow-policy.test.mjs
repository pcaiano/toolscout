import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

const wrangler=read('wrangler.toml');
assert.match(wrangler,/main\s*=\s*"compute-router-worker\.js"/);
assert.match(wrangler,/crons\s*=\s*\["\*\/15 \* \* \* \*"/);

const router=read('compute-router-worker.js');
assert.match(router,/DAILY_JOB_BUDGET=1500/);
assert.match(router,/DISTRIBUTION_CLASSIFIER_VERSION=13/);
assert.match(router,/EXECUTION_DAILY_JOB_BUDGET=800/);
assert.match(router,/const submitLimit=Math\.min\(300,remaining\);/);
assert.match(router,/BATCH_SIZE=8/);
assert.match(router,/MAX_ACTIVE_BATCHES=3/);
assert.match(router,/async function createBatch\(env,\{preferredJobType=null\}=\{\}\)/);
assert.match(router,/job_type=\?/);
assert.match(router,/preferredJobType=slot===0\?'distribution_route_research':null/);
assert.match(router,/BATCH_TIMEOUT_MINUTES=3/);
assert.match(router,/githubActionsRole:'disabled_until_october'/);
assert.match(router,/d1ReadModel:'incremental_funnel_plus_indexed_queue_v2'/);
assert.match(router,/SELECT COUNT\(\*\) n FROM compute_overflow_batches WHERE status IN \('dispatched','running'\)/);
assert.match(router,/canonical_queued/);
assert.match(router,/runnable_queued/);
assert.match(router,/deferred_queued/);
assert.match(router,/compute_overflow_locks/);
assert.match(router,/acquireDispatchLock/);
assert.match(router,/recoverTransientDispatchDeferrals/);
assert.match(router,/available_at=datetime\('now','\+1 minute'\)/);
assert.match(router,/qualifyDistributionSurfaces/);
assert.match(router,/continueDistributionExecutionHandoff/);
assert.match(router,/qualifyResearchReadySweep/);
assert.match(router,/runQualificationWatchdog/);
assert.match(router,/qualification_watchdog_cycle/);
assert.match(router,/qualificationReady15m/);
assert.match(router,/qualificationResearch15m/);
assert.match(router,/qualificationHuman15m/);
assert.match(router,/qualificationAuth15m/);
assert.match(router,/qualificationPolicy15m/);
assert.match(router,/const preRuns=await dispatchAvailableBatches\(env\)/);
assert.match(router,/const postRuns=await dispatchAvailableBatches\(env\)/);
assert.match(router,/distributionHandoffSlugs/);
assert.match(router,/validatedOverflowMachineCandidate/);
assert.match(router,/machineCandidatesFoundToday/);
assert.match(router,/formRoutesSeenToday/);
assert.match(router,/authRoutesSeenToday/);
assert.match(router,/captchaRoutesSeenToday/);
assert.match(router,/reconcileMetricAnomaly/);
assert.match(router,/await metricDelta\(env,\{queued:metricQueued,leased:metricLeased,completed:metricCompleted,failed:metricFailed,activeBatches:-1,completedBatches:1,lastCompleted:true\}\)/);
assert.match(router,/if\(!env\.OVERFLOW_COMPUTE_URL\)return\{ok:true,status:'awaiting_external_runtime'\}/);
assert.match(router,/capability-secured|completion_token_hash|invalid_completion_capability/);
assert.match(router,/distribution_route_research/);
assert.match(router,/status IN \('candidate','discovered','research_required'\)/);
assert.match(router,/COALESCE\(human_required,0\)=0 AND action_url IS NOT NULL/);
assert.doesNotMatch(router,/status='research_required' AND \(last_checked_at IS NULL OR last_checked_at<=datetime\('now','-\$\{DISTRIBUTION_RESEARCH_BUCKET_HOURS\} hours'\)\)/);
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
assert.match(core,/sourceFallbackAttempted/);
assert.match(core,/origin\+'\/submit-tool'/);
assert.match(core,/classification:'source_unreachable'/);
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

assert.match(router,/HEALTH_CACHE_MS=120000/);
assert.match(router,/healthReadModel:'incremental_cached_120s_read_only'/);
assert.match(router,/render_classification_primary/);
assert.match(router,/render_primary_with_bounded_cloudflare_fallback/);
assert.match(router,/runQualificationWatchdog\(env\)\.catch/);
assert.match(router,/QUALIFICATION_FALLBACK_LIMIT=6/);
assert.doesNotMatch(router,/health_watchdog_pump_failed/);

assert.match(router,/compute_overflow_funnel_metrics/);
assert.match(router,/funnelMetricDelta/);
assert.match(router,/hiddenSafetyFields/);
assert.match(core,/machineFormAssessment/);
assert.match(core,/canonicalFieldName/);
assert.match(core,/formRejections/);
assert.match(core,/openApiMachineCandidate/);
assert.match(core,/findOpenApiMachineCandidate/);
assert.match(core,/kind:'json_api'/);
assert.match(router,/safeOverflowJsonPayload/);
assert.match(router,/kind==='json_api'/);

assert.match(router,/CONTACT_SUPPLY_RESEARCH_BATCH=40/);
assert.match(router,/const limit=Math\.min\(80,remaining\);/);

