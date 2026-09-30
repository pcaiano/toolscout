import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('outbound reputation schema is migration-owned',()=>{
  const migration=read('migrations/0101_outbound_reputation_schema.sql');
  assert.match(migration,/CREATE TABLE IF NOT EXISTS outbound_reputation_overrides/);
  assert.match(migration,/override_token TEXT PRIMARY KEY/);
  assert.match(migration,/payload_hash TEXT NOT NULL/);
  assert.match(migration,/status TEXT NOT NULL DEFAULT 'pending'/);
  assert.match(migration,/CREATE TABLE IF NOT EXISTS outbound_reputation_learning/);
  assert.match(migration,/rule_key TEXT PRIMARY KEY/);
  assert.match(migration,/enabled INTEGER NOT NULL DEFAULT 1/);
  assert.match(migration,/source_override_token TEXT/);
});

test('growth Command Center no longer mutates reputation schema during requests',()=>{
  const runtime=read('growth-command-center-v2-worker.js');
  assert.doesNotMatch(runtime,/CREATE\s+(?:TABLE|INDEX)|ALTER\s+TABLE/i);
  assert.match(runtime,/INSERT INTO outbound_reputation_overrides/);
  assert.match(runtime,/INSERT INTO outbound_reputation_learning/);
  assert.match(runtime,/reputation_override_sender_unconfigured/);
  assert.match(runtime,/reputation_override_dispatch_failed/);
});
