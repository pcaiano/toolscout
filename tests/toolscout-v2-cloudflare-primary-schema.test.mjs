import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Cloudflare primary growth asset cache schema is migration-owned',()=>{
  const runtime=read('cloudflare-primary-runtime-worker.js');
  const migration=read('migrations/0098_growth_asset_cache_schema.sql');

  assert.doesNotMatch(runtime,/CREATE TABLE|CREATE INDEX|ALTER TABLE/);
  assert.match(runtime,/growth_asset_cache_schema_not_migrated/);
  assert.match(runtime,/source:'d1_migrations'/);
  assert.match(runtime,/await ensureGscCache\(env\)/);
  assert.match(migration,/CREATE TABLE IF NOT EXISTS growth_asset_cache/);
  assert.match(migration,/path TEXT PRIMARY KEY/);
  assert.match(migration,/payload_json TEXT NOT NULL/);
  assert.match(migration,/source_generated_at TEXT/);
  assert.match(migration,/cached_at TEXT NOT NULL DEFAULT/);
  assert.match(migration,/updated_at TEXT NOT NULL DEFAULT/);
});
