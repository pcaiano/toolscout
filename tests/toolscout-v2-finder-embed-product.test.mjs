import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {handleDistributionEmbedRoute} from '../distribution-embed-worker.js';
import {handleDistributionLearningRoute} from '../distribution-learning-worker.js';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const tools=read('data/tools.json');
const intents=read('data/intents.json');
const publisherKit=read('distribution/publisher-kit.html');

function assetEnv(){
  return {
    ASSETS:{
      async fetch(request){
        const path=new URL(request.url).pathname;
        if(path==='/data/tools.json')return new Response(tools,{status:200,headers:{'content-type':'application/json'}});
        if(path==='/data/intents.json')return new Response(intents,{status:200,headers:{'content-type':'application/json'}});
        if(path==='/distribution/publisher-kit.html')return new Response(publisherKit,{status:200,headers:{'content-type':'text/html; charset=UTF-8'}});
        return new Response('not found',{status:404});
      }
    }
  };
}

test('Finder embed is an inline discovery product rather than a link-only launcher',()=>{
  const src=read('embed/toolscout-finder.js');
  assert.match(src,/attachShadow\(\{mode:'open'\}\)/);
  assert.match(src,/\/api\/recommend/);
  assert.match(src,/data\.mode|dataset\.mode/);
  assert.match(src,/dataset\.publisher/);
  assert.match(src,/profile_click/);
  assert.match(src,/vendor_click/);
  assert.match(src,/data-toolscout-embed','finder/);
  assert.doesNotMatch(src,/window\.open\('https:\/\/trytoolscout\.org\/\?'/);
});

test('public recommendation API refuses unrecognised noise',async()=>{
  const response=await handleDistributionEmbedRoute(new Request('https://trytoolscout.org/api/recommend?q=coiso'),assetEnv());
  assert.equal(response.status,422);
  const body=await response.json();
  assert.equal(body.error,'recommendation_unresolved');
});

test('broad category searches avoid fake personalised percentages',async()=>{
  const response=await handleDistributionEmbedRoute(new Request('https://trytoolscout.org/api/recommend?q=SEO'),assetEnv());
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.recommendation_type,'category');
  assert.ok(body.recommendations.length>0);
  assert.equal(body.recommendations[0].match,null);
  assert.equal(body.recommendations[0].match_type,'category_fit');
  assert.match(body.recommendations[0].match_label,/category fit/i);
});

test('embed telemetry is publisher-attributed and does not require raw queries',async()=>{
  let sql='',bindings=[];
  const env={
    DB:{
      prepare(statement){
        sql=statement;
        return {bind(...args){bindings=args;return{async run(){return{success:true}}}}};
      }
    }
  };
  const response=await handleDistributionLearningRoute(new Request('https://trytoolscout.org/api/distribution/embed-event',{
    method:'POST',
    headers:{Origin:'https://publisher.example','Content-Type':'text/plain;charset=UTF-8'},
    body:JSON.stringify({embed_type:'finder',event:'results',publisher_id:'publisher-one',mode:'full',result_count:3,intent_slug:'seo-tools'})
  }),env);
  assert.equal(response.status,204);
  assert.match(sql,/INSERT INTO distribution_embed_events/);
  assert.equal(bindings[3],'publisher-one');
  assert.equal(bindings[4],'publisher.example');
  assert.ok(!bindings.some(value=>String(value||'').includes('raw search text')));
});

test('embed telemetry migration stores interaction evidence without a raw query field',()=>{
  const migration=read('migrations/0107_distribution_embed_product.sql');
  assert.match(migration,/CREATE TABLE IF NOT EXISTS distribution_embed_events/);
  const table=migration.match(/CREATE TABLE IF NOT EXISTS distribution_embed_events\s*\(([\s\S]*?)\);/i)?.[1]||'';
  assert.doesNotMatch(table,/\bquery(?:_|\s)/i);
  assert.match(table,/publisher_id TEXT/);
  assert.match(table,/source_host TEXT/);
  assert.match(table,/result_slug TEXT/);
});

