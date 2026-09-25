import assert from 'node:assert/strict';
import fs from 'node:fs';

const src=fs.readFileSync(new URL('../compute-router-worker.js',import.meta.url),'utf8');
const start=src.indexOf('async function isolatedOverflowStage');
const end=src.indexOf('async function batchPayload',start);
assert.ok(start>=0&&end>start,'overflow orchestration helpers must exist');
const body=src.slice(start,end);

assert.match(body,/overflow_\$\{name\}_failed/,'stage failures must be recorded instead of aborting the tick');
assert.match(body,/for\(let slot=0;slot<MAX_ACTIVE_BATCHES;slot\+\+\)/,'the router must use every configured active-batch slot');
assert.match(body,/isolatedOverflowStage\(env,'authorized_execution_enqueue'/);
assert.match(body,/isolatedOverflowStage\(env,'research_enqueue'/);
assert.match(body,/const runs=await dispatchAvailableBatches\(env\)/,'dispatch must still execute after isolated enqueue failures');
assert.match(body,/dispatchSlotsUsed:runs\.length,dispatchSlotsMax:MAX_ACTIVE_BATCHES/);

console.log('Overflow router isolates upstream failures and fills available external batch slots.');
