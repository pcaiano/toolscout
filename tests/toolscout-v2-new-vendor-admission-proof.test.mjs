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

test('admission cannot be based on expired, future or impossible-dated evidence',()=>{
 const sample=structuredClone(documented);
 const claim=sample.decisionClaims.find(c=>c.status==='verified');
 assert.ok(claim);
 for(const date of ['2024-01-01','2099-01-01','2026-02-30','not-a-date']){
   const invalid={...sample,decisionClaims:[{...claim,verifiedAt:date}]};
   assert.equal(hasManufacturerDecisionClaim(invalid),false,date);
   assert.equal(trustedManufacturerEvidence(invalid,{decisionGrade:true}),false,date);
 }
});
test('admission accepts only fields actually usable by the decision qualifier',()=>{
 const sample=structuredClone(documented);
 const claim=sample.decisionClaims.find(c=>c.type==='plan_limit');
 assert.ok(claim);
 const invalids=[
   {...claim,type:'made_up_product_claim'},
   {...claim,unit:'contacts',scope:undefined},
   {...claim,period:undefined},
   {...claim,plan:undefined},
   {...claim,quantity:0},
   {...claim,quantity:-7},
   {...claim,quantity:'100'},
   {...claim,type:'price_quote',amount:10,chargeAmount:10,currency:'EUR',
     billingCycle:'monthly',unit:'seat',unitQuantity:5,market:'unspecified',
     taxStatus:'unknown'}
 ];
 for(const candidate of invalids){
   const item={...sample,decisionClaims:[candidate]};
   assert.equal(hasManufacturerDecisionClaim(item),false,JSON.stringify(candidate));
   assert.equal(trustedManufacturerEvidence(item,{decisionGrade:true}),false);
 }
});
test('catalog growth cannot short-circuit source review with scores alone',()=>{
 const source=fs.readFileSync(new URL('../catalog-gap-runtime-worker.js',import.meta.url),'utf8');
 assert.match(source,/function isFullParityProfile\\(p\\)/);
 assert.match(source,/p\\.editorialReview\\?\\.verificationStatus==='vendor_documented'&&hasManufacturerDecisionClaim\\(p\\)/);
});
