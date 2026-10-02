import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('autonomous cycle targets the exact qualification task',()=>{
  const src=read('distribution-autonomous-worker.js');
  assert.match(src,/runAutonomousDistributionCycle\(env,task=null\)/);
  assert.match(src,/taskAction==='autonomous_route_qualification'/);
  assert.match(src,/qualifyDistributionSurfaces\(env,\[taskTarget\]\)/);
  assert.match(src,/packageAndExecute\(env,\{surfaceSlug:taskTarget\}\)/);
  assert.match(src,/verifyAutoSubmitted\(env,\{surfaceSlug:taskTarget\}\)/);
});

test('autonomous backlink verification is exact and force-refreshes the target',()=>{
  const src=read('distribution-autonomous-worker.js');
  assert.match(src,/taskAction==='verify_backlink_acquisition'/);
  assert.match(src,/verifyFootprint\(env,\{surfaceSlug:taskTarget,force:true\}\)/);
  assert.match(src,/backlinkVerified:Number\(placement\?\.backlink_verified\|\|0\)===1/);
});

test('autonomous helper queries can be scoped to one surface',()=>{
  const src=read('distribution-autonomous-worker.js');
  assert.match(src,/packageAndExecute\(env,\{surfaceSlug=null\}=\{\}\)/);
  assert.match(src,/verifyAutoSubmitted\(env,\{surfaceSlug=null\}=\{\}\)/);
  assert.match(src,/verifyFootprint\(env,\{surfaceSlug=null,force=false\}=\{\}\)/);
});
