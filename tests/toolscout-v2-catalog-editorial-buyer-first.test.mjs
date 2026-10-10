import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {candidatePage,trustedManufacturerEvidence} from '../catalog-autonomy-worker.js';
import {buildCatalogEditorialRevisionSql} from '../scripts/build-catalog-editorial-revision.mjs';

const source=JSON.parse(fs.readFileSync(new URL('../data/catalog-wave4-decision-ready.json',import.meta.url),'utf8'));
const countWords=s=>s.trim().split(/\s+/).length;

test('published buyer reviews are short, independent and decision-focused, not internal source notes',()=>{
 for(const tool of source){
  const review=tool.editorialReview;
  assert.equal(trustedManufacturerEvidence(tool,{decisionGrade:true}),true,tool.slug+' must retain manufacturer proof');
  assert.ok(countWords(review.summary)>=60&&countWords(review.summary)<=100,tool.slug+' too long or thin');
  assert.ok(countWords(review.buyerCheck)<=40,tool.slug+' buyer check too long');
  assert.doesNotMatch(review.summary,/vendor's detailed|manufacturer(?:'s)? (?:feature|pricing|help|scheduling|documentation)|published US.dollar|source data last checked|first.party documentation|SEO/i);
  assert.doesNotMatch(review.buyerCheck,/using the fees applicable to the buyer's country|evidence|SEO/i);
  assert.match(review.summary,/(cost|trade.off|fees|billing|setup|more specialised)/i,tool.slug+' needs a tradeoff');
  assert.doesNotMatch(candidatePage(tool),/published US.dollar|vendor's detailed scheduling page/i);
  assert.ok(review.sourceUrls.length>=2,'Sources still retained internally');
 }
});

test('editorial D1 revisions are bounded, preserve claims and require exact vendor evidence identity',()=>{
 const sql=buildCatalogEditorialRevisionSql(source);
 assert.equal((sql.match(/UPDATE catalog_runtime_candidates/g)||[]).length,source.length);
 for(const tool of source){
   assert.match(sql,new RegExp('tool_slug='+"'"+tool.slug+"'"));
   assert.ok(sql.includes(tool.editorialReview.sourceUrl),'must require current documented source');
 }
 for(const fragment of [
  "status='published'","source_status='ok'","$.provenance.mode","runtime_trusted_catalog",
  "$.editorialReview.verificationStatus","vendor_documented",
  "$.editorialReview.sourceUrls","$.editorialReview.summary","$.editorialReview.buyerCheck",
  "json_set(profile_json","updated_at=datetime('now')"
 ])assert.ok(sql.includes(fragment),fragment+' missing');
 assert.doesNotMatch(sql,/\b(?:DELETE|DROP|INSERT|REPLACE INTO|UPDATE catalog_runtime_state|SET status|SET source_status)\b/i);
 assert.doesNotMatch(sql,/SET profile_json=(?!json_set)/);
 const bad=structuredClone(source);
 bad[1].editorialReview.summary='Do not transfer published US-dollar charges into another country';
 assert.throws(()=>buildCatalogEditorialRevisionSql(bad),/manufacturer_evidence_missing|reader_quality_hold/);
});
