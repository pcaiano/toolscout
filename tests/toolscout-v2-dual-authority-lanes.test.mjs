import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const src=fs.readFileSync(new URL('../distribution-orchestrator-worker.js',import.meta.url),'utf8');

test('authority cycle drains network and autonomous lanes together when authority is selected',()=>{
  assert.match(src,/selectedInternalLane==='distribution_network'[\s\S]*runInternal\('distribution_network'[\s\S]*runInternal\('distribution_autonomous'/);
  assert.match(src,/selectedInternalLane==='distribution_autonomous'[\s\S]*runInternal\('distribution_autonomous'[\s\S]*runInternal\('distribution_network'/);
  assert.match(src,/authorityCounterpartDrain:true/);
});

test('distribution task proof has one canonical verified branch',()=>{
  const needle="(executor==='distribution_network'||executor==='distribution_autonomous')&&out?.taskProof?.verified===true";
  assert.equal(src.split(needle).length-1,1);
});

test('each authority executor remains individually capped at one in flight',()=>{
  assert.match(src,/claimExecutorTasks\(env,executor,\{limit:1,maxInFlight:1/);
});
