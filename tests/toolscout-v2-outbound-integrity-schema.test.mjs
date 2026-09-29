import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFileSync(path.join(ROOT,p),'utf8');

test('outbound integrity schema is migration-owned',()=>{
  const runtime=read('outbound-integrity-worker.js');
  assert.doesNotMatch(runtime,/CREATE TABLE|CREATE INDEX|ALTER TABLE/);
  assert.match(runtime,/outbound_integrity_schema_not_migrated/);
  assert.match(runtime,/source:'d1_migrations'/);

  const migration=read('migrations/0094_outbound_integrity_schema.sql');
  assert.match(migration,/CREATE TABLE IF NOT EXISTS verified_outbound_events/);
  assert.match(migration,/CREATE TABLE IF NOT EXISTS outbound_integrity_meta/);
  assert.match(migration,/CREATE INDEX IF NOT EXISTS idx_verified_outbound_created/);
  assert.match(migration,/tracking_started_at/);
  assert.match(migration,/strict_human_tracking_started_at/);
});

test('/go write path remains present after schema migration',()=>{
  const runtime=read('outbound-integrity-worker.js');
  assert.match(runtime,/async function recordVerifiedOutbound/);
  assert.match(runtime,/INSERT OR IGNORE INTO verified_outbound_events/);
  assert.match(runtime,/url\.pathname\.startsWith\('\/go\/'\)/);
});
