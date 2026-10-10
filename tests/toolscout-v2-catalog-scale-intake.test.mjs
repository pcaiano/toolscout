import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {selectCatalogResearchLeads,syncCatalogResearchSupply,classifyMarketGapEvidence,candidatePage,
  linkedManufacturerDocumentation,researchCatalogManufacturerDossiers,fetchOfficial}
  from '../catalog-autonomy-worker.js';
import {executeCatalogGrowthTask} from '../catalog-gap-runtime-worker.js';

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


test('Codex: two subdomains of a single publisher cannot impersonate independent product demand',()=>{
 const mirrored={slug:'sample-app',sources:['Directory A','Directory B'],exampleUrls:[
   'https://www.directorya.example/tools/sample-app',
   'https://de.directorya.example/tools/sample-app'
 ]};
 const outcome=classifyMarketGapEvidence(mirrored);
 assert.equal(outcome.status,'discovery_only');
 assert.ok(outcome.independent_product_hosts<2);
 const mismatched={slug:'sample-app',sources:['Directory A','Directory B'],exampleUrls:[
   'https://unrelated-one.example/tools/sample-app',
   'https://unrelated-two.example/tools/sample-app'
 ]};
 assert.equal(classifyMarketGapEvidence(mismatched).status,'discovery_only');
});

test('Codex: a stale execution contract cannot promote a demoted taxonomy market gap',async()=>{
 const calls=[];
 const env={
   ASSETS:{fetch:async()=>Response.json([])},
   DB:{prepare(sql){
     calls.push(sql);
     return{
       bind(){return{
         first:async()=>sql.includes('SELECT signals,sources_json,examples_json,status')?
           {signals:2,sources_json:'["Source A","Source B"]',examples_json:'[]',status:'discovery_only'}:null,
         run:async()=>{throw Error('stale demoted gap must never be mutated')}
       }}
     };
   }}
 };
 const result=await executeCatalogGrowthTask(env,{subject_type:'catalog_gap',subject_key:'audio-editor'});
 assert.equal(result.ok,true);
 assert.equal(result.admitted,false);
 assert.equal(result.reason,'market_gap_not_product_qualified');
 assert.ok(!calls.some(sql=>/UPDATE catalog_market_gaps/.test(sql)));
 const src=fs.readFileSync(new URL('../catalog-gap-runtime-worker.js',import.meta.url),'utf8');
 assert.match(src,/reason:'market_gap_demoted_during_research'/,
  'long-running manufacturer fetches must recheck the original product identity before publishing');
 assert.match(src,/WHERE tool_slug=\? AND status='research_required'/);
});


test('manufacturer research extracts only on-site canonical product documentation links',()=>{
 const html='<a href="/docs/features?utm_campaign=1">Features</a>'+
   '<a href="/docs/features?utm_campaign=2">Features again</a>'+
   '<a href="https://evil.example/pricing">Pricing imitation</a>'+
   '<a href="/privacy">Privacy</a>'+
   '<a href="/pricing">Pricing</a>'+
   '<a href="/blog/updates">News</a>';
 const urls=linkedManufacturerDocumentation(html,'https://vendor.example/');
 assert.equal(urls.length,2);
 assert.equal(new URL(urls[0]).pathname,'/docs/features');
 assert.equal(new URL(urls[1]).pathname,'/pricing');
 assert.ok(urls.every(x=>new URL(x).hostname==='vendor.example'));
});

