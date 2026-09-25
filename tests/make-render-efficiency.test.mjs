import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

const orchestrator=read('distribution-orchestrator-worker.js');
assert.match(orchestrator,/external_runtime_config/);
assert.match(orchestrator,/make_sender_webhook_url/);
assert.match(orchestrator,/wakeMakeSender/);
assert.match(orchestrator,/deliveryMode:'instant_webhook'/);
assert.match(orchestrator,/approved_sender_work_available/);
assert.doesNotMatch(orchestrator,/hook\.eu1\.make\.com\/[^'"]+/);

const core=read('overflow-compute/research-core.mjs');
assert.match(core,/PAGE_CACHE_TTL_MS=20\*60\*1000/);
assert.match(core,/PAGE_CACHE_MAX=500/);
assert.match(core,/PER_HOST_CONCURRENCY=3/);
assert.match(core,/pageInflight/);
assert.match(core,/acquireHost/);
assert.match(core,/runtimeStats/);

const server=read('overflow-compute/server.mjs');
assert.match(server,/runtimeStats/);
assert.match(server,/maxConcurrency:MAX_CONCURRENCY/);

console.log('Make push and Render efficiency policy is intact.');
