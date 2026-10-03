import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../distribution-orchestrator-worker.js',import.meta.url),'utf8');

test('unresolved external authority surfaces always receive autonomous qualification work',()=>{
  assert.match(source,/const unresolvedAuthorityRoute=acquisitionOpen&&authoritySurface&&Number\(row\.human_required\|\|0\)===0&&Boolean\(row\.action_url\)/);
  assert.match(source,/vendorRouteQualification\|\|machineSafeDirect\|\|unresolvedAuthorityRoute\)actions\.unshift\('autonomous_route_qualification'\)/);
});

test('contact discovery can run in parallel with autonomous route qualification',()=>{
  const start=source.indexOf('const unresolvedAuthorityRoute=');
  const end=source.indexOf('const signals=',start);
  assert.ok(start>=0&&end>start);
  const block=source.slice(start,end);
  assert.match(block,/if\(acquisitionOpen&&networkOutreachEligible&&contactDiscoveryDue\)actions\.unshift\('publisher_contact_discovery'\)/);
  assert.doesNotMatch(block,/else if\(acquisitionOpen&&networkOutreachEligible&&contactDiscoveryDue\)/);
});

test('autonomous qualification is not duplicated when an alternate autonomous route already exists',()=>{
  assert.match(source,/!actions\.includes\('autonomous_route_qualification'\).*Number\(row\.route_auto\|\|0\)>0/);
});
