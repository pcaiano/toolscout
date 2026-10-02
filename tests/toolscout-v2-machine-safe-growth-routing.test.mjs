import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const src=fs.readFileSync(new URL('../distribution-orchestrator-worker.js',import.meta.url),'utf8');

test('surface coordination reads machine-safety evidence',()=>{
  assert.match(src,/o\.human_required,o\.automation_potential/);
  assert.match(src,/const machineSafeDirect=Number\(row\.human_required\|\|0\)===0/);
  assert.match(src,/Number\(row\.automation_potential\|\|0\)>=90/);
});

test('machine-safe API surfaces route to autonomous qualification instead of publisher contact discovery',()=>{
  assert.match(src,/if\(machineSafeDirect\)actions\.unshift\('autonomous_route_qualification'\)/);
  assert.match(src,/else if\(!network\|\|network==='queued'\|\|network==='send_failed'\)actions\.unshift\('publisher_contact_discovery'\)/);
  assert.match(src,/machine_safe_direct:machineSafeDirect/);
});

test('backlink verification remains independent of machine-safe route ownership',()=>{
  assert.match(src,/verify_backlink_acquisition/);
});
