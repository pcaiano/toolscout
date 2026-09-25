import assert from 'node:assert/strict';
import fs from 'node:fs';

const src=fs.readFileSync(new URL('../growth-execution-contract.js',import.meta.url),'utf8');
const start=src.indexOf('export async function claimExecutorTasks');
const end=src.indexOf('export async function markExecutorAttempt',start);
assert.ok(start>=0&&end>start,'claimExecutorTasks must exist');
const body=src.slice(start,end);

assert.match(body,/ORDER BY CASE WHEN status='stalled' THEN 0 ELSE 1 END/,'stalled contracts must be claimed before ordinary pending work');
assert.match(body,/CASE WHEN executor='catalog_cycle' AND subject_type='catalog_gap' THEN 0 ELSE 1 END/,'catalog-gap preference remains secondary to stall recovery');

console.log('Stalled execution contracts are reclaimed before newer pending work.');