test('hourly catalog quality mission saves manufacturer research dossier in private D1 without claiming publication',async()=>{
 const originalFetch=globalThis.fetch;
 const privateWrites=[];
 const seed={schemaVersion:1,status:'research_only_not_catalog',
   candidates:[{slug:'vendor-example',name:'Vendor Example',candidateUrl:'https://vendor.example/',discoveryCategory:'Automation'}]};
 const markup={
  '/':'<html><head><title>Vendor Example Official</title></head><body>'+
    '<a href="/docs/features">Product features</a><a href="/docs/pricing">Pricing</a>'+
    '<a href="https://other.example/docs">Unrelated publisher</a></body></html>',
  '/docs/features':'<html><head><title>Features</title></head><body><h1>Features</h1>'+
    '<p>'+('Official feature documentation explains the product operations. '.repeat(5))+'</p></body></html>',
  '/docs/pricing':'<html><head><title>Pricing</title></head><body><h1>Plan details</h1>'+
    '<p>'+('Official plan documentation describes the available purchase options. '.repeat(5))+'</p></body></html>'
 };
 globalThis.fetch=async url=>{
   const u=new URL(url);
   assert.equal(u.hostname,'vendor.example','manufacturer crawl must remain first party');
   const html=markup[u.pathname];
   return new Response(html||'missing',{status:html?200:404,headers:{'Content-Type':'text/html'}});
 };
 const env={
   ASSETS:{fetch:async()=>Response.json(seed)},
   DB:{prepare(sql){
     return {bind(...args){return {
       all:async()=>({results:[{tool_slug:'vendor-example'}]}),
       run:async()=>{privateWrites.push({sql,args});return{success:true,meta:{changes:1}}}
     }}};
   }}
 };
 try{
   const result=await researchCatalogManufacturerDossiers(env,{deadlineAt:Date.now()+60000});
   assert.equal(result.documented,1);
   assert.equal(result.checked,1);
   const dossier=privateWrites.find(x=>x.args?.[2]==='catalog_manufacturer_dossier_documented');
   assert.ok(dossier,'manufacturer document evidence must be durable in canonical D1 event ledger');
   const proof=JSON.parse(dossier.args[5]);
   assert.equal(proof.documents.length,2);
   assert.ok(proof.documents.every(x=>x.fingerprint&&x.url.startsWith('https://vendor.example/')));
   assert.equal(proof.editorial_complete,false);
   assert.equal(proof.decision_claims_complete,false);
   assert.equal(proof.admission_ready,false);
   assert.ok(privateWrites.some(x=>/UPDATE catalog_market_gaps SET status='source_researched'/.test(x.sql)));
   assert.ok(!privateWrites.some(x=>/INSERT INTO catalog_runtime_candidates/.test(x.sql)));
   assert.ok(!privateWrites.some(x=>/status='published'/.test(x.sql)));
 }finally{globalThis.fetch=originalFetch}
});

test('manufacturer research budget defers safely before network and a directory link cannot stage software',async()=>{
 let used=false;
 const result=await researchCatalogManufacturerDossiers({},{
   deadlineAt:Date.now()-1
 });
 assert.equal(result.deferred,true);
 assert.equal(result.checked,0);
 const env={
   ASSETS:{fetch:async()=>Response.json({schemaVersion:1,status:'research_only_not_catalog',
     candidates:[{slug:'git-project',name:'Git Project',candidateUrl:'https://github.com/example/git-project'}]})},
   DB:{prepare(sql){return{bind(){return{
     all:async()=>({results:[{tool_slug:'git-project'}]}),
     run:async()=>{used=true;return{success:true,meta:{changes:1}}}
   }}}}}
 };
 const originalFetch=globalThis.fetch;
 globalThis.fetch=async()=>{throw Error('directory site must never be treated as manufacturer evidence')};
 try{
   const out=await researchCatalogManufacturerDossiers(env,{deadlineAt:Date.now()+60000});
   assert.equal(out.checked,1);
   assert.equal(out.documented,0);
   assert.equal(used,true,'deferred evidence is recorded');
 }finally{globalThis.fetch=originalFetch}
});

test('autonomous manufacturer research shares catalog quality mission without creating another cron',()=>{
 const src=fs.readFileSync(new URL('../catalog-autonomy-worker.js',import.meta.url),'utf8');
 assert.match(src,/manufacturer_dossiers:manufacturerDossiers/);
 assert.match(src,/researchCatalogManufacturerDossiers\(env,\{deadlineAt\}\)/);
 assert.match(src,/MAX_MANUFACTURER_DOSSIERS_PER_CYCLE=2/);
 assert.match(src,/status='source_researched'/);
 assert.match(src,/documented_dossiers_are_not_published:true/);
});


