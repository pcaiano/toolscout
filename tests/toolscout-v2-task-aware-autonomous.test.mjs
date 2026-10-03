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
  assert.match(src,/const conclusive=Number\(footprint\?\.checked\|\|0\)>0/);
  assert.match(src,/outcome=backlinkVerified\?'backlink_confirmed':conclusive\?'backlink_absent':'verification_inconclusive'/);
  assert.match(src,/taskProof:\{verified:backlinkVerified,conclusive,outcome/);
});

test('autonomous helper queries can be scoped to one surface',()=>{
  const src=read('distribution-autonomous-worker.js');
  assert.match(src,/packageAndExecute\(env,\{surfaceSlug=null\}=\{\}\)/);
  assert.match(src,/verifyAutoSubmitted\(env,\{surfaceSlug=null\}=\{\}\)/);
  assert.match(src,/verifyFootprint\(env,\{surfaceSlug=null,force=false\}=\{\}\)/);
});


test('Growth Brain does not plan unresolved route qualification while research is in cooldown',()=>{
  const src=read('distribution-orchestrator-worker.js');
  assert.match(src,/const routeResearchDue=String\(row\.route_adapter_policy_state\|\|''\)==='revalidation_required'/);
  assert.match(src,/Number\(row\.route_research_recent\|\|0\)===0/);
  assert.match(src,/Number\(row\.route_research_noyield\|\|0\)===0/);
  assert.match(src,/Number\(row\.route_research_unreachable_cooldown\|\|0\)===0/);
  assert.match(src,/const unresolvedAuthorityRoute=[\s\S]*&&routeResearchDue/);
});
