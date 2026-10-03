import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {vendorContactRouteBridgePolicy,vendorContactRoutePurpose} from '../compute-router-worker.js';

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
  assert.match(orchestrator,/if\(vendorRouteQualification\|\|machineSafeDirect\|\|unresolvedAuthorityRoute\)actions\.unshift\('autonomous_route_qualification'\)/);
  assert.match(orchestrator,/const backlinkMissing=backlinkAcquisition&&authoritySurface/);
});

test('existing vendor ready routes are backfilled incrementally without reopening generic outreach',()=>{
  assert.match(compute,/async function backfillVendorContactRoutes\(env,limit=24\)/);
  assert.match(compute,/cs\.status='ready_route'/);
  assert.match(compute,/cs\.source_type IN \('vendor_amplification','catalog_vendor'\)/);
  assert.match(compute,/o\.surface_type='vendor_contact_route' AND o\.action_url=cs\.route_url/);
  assert.match(compute,/Math\.min\(40,num\(limit\)\|\|24\)/);
  assert.match(compute,/vendor_contact_route_backfill/);
  assert.match(compute,/backfillVendorContactRoutes\(env,24\)/);
});

test('vendor route semantics accept explicit contact and partnership paths but reject accidental keyword matches',()=>{
  assert.equal(vendorContactRoutePurpose('https://miro.com/partners/solution-partners/'),'partnership');
  assert.equal(vendorContactRoutePurpose('https://www.gorgias.com/tech-partner'),'partnership');
  assert.equal(vendorContactRoutePurpose('https://www.notion.com/contact-sales'),'contact');
  assert.equal(vendorContactRoutePurpose('https://moz.com/about/contact'),'contact');
  assert.equal(vendorContactRoutePurpose('https://clickup.com/press'),'media');
  assert.equal(vendorContactRoutePurpose('https://example.com/submit'),'submission');
  assert.equal(vendorContactRoutePurpose('https://www.descript.com/eye-contact'),null);
  assert.equal(vendorContactRoutePurpose('https://www.typeform.com/contacts-and-automations'),null);
  assert.equal(vendorContactRoutePurpose('https://www.jotform.com/integrations/constant-contact'),null);
  assert.equal(vendorContactRoutePurpose('https://ahrefs.com/web-analytics'),null);
  assert.equal(vendorContactRoutePurpose('https://mailchimp.com/de/integrations/wordpress/'),null);
});

test('semantic mismatches never materialize and are retired from repeated ready-route backfill',()=>{
  const rejected=vendorContactRouteBridgePolicy({
    sourceType:'vendor_amplification',
    domain:'descript.com',
    routeUrl:'https://www.descript.com/eye-contact',
    sourceName:'Descript'
  });
  assert.equal(rejected.eligible,false);
  assert.equal(rejected.reason,'vendor_route_semantic_mismatch');
  assert.match(compute,/status='route_filtered'/);
  assert.match(compute,/vendor_contact_route_filtered/);
  assert.match(compute,/reconcileVendorContactRouteSemanticNoise/);
  assert.match(compute,/vendor_contact_route_semantic_quality/);
  assert.match(compute,/vendor_contact_route_semantic_noise_pruned/);
});

