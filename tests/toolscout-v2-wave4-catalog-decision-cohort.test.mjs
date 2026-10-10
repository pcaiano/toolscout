import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {trustedManufacturerEvidence,candidatePage,unpublishedReadyCatalogSlugs} from '../catalog-autonomy-worker.js';
import {hasManufacturerDecisionClaim,structuralCatalogIssues} from '../catalog-quality-runtime.js';
import {transformPublicRedesignResponse} from '../public-redesign-runtime.js';
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
test('dynamic profiles reuse the original profile content shell, and the global transform owns the one 2.0 header',async()=>{
 const staticHtml=fs.readFileSync(new URL('../tools/figma.html',import.meta.url),'utf8');
 const staticCss=staticHtml.match(/<style>([\s\S]*?)<\/style>/)?.[1];
 assert.ok(staticCss?.length>2500);
 for(const tool of tools){
   const raw=candidatePage(tool);
   assert.equal((raw.match(/class="ts2-global-nav"/g)||[]).length,0,tool.slug+' no standalone nav');
   assert.doesNotMatch(raw,/data-toolscout-public-redesign="2"/,tool.slug+' global design stylesheet must be injected by the shared transform');
   assert.match(raw,/data-toolscout-redesign="2"/);
   assert.match(raw,/data-toolscout-surface="tool-profile"/);
   assert.equal(raw.match(/<style>([\s\S]*?)<\/style>/)?.[1],staticCss,tool.slug+' must have the same base CSS as indexed Figma');
   for(const className of ['editorialIntro','editorialBuyerCheck','heroHead','panel','secondaryCta','backTools'])
     assert.match(raw,new RegExp('class="[^"]*\\b'+className+'\\b[^"]*"'),tool.slug+' missing '+className);
   assert.doesNotMatch(raw,/class="editorial"/);
   assert.doesNotMatch(raw,/class="back"/);
   assert.doesNotMatch(raw,/background:#0b0d0c|class="cta secondary"/i);
   assert.match(raw,/href="\/compare\.html\?a=/);
   assert.match(raw,new RegExp('<h1>'+tool.name+'</h1>'));
   assert.doesNotMatch(raw,/Free plan recorded: Unknown|not yet verified the current free-plan position/i);
   assert.doesNotMatch(raw,/Editorial evidence:|First-party documentation informed this assessment|manufacturer documentation retained in ToolScout/i);
   assert.match(raw,/Information last checked/);
   assert.doesNotMatch(raw,/href="https:\/\/[^"]*\/features\//i);
   for(const document of tool.editorialReview.sourceUrls)assert.ok(!raw.includes(document),tool.slug+' vendor URL leaked');
   const req=new Request('https://trytoolscout.org/tools/'+tool.slug);
   const resp=await transformPublicRedesignResponse(req,new Response(raw,{headers:{'Content-Type':'text/html; charset=UTF-8'}}));
   const html=await resp.text();
   assert.equal((html.match(/class="ts2-global-nav"/g)||[]).length,1,tool.slug+' one global navigation');
   assert.match(html,/data-toolscout-public-redesign="2"/);
   assert.match(html,/class="ts2-brand"/);
   assert.match(html,/href="\/distribution\/publisher-kit"/);
   assert.match(html,/href="\/software-trends-index"/);
   assert.match(html,/href="\/toolscout-v2-native\.css/);
   assert.match(html,/class="ts2-back-tools"/);
   assert.equal((html.match(/class="ts2-back-tools"/g)||[]).length,1);
   assert.doesNotMatch(html,/class="backTools"/);
 }
});
test('new profiles use approved /go links; Fresha has an explicitly non-affiliate manufacturer-homepage exception',()=>{
 for(const tool of tools){
   const normal=candidatePage(tool,{monetized:false});
   assert.doesNotMatch(normal,/href="\/go\//,'No commercial approval => no Visit button');
   if(tool.slug==='fresha'){
     assert.match(normal,/href="https:\/\/www\.fresha\.com\/"/);
     assert.match(normal,/data-commercial-status="non-affiliate"/);
     assert.doesNotMatch(normal,/rel="nofollow sponsored/);
   }else assert.doesNotMatch(normal,/data-commercial-status="non-affiliate"/);
   assert.match(normal,/Add to comparator/);
   const approved=candidatePage(tool,{monetized:true});
   assert.match(approved,new RegExp('href="/go/'+tool.slug+'"'));
   assert.match(approved,/rel="nofollow sponsored noopener"/);
   assert.match(approved,/target="_blank"/);
   assert.doesNotMatch(approved,/href="https:\/\/www\.(clio|fresha|bqe)\.com/i);
   assert.match(approved,/ToolScout may earn a commission on qualifying purchases through approved affiliate links\./);
   assert.doesNotMatch(normal,/ToolScout may earn a commission/);
   assert.match(approved,/Affiliate relationships do not influence ToolScout rankings or recommendations\./);
 }
});


test('verified AI integrations never disclose private manufacturer verification operations on the public profile',()=>{
 const tool={...tools.find(x=>x.slug==='fresha'),aiIntegration:{status:'verified',tier:'moderate',mcp:'official',publicApi:true,assistants:['Claude'],summary:'Vendor-supported AI workflow has documented agent interoperability.',verifiedAt:'2026-10-10',sources:['https://www.fresha.com/for-business/features']}};
 const html=candidatePage(tool,{monetized:false});
 assert.match(html,/AI interoperability/);
 assert.match(html,/Vendor-supported AI workflow/);
 assert.match(html,/AI compatibility:<\/strong> Manufacturer-confirmed, verified 2026-10-10\./);
 assert.match(html,/data-ai-evidence-date="1"/);
 assert.match(html,/Official/);
 assert.doesNotMatch(html,/AI integration reviewed against manufacturer documentation internally|First-party documentation informed this assessment|Unknown is not treated as no integration/);
 assert.doesNotMatch(html,/https:\/\/www\.fresha\.com\/for-business\/features/);
 const undocumented={...tool,aiIntegration:{...tool.aiIntegration,sources:[],verifiedAt:null}};
 const noProof=candidatePage(undocumented);
 assert.doesNotMatch(noProof,/Manufacturer-confirmed/,'unsubstantiated integrations cannot receive a manufacturer-confirmed badge');
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
