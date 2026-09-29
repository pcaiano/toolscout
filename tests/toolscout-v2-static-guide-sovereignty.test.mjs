import test from 'node:test';
import assert from 'node:assert/strict';
import {renderRuntimeRanking} from '../catalog-runtime-ranking.js';
import fs from 'node:fs';

const intent={
  slug:'best-seo-tools-for-agencies',
  title:'Best SEO Tools for Agencies',
  category:'seo',
  allowedCategories:['seo'],
  keywords:['seo','keyword research'],
  weights:{seo:1,research:0.8}
};
const tools=[
  {slug:'alpha-seo',name:'Alpha SEO',category:'seo',description:'SEO and keyword research platform',features:['seo','keyword research'],bestFor:['agencies'],scores:{seo:9,research:8},sourceUrl:'https://alpha.example.com',lastVerified:'2026-09-29',provenance:{mode:'runtime_trusted_catalog'}},
  {slug:'beta-seo',name:'Beta SEO',category:'seo',description:'SEO keyword research software',features:['seo','keyword research'],bestFor:['agencies'],scores:{seo:8,research:8},sourceUrl:'https://beta.example.com',lastVerified:'2026-09-29'}
];

function envWithStaticGuide(staticExists){
  return {
    ASSETS:{
      fetch:async request=>{
        const p=new URL(request.url).pathname;
        if(p==='/data/intents.json')return Response.json([intent]);
        if(p==='/data/seo-longtail.json')return Response.json({intents:[]});
        if(p==='/best-seo-tools-for-agencies.html'||p==='/best-seo-tools-for-agencies'){
          return staticExists
            ?new Response('<!doctype html><html><body>existing guide</body></html>',{status:200,headers:{'Content-Type':'text/html; charset=UTF-8'}})
            :new Response('not found',{status:404});
        }
        return new Response('not found',{status:404});
      }
    }
  };
}

test('existing static guide is sovereign over runtime ranking',async()=>{
  const response=await renderRuntimeRanking(envWithStaticGuide(true),'/best-seo-tools-for-agencies',tools);
  assert.equal(response,null);
});

test('runtime ranking is creation-only and carries primary evidence',async()=>{
  const response=await renderRuntimeRanking(envWithStaticGuide(false),'/best-seo-tools-for-agencies',tools);
  assert.ok(response instanceof Response);
  const html=await response.text();
  assert.match(html,/Official source/);
  assert.match(html,/Source checked 2026-09-29/);
  assert.match(html,/https:\/\/alpha\.example\.com/);
});

test('runtime-admitted tool profile generator exposes official evidence',()=>{
  const src=fs.readFileSync(new URL('../catalog-autonomy-worker.js',import.meta.url),'utf8');
  assert.match(src,/Editorial evidence:/);
  assert.match(src,/Official product source/);
  assert.match(src,/tool\.sourceUrl/);
});
