import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {trustedManufacturerEvidence,unpublishedReadyCatalogSlugs,candidatePage} from '../catalog-autonomy-worker.js';
import {hasManufacturerDecisionClaim,structuralCatalogIssues} from '../catalog-quality-runtime.js';

const read=path=>JSON.parse(fs.readFileSync(new URL('../'+path,import.meta.url),'utf8'));
const cohort=read('data/catalog-wave6-decision-ready.json'),baseline=read('data/tools.json'),engine=read('data/catalog-engine.json');
test('wave 6 contains distinct first-party documented full catalog peers, not research-only seeds',()=>{
 assert.equal(cohort.length,8);
 const original=new Set(baseline.map(x=>x.slug));
 const seen=new Set();
 assert.ok(engine.trustedCandidateFiles.includes('data/catalog-wave6-decision-ready.json'));
 for(const t of cohort){
  assert.ok(!seen.has(t.slug)&&!original.has(t.slug),t.slug+' duplicate');
  seen.add(t.slug);
  assert.equal(trustedManufacturerEvidence(t,{decisionGrade:true}),true,t.slug+' insufficient official manufacturer evidence');
  assert.equal(hasManufacturerDecisionClaim(t),true,t.slug+' no verified decision capability');
  assert.deepEqual(structuralCatalogIssues(t),[],t.slug+' missing quality fields');
  assert.ok(t.editorialReview.summary.length>=260);
  assert.ok(t.editorialReview.buyerCheck.length>=60);
  assert.ok(t.editorialReview.sourceUrls.length>=2);
  assert.ok(t.decisionClaims.length>=3);
  assert.equal(t.aiIntegration.status,'unverified');
  assert.equal(t.rankingEligible,true);
  assert.equal(t.comparisonEligible,true);
  assert.equal(t.freePlanKnown,false,'No imaginary perpetual free plan');
  const publicHtml=candidatePage(t,{monetized:false});
  assert.match(publicHtml,new RegExp('href="/go/'+t.slug+'"'),'Every new tool has tracked manufacturer outbound');
  assert.match(publicHtml,/data-commercial-status="non-affiliate"/);
  assert.doesNotMatch(publicHtml,/rel="nofollow sponsored/);
  for(const vendorDoc of t.editorialReview.sourceUrls)assert.ok(!publicHtml.includes(vendorDoc),'private first-party documentation leaked: '+t.slug);
 }
});
test('existing catalog automation immediately recognizes all eight verified candidates as actionable supply',()=>{
 const baselineSlugs=baseline.map(x=>x.slug);
 assert.deepEqual(unpublishedReadyCatalogSlugs([cohort],baselineSlugs).sort(),
  cohort.map(x=>x.slug).sort());
 assert.deepEqual(unpublishedReadyCatalogSlugs([cohort],[...baselineSlugs,...cohort.map(x=>x.slug)]),[]);
});
