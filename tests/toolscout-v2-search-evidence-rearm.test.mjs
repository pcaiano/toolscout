import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const contract=fs.readFileSync(new URL('../growth-execution-contract.js',import.meta.url),'utf8');
const seo=fs.readFileSync(new URL('../seo-execution-runtime.js',import.meta.url),'utf8');
const migration=fs.readFileSync(new URL('../migrations/0114_search_evidence_rearm.sql',import.meta.url),'utf8');

test('verified SEO opportunity tasks rearm only from newer search evidence',()=>{
  assert.match(contract,/const SEO_EVIDENCE_REARM_LIMIT=8/);
  assert.match(contract,/async function rearmSeoTasksForNewEvidence/);
  assert.match(contract,/c\.executor='seo_cloudflare'/);
  assert.match(contract,/c\.subject_type='search'/);
  assert.match(contract,/c\.status='verified'/);
  assert.match(contract,/g\.status='active'/);
  assert.match(contract,/gsc_snapshot_generated_at/);
  assert.match(contract,/last_strict_human_at/);
  assert.match(contract,/datetime\(COALESCE\([\s\S]*\)\) > datetime\(COALESCE\(c\.verified_at,c\.completed_at,c\.updated_at\)\)/);
  assert.match(contract,/ORDER BY c\.priority_score DESC/);
  assert.match(contract,/LIMIT \$\{bounded\}/);
});

test('rearmed SEO tasks clear old proof and become fresh deferred work',()=>{
  assert.match(contract,/status='deferred'.*completed_at=NULL,verified_at=NULL,evidence_json=NULL/s);
  assert.match(contract,/last_result='new_search_evidence_rearmed_v1'/);
  assert.match(contract,/event_type,executor,status,detail/);
  assert.match(contract,/'evidence_rearmed','seo_cloudflare','deferred'/);
  assert.match(contract,/seoEvidenceRearmed:Number\(seoEvidenceRearm\?\.rearmed\|\|0\)/);
});

test('SEO reconciliation requires proof newer than the current execution lifecycle',()=>{
  assert.match(contract,/const proofBoundary=t\.claimed_at\|\|t\.updated_at\|\|t\.created_at/);
  assert.match(contract,/generated>=boundaryAt&&matched/);
  assert.doesNotMatch(contract,/generated>=createdAt&&matched/);
});

test('SEO executor records the canonical GSC or strict-human evidence timestamp',()=>{
  assert.match(seo,/signal\?\.gsc_snapshot_generated_at\|\|signal\?\.last_strict_human_at/);
});

test('production cutover migration mirrors the bounded evidence rearm policy',()=>{
  assert.match(migration,/c\.executor='seo_cloudflare'/);
  assert.match(migration,/c\.subject_type='search'/);
  assert.match(migration,/c\.status='verified'/);
  assert.match(migration,/gsc_snapshot_generated_at/);
  assert.match(migration,/last_strict_human_at/);
  assert.match(migration,/LIMIT 8/);
  assert.match(migration,/last_result='new_search_evidence_rearmed_v1'/);
  assert.match(migration,/verified_at=NULL/);
  assert.match(migration,/evidence_json=NULL/);
});
