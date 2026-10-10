import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {trustedManufacturerEvidence,unpublishedReadyCatalogSlugs,candidatePage} from '../catalog-autonomy-worker.js';
import {hasManufacturerDecisionClaim,structuralCatalogIssues} from '../catalog-quality-runtime.js';
import {verifiedPmsCandidates,businessWorkflowGuidance} from '../business-workflow-intent.js';
import {qualifiedSoftwareDecisionShortlist} from '../agent-protocol-core-worker.js';
import {transformPublicRedesignResponse} from '../public-redesign-runtime.js';

const load=path=>JSON.parse(fs.readFileSync(new URL('../'+path,import.meta.url),'utf8'));
const tools=load('data/catalog-wave5-decision-ready.json');
const engine=load('data/catalog-engine.json');
const baseline=load('data/tools.json');
const slugs=['ezyvet','guesty','hostaway','lodgify','square-for-restaurants','toast-pos'];

test('wave5 has six independently documented sector decision records with real admission and publisher quality',()=>{
 assert.deepEqual(tools.map(x=>x.slug).sort(),slugs);
 assert.ok(engine.trustedCandidateFiles.includes('data/catalog-wave5-decision-ready.json'));
 assert.ok(engine.admission.allowedCatalogCategories.includes('vacation-rental'));
 const summaries=new Set(),proofs=new Set();
 for(const tool of tools){
  assert.ok(!baseline.some(t=>t.slug===tool.slug),tool.slug+' duplicates legacy catalog');
  assert.equal(trustedManufacturerEvidence(tool,{decisionGrade:true}),true,tool.slug+' lacks decision-grade primary docs');
  assert.equal(hasManufacturerDecisionClaim(tool),true,tool.slug+' lacks manufacturer-confirmed capability');
  assert.deepEqual(structuralCatalogIssues(tool),[],tool.slug+' has structurally incomplete evidence');
  assert.ok(tool.editorialReview.summary.trim().split(/\s+/).length>=65);
  assert.ok(tool.editorialReview.summary.trim().split(/\s+/).length<=105);
  assert.ok(tool.editorialReview.sourceUrls.length>=2);
  assert.ok(tool.decisionClaims.length>=3);
  assert.ok(tool.strengths.length>=2&&tool.limitations.length>=2&&tool.tradeoffs.length>=1);
  assert.equal(tool.freePlanKnown,false,'Free tiers must not be inferred');
  assert.equal(tool.aiIntegration.status,'unverified','No claimed ChatGPT/Claude links without proof');
  assert.equal(tool.rankingEligible,true);
  assert.equal(tool.comparisonEligible,true);
  assert.ok(!summaries.has(tool.editorialReview.summary));
  summaries.add(tool.editorialReview.summary);
  for(const e of tool.evidence)proofs.add(e.sourceUrl);
 }
 assert.ok(proofs.size>=12,'Two independently reviewed first-party pages per manufacturer');
});
test('a documented rental PMS is eligible only with channel AND reservation management first-party claims',()=>{
 const rental=tools.filter(t=>t.category==='vacation-rental');
 assert.equal(rental.length,3);
 assert.deepEqual(verifiedPmsCandidates(tools).map(t=>t.slug).sort(),['guesty','hostaway','lodgify']);
 for(const tool of rental){
  assert.ok(tool.decisionClaims.some(c=>c.value==='channel management'&&c.status==='verified'));
  assert.ok(tool.decisionClaims.some(c=>c.value==='reservation management'&&c.status==='verified'));
  const without=structuredClone(tool);
  without.decisionClaims=without.decisionClaims.filter(c=>c.value!=='reservation management');
  assert.deepEqual(verifiedPmsCandidates([without]),[],tool.slug+' cannot qualify on channel management alone');
 }
 assert.equal(businessWorkflowGuidance('best software to run an Airbnb vacation rental business',{},tools),null,
   'documented PMS category should be actionable, not pretend there is no specialist inventory');
 const shortlist=qualifiedSoftwareDecisionShortlist(tools,{job:'vacation rental management software',limit:5});
 assert.ok(shortlist.length>=2,'rental buyer should see comparable documented alternatives');
 assert.ok(shortlist.every(x=>rental.some(y=>y.slug===x.slug)),'cross-category tools cannot become rental PMS');
 assert.ok(shortlist.every(x=>x.profile_url.startsWith('https://trytoolscout.org/tools/')));
});
test('restaurants and veterinary clinics are not ranked or compared as generic project management',()=>{
 const restaurant=tools.filter(t=>t.category==='restaurant-pos');
 const vets=tools.filter(t=>t.category==='veterinary');
 assert.deepEqual(restaurant.map(x=>x.slug).sort(),['square-for-restaurants','toast-pos']);
 assert.deepEqual(vets.map(x=>x.slug),['ezyvet']);
 for(const cat of ['restaurant-pos','veterinary'])assert.ok(engine.admission.allowedCatalogCategories.includes(cat));
 const all=[...baseline,...tools];
 const pos=qualifiedSoftwareDecisionShortlist(all,{job:'restaurant point of sale software',limit:5});
 assert.ok(pos.some(x=>x.slug==='toast-pos'),'Restaurant POS should be eligible for its actual job');
 assert.ok(pos.some(x=>x.slug==='square-for-restaurants'),'Competing restaurant POS should be eligible');
 assert.ok(pos.every(x=>x.category==='restaurant-pos'),'No unrelated business tools as restaurant POS');
 const vet=qualifiedSoftwareDecisionShortlist(all,{job:'veterinary practice management software',limit:5});
 assert.ok(vet.some(x=>x.slug==='ezyvet'),'Vets need the documented veterinary record system');
 assert.ok(vet.every(x=>x.category==='veterinary'),'Do not substitute generic booking or project tools for veterinary clinical management');
 const projects=qualifiedSoftwareDecisionShortlist(all,{job:'project management software',limit:5});
 assert.ok(projects.every(x=>!['restaurant-pos','veterinary','vacation-rental'].includes(x.category)),'Vertical software cannot leak into generic project workflow recommendations');
 const misc=qualifiedSoftwareDecisionShortlist(all,{job:'CRM software',limit:5});
 assert.ok(misc.every(x=>!['restaurant-pos','veterinary','vacation-rental'].includes(x.category)));
});
test('Codex P1: an explicit veterinary management job bypasses generic healthcare guidance',()=>{
 const corpus=[...baseline,...tools];
 for(const job of ['veterinary practice management software','veterinary medical records for a clinic','vet practice management software']){
  assert.equal(businessWorkflowGuidance(job,{},corpus),null,job+' must reach the decision shortlist');
  const found=qualifiedSoftwareDecisionShortlist(corpus,{job,limit:5});
  assert.ok(found.some(x=>x.slug==='ezyvet'),job+' must include evidence-backed ezyVet');
  assert.ok(found.every(x=>x.category==='veterinary'),job+' must exclude generic CRM or appointment products');
 }
 assert.ok(businessWorkflowGuidance('best software for my veterinary clinic',{},corpus),
   'ambiguous whole-business software requests still need workflow clarification');
});

