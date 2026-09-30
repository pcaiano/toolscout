import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('visitor accuracy schema is migration-owned',()=>{
  const runtime=read('visitor-accuracy-worker.js');
  const migration=read('migrations/0100_visitor_accuracy_schema.sql');

  assert.doesNotMatch(runtime,/CREATE TABLE|CREATE INDEX|ALTER TABLE/);
  assert.match(runtime,/visitor_accuracy_schema_not_migrated/);
  assert.match(runtime,/source:'d1_migrations'/);
  assert.match(runtime,/ensureVisitorSchema\(env\)/);
  assert.doesNotMatch(runtime,/waitUntil\(ensureVisitorSchema/);

  assert.match(migration,/CREATE TABLE IF NOT EXISTS visitor_events/);
  assert.match(migration,/visitor_id TEXT NOT NULL/);
  assert.match(migration,/source TEXT NOT NULL DEFAULT 'direct'/);
  assert.match(migration,/CREATE INDEX IF NOT EXISTS idx_visitor_events_created_at/);
  assert.match(migration,/CREATE INDEX IF NOT EXISTS idx_visitor_events_visitor_id/);
  assert.match(migration,/CREATE TABLE IF NOT EXISTS visitor_tracking_meta/);
  assert.match(migration,/tracking_started_at/);
});

test('visitor writes and snapshots require migrated schema before D1 access',()=>{
  const runtime=read('visitor-accuracy-worker.js');
  const record=runtime.indexOf('async function recordVisitor');
  const snapshot=runtime.indexOf('async function visitorSnapshot');
  const firstEnsure=runtime.indexOf('await ensureVisitorSchema(env)',record);
  const firstInsert=runtime.indexOf('INSERT INTO visitor_events',record);
  const secondEnsure=runtime.indexOf('await ensureVisitorSchema(env)',snapshot);
  const snapshotQuery=runtime.indexOf('SELECT visitor_id,created_at FROM visitor_events',snapshot);
  assert.ok(record>=0&&firstEnsure>record&&firstInsert>firstEnsure);
  assert.ok(snapshot>=0&&secondEnsure>snapshot&&snapshotQuery>secondEnsure);
});
