import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('affiliate reply ingestion schema is migration-owned',()=>{
  const migration=read('migrations/0102_affiliate_reply_schema.sql');
  assert.match(migration,/CREATE TABLE IF NOT EXISTS affiliate_reply_events/);
  assert.match(migration,/message_id TEXT PRIMARY KEY/);
  assert.match(migration,/status TEXT NOT NULL/);
  assert.match(migration,/processed_at TEXT NOT NULL DEFAULT \(datetime\('now'\)\)/);
});

test('affiliate coverage runtime no longer creates schema during requests',()=>{
  const runtime=read('affiliate-coverage-entry-worker.js');
  assert.doesNotMatch(runtime,/CREATE\s+(?:TABLE|INDEX)|ALTER\s+TABLE/i);
  assert.match(runtime,/INSERT INTO affiliate_reply_events/);
  assert.match(runtime,/SELECT message_id,status FROM affiliate_reply_events/);
});
