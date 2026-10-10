import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {selectCatalogResearchLeads,syncCatalogResearchSupply,classifyMarketGapEvidence,candidatePage}
  from '../catalog-autonomy-worker.js';

const directory=JSON.parse(fs.readFileSync(new URL('../data/catalog-research-seeds-scale.json',import.meta.url),'utf8'));
const baseline=JSON.parse(fs.readFileSync(new URL('../data/tools.json',import.meta.url),'utf8'));
const wave4=JSON.parse(fs.readFileSync(new URL('../data/catalog-wave4-decision-ready.json',import.meta.url),'utf8'));

test('scale corpus spans over a thousand real discovery leads but is never represented as published evidence',()=>{
  assert.equal(directory.schemaVersion,1);
  assert.equal(directory.status,'research_only_not_catalog');
  assert.ok(directory.candidates.length>=1000);
  assert.ok(new Set(directory.candidates.map(x=>x.discoveryCategory)).size>=50);
  assert.equal(new Set(directory.candidates.map(x=>x.slug)).size,directory.candidates.length);
  assert.ok(directory.candidates.every(x=>/^https:\/\//.test(x.candidateUrl)));
  assert.ok(directory.candidates.every(x=>!x.editorialReview&&!x.decisionClaims&&!x.rankingEligible));
  assert.equal(selectCatalogResearchLeads(directory.candidates,[],baseline.map(x=>x.slug),200).length,200);
});

test('bounded D1 intake writes research leads only with one discovery signal, not publishable profiles',async()=>{
  const writes=[],known=[{slug:directory.candidates[0].slug}];
  const records=directory.candidates.slice(0,6);
  const injected={...directory,candidates:records};
  const env={
    ASSETS:{fetch:async()=>new Response(JSON.stringify(injected),{status:200,headers:{'Content-Type':'application/json'}})},
    DB:{prepare(sql){
      return {
        all:async()=>({results:[]}),
        run:async()=>({meta:{changes:0}}),
        bind(...args){
          return{
            first:async()=>({n:7}),
            all:async()=>({results:[]}),
            run:async()=>{writes.push({sql,args});return {meta:{changes:1}}}
          };
        }
      };
    }}
  };
  const result=await syncCatalogResearchSupply(env,{knownTools:known,limit:3});
  assert.equal(result.ok,true);
  assert.equal(result.staged,3);
  const adds=writes.filter(x=>/INSERT OR IGNORE INTO catalog_market_gaps/.test(x.sql));
  assert.equal(adds.length,3);
  for(const write of adds){
    assert.match(write.sql,/VALUES\(\?,1,\?,\?,'discovery_only'/);
    assert.deepEqual(JSON.parse(write.args[1]),['awesome-selfhosted-directory']);
    assert.ok(JSON.parse(write.args[2])[0].startsWith('https://'));
    assert.ok(!/published|admitted_coverage/.test(write.sql));
  }
});

test('Fresha has manufacturer-homepage outbound without counterfeit affiliate tracking',()=>{
  const fresha=wave4.find(x=>x.slug==='fresha');
  assert.ok(fresha);
  const publicHtml=candidatePage(fresha);
  assert.match(publicHtml,/data-commercial-status="non-affiliate"/);
  assert.match(publicHtml,/href="\/go\/fresha"/);
  assert.match(publicHtml,/Visit Fresha<\/a>/);
  assert.doesNotMatch(publicHtml,/href="https:\/\/www\.fresha\.com\/"/);
  assert.doesNotMatch(publicHtml,/href="https:\/\/www\.fresha\.com\/for-business\/features/);
  const counterfeit={...fresha,sourceUrl:'https://fresha.com.evil.example/'};
  assert.doesNotMatch(candidatePage(counterfeit),/data-commercial-status="non-affiliate"/);
  assert.match(candidatePage(fresha,{monetized:true}),/href="\/go\/fresha"/);
  assert.doesNotMatch(candidatePage(fresha,{monetized:true}),/data-commercial-status="non-affiliate"/);
});


test('competitive market-gap classification keeps directories and category pages out of product admission',()=>{
  const gaps=JSON.parse(fs.readFileSync(new URL('../reports/competitive-gap-signals.json',import.meta.url),'utf8')).gaps;
  const bySlug=Object.fromEntries(gaps.map(g=>[g.slug,g]));
  for(const slug of ['audio-editor','no-code','faq','video-editing','ai-background-remover','content-creation']){
    const result=classifyMarketGapEvidence(bySlug[slug]);
    assert.equal(result.status,'discovery_only',slug+' is a taxonomy or help page, not an individual verified product');
  }
  for(const slug of ['claude-code','coool-ai','makiverse','postwizard-ai']){
    const result=classifyMarketGapEvidence(bySlug[slug]);
    assert.equal(result.status,'research_required',slug+' has two independently sourced product-specific references');
    assert.ok(result.independent_product_hosts>=2);
  }
  // Language mirror URLs and two subdomains are not independent evidence.
  const mirrors={slug:'sample',sources:['Directory'],exampleUrls:[
    'https://www.directory.example/tools/sample',
    'https://fr.directory.example/tools/sample'
  ]};
  assert.equal(classifyMarketGapEvidence(mirrors).status,'discovery_only');
  assert.equal(classifyMarketGapEvidence({slug:'any',sources:['A','B'],exampleUrls:[
    'https://a.example/category/any','https://b.example/faq/any'
  ]}).status,'discovery_only');
});

test('catalog market-gap intake persists taxonomy as discovery only and cannot demote already published tools',()=>{
  const src=fs.readFileSync(new URL('../catalog-autonomy-worker.js',import.meta.url),'utf8');
  const block=src.slice(src.indexOf('async function syncMarketGaps('),src.indexOf('export function unpublishedReadyCatalogSlugs('));
  assert.match(block,/const signal=classifyMarketGapEvidence\(gap\)/);
  assert.match(block,/signal\.status\)\.run\(\)/);
  assert.match(block,/ELSE excluded\.status END/);
  assert.match(block,/catalog_market_gaps\.status IN \('published','admitted_coverage','covered','covered_existing'\)/);
  assert.doesNotMatch(block,/ELSE 'research_required' END/,'unqualified taxonomy must not be re-promoted on each sync');
});
