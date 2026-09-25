import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const network=read('distribution-network-worker.js');

const start=network.indexOf('async function materializeRouteActions(env)');
const end=network.indexOf('async function reconcileRouteActions(env)',start);
assert.ok(start>=0&&end>start,'materializeRouteActions must exist');
const body=network.slice(start,end);

assert.match(body,/canonicalRouteIdentity=/,'autonomous contact routes must derive a canonical destination identity');
assert.match(body,/routeHash\(mode==='autonomous_qualification'\?canonicalRouteIdentity:row\.route_id\)/);
assert.match(body,/mode==='autonomous_qualification'/);
assert.match(body,/UPDATE distribution_contact_route_actions[\s\S]*execution_mode='autonomous_qualification' AND route_url=\?/);
assert.match(body,/Duplicate publisher contact route merged into canonical opportunity/);
assert.match(body,/surface_type='publisher_contact_route' AND action_url=\? AND surface_slug<>\?/);
assert.match(body,/status NOT IN \('submitted','pending_review','scheduled','live','verified'\)/,'verified or in-flight placements must never be collapsed');

console.log('Synthetic publisher contact routes collapse onto one canonical qualification opportunity per destination.');
