import test from 'node:test';
import assert from 'node:assert/strict';
import {handlePublicEditorialRoute,ownsPublicEditorialPath} from '../public-editorial-runtime.js';

const article='<!doctype html><html><head><title>Zapier update | ToolScout</title><link rel="canonical" href="https://trytoolscout.org/news/zapier-update.html"><link rel="icon" href="/favicon.svg"></head><body><main><h1>Zapier update</h1><p>ToolScout analysis: what this means for buyers.</p><a href="https://zapier.com/">Official source</a></main></body></html>';
const env={ASSETS:{fetch:async()=>new Response(article,{status:200,headers:{'Content-Type':'text/html; charset=UTF-8','Cache-Control':'public, max-age=300'}})}};

test('news path is owned by the direct editorial public plane',()=>{
  assert.equal(ownsPublicEditorialPath('/news/zapier-update'),true);
  assert.equal(ownsPublicEditorialPath('/best-seo-tools-for-agencies'),false);
});

test('direct news response uses ToolScout 2.0 and removes non-monetizable external anchors',async()=>{
  const response=await handlePublicEditorialRoute(new Request('https://trytoolscout.org/news/zapier-update'),env);
  assert.equal(response.status,200);
  assert.equal(response.headers.get('X-ToolScout-Public-Plane'),'editorial-v1');
  const html=await response.text();
  assert.match(html,/rel="canonical" href="https:\/\/trytoolscout\.org\/news\/zapier-update"/);
  assert.doesNotMatch(html,/trytoolscout\.org\/news\/zapier-update\.html/);
  assert.match(html,/data-toolscout-redesign="2"/);
  assert.match(html,/data-toolscout-surface="news"/);
  assert.match(html,/class="ts2-global-nav"/);
  assert.doesNotMatch(html,/href="https:\/\/zapier\.com\//);
  assert.match(html,/>Official source</);
  assert.doesNotMatch(html,/href="https:\/\/(?:www\.)?(?:linkedin\.com|x\.com|bsky\.app|dev\.to|pinterest\.com|threads\.com)/);
  assert.doesNotMatch(html,/data-toolscout-social-footer="1"|ToolScout elsewhere/);
});

test('legacy .html news URL redirects to the existing canonical path',async()=>{
  const response=await handlePublicEditorialRoute(new Request('https://trytoolscout.org/news/zapier-update.html?x=1'),env);
  assert.equal(response.status,308);
  assert.equal(response.headers.get('location'),'https://trytoolscout.org/news/zapier-update?x=1');
});

test('non-news pages remain on staged legacy fallback',async()=>{
  const response=await handlePublicEditorialRoute(new Request('https://trytoolscout.org/best-seo-tools-for-agencies'),env);
  assert.equal(response,null);
});


test('Software Trends HTML is owned by the direct editorial plane',()=>{
  assert.equal(ownsPublicEditorialPath('/software-trends-index'),true);
  assert.equal(ownsPublicEditorialPath('/software-trends-index.html'),true);
  assert.equal(ownsPublicEditorialPath('/software-trends-index.json'),true);
});

test('Software Trends legacy html URL preserves current extensionless redirect behavior',async()=>{
  const response=await handlePublicEditorialRoute(
    new Request('https://trytoolscout.org/software-trends-index.html?edition=2026-09'),
    env
  );
  assert.equal(response.status,308);
  assert.equal(response.headers.get('location'),'https://trytoolscout.org/software-trends-index?edition=2026-09');
});

test('Software Trends JSON dataset bypasses HTML transforms',async()=>{
  const datasetEnv={ASSETS:{fetch:async request=>{
    const p=new URL(request.url).pathname;
    if(p==='/software-trends-index.json')return new Response(JSON.stringify({version:4,updates:[]}),{status:200,headers:{'Content-Type':'application/json'}});
    return new Response('not found',{status:404});
  }}};
  const response=await handlePublicEditorialRoute(
    new Request('https://trytoolscout.org/software-trends-index.json'),
    datasetEnv
  );
  assert.equal(response.status,200);
  assert.equal(response.headers.get('X-ToolScout-Public-Plane'),'editorial-v1');
  assert.match(response.headers.get('content-type')||'',/application\/json/);
  const body=await response.json();
  assert.equal(body.version,4);
});


test('Software Trends direct owner also receives redesign and outbound protection',async()=>{
  const trends='<html><head><link rel="canonical" href="https://trytoolscout.org/software-trends-index"></head><body><div class="wrap"><div class="top">Legacy nav</div><main><header class="hero"><h1>Software trends</h1></header><a href="https://vendor.example/source">Primary source</a><a href="/news/example">Read ToolScout article</a></main></div></body></html>';
  const trendsEnv={ASSETS:{fetch:async()=>new Response(trends,{status:200,headers:{'Content-Type':'text/html; charset=UTF-8'}})}};
  const response=await handlePublicEditorialRoute(new Request('https://trytoolscout.org/software-trends-index'),trendsEnv);
  const html=await response.text();
  assert.match(html,/data-toolscout-redesign="2"/);
  assert.match(html,/data-toolscout-surface="trends"/);
  assert.match(html,/class="ts2-global-nav"/);
  assert.doesNotMatch(html,/href="https:\/\/vendor\.example\/source"/);
  assert.match(html,/href="\/news\/example"/);
});
