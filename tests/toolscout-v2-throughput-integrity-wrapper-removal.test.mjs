import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('generic traversal bypasses throughput integrity wrapper',()=>{
  const compute=read('compute-router-worker.js');
  assert.match(compute,/import base from '\.\/distribution-autonomous-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/distribution-throughput-integrity-worker\.js'/);
});

test('IndexNow timestamp normalization is folded into throughput runtime',()=>{
  const runtime=read('distribution-throughput-worker.js');
  assert.match(runtime,/async function normalizeIndexNowAttemptTimestamps\(env\)/);
  assert.match(runtime,/last_network_attempt_at/);
  assert.match(runtime,/error LIKE 'retryable:indexnow_%'/);
  assert.match(runtime,/if\(integrityTarget\)await normalizeIndexNowAttemptTimestamps\(env\)/);
  assert.match(runtime,/await normalizeIndexNowAttemptTimestamps\(env\);return result/);
});

test('throughput runtime remains schema-clean',()=>{
  const runtime=read('distribution-throughput-worker.js');
  assert.doesNotMatch(runtime,/CREATE\s+(?:TABLE|INDEX)|ALTER\s+TABLE/i);
});
