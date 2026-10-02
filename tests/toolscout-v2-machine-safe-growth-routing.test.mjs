import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const src=fs.readFileSync(new URL('../distribution-orchestrator-worker.js',import.meta.url),'utf8');

test('surface coordination reads machine-safety evidence',()=>{
  assert.match(src,/o\.human_required,o\.automation_potential/);
  assert.match(src,/const acquisitionOpen=externalSurface&&\['discovered','candidate','research_required','stale'\]\.includes\(surfaceStatus\)/);
  assert.match(src,/const machineSafeDirect=acquisitionOpen/);
  assert.match(src,/Number\(row\.human_required\|\|0\)===0/);
  assert.match(src,/Number\(row\.automation_potential\|\|0\)>=90/);
});

test('machine-safe API surfaces route to autonomous qualification instead of publisher contact discovery',()=>{
  assert.match(src,/if\(machineSafeDirect\)actions\.unshift\('autonomous_route_qualification'\)/);
  assert.match(src,/else if\(acquisitionOpen&&\(!network\|\|network==='queued'\|\|network==='send_failed'\)\)actions\.unshift\('publisher_contact_discovery'\)/);
  assert.match(src,/machine_safe_direct:machineSafeDirect/);
});

test('backlink verification remains independent of machine-safe route ownership',()=>{
  assert.match(src,/verify_backlink_acquisition/);
});


test('waiting and first-party surfaces cannot generate fresh acquisition outreach',()=>{
  assert.match(src,/const externalSurface=!\['rss','toolscout-ard','toolscout-machine-discovery','indexnow'\]/);
  assert.match(src,/if\(externalSurface&&network==='contact_found'\)actions\.unshift\('publisher_outreach'\)/);
  assert.match(src,/if\(externalSurface&&\(network==='adopted'\|\|Number\(row\.route_verified\|\|0\)>0\)\)actions\.unshift\('scale_proven_surface'\)/);
  assert.doesNotMatch(src,/else if\(!network\|\|network==='queued'\|\|network==='send_failed'\)actions\.unshift\('publisher_contact_discovery'\)/);
});
