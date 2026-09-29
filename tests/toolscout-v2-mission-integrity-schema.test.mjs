import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const worker=fs.readFileSync(new URL('../mission-integrity-worker.js',import.meta.url),'utf8');
const migration88=fs.readFileSync(new URL('../migrations/0088_mission_integrity_schema.sql',import.meta.url),'utf8');
const migration94=fs.readFileSync(new URL('../migrations/0094_mission_integrity_schema_completion.sql',import.meta.url),'utf8');

test('mission integrity runtime no longer owns schema mutation',()=>{
  assert.doesNotMatch(worker,/CREATE TABLE|CREATE INDEX|ALTER TABLE/);
  const ensure=worker.slice(worker.indexOf('async function ensureSchema'),worker.indexOf('function safe('));
  assert.doesNotMatch(ensure,/\.run\(|\.batch\(/);
  assert.match(ensure,/sqlite_master/);
  assert.match(ensure,/mission_integrity_schema_not_migrated/);
  assert.match(ensure,/idx_external_engine_evidence_engine_mission/);
  assert.match(ensure,/idx_external_engine_evidence_created/);
});

test('mission integrity schema is fully migration-owned',()=>{
  assert.match(migration88,/CREATE TABLE IF NOT EXISTS external_engine_evidence/);
  assert.match(migration88,/CREATE INDEX IF NOT EXISTS idx_external_engine_evidence_engine_mission/);
  assert.match(migration94,/CREATE INDEX IF NOT EXISTS idx_external_engine_evidence_created/);
});
