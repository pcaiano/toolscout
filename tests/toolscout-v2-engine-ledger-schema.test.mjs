import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFileSync(path.join(ROOT,p),'utf8');

test('engine run ledger schema is migration-owned',()=>{
  const runtime=read('engine-run-ledger.js');
  const ensure=runtime.slice(
    runtime.indexOf('export async function ensureEngineRunSchema'),
    runtime.indexOf('async function acquireMissionCycleClaim')
  );
  assert.doesNotMatch(ensure,/CREATE TABLE|CREATE INDEX|ALTER TABLE|\.run\(|\.batch\(/);
  assert.match(ensure,/engine_run_ledger_schema_not_migrated/);
  assert.match(ensure,/source:'d1_migrations'/);

  const migration=read('migrations/0095_engine_run_ledger_schema.sql');
  assert.match(migration,/CREATE TABLE IF NOT EXISTS engine_runs/);
  assert.match(migration,/CREATE TABLE IF NOT EXISTS engine_run_leases/);
  assert.match(migration,/CREATE TABLE IF NOT EXISTS engine_cycle_claims/);
  assert.match(migration,/idx_engine_runs_engine_started/);
  assert.match(migration,/idx_engine_cycle_claims_updated/);
});

test('engine ledger operational writes remain explicit outside schema probe',()=>{
  const runtime=read('engine-run-ledger.js');
  assert.match(runtime,/INSERT INTO engine_runs/);
  assert.match(runtime,/INSERT OR IGNORE INTO engine_run_leases/);
  assert.match(runtime,/INSERT OR IGNORE INTO engine_cycle_claims/);
});