test('Finder supports three public colour themes with backwards-compatible aliases',()=>{
  const src=read('embed/toolscout-finder.js');
  assert.match(src,/requestedTheme/);
  assert.match(src,/graphite:\{bg:'#0B0D0C'/);
  assert.match(src,/paper:\{bg:'#F3F5F1'/);
  assert.match(src,/neutral:\{bg:'#F8F9F6'/);
  assert.match(src,/requestedTheme==='paper'\|\|requestedTheme==='light'/);
  assert.match(src,/data-toolscout-theme/);
  assert.match(src,/theme,/);
  const profile=JSON.parse(read('data/distribution-publishing-profile.json'));
  assert.deepEqual(profile.product.finder_widget.themes.map(x=>x.id),['graphite','paper','neutral']);
  assert.equal(profile.product.finder_widget.legacy_theme_aliases.dark,'graphite');
  assert.equal(profile.product.finder_widget.legacy_theme_aliases.light,'paper');
});

test('publisher kit leads with Finder Full and Mini plus a non-tracking live demo',async()=>{
  const response=await handleDistributionEmbedRoute(new Request('https://trytoolscout.org/distribution/publisher-kit'),assetEnv());
  assert.equal(response.status,200);
  const html=await response.text();
  assert.match(html,/Add software discovery to your site\./);
  assert.match(html,/Finder Full/);
  assert.match(html,/Finder Mini/);
  assert.match(html,/Finder Full · live demo/);
  assert.match(html,/Finder Mini · live demo/);
  assert.match(html,/data-mode="full" data-theme="graphite" data-track="false"/);
  assert.match(html,/data-mode="mini" data-theme="paper" data-track="false"/);
  assert.match(html,/Colour themes/);
  assert.match(html,/data-theme="graphite"/);
  assert.match(html,/data-theme="paper"/);
  assert.match(html,/data-theme="neutral"/);
  assert.match(html,/Existing <code>dark<\/code> and <code>light<\/code> values remain supported as aliases/);
  assert.match(html,/data-track="false"/);
  assert.match(html,/one script tag/i);
  assert.match(html,/raw Finder query/i);
  assert.match(html,/name="robots" content="index,follow"/);
  assert.match(html,/href="\/software-trends-index">Trends<\/a>/);
  assert.match(html,/href="\/distribution\/publisher-kit" aria-current="page">Publisher Kit<\/a>/);
  assert.match(html,/data-toolscout-sticky-nav="2"/);
  assert.match(html,/class="nav-cta" href="\/#finder">Find my tools/);
  const sitemap=read('sitemap.xml');
  assert.match(sitemap,/https:\/\/trytoolscout\.org\/software-trends-index/);
  assert.match(sitemap,/https:\/\/trytoolscout\.org\/distribution\/publisher-kit/);
  const sitemapGenerator=read('scripts/generate-sitemap.mjs');
  assert.match(sitemapGenerator,/RUNTIME_CORE_URLS/);
  assert.match(sitemapGenerator,/publisherKitIncluded/);
});

test('Distribution Network outreach leads with the free Finder offer',()=>{
  const src=read('distribution-network-worker.js');
  assert.match(src,/Free software Finder widget for/);
  assert.match(src,/free software discovery Finder that publishers can add with one script tag/);
  assert.match(src,/distribution_embed_events/);
  assert.match(src,/publishers30d/);
});


test('Airbnb business discovery decomposes jobs instead of fabricating property manager recommendations',async()=>{
  for(const q of ['best software to manage an Airbnb business','melhor software para gerir um negócio de Airbnb','software for managing a vacation rental business']){
    const response=await handleDistributionEmbedRoute(new Request('https://trytoolscout.org/api/recommend?q='+encodeURIComponent(q)),assetEnv());
    assert.equal(response.status,200,q);
    const data=await response.json();
    assert.equal(data.recommendation_type,'workflow_guidance',q);
    assert.equal(data.guidance.industry,'short_term_rentals');
    assert.equal(data.recommendations.length,0);
    assert.match(data.guidance.explanation,/does not currently have.*PMS/i);
    assert.ok(data.guidance.workflows.some(w=>w.category==='crm'));
    assert.ok(data.guidance.workflows.some(w=>w.category==='business'));
    assert.ok(data.guidance.workflows.every(w=>typeof w.job==='string'&&w.job.length>10));
  }
});

test('general business questions get actionable workflow decomposition',async()=>{
  for(const q of ['software for managing a small business','best software to run a restaurant business']){
    const response=await handleDistributionEmbedRoute(new Request('https://trytoolscout.org/api/recommend?q='+encodeURIComponent(q)),assetEnv());
    assert.equal(response.status,200,q);
    const data=await response.json();
    assert.equal(data.recommendation_type,'workflow_guidance');
    assert.equal(data.guidance.industry,'general_business');
    assert.equal(data.recommendations.length,0);
    assert.equal(data.guidance.workflows.length,4);
  }
});

test('specific business job avoids broad workflow guide',async()=>{
  const response=await handleDistributionEmbedRoute(new Request('https://trytoolscout.org/api/recommend?q='+encodeURIComponent('CRM for my Airbnb guest enquiries')),assetEnv());
  assert.equal(response.status,200);
  const data=await response.json();
  assert.notEqual(data.recommendation_type,'workflow_guidance');
  assert.ok(data.recommendations.length>0);
  assert.ok(data.recommendations.every(t=>t.category==='crm'));
});

test('Finder scores are evidence-weighted, differentiated and restricted to relevant categories',async()=>{
  const queries=[
    {q:'CRM for a small sales team',category:'crm'},
    {q:'SEO software for agency keyword research',category:'seo'},
    {q:'workflow automation software for repetitive tasks',category:'automation'}
  ];
  for(const row of queries){
    const response=await handleDistributionEmbedRoute(new Request('https://trytoolscout.org/api/recommend?q='+encodeURIComponent(row.q)),assetEnv());
    assert.equal(response.status,200,row.q);
    const data=await response.json();
    assert.ok(data.recommendations.length>=2,row.q);
    assert.ok(data.recommendations.every(t=>t.category===row.category),row.q);
    assert.ok(data.recommendations.every(t=>Number.isFinite(t.match)&&t.match>66),row.q);
    assert.ok(data.recommendations.every(t=>/\/100 fit score/.test(t.match_label)),row.q);
    assert.ok(new Set(data.recommendations.map(t=>t.match)).size>1,row.q+' has an unexplained score tie');
    assert.ok(data.recommendations.every(t=>t.tool_url==='https://trytoolscout.org/go/'+t.slug));
  }
});

test('homepage and publisher embeds use one recommendation endpoint and do not manufacture a percentage',()=>{
  const home=read('app.js'),embed=read('embed/toolscout-finder.js');
  assert.match(home,/fetch\(api\('\/api\/recommend\?/);
  assert.doesNotMatch(home,/function scoreTool\(/);
  assert.match(home,/workflow_guidance/);
  assert.match(embed,/workflow_guidance/);
  assert.match(embed,/\/api\/recommend/);
  assert.doesNotMatch(embed,/% match/);
});

test('unverified Free status cannot enter free-only Finder shortlist',async()=>{
  const response=await handleDistributionEmbedRoute(new Request('https://trytoolscout.org/api/recommend?q=CRM&budget=free'),assetEnv());
  assert.equal(response.status,200);
  const data=await response.json();
  assert.ok(data.recommendations.length>0);
  const rows=JSON.parse(tools);
  for(const item of data.recommendations){
    const product=rows.find(t=>t.slug===item.slug);
    assert.equal(product.freePlanKnown,true);
    assert.equal(product.freePlan,true);
  }
});


test('Budget vocabulary distinguishes an affordable paid product from free only',async()=>{
  const cheap=await handleDistributionEmbedRoute(new Request('https://trytoolscout.org/api/recommend?q=cheap%20CRM'),assetEnv());
  assert.equal(cheap.status,200);
  const cheapData=await cheap.json();
  assert.equal(cheapData.profile.budget,'low');
  assert.ok(cheapData.recommendations.length>0);
  const free=await handleDistributionEmbedRoute(new Request('https://trytoolscout.org/api/recommend?q=free%20CRM'),assetEnv());
  assert.equal(free.status,200);
  const freeData=await free.json();
  assert.equal(freeData.profile.budget,'free');
});

test('homepage sends only explicit guided selections to API and displays server-derived profile',()=>{
  const source=read('app.js');
  assert.match(source,/if\(profile\[k\]\)params\.set\(k,profile\[k\]\)/);
  assert.match(source,/p=data\.profile\|\|p/);
  assert.doesNotMatch(source,/if\(p\[k\]\)params\.set\(k,p\[k\]\)/);
});
