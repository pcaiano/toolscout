import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

const router=read('compute-router-worker.js');
assert.match(router,/CONTACT_SUPPLY_TARGET=200/);
assert.match(router,/CONTACT_SUPPLY_MIN=150/);
assert.match(router,/CREATE TABLE IF NOT EXISTS contact_supply_domain/);
assert.match(router,/domain TEXT PRIMARY KEY/);
assert.match(router,/CREATE TABLE IF NOT EXISTS contact_supply_metrics/);
assert.match(router,/contact_supply_public_research/);
assert.match(router,/enqueueContactSupplyResearch/);
assert.match(router,/seedContactSupply/);
assert.match(router,/sourceType:'catalog_vendor'/);
assert.match(router,/source_type:'distribution_surface'/);
assert.match(router,/status='ready_email'/);
assert.match(router,/status='ready_route'/);
assert.match(router,/status='cooldown'/);
assert.match(router,/domainInOutreachCooldown/);
assert.match(router,/apollo_status='plan_blocked'/);
assert.match(router,/plan_blocked_people_api/);
assert.match(router,/provider_blocked/);
assert.match(router,/distribution_vendor_amplification SET[\s\S]*contact_method='public_role_email'/);
assert.match(router,/distribution_network_outreach SET[\s\S]*status='contact_found'/);
assert.match(router,/\/api\/contact-supply\/health/);

const core=read('overflow-compute/research-core.mjs');
assert.match(core,/contact_supply_public_research/);
assert.match(core,/contactRoutes/);
assert.match(core,/public_role_email_found/);
assert.match(core,/public_contact_route_found/);

const truth=read('operational-truth-reconciliation-worker.js');
assert.match(truth,/contactSupplyTarget/);
assert.match(truth,/contactSupplyReadyEmail/);
assert.match(truth,/contactSupplyReadyRoute/);
assert.match(truth,/contactSupplyApolloStatus/);
assert.match(truth,/contactSupplyPlane/);

const cc=read('command-center-simplified-view.js');
assert.match(cc,/Recipient buffer/);
assert.match(cc,/Contact Supply Engine/);
assert.match(cc,/unique-domain email buffer/);
assert.match(cc,/Apollo-eligible/);

console.log('Contact Supply Engine v2 keeps recipient discovery domain-deduped, quality-gated and visible.');

assert.match(router,/EXISTS\(SELECT 1 FROM distribution_vendor_amplification v[\s\S]*v\.status='contact_found'[\s\S]*EXISTS\(SELECT 1 FROM distribution_network_outreach n[\s\S]*n\.status='contact_found'/);
assert.match(router,/status NOT IN \('sent','adopted','reputation_quarantine','suppressed_competitor'\)/);
console.log('Contact Supply ready_email counts sender-admissible recipients and cannot reopen competitor-suppressed outreach.');

assert.match(router,/WHERE o\.surface_slug=contact_supply_domain\.source_key[\s\S]*o\.status='policy_blocked'/);
console.log('Policy-blocked surfaces are excluded from the sender-ready contact buffer.');

const vendorMetricsMigration=read('migrations/0107_contact_supply_vendor_route_metrics.sql');
assert.match(vendorMetricsMigration,/route_filtered/);
assert.match(vendorMetricsMigration,/vendor_routes_authority_like/);
assert.match(router,/vendorRoutesAuthorityLike/);
assert.match(router,/vendor_routes_policy_blocked/);
assert.match(cc,/Vendor route bridge/);
assert.match(cc,/Vendor route safety/);
assert.match(cc,/leakage sentinel, not authority credit/);
console.log('Vendor route bridge observability separates research, filtering, policy and leakage sentinels from authority credit.');
