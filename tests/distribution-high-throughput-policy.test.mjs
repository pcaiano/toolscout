import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');

const discoveryConfig=JSON.parse(read('data/distribution-discovery-sources.json'));
assert.ok(Number(discoveryConfig.guardrails?.max_fetches_per_run)>=16,'distribution discovery must scan at least 16 sources per cycle');
assert.ok(Number(discoveryConfig.guardrails?.max_candidates_per_source)>=80,'distribution discovery must inspect at least 80 candidates per source');

const discoveryWorker=read('distribution-discovery-worker.js');
assert.match(discoveryWorker,/Math\.min\(24,Number\(c\.guardrails\?\.max_fetches_per_run\|\|16\)\)/,'discovery worker must allow the high-throughput source cap');

const autonomousWorker=read('distribution-autonomous-worker.js');
assert.match(autonomousWorker,/const QUALIFY_LIMIT=24;/,'autonomous distribution must qualify 24 surfaces per cycle');
assert.match(autonomousWorker,/const EXECUTION_LIMIT=12;/,'autonomous distribution must execute up to 12 verified surfaces per cycle');
assert.match(autonomousWorker,/const RESEARCH_COOLDOWN_HOURS=6;/,'research retry cooldown must remain six hours');
assert.match(autonomousWorker,/const discovery=await runDiscoveryRefresh\(env\);/,'every autonomous cycle must begin with discovery');
assert.match(autonomousWorker,/return \{ok:true,discovery,/,'discovery evidence must remain part of the cycle result');
assert.match(autonomousWorker,/const AUTHORITY_STAGNATION_HOURS=24;/,'authority stagnation recovery must react within 24 hours');
assert.match(autonomousWorker,/backlogActive=authorityQueue>0,required=bootstrapIncomplete\|\|backlogActive;/,'authority acquisition must remain active while backlog exists beyond the bootstrap floor');
assert.match(autonomousWorker,/acquisitionMode:'exhaustive_backlog'/,'authority acquisition must expose exhaustive backlog mode');

const closedLoopWorker=read('growth-runtime-closed-loop-worker.js');
assert.doesNotMatch(closedLoopWorker,/before\.queue<=0\|\|before\.attempts24>=AUTHORITY_ATTEMPT_MIN_24H/,'daily attempt floor must not cap authority backlog execution');
assert.match(closedLoopWorker,/if\(before\.queue<=0\)/,'authority loop may pause only after its executable queue is drained');
assert.match(closedLoopWorker,/return'executing_backlog';/,'authority health must distinguish active backlog execution from a healthy completed outcome');

const authorityDrainWorker=read('growth-runtime-authority-drain-worker.js');
assert.doesNotMatch(authorityDrainWorker,/if\(floorMet\)d\.status='healthy'/,'sender reconciliation must not mark authority healthy from attempt volume alone');

const growthSupervisor=read('growth-supervisor.js');
assert.match(growthSupervisor,/const BACKLINK_STAGNATION_HOURS=24;/,'backlink stagnation must trigger reallocation after 24 hours');
assert.match(growthSupervisor,/const acquisitionRequired=bootstrapGap\|\|backlogActive;/,'backlink acquisition must continue after ten referring domains while authority backlog remains');
assert.match(growthSupervisor,/backlink_slowdown_allowed:!bootstrapGap&&!backlogActive/,'slowdown is allowed only after bootstrap and backlog exhaustion');

const throughputWorker=read('distribution-throughput-worker.js');
assert.match(throughputWorker,/const RESEARCH_SCAN_LIMIT=120;/);
assert.match(throughputWorker,/const RESEARCH_BUDGET=24;/);
assert.match(throughputWorker,/const INDEXNOW_BATCH_LIMIT=50;/);
assert.match(throughputWorker,/const VERIFY_LIMIT=100;/);

const adapters=JSON.parse(read('data/distribution-submission-adapters.json'));
assert.ok(Number(adapters.policy?.max_automatic_per_run)>=16,'safe automatic executor must retain at least 16 slots per run');
assert.equal(adapters.policy?.zero_cost_only,true,'zero-cost distribution policy must remain enforced');
assert.ok((adapters.policy?.never_automatic||[]).includes('payment'),'paid submission must remain non-automatic');
assert.ok((adapters.policy?.never_automatic||[]).includes('captcha'),'human CAPTCHA gates must remain non-automatic');

console.log('Distribution high-throughput policy: discovery, qualification, execution and safety guardrails are intact.');
