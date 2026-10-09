import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {vendorEvidenceIssues} from '../scripts/check-vendor-evidence.mjs';
import {trustedManufacturerEvidence} from '../catalog-autonomy-worker.js';
import {transformPublicRedesignResponse} from '../public-redesign-runtime.js';

const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));

test('every future tool requires a dated first-party manufacturer source',()=>{
 const catalog=read('data/tools.json'), pending=read('data/vendor-evidence-backlog.json').pendingSlugs;
 assert.equal(catalog.length,127);
 assert.equal(pending.length,0);
 assert.deepEqual(vendorEvidenceIssues(catalog,pending),[]);
 const legacyWithoutStatus={...catalog.find(t=>t.slug==='hubspot'),editorialReview:{...catalog.find(t=>t.slug==='hubspot').editorialReview,verificationStatus:undefined}};
 assert.match(vendorEvidenceIssues(catalog.map(t=>t.slug==='hubspot'?legacyWithoutStatus:t),pending).join(' '),/Manufacturer documentation required: hubspot/);
 const allExplicit=catalog.filter(t=>t.editorialReview?.verificationStatus==='vendor_documented');
 assert.equal(allExplicit.length,catalog.length,'Every profile must carry explicit manufacturer provenance status');
 const invented={...catalog[0],slug:'unsourced-new-software',editorialReview:{summary:'Unsupported',verificationStatus:'catalog_only',sourceUrl:null},evidence:[]};
 assert.match(vendorEvidenceIssues([...catalog,invented],pending).join(' '),/Manufacturer documentation required/);
 const original=catalog.find(x=>x.slug==='posthog');
 const copied={...original,slug:'copied-product-with-fake-evidence'};
 assert.match(vendorEvidenceIssues([...catalog,copied],pending).join(' '),/Duplicate or empty product name/);
 const documented={...original,slug:'future-verified-example',name:'Future Verified Example',sourceUrl:'https://example-vendor.test/',editorialReview:{...original.editorialReview,sourceUrl:'https://example-vendor.test/docs',verificationStatus:'vendor_documented'},evidence:[{claimScope:'toolscout_editorial_review',sourceUrl:'https://example-vendor.test/docs',verifiedAt:'2026-10-08'}]};
 assert.deepEqual(vendorEvidenceIssues([...catalog,documented],pending),[]);
 const homepageOnly={...documented,slug:'homepage-only-example',name:'Homepage Only Example',sourceUrl:'https://example-vendor.test/',editorialReview:{...documented.editorialReview,sourceUrl:'https://example-vendor.test/',verificationStatus:'vendor_documented'},evidence:[{claimScope:'toolscout_editorial_review',sourceUrl:'https://example-vendor.test/',verifiedAt:'2026-10-08'}]};
 assert.match(vendorEvidenceIssues([...catalog,homepageOnly],pending).join(' '),/Manufacturer documentation required/);
});

test('generated profiles use the product name as the only H1',()=>{
 const generator=fs.readFileSync(new URL('../scripts/generate-tool-pages.mjs',import.meta.url),'utf8');
 assert.ok(generator.includes('<h1>${esc(tool.name)}</h1>'));
 assert.ok(!generator.includes('<h1>${esc(tool.name)} profile</h1>'));
});

test('existing live profile pages remove only redundant H1 profile suffix',async()=>{
 const html='<!doctype html><html><head></head><body><main class="hero"><h1>HubSpot profile</h1><p>Independent CRM profile</p><a href="/go/hubspot">Visit</a></main></body></html>';
 const input=new Response(html,{headers:{'content-type':'text/html; charset=utf-8'}});
 const url='https://trytoolscout.org/tools/hubspot';
 const changed=await transformPublicRedesignResponse(new Request(url),input);
 const result=await changed.text();
 assert.match(result,/<h1>HubSpot<\/h1>/);
 assert.doesNotMatch(result,/<h1>HubSpot profile<\/h1>/);
 assert.match(result,/Independent CRM profile/);
 assert.match(result,/href="\/go\/hubspot"/);
});

