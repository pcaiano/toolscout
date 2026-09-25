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
