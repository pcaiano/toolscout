import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

const wrangler=read('wrangler.toml');
assert.match(wrangler,/main\s*=\s*"compute-router-worker\.js"/);
assert.match(wrangler,/crons\s*=\s*\["\*\/5 \* \* \* \*"/);

const router=read('compute-router-worker.js');
assert.match(router,/DAILY_JOB_BUDGET=1500/);
assert.match(router,/BATCH_SIZE=25/);
assert.match(router,/MAX_ACTIVE_BATCHES=2/);
assert.match(router,/BATCH_TIMEOUT_MINUTES=3/);
assert.match(router,/githubActionsRole:'disabled_until_october'/);
assert.match(router,/d1ReadModel:'single_row_metrics_no_job_table_scans'/);
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
