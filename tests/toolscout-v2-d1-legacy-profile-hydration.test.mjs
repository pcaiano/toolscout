import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {hydrateLegacyCatalogProfile} from '../catalog-profile-hydration.js';
import {hasManufacturerDecisionClaim} from '../catalog-quality-runtime.js';
import {trustedManufacturerEvidence} from '../catalog-autonomy-worker.js';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const tools=JSON.parse(read('data/tools.json'));
function profile(slug){return tools.find(t=>t.slug===slug)}
function render(slug,tool=profile(slug)){return hydrateLegacyCatalogProfile(read('tools/'+slug+'.html'),tool)}
test('all 127 existing profile templates can hydrate D1 records without replacing the audited HTML shell',()=>{
 for(const tool of tools){
   const html=render(tool.slug);
   if(tool.categoryReviewRequired===true){assert.equal(html,null,'unverified category must retain the existing review warning: '+tool.slug);continue}
   assert.ok(html,'Legacy profile cannot be hydrated: '+tool.slug);
   assert.ok(html.includes('href="/go/'+tool.slug+'"'),'monetizable route changed: '+tool.slug);
   assert.ok(html.includes('href="/compare.html?a='+tool.slug+'&source=tool-profile"'),'comparator route changed: '+tool.slug);
   assert.ok(html.includes('href="https://trytoolscout.org/tools/'+tool.slug+'"'),'canonical changed: '+tool.slug);
   assert.ok(!html.includes('[object Object]'),'invalid editorial rendering: '+tool.slug);
 }
 assert.equal(tools.length,127);
});
test('manufacturer-verified D1 editorial revision updates buyer fields and structured data while preserving UI and CTA',()=>{
 const original=read('tools/systeme-io.html'),base=profile('systeme-io');
 const updated={...structuredClone(base),
    description:'Manufacturer-verified specialist buyer workflow update & risk analysis',
    features:['workflow management','sales pipeline'],
    bestFor:['qualified buying teams','evidence-led users'],
    pricing:'Manufacturer-confirmed revised pricing with exact plan limits.',
    editorialReview:{...base.editorialReview,
      summary:'Revised ToolScout editorial conclusion grounded in first-party documentation and independently analysed with concrete product tradeoffs.',
      buyerCheck:'Check the exact current subscription plan against the purchasing team requirements.'}
 };
 assert.equal(trustedManufacturerEvidence(updated,{decisionGrade:true}),false,'short modified review must not qualify');
 const full={...updated,editorialReview:{...updated.editorialReview,summary:updated.editorialReview.summary.repeat(4)}};
 assert.ok(hasManufacturerDecisionClaim(full));
 assert.ok(trustedManufacturerEvidence(full,{decisionGrade:true}));
 const html=render('systeme-io',full);
 assert.ok(html);
 assert.ok(html.includes('Manufacturer-verified specialist buyer workflow update &amp; risk analysis'));
 assert.ok(html.includes('<span>workflow management</span>'));
 assert.ok(html.includes('<li>qualified buying teams</li>'));
 assert.ok(html.includes('Manufacturer-confirmed revised pricing'));
 assert.ok(html.includes('href="/go/systeme-io"'));
 assert.ok(html.includes('href="/compare.html?a=systeme-io&source=tool-profile"'));
 assert.ok(html.includes('data-ai-interoperability="1"'));
 assert.ok(html.includes('<h1>Systeme.io</h1>'));
 assert.ok(html.includes('class="backTools"'));
 assert.ok(html.includes('og:url" content="https://trytoolscout.org/tools/systeme-io"'));
 const app=JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1]||'null');
 const schema=app.find(x=>x['@type']==='WebPage').about;
 assert.equal(schema.description,full.description);
 assert.deepEqual(schema.featureList,full.features);
 assert.ok(html.includes('<summary>What is Systeme.io best for?</summary>'));
 assert.ok(!html.includes('Official AI source'));
 assert.ok(original.includes('<h1>Systeme.io</h1>'));
});
test('unverifiable or drifting legacy markup fails closed rather than showing partially updated content',()=>{
 const html=read('tools/hubspot.html'),candidate=profile('hubspot');
 assert.equal(hydrateLegacyCatalogProfile(html.replace('Pricing at a glance','Pricing format drifted'),candidate),null);
 assert.equal(hydrateLegacyCatalogProfile(html.replace('<script type="application/ld+json">','<script type="application/json">'),candidate),null);
 assert.equal(hydrateLegacyCatalogProfile(html,{...candidate,lastVerified:'today'}),null);
 assert.equal(hydrateLegacyCatalogProfile(html,{...candidate,editorialReview:{summary:'No buyer check.'}}),null);
});
test('catalog worker gates edited legacy D1 profiles on verified origin, manufacturer review and individual claims',()=>{
 const src=read('catalog-autonomy-worker.js');
 assert.match(src,/snapshot\.verifiedRevisions\?\.has\(key\)/);
 assert.match(src,/trustedManufacturerEvidence\(revision,\{decisionGrade:true\}\)/);
 assert.match(src,/hasManufacturerDecisionClaim\(revision\)/);
 assert.match(src,/if\(hydrated\)html=hydrated/);
 assert.match(src,/X-ToolScout-Catalog-Hydration/);
});
