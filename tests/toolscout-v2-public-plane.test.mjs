import test from 'node:test';
import assert from 'node:assert/strict';
import {handlePublicEditorialRoute,ownsPublicEditorialPath} from '../public-editorial-runtime.js';

const article='<!doctype html><html><head><title>Zapier update | ToolScout</title><link rel="canonical" href="https://trytoolscout.org/news/zapier-update"><link rel="icon" href="/favicon.svg"></head><body><main><h1>Zapier update</h1><p>ToolScout analysis: what this means for buyers.</p><a href="https://zapier.com/">Official source</a></main></body></html>';
const env={ASSETS:{fetch:async()=>new Response(article,{status:200,headers:{'Content-Type':'text/html; charset=UTF-8','Cache-Control':'public, max-age=300'}})}};

test('news path is owned by the direct editorial public plane',()=>{
  assert.equal(ownsPublicEditorialPath('/news/zapier-update'),true);
  assert.equal(ownsPublicEditorialPath('/best-seo-tools-for-agencies'),false);
});

test('direct news response preserves editorial evidence and adds standard public transforms',async()=>{
  const response=await handlePublicEditorialRoute(new Request('https://trytoolscout.org/news/zapier-update'),env);
  assert.equal(response.status,200);
  assert.equal(response.headers.get('X-ToolScout-Public-Plane'),'editorial-v1');
  const html=await response.text();
  assert.match(html,/rel="canonical" href="https:\/\/trytoolscout\.org\/news\/zapier-update"/);
  assert.match(html,/https:\/\/zapier\.com\//);
  assert.match(html,/data-toolscout-social-footer="1"/);
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