test('Codex P2: SPA soft-404 pages with the same HTML cannot supply two first-party documents',async()=>{
 const originalFetch=globalThis.fetch,writes=[];
 const seed={schemaVersion:1,status:'research_only_not_catalog',candidates:[
   {slug:'same-page-vendor',name:'Same Page Vendor',candidateUrl:'https://samepage.example/',discoveryCategory:'Automation'}
 ]};
 const fallback='<html><head><title>Vendor SPA</title></head><body><h1>Vendor page</h1><p>'+
   'This generic app shell is returned on all routes without separate manufacturer documentation. '.repeat(7)+
   '</p></body></html>';
 const homepage='<html><head><title>Vendor SPA</title></head><body>'+
   '<a href="/docs/features">Features</a><a href="/docs/pricing">Pricing</a>'+
   '<a href="/docs/integrations">Integrations</a></body></html>';
 globalThis.fetch=async url=>{
   const u=new URL(url);assert.equal(u.hostname,'samepage.example');
   return new Response(u.pathname==='/'?homepage:fallback,
     {status:200,headers:{'Content-Type':'text/html'}});
 };
 const env={
   ASSETS:{fetch:async()=>Response.json(seed)},
   DB:{prepare(sql){return {bind(...args){return{
     all:async()=>({results:[{tool_slug:'same-page-vendor'}]}),
     run:async()=>{writes.push({sql,args});return{success:true,meta:{changes:1}}}
   }}}}}
 };
 try{
   const result=await researchCatalogManufacturerDossiers(env,{deadlineAt:Date.now()+60000});
   assert.equal(result.checked,1);
   assert.equal(result.documented,0);
   assert.ok(writes.some(x=>x.args?.[2]==='catalog_manufacturer_dossier_deferred'));
   assert.ok(!writes.some(x=>x.args?.[2]==='catalog_manufacturer_dossier_documented'));
   assert.ok(!writes.some(x=>/status='source_researched'/.test(x.sql)),
     'soft-404 document aliases must never change the canonical research state');
 }finally{globalThis.fetch=originalFetch}
});

test('Codex P2: manufacturer dossier proof checks both page identity and content fingerprint',()=>{
 const src=fs.readFileSync(new URL('../catalog-autonomy-worker.js',import.meta.url),'utf8');
 const section=src.slice(src.indexOf('export async function researchCatalogManufacturerDossiers'),
   src.indexOf('async function syncMarketGaps('));
 assert.match(section,/fingerprints=new Set\(\)/);
 assert.match(section,/fingerprints\.has\(page\.researchBodyFingerprint\)/);
 assert.match(section,/page\.researchBodyFingerprint===source\.researchBodyFingerprint/);
 assert.match(section,/identity===homepageIdentity/);
});


test('Codex P2: long vendor documents differing after 14k prefix retain distinct full-body proofs',async()=>{
 const originalFetch=globalThis.fetch;
 const common='Identical documentation navigation and shared sidebars. '.repeat(360);
 const makePage=unique=>'<html><head><title>Product Docs</title>'+
   '<meta name="description" content="Vendor product documentation"></head>'+
   '<body><main><p>'+common+'</p><section>'+unique.repeat(5)+'</section></main></body></html>';
 const pages={
   '/docs/first':makePage('Unique integration endpoint details and API field references. '),
   '/docs/second':makePage('Unique purchasing plan entitlements and support scope. ')
 };
 globalThis.fetch=async raw=>{
   const u=new URL(raw);
   assert.equal(u.hostname,'docs-vendor.example');
   return new Response(pages[u.pathname]||'missing',{
     status:pages[u.pathname]?200:404,headers:{'Content-Type':'text/html'}
   });
 };
 try{
   const a=await fetchOfficial('https://docs-vendor.example/docs/first');
   const b=await fetchOfficial('https://docs-vendor.example/docs/second');
   assert.equal(a.fingerprint,b.fingerprint,
     'legacy 14k summary can legitimately coincide; do not silently change existing source-change hashes');
   const first=await fetchOfficial('https://docs-vendor.example/docs/first',{includeResearchFingerprint:true});
   const second=await fetchOfficial('https://docs-vendor.example/docs/second',{includeResearchFingerprint:true});
   assert.notEqual(first.researchBodyFingerprint,second.researchBodyFingerprint);
   assert.equal(first.fingerprint,a.fingerprint,'quality tracker fingerprint remains unchanged');
   assert.equal(second.fingerprint,b.fingerprint,'legacy fingerprint stays stable');
   assert.equal(a.researchBodyFingerprint,undefined,
     'normal source verification does not perform extra full-body digests');
 }finally{globalThis.fetch=originalFetch}
});

test('full-body manufacturer digest is opt-in and does not alter historic catalog source-change detection',()=>{
 const source=fs.readFileSync(new URL('../catalog-autonomy-worker.js',import.meta.url),'utf8');
 assert.match(source,/includeResearchFingerprint=false/);
 assert.match(source,/researchBodyFingerprint:await sha\(stripHtml/);
 assert.match(source,/fetchOfficial\(url,\{deadlineAt,includeResearchFingerprint:true\}\)/);
 assert.match(source,/page\.researchBodyFingerprint===source\.researchBodyFingerprint/);
 assert.match(source,/fingerprints\.has\(page\.researchBodyFingerprint\)/);
 assert.match(source,/fingerprint:await sha/);
});