test('Codex P2: specialist jobs outrank incidental business tokens without hijacking an explicit CRM job',()=>{
 const corpus=[...baseline,...tools];
 for(const job of ['restaurant point of sale business software','restaurant POS for my business','best restaurant point of sale software for cafes']){
  const found=qualifiedSoftwareDecisionShortlist(corpus,{job,limit:5});
  assert.ok(found.some(x=>x.slug==='toast-pos'),job+' must include Toast POS');
  assert.ok(found.some(x=>x.slug==='square-for-restaurants'),job+' must include Square for Restaurants');
  assert.ok(found.every(x=>x.category==='restaurant-pos'),job+' must not leak Calendly or Linear');
 }
 const crm=qualifiedSoftwareDecisionShortlist(corpus,{job:'CRM for a veterinary clinic',limit:5});
 assert.ok(crm.length>0,'explicit CRM job remains actionable');
 assert.ok(crm.every(x=>x.category==='crm'),'clinic context must not force vet practice-management category');
 const generic=qualifiedSoftwareDecisionShortlist(corpus,{job:'project management for restaurant staff',limit:5});
 assert.ok(generic.length>0);
 assert.ok(generic.every(x=>x.category==='business'),'project management remains a task category');
});

test('wave5 dynamic profiles use ToolScout 2.0 visual contract without any manufacturer-source outbound links',async()=>{
 for(const tool of tools){
  const raw=candidatePage(tool,{monetized:false});
  assert.match(raw,/<h1>/);
  assert.match(raw,/Add to comparator/);
  assert.match(raw,new RegExp('href="/go/'+tool.slug+'"'),'Every published tool must have a tracked vendor visit');
  assert.match(raw,/data-commercial-status="non-affiliate"/);
  assert.doesNotMatch(raw,/rel="nofollow sponsored/);
  for(const doc of tool.editorialReview.sourceUrls)assert.ok(!raw.includes(doc),tool.slug+' leaks private manufacturer docs');
  const rendered=await transformPublicRedesignResponse(new Request('https://trytoolscout.org/tools/'+tool.slug),
    new Response(raw,{headers:{'Content-Type':'text/html; charset=UTF-8'}}));
  const html=await rendered.text();
  assert.equal((html.match(/class="ts2-global-nav"/g)||[]).length,1);
  assert.match(html,/data-toolscout-public-redesign="2"/);
  assert.match(html,/class="ts2-back-tools"/);
  assert.ok(html.includes(tool.editorialReview.summary.slice(0,48)));
 }
});
test('hourly existing catalog admission sees documented wave5 once and never publishes research-only seeds',()=>{
 const existing=baseline.map(t=>t.slug);
 assert.deepEqual(unpublishedReadyCatalogSlugs([tools],existing).sort(),slugs);
 assert.deepEqual(unpublishedReadyCatalogSlugs([tools],[...existing,...slugs]),[]);
 const seeds=load('data/catalog-research-seeds.json');
 assert.deepEqual(unpublishedReadyCatalogSlugs([seeds.candidates],existing),[]);
 assert.deepEqual(unpublishedReadyCatalogSlugs([tools,tools],existing).sort(),slugs);
});

test('Codex P1: explicit generic jobs outweigh industry words even without a family synonym',()=>{
 const all=[...baseline,...tools];
 for(const [job,category] of [
  ['automation software for my veterinary clinic','automation'],
  ['automation software for a vacation rental business','automation'],
  ['forms software for a veterinary clinic','forms'],
  ['analytics software for a veterinary clinic','analytics']
 ]){
  assert.equal(businessWorkflowGuidance(job,{},all),null,job+' must reach the qualified shortlist');
  const shortlist=qualifiedSoftwareDecisionShortlist(all,{job,limit:5});
  assert.ok(shortlist.length>0,job+' should find real '+category+' catalog products');
  assert.ok(shortlist.every(x=>x.category===category),job+' must not be hijacked by veterinary or rental systems');
 }
});
