import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Distribution Sender schema is fully migration-owned',()=>{
  const runtime=read('distribution-sender-worker.js');
  const network=read('migrations/0078_distribution_network_engine.sql');
  const content=read('migrations/0103_content_social_intelligence_schema.sql');
  const reputation=read('migrations/0101_outbound_reputation_schema.sql');
  const completion=read('migrations/0106_distribution_sender_schema_completion.sql');

  assert.doesNotMatch(runtime,/CREATE\s+(?:TABLE|INDEX)|ALTER\s+TABLE/i);
  assert.match(runtime,/distribution_sender_network_schema_not_migrated/);
  assert.match(runtime,/distribution_sender_reputation_schema_not_migrated/);
  assert.match(runtime,/source:'d1_migrations'/);

  assert.match(network,/CREATE TABLE IF NOT EXISTS distribution_network_outreach/);
  assert.match(network,/idx_distribution_network_status_priority/);
  assert.match(content,/CREATE TABLE IF NOT EXISTS growth_action_events/);
  assert.match(content,/idx_growth_action_events_opportunity/);
  assert.match(reputation,/CREATE TABLE IF NOT EXISTS outbound_reputation_overrides/);
  assert.match(reputation,/CREATE TABLE IF NOT EXISTS outbound_reputation_learning/);
  assert.match(completion,/CREATE INDEX IF NOT EXISTS idx_reputation_learning_lookup/);
});
