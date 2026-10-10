import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {trustedManufacturerEvidence,candidatePage,unpublishedReadyCatalogSlugs} from '../catalog-autonomy-worker.js';
import {hasManufacturerDecisionClaim,structuralCatalogIssues} from '../catalog-quality-runtime.js';
const tools=JSON.parse(fs.readFileSync(new URL('../data/catalog-wave4-decision-ready.json',import.meta.url),'utf8'));
const original=JSON.parse(fs.readFileSync(new URL('../data/tools.json',import.meta.url),'utf8'));
const engine=JSON.parse(fs.readFileSync(new URL('../data/catalog-engine.json',import.meta.url),'utf8'));
test('catalog cohort supplies distinct new vendor-documented tools for canonical D1 runtime admission',()=>{
 assert.equal(tools.length,3);
 assert.deepEqual([...new Set(tools.map(t=>t.slug))].sort(),['bqe-core','clio-manage','fresha']);
 assert.ok(engine.trustedCandidateFiles.includes('data/catalog-wave4-decision-ready.json'));
 for(const tool of tools){
   assert.equal(original.some(x=>x.slug===tool.slug),false,'new cohort is not a duplicate of the original 127');
   assert.equal(trustedManufacturerEvidence(tool,{decisionGrade:true}),true,tool.slug);
   assert.equal(hasManufacturerDecisionClaim(tool),true,tool.slug);
   assert.deepEqual(structuralCatalogIssues(tool),[],tool.slug);
   assert.equal(tool.editorialReview.verificationStatus,'vendor_documented');
   assert.ok(tool.editorialReview.summary.length>=260);
   assert.ok(tool.editorialReview.buyerCheck.length>=60);
   assert.ok(tool.editorialReview.sourceUrls.length>=2);
   assert.ok(tool.decisionClaims.length>=3);
   assert.equal(tool.freePlanKnown,false,'a trial cannot be silently promoted to perpetual Free');
   assert.equal(tool.aiIntegration.status,'unverified','invented named assistant support is forbidden');
   assert.equal(tool.rankingEligible,true);
   assert.equal(tool.comparisonEligible,true);
 }
});
test('dynamic catalog profiles use one dark ToolScout 2.0 navigation shell and never publish manufacturer sources',()=>{
 for(const tool of tools){
   const html=candidatePage(tool);
   assert.equal((html.match(/class="global"/g)||[]).length,1,tool.slug);
   assert.equal((html.match(/aria-label="Site navigation"/g)||[]).length,1);
   assert.match(html,/background:#0b0d0c/);
   assert.match(html,/href="\/compare\.html\?a=/);
   assert.match(html,/href="\/tools"/);
   assert.match(html,new RegExp('<h1>'+tool.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'</h1>'));
   assert.doesNotMatch(html,/<h1>[^<]*profile/i);
   assert.doesNotMatch(html,/Free plan recorded: Unknown|not yet verified the current free-plan position/i);
   assert.doesNotMatch(html,/href="https:\/\/[^"]*\/features\//i);
   for(const document of tool.editorialReview.sourceUrls)assert.ok(!html.includes(document),tool.slug+' vendor research URL leaked');
 }
});
test('new profiles never advertise an unmonetized product visit; eligible routes remain internal /go links',()=>{
 for(const tool of tools){
   const normal=candidatePage(tool,{monetized:false});
   assert.doesNotMatch(normal,/href="\/go\//,'No commercial approval => no Visit button');
   assert.match(normal,/Add to comparator/);
   const approved=candidatePage(tool,{monetized:true});
   assert.match(approved,new RegExp('href="/go/'+tool.slug+'"'));
   assert.match(approved,/rel="nofollow sponsored noopener"/);
   assert.match(approved,/target="_blank"/);
   assert.doesNotMatch(approved,/href="https:\/\/www\.(clio|fresha|bqe)\.com/i);
 }
});

test('hourly supply signal wakes only for first-party complete new vendor cohorts',()=>{
 const existing=original.map(t=>t.slug);
 const ready=unpublishedReadyCatalogSlugs([tools],existing);
 assert.deepEqual(ready.sort(),['bqe-core','clio-manage','fresha']);
 assert.deepEqual(unpublishedReadyCatalogSlugs([tools],[...existing,...ready]),[],
   'published canonical D1 slugs must not reactivate hourly admission');
 const research=JSON.parse(fs.readFileSync(new URL('../data/catalog-research-seeds.json',import.meta.url),'utf8'));
 assert.deepEqual(unpublishedReadyCatalogSlugs([research.candidates],existing),[],
   'research seed URLs are never a publication trigger');
 assert.deepEqual(unpublishedReadyCatalogSlugs([tools,tools],existing).sort(),ready,
   'duplicate trusted files must not trigger duplicate vendor admissions');
 const scheduler=fs.readFileSync(new URL('../growth-scheduler.js',import.meta.url),'utf8');
 assert.match(scheduler,/hasNewDecisionGradeCatalogSupply\(env\)/);
 assert.match(scheduler,/recoverCoverage\|\|newCandidateSupply/);
 assert.match(scheduler,/admitTrustedCandidates\(env\)/);
});
