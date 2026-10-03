import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const router=fs.readFileSync(new URL('../compute-router-worker.js',import.meta.url),'utf8');
const migration=fs.readFileSync(new URL('../migrations/0110_contact_supply_source_diversification.sql',import.meta.url),'utf8');
const cc=fs.readFileSync(new URL('../command-center-simplified-view.js',import.meta.url),'utf8');

test('Contact Supply keeps multiple official sources per domain with independent backoff',()=>{
  assert.match(migration,/CREATE TABLE IF NOT EXISTS contact_supply_source/);
  assert.match(migration,/UNIQUE INDEX IF NOT EXISTS idx_contact_supply_source_domain_url/);
  assert.match(migration,/vendor_home/);
  assert.match(migration,/diversified_sources_due/);
  assert.match(router,/async function upsertContactSupplySource/);
  assert.match(router,/ON CONFLICT\(domain,source_url\) DO UPDATE/);
  assert.match(router,/source_id=\(\s*SELECT s2\.source_id FROM contact_supply_source s2/);
  assert.match(router,/contact-supply:\$\{row\.domain\}:source:\$\{row\.source_id\}:attempt:/);
  assert.match(router,/status='researching',attempts=attempts\+1/);
});

test('Vendor contact research starts from the official vendor domain, not the ToolScout outreach asset',()=>{
  assert.match(router,/sourceType:'vendor_amplification'.*sourceUrl:\`https:\/\/\$\{domain\}\//s);
  assert.doesNotMatch(router,/sourceType:'vendor_amplification'.*sourceUrl:row\.asset_url/s);
});

test('Per-source results distinguish email, route, exhaustion and transport failure',()=>{
  assert.match(router,/updateContactSupplySourceResult\(env,payload,'email_found'/);
  assert.match(router,/updateContactSupplySourceResult\(env,payload,'route_found'/);
  assert.match(router,/updateContactSupplySourceResult\(env,payload,'exhausted'/);
  assert.match(router,/sourceError==='source_unreachable'\?'unreachable':'retry'/);
  assert.match(router,/WHERE status='researching' AND last_researched_at<datetime\('now','-6 hours'\)/);
});

test('Command Center exposes the diversified source pool without treating sources as sender-ready emails',()=>{
  assert.match(cc,/Contact source pool/);
  assert.match(cc,/official source URLs/);
  assert.match(cc,/exhausted\/backoff/);
});
