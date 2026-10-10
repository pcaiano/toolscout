import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {FUNNEL_EVENT_TYPES,parseFunnelEvent,rate} from '../funnel-model.js';
import {trustedManufacturerEvidence} from '../catalog-autonomy-worker.js';
const load=path=>JSON.parse(fs.readFileSync(new URL('../'+path,import.meta.url),'utf8'));
const catalog=load('data/tools.json'),seed=load('data/catalog-research-seeds.json');
test('research supply contains new, real first-party manufacturer leads, not published tools',()=>{
 const existing=new Set(catalog.map(x=>x.slug));
 const unique=new Set();
 assert.ok(seed.candidates.length>=9);
 assert.ok(new Set(seed.candidates.map(x=>x.industry)).size>=5);
 for(const c of seed.candidates){
  assert.ok(/^[a-z0-9-]+$/.test(c.slug),c.slug);
  assert.ok(!existing.has(c.slug),'already in published catalog: '+c.slug);
  assert.ok(!unique.has(c.slug),'duplicate research candidate: '+c.slug);
  unique.add(c.slug);
  assert.equal(c.reviewStatus,'source_urls_identified_editorial_pending');
  assert.equal(c.decisionClaimsStatus,'not_verified');
  assert.equal(c.affiliateRouteStatus,'not_verified');
  assert.ok(/^https:\/\//.test(c.home));
  assert.ok(Array.isArray(c.documentation)&&new Set(c.documentation).size>=2);
  assert.equal(trustedManufacturerEvidence(c,{decisionGrade:true}),false,'research seed cannot qualify for admission');
 }
});
test('fully documented future admissions retain review object and preflight before manufacturer HTTP calls',()=>{
 const s=fs.readFileSync(new URL('../catalog-autonomy-worker.js',import.meta.url),'utf8');
 const preflight=s.indexOf("if(!trustedManufacturerEvidence(raw,{decisionGrade:true}))");
 const firstFetch=s.indexOf("const source=await fetchTrustedCandidateOfficialSource(raw)",preflight);
 assert.match(s,/fetchTrustedCandidateOfficialSource\(candidate\)/);
 assert.match(s,/trustedCandidateOfficialFallbackUrls\(candidate\)/);
 assert.ok(preflight>0&&firstFetch>preflight,'manufacturer evidence preflight must precede external fetch');
 assert.match(s,/profile\.editorialReview=\{\.\.\.raw\.editorialReview\}/);
 assert.doesNotMatch(s,/profile\.editorialReview=raw\.editorialReview\.summary/);
 assert.match(s,/ready_trusted_sources/);
 assert.match(s,/research_seeds_total/);
 assert.match(s,/candidate_supply_status/);
 assert.match(s,/MAX_ADMIT_PER_DAY=6/);
 assert.match(s,/MAX_CANDIDATE_CHECKS_PER_CYCLE=12/);
});
test('candidate research is never a substitute for two documentary source pages or affiliate route verification',()=>{
 const config=load('data/catalog-engine.json');
 assert.equal(config.admission.requireDecisionGradeManufacturerDocumentation,true);
 assert.equal(config.admission.minimumIndependentDocumentPages,2);
 assert.equal(config.principles.affiliateEconomicsNeverAffectEditorialSelection,true);
 assert.equal(config.admission.requireResolvedVisualAssetBeforePublication,undefined);
 const src=fs.readFileSync(new URL('../catalog-autonomy-worker.js',import.meta.url),'utf8');
 assert.ok(src.includes("priority_policy:'documented_first_then_category_coverage_then_affiliate_ai_research'"));
});
const example={event_id:'evt_1234567890abcdef',session_id:'00000000-0000-4000-8000-000000000001',event_type:'business_workflow_viewed',intent_slug:'marketing-agencies',path:'/',source:'ai-agent',referrer_host:null};
test('distinct industry exploration events accepted by original first-party funnel ledger',()=>{
 for(const event_type of ['business_workflow_viewed','business_workflow_selected']){
  assert.ok(FUNNEL_EVENT_TYPES.has(event_type));
  assert.equal(parseFunnelEvent({...example,event_type})?.event_type,event_type);
 }
 assert.equal(parseFunnelEvent({...example,event_type:'industry_closed_deal'}),null);
 assert.equal(rate(3,6),50);
 assert.equal(rate(0,0),null);
});
test('a viewed business guide is not misreported as a failed or completed vendor recommendation',()=>{
 const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const funnel=fs.readFileSync(new URL('../funnel-worker.js',import.meta.url),'utf8');
 assert.match(app,/trackFunnel\('business_workflow_viewed'/);
 assert.match(app,/trackFunnel\('business_workflow_selected'/);
 assert.match(app,/trackFunnel\('recommendation_started',\{intent_slug:'business-workflow-selected'\}\)/);
 assert.doesNotMatch(app,/trackFunnel\('recommendation_unresolved',\{intent_slug:'business-workflow-guidance'\}\)/);
 assert.match(funnel,/businessWorkflowViews:workflowViews/);
 assert.match(funnel,/businessWorkflowSelectionRate:rate\(workflowSelections,workflowViews\)/);
});

test('runtime software profiles never publish raw manufacturer AI documentation links',()=>{
 const src=fs.readFileSync(new URL('../catalog-autonomy-worker.js',import.meta.url),'utf8');
 assert.doesNotMatch(src,/Official AI source/);
 assert.doesNotMatch(src,/const links=\(p\.sources/);
 assert.match(src,/Manufacturer documentation is private editorial evidence/);
 assert.match(src,/AI integration reviewed against manufacturer documentation internally/);
});
