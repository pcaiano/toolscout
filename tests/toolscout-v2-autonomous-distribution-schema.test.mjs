import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('autonomous distribution placement schema is migration-owned',()=>{
  const runtime=read('distribution-autonomous-worker.js');
  const migration=read('migrations/0105_autonomous_distribution_placement_schema.sql');

  assert.doesNotMatch(runtime,/CREATE\s+(?:TABLE|INDEX)|ALTER\s+TABLE/i);
  assert.match(runtime,/distribution_placements_schema_not_migrated/);
  assert.match(runtime,/source:'d1_migrations'/);
  assert.match(runtime,/idx_distribution_placements_backlink/);

  assert.match(migration,/CREATE TABLE IF NOT EXISTS distribution_placements/);
  assert.match(migration,/surface_slug TEXT PRIMARY KEY/);
  assert.match(migration,/public_url TEXT NOT NULL/);
  assert.match(migration,/placement_verified INTEGER NOT NULL DEFAULT 0/);
  assert.match(migration,/backlink_verified INTEGER NOT NULL DEFAULT 0/);
  assert.match(migration,/CREATE INDEX IF NOT EXISTS idx_distribution_placements_backlink/);
});
