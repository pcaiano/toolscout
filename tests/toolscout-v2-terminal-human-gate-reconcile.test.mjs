import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const autonomous=fs.readFileSync(new URL('../distribution-autonomous-worker.js',import.meta.url),'utf8');
const migration=fs.readFileSync(new URL('../migrations/0113_phase255_terminal_human_gate_reconcile.sql',import.meta.url),'utf8');

test('terminal Human Gate reconciliation includes verification-pending gates',()=>{
  assert.match(autonomous,/g\.status IN \('open','verification_pending'\)/);
  assert.match(autonomous,/WHERE gate_key=\? AND status IN \('open','verification_pending'\)/);
});

test('Phase 255 migration closes existing terminal Human Gates',()=>{
  assert.match(migration,/status IN \('open','verification_pending'\)/);
  assert.match(migration,/status IN \('submitted','pending_review','scheduled','verified','live','policy_blocked','rejected','skipped','unavailable_free'\)/);
  assert.match(migration,/THEN 'resolved'/);
  assert.match(migration,/ELSE 'cancelled'/);
});