test('public product profiles do not render manufacturer-documentation links',async()=>{
 const catalog=read('data/tools.json');
 for(const tool of catalog){
   const source=fs.readFileSync(new URL('../tools/'+tool.slug+'.html',import.meta.url),'utf8');
   const url='https://trytoolscout.org/tools/'+tool.slug;
   const response=await transformPublicRedesignResponse(new Request(url),new Response(source,{headers:{'content-type':'text/html; charset=utf-8'}}));
   const html=await response.text();
   const anchors=[...html.matchAll(/<a\b[^>]*href=["']([^"']+)["']/gi)].map(match=>match[1]);
   assert.ok(anchors.some(href=>href==='/go/'+tool.slug),'Monetized product CTA missing: '+tool.slug);
   for(const href of anchors){
     assert.ok(!/^https?:\/\//i.test(href),'External direct link exposed in public profile: '+tool.slug+' '+href);
   }
   assert.ok(!html.includes('AI integration evidence:'),'Legacy source citations exposed: '+tool.slug);
 }
 const generator=fs.readFileSync(new URL('../scripts/generate-tool-pages.mjs',import.meta.url),'utf8');
 assert.ok(!generator.includes('Official AI integration source'));
 assert.ok(!generator.includes('href="${esc(tool.sourceUrl)}"'));
});

test('new catalog admission routes reject vendor-page-only evidence',()=>{
 const runtime=fs.readFileSync(new URL('../catalog-gap-runtime-worker.js',import.meta.url),'utf8');
 const promotion=fs.readFileSync(new URL('../scripts/promote-verified-gap-profiles-to-catalog.mjs',import.meta.url),'utf8');
 assert.match(runtime,/manufacturer_editorial_documentation_required/);
 assert.match(promotion,/manufacturer_editorial_documentation_required/);
 assert.match(runtime,/datedDocument/);
 assert.match(promotion,/documentSource/);
});

test('scheduled trusted catalog admissions require dated manufacturer proof',()=>{
 const catalog=read('data/tools.json');
 const hubspot=catalog.find(t=>t.slug==='hubspot');
 assert.equal(trustedManufacturerEvidence(hubspot),true);
 assert.equal(trustedManufacturerEvidence({...hubspot,editorialReview:null}),false);
 assert.equal(trustedManufacturerEvidence({...hubspot,evidence:[]}),false);
 assert.equal(trustedManufacturerEvidence({...hubspot,editorialReview:{...hubspot.editorialReview,sourceUrl:'https://unrelated.co.uk/docs'}}),false);
 const forged={...hubspot,sourceUrl:'https://seller.co.uk/',editorialReview:{...hubspot.editorialReview,sourceUrl:'https://unrelated.co.uk/pricing'},evidence:[{claimScope:'toolscout_editorial_review',sourceUrl:'https://unrelated.co.uk/pricing',verifiedAt:'2026-10-08'}]};
 assert.equal(trustedManufacturerEvidence(forged),false);
 assert.match(fs.readFileSync(new URL('../catalog-autonomy-worker.js',import.meta.url),'utf8'),/trustedManufacturerEvidence\(raw,\{decisionGrade:true\}\)/);
});

test('future catalog additions require a real buying analysis and two dated manufacturer documents',()=>{
 const catalog=read('data/tools.json'),pending=read('data/vendor-evidence-backlog.json').pendingSlugs;
 const sourceA='https://vendor-quality.example/docs/capabilities';
 const sourceB='https://vendor-quality.example/docs/pricing';
 const review={
   verificationStatus:'vendor_documented',
   angle:'Product-specific opportunity cost for a technical buying team',
   summary:'This tool has a documented workflow that suits a specific customer and offers distinct strengths. It also imposes clear limits that buyers should evaluate carefully before committing to a plan. Teams should test the feature configuration, access rules, price limits and operational handoffs with a real use case rather than accepting a generic headline ranking.',
   buyerCheck:'Configure a real end-to-end scenario, evaluate plan limits and measure approval and delivery effort.',
   sourceUrl:sourceA,sourceUrls:[sourceA,sourceB],handsOnTested:false
 };
 const sample={
   slug:'quality-new-tool',name:'Quality New Tool',category:'crm',sourceUrl:'https://vendor-quality.example/',
   description:'Manufacturer-documented specialist CRM for buyer teams.',
   pricing:'See vendor for current pricing',freePlan:false,
   features:['leads','deals','workflow'],bestFor:['sales teams','buyers'],
   strengths:['configurable records','structured workflow'],
   limitations:['setup effort','paid plan constraints'],
   tradeoffs:['speed versus configuration overhead'],
   pricingDetails:{freePlanStatus:'unverified'},
   editorialReview:review,
   evidence:[sourceA,sourceB].map(sourceUrl=>({claimScope:'toolscout_editorial_review',sourceUrl,verifiedAt:'2026-10-09'}))
 };
 assert.deepEqual(vendorEvidenceIssues([...catalog,sample],pending,[sample.slug]),[]);
 assert.equal(trustedManufacturerEvidence(sample,{decisionGrade:true}),true);
 const oneSource={...sample,evidence:sample.evidence.slice(0,1)};
 assert.match(vendorEvidenceIssues([...catalog,oneSource],pending,[oneSource.slug]).join(' '),/Two distinct dated manufacturer documentation pages/);
 assert.equal(trustedManufacturerEvidence(oneSource,{decisionGrade:true}),false);
 const shallow={...sample,editorialReview:{...review,summary:'Generic helpful software.'}};
 assert.match(vendorEvidenceIssues([...catalog,shallow],pending,[shallow.slug]).join(' '),/Decision-grade analysis/);
 assert.equal(trustedManufacturerEvidence(shallow,{decisionGrade:true}),false);
 const noTradeoff={...sample,tradeoffs:[]};
 assert.match(vendorEvidenceIssues([...catalog,noTradeoff],pending,[noTradeoff.slug]).join(' '),/Explicit strengths, limitations and tradeoffs/);
 assert.equal(trustedManufacturerEvidence(noTradeoff,{decisionGrade:true}),false);
});
