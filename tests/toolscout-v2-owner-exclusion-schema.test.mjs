import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('owner retrospective audit schema is migration-owned',()=>{
  const runtime=read('owner-exclusion-worker.js');
  const migration=read('migrations/0099_owner_retrospective_audits_schema.sql');
  assert.doesNotMatch(runtime,/CREATE TABLE|CREATE INDEX|ALTER TABLE/);
  assert.match(runtime,/owner_retrospective_audits_schema_not_migrated/);
  assert.match(runtime,/source:'d1_migrations'/);
  assert.match(runtime,/await ensureOwnerAuditSchema\(env\)/);
  assert.match(migration,/CREATE TABLE IF NOT EXISTS owner_retrospective_audits/);
  assert.match(migration,/audit_key TEXT PRIMARY KEY/);
  assert.match(migration,/visitor_hash TEXT NOT NULL/);
  assert.match(migration,/details_json TEXT NOT NULL/);
  assert.match(migration,/audited_at TEXT NOT NULL DEFAULT/);
});
