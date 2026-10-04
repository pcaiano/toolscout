import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

test('free-by-default spend guard accepts explicitly declined paid upsells',()=>{
  const run=spawnSync(process.execPath,['scripts/validate-growth-spend-policy.mjs'],{encoding:'utf8'});
  const output=(run.stdout||'')+(run.stderr||'');
  assert.equal(run.status,0,output);
  const result=JSON.parse(run.stdout);
  assert.equal(result.ok,true,output);
  assert.deepEqual(result.violations,[],output);
});
