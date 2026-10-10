import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {trustedManufacturerEvidence} from '../catalog-autonomy-worker.js';
import {structuralCatalogIssues} from '../catalog-quality-runtime.js';

const runtime=fs.readFileSync(new URL('../catalog-autonomy-worker.js',import.meta.url),'utf8');
const cohort=JSON.parse(fs.readFileSync(new URL('../data/catalog-wave6-decision-ready.json',import.meta.url),'utf8'));
const engine=JSON.parse(fs.readFileSync(new URL('../data/catalog-engine.json',import.meta.url),'utf8'));

test('hourly admission handles at least one full documented cohort without weakening gates',()=>{
 assert.match(runtime,/MAX_ADMIT_PER_DAY=24/);
 assert.match(runtime,/MAX_CANDIDATE_CHECKS_PER_CYCLE=32/);
 assert.match(runtime,/if\(!trustedManufacturerEvidence\(raw,\{decisionGrade:true\}\)\)/);
 assert.match(runtime,/source\.status!=='ok'/);
 assert.match(runtime,/if\(!quality\.publishable\)/);
 assert.match(runtime,/source_status='ok'/);
 assert.ok(engine.trustedCandidateFiles.includes('data/catalog-wave6-decision-ready.json'));
});

test('wave six supplies eight distinct eligible manufacturer-documented vendor records',()=>{
 assert.equal(cohort.length,8);
 assert.equal(new Set(cohort.map(t=>t.slug)).size,cohort.length);
 for(const tool of cohort){
  assert.equal(trustedManufacturerEvidence(tool,{decisionGrade:true}),true,tool.slug+' lacks first-party proof');
  assert.deepEqual(structuralCatalogIssues(tool),[],tool.slug+' lacks full catalog parity');
 }
});
