import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {handleDistributionEmbedRoute} from '../distribution-embed-worker.js';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const tools=read('data/tools.json');
const intents=read('data/intents.json');

function assetEnv(){
  return {
    ASSETS:{
      async fetch(request){
        const path=new URL(request.url).pathname;
        if(path==='/data/tools.json')return new Response(tools,{status:200,headers:{'content-type':'application/json'}});
        if(path==='/data/intents.json')return new Response(intents,{status:200,headers:{'content-type':'application/json'}});
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
  const response=await handleDistributionEmbedRoute(new Request('https://trytoolscout.org/api/distribution/embed-event',{
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

test('publisher kit leads with Finder Full and Mini plus a non-tracking live demo',async()=>{
  const response=await handleDistributionEmbedRoute(new Request('https://trytoolscout.org/distribution/publisher-kit'),{});
  assert.equal(response.status,200);
  const html=await response.text();
  assert.match(html,/Add software discovery to your site\./);
  assert.match(html,/Finder Full/);
  assert.match(html,/Finder Mini/);
  assert.match(html,/data-track="false"/);
  assert.match(html,/one script tag/i);
  assert.match(html,/raw Finder query/i);
});

test('Distribution Network outreach leads with the free Finder offer',()=>{
  const src=read('distribution-network-worker.js');
  assert.match(src,/Free software Finder widget for/);
  assert.match(src,/free software discovery Finder that publishers can add with one script tag/);
  assert.match(src,/distribution_embed_events/);
  assert.match(src,/publishers30d/);
});
