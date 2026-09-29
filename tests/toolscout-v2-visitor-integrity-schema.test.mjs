import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const visitor=fs.readFileSync(new URL('../visitor-integrity-worker.js',import.meta.url),'utf8');
const migration=fs.readFileSync(new URL('../migrations/0093_visitor_integrity_schema.sql',import.meta.url),'utf8');

test('visitor integrity runtime no longer owns schema mutation',()=>{
  assert.doesNotMatch(visitor,/CREATE TABLE|CREATE INDEX|ALTER TABLE/);
  const ensure=visitor.slice(visitor.indexOf('async function ensureSchema'),visitor.indexOf('async function guardAllowed'));
  assert.doesNotMatch(ensure,/\.run\(|\.batch\(/);
  assert.match(ensure,/sqlite_master/);
  assert.match(ensure,/visitor_integrity_schema_not_migrated/);
  assert.match(ensure,/session_identity_cleanup_v1/);
  assert.match(ensure,/visitor_registry_backfilled_at/);
});

test('visitor identity migration preserves legacy cleanup and backfill rules',()=>{
  assert.match(migration,/CREATE TABLE IF NOT EXISTS confirmed_visitor_registry/);
  assert.match(migration,/CREATE UNIQUE INDEX IF NOT EXISTS uq_confirmed_visitor_events_session_id/);
  assert.match(migration,/CREATE UNIQUE INDEX IF NOT EXISTS uq_confirmed_visitor_countries_session_id/);
  assert.match(migration,/session_identity_rule','one_session_one_visitor_first_valid_link_wins/);
  assert.match(migration,/WHERE key='session_identity_cleanup_v1'/);
  assert.match(migration,/WHERE key='visitor_registry_backfilled_at'/);
  assert.match(migration,/INSERT OR IGNORE INTO traffic_integrity_meta\(key,value\)\nVALUES\('session_identity_cleanup_v1'/);
  assert.match(migration,/INSERT OR IGNORE INTO traffic_integrity_meta\(key,value\)\nVALUES\('visitor_registry_backfilled_at'/);
});
