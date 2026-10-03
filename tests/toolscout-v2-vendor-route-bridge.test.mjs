import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {vendorContactRouteBridgePolicy} from '../compute-router-worker.js';

const compute=fs.readFileSync(new URL('../compute-router-worker.js',import.meta.url),'utf8');
const autonomous=fs.readFileSync(new URL('../distribution-autonomous-worker.js',import.meta.url),'utf8');
const orchestrator=fs.readFileSync(new URL('../distribution-orchestrator-worker.js',import.meta.url),'utf8');

test('vendor contact route bridge only admits external vendor sources',()=>{
  assert.equal(vendorContactRouteBridgePolicy({
    sourceType:'vendor_amplification',
    domain:'notion.so',
    routeUrl:'https://www.notion.so/contact-sales',
    sourceName:'Notion'
  }).eligible,true);
  assert.equal(vendorContactRouteBridgePolicy({
    sourceType:'distribution_surface',
    domain:'notion.so',
    routeUrl:'https://www.notion.so/contact-sales',
    sourceName:'Notion'
  }).eligible,false);
});

test('competitive software discovery businesses are excluded from partnership route bridge',()=>{
  const result=vendorContactRouteBridgePolicy({
    sourceType:'vendor_amplification',
    domain:'bestofai.com',
    routeUrl:'https://bestofai.com/contact',
    sourceName:'Best of AI'
  });
  assert.equal(result.eligible,false);
  assert.match(String(result.reason),/competitive|discovery/i);
});

test('contact supply materializes vendor route as research-only synthetic surface',()=>{
  assert.match(compute,/surface_type,audience_fit,authority,traffic_potential,backlink_value/);
  assert.match(compute,/vendor_contact_route/);
  assert.match(compute,/status='ready_route'/);
  assert.match(compute,/materializeVendorContactRoute/);
  assert.match(compute,/never execute the listing payload unless the route proves exact self-service listing\/submission intent/);
});

test('generic vendor contact routes fail closed before listing adapter discovery',()=>{
  const guard=autonomous.indexOf("vendorContactRoute&&!currentSubmissionIntent");
  const openApi=autonomous.indexOf("const adapter=await findOpenApi",guard);
  assert.ok(guard>=0&&openApi>guard);
  assert.match(autonomous,/vendor_contact_route_requires_partnership_executor/);
  assert.match(autonomous,/do not reuse the listing payload and do not create a generic human gate/);
});

test('Growth Brain qualifies vendor routes but excludes them from backlink authority accounting',()=>{
  assert.match(orchestrator,/const vendorContactRoute=String\(row\.surface_type\|\|''\)==='vendor_contact_route'/);
  assert.match(orchestrator,/const authoritySurface=externalSurface&&!vendorContactRoute/);
  assert.match(orchestrator,/const vendorRouteQualification=acquisitionOpen&&vendorContactRoute/);
  assert.match(orchestrator,/if\(vendorRouteQualification\)actions\.unshift\('autonomous_route_qualification'\)/);
  assert.match(orchestrator,/const backlinkMissing=backlinkAcquisition&&authoritySurface/);
});
