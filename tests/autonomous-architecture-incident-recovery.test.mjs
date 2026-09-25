import assert from 'node:assert/strict';
import fs from 'node:fs';

const autonomous=fs.readFileSync(new URL('../distribution-autonomous-worker.js',import.meta.url),'utf8');
const architecture=fs.readFileSync(new URL('../growth-architecture-escalation.js',import.meta.url),'utf8');

assert.doesNotMatch(autonomous,/superseded_by_healthy_autonomous_cycle/,'autonomous worker must not self-mark old runs as failed');
assert.match(autonomous,/mission:'autonomous_cycle',triggerName:'manual_api',singleFlightMinutes:15/,'manual autonomous refresh must be single-flight guarded');
assert.match(architecture,/superseded_by_healthy_autonomous_cycle/,'historical superseded bookkeeping failures must be excluded from architecture incidents');

console.log('Autonomous distribution runs are serialized and superseded bookkeeping failures do not create architecture incidents.');
