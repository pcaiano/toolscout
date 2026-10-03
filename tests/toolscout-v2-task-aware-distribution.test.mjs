import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('distribution network cycle accepts and scopes an opportunity task',()=>{
  const src=read('distribution-network-worker.js');
  assert.match(src,/runDistributionNetworkCycle\(env,task=null\)/);
  assert.match(src,/task\?\.source_kind==='opportunity'/);
  assert.match(src,/surfaceSlug:targeted\?target:null/);
  assert.match(src,/\(\?='' OR surface_slug=\?\)/);
  assert.match(src,/\(\?='' OR r\.surface_slug=\?\)/);
  assert.match(src,/\(\?='' OR a\.surface_slug=\?\)/);
});

test('publisher contact discovery emits task-specific proof only after a concrete outcome',()=>{
  const src=read('distribution-network-worker.js');
  assert.match(src,/kind:'publisher_contact_discovery'/);
  assert.match(src,/contact_found/);
  assert.match(src,/contact_route_found/);
  assert.match(src,/suppressed_no_contact/);
  assert.match(src,/taskProof/);
});

test('orchestrator records verified task-specific distribution proof',()=>{
  const src=read('distribution-orchestrator-worker.js');
  assert.match(src,/out\?\.taskProof\?\.verified===true\|\|out\?\.taskProof\?\.conclusive===true/);
  assert.match(src,/task_specific_distribution_proof/);
  assert.match(src,/proof\.outcome/);
  assert.match(src,/recordExecutionProof/);
});


test('live or verified surfaces without backlinks advance into publisher authority recovery',()=>{
  const src=read('distribution-orchestrator-worker.js');
  assert.match(src,/const backlinkMissing=backlinkAcquisition&&externalSurface&&\['live','verified'\]\.includes\(surfaceStatus\)&&!backlinkVerified/);
  assert.match(src,/backlinkMissing&&\(!network\|\|network==='queued'\|\|network==='send_failed'\).*publisher_contact_discovery/);
  assert.match(src,/backlinkMissing&&network==='contact_route_found'.*execute_alternate_routes/);
});


test('publisher contact discovery respects its 20 hour network scan cooldown',()=>{
  const src=read('distribution-orchestrator-worker.js');
  assert.match(src,/n\.contact_email network_contact_email/);
  assert.match(src,/n\.contact_checked_at network_contact_checked_at/);
  assert.match(src,/const contactDiscoveryDue=!network/);
  assert.match(src,/Date\.now\(\)-networkContactCheckedAt>=20\*3600000/);
  assert.match(src,/backlinkMissing&&contactDiscoveryDue/);
  assert.match(src,/acquisitionOpen&&contactDiscoveryDue/);
  assert.match(src,/contact_discovery_due:contactDiscoveryDue/);
});
