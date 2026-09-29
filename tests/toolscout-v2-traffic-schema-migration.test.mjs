import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

const runtimeFiles=[
  'traffic-integrity-worker.js',
  'traffic-integrity-guard-worker.js',
  'command-center-integrity-worker.js'
];

test('traffic integrity schema is migration-owned',()=>{
  for(const file of runtimeFiles){
    const src=read(file);
    assert.doesNotMatch(src,/CREATE TABLE|CREATE INDEX|ALTER TABLE/,file+' reintroduced runtime DDL');
  }
});

test('traffic integrity workers fail closed when migration schema is missing',()=>{
  assert.match(read('traffic-integrity-worker.js'),/traffic_integrity_schema_not_migrated/);
  assert.match(read('traffic-integrity-guard-worker.js'),/traffic_guard_schema_not_migrated/);
  assert.match(read('command-center-integrity-worker.js'),/command_center_optimization_schema_not_migrated/);
});

test('migration 0092 owns the residual traffic and Command Center schema',()=>{
  const migration=read('migrations/0092_traffic_integrity_runtime_schema.sql');
  for(const token of [
    'idx_confirmed_visitor_events_created_visitor',
    'idx_funnel_event_type_created_session',
    'idx_sessions_classification_session',
    'idx_traffic_guard_decision_created_session',
    'idx_traffic_guard_session_decision_created',
    'idx_traffic_guard_suspicious_created',
    'idx_traffic_human_evidence_visitor',
    'command_center_daily_metrics',
    'idx_command_center_daily_updated'
  ])assert.match(migration,new RegExp(token));
});

test('schema probes remain read-only',()=>{
  for(const file of runtimeFiles){
    const src=read(file);
    assert.match(src,/sqlite_master/);
    const ensure=src.match(/async function ensure[A-Za-z]+Schema\(env\)\{[\s\S]*?\n\}/)?.[0]||'';
    assert.doesNotMatch(ensure,/\.run\(|\.batch\(/);
  }
});
