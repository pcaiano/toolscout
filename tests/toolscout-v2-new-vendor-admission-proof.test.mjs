import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {hasManufacturerDecisionClaim} from '../catalog-quality-runtime.js';
import {trustedManufacturerEvidence} from '../catalog-autonomy-worker.js';

const all=JSON.parse(fs.readFileSync(new URL('../data/tools.json',import.meta.url),'utf8'));
const documented=all.find(tool=>tool.slug==='systeme-io');
assert.ok(documented,'documented manufacturer corpus fixture missing');

test('existing documented manufacturer claims meet the admission-level evidence standard',()=>{
 assert.equal(hasManufacturerDecisionClaim(documented),true);
 assert.equal(trustedManufacturerEvidence(documented,{decisionGrade:true}),true);
});
test('a vendor with a long attractive review but no supported decision claim cannot enter a decision catalog',()=>{
 const noClaims={...structuredClone(documented),decisionClaims:[]};
 assert.equal(hasManufacturerDecisionClaim(noClaims),false);
 assert.equal(trustedManufacturerEvidence(noClaims,{decisionGrade:true}),false);
});
test('manufacturer decision evidence must be sourced, dated, first-party and verified',()=>{
 const baseline=structuredClone(documented);
 const claim=baseline.decisionClaims.find(c=>c.status==='verified'&&c.type&&c.value&&c.sourceUrl);
 assert.ok(claim);
 const invalids=[
   {...claim,status:'unknown'},
   {...claim,verifiedAt:'n/a'},
   {...claim,sourceUrl:'https://fake-review-site.example/pricing'},
   {...claim,sourceUrl:'https://systeme.io/'},
   {...claim,sourceUrl:'javascript:alert(1)'},
   {...claim,type:''},
   {...claim,value:''}
 ];
 for(const invalid of invalids){
   const sample={...baseline,decisionClaims:[invalid]};
   assert.equal(hasManufacturerDecisionClaim(sample),false,'invalid decision claim unexpectedly admitted: '+JSON.stringify(invalid));
   assert.equal(trustedManufacturerEvidence(sample,{decisionGrade:true}),false);
 }
});
test('manufacturer-researched candidate seeds with no verified claims remain internal only',()=>{
 const seeds=JSON.parse(fs.readFileSync(new URL('../data/catalog-research-seeds.json',import.meta.url),'utf8'));
 assert.ok(seeds.candidates.length>=9);
 assert.ok(seeds.candidates.every(seed=>!hasManufacturerDecisionClaim(seed)));
 const src=fs.readFileSync(new URL('../catalog-gap-runtime-worker.js',import.meta.url),'utf8');
 assert.match(src,/hasManufacturerDecisionClaim\(hint\)/);
 const config=JSON.parse(fs.readFileSync(new URL('../data/catalog-engine.json',import.meta.url),'utf8'));
 assert.equal(config.admission.requireDecisionGradeManufacturerDocumentation,true);
 assert.equal(config.admission.minimumIndependentDocumentPages,2);
});
