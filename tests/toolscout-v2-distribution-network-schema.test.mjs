import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Distribution Network route schema is migration-owned',()=>{
  const m78=read('migrations/0078_distribution_network_engine.sql');
  const m103=read('migrations/0103_content_social_intelligence_schema.sql');
  const m104=read('migrations/0104_distribution_network_route_schema.sql');
  assert.match(m78,/CREATE TABLE IF NOT EXISTS distribution_network_outreach/);
  assert.match(m103,/CREATE TABLE IF NOT EXISTS distribution_contact_route_actions/);
  assert.match(m104,/CREATE TABLE IF NOT EXISTS distribution_contact_routes/);
  assert.match(m104,/idx_distribution_contact_routes_surface/);
  assert.match(m104,/idx_distribution_contact_routes_domain/);
  assert.match(m104,/idx_distribution_contact_route_actions_status/);
  assert.match(m104,/idx_distribution_contact_route_actions_surface/);
});

test('Distribution Network runtime no longer mutates schema',()=>{
  const runtime=read('distribution-network-worker.js');
  assert.doesNotMatch(runtime,/CREATE\s+(?:TABLE|INDEX)|ALTER\s+TABLE/i);
  assert.match(runtime,/async function ensureSchema\(_env\)\{return true;\}/);
});
