import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {transformPublicRedesignResponse} from '../public-redesign-runtime.js';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('homepage keeps canonical, structured data, recommendation ids and editorial pulse',()=>{
  const html=read('index.html');
  assert.match(html,/rel="canonical" href="https:\/\/trytoolscout\.org\/"/);
  assert.match(html,/application\/ld\+json/);
  for(const id of ['need','go','guidedStart','guided','progress','question','choices','back','results','softwarePulse'])assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(html,/Independent\. No sponsored rankings\./);
  assert.match(html,/What's new · live/);
  assert.match(html,/href="\/guides\.html">Guides<\/a>/);
  assert.match(html,/id="homeCompareA"/);
  assert.match(html,/id="homeCompareB"/);
  assert.match(html,/class="doorTag">Comparator<\/span>/);
  assert.doesNotMatch(html,/class="comparisonRow"/);
  assert.match(html,/id="pulseCycle"/);
  assert.match(html,/scheduleRotation\(\)/);
  assert.match(html,/prefers-reduced-motion:reduce/);
});

test('public redesign injects the shared shell without changing canonical content',async()=>{
  const source='<!doctype html><html><head><link rel="canonical" href="https://trytoolscout.org/tools/figma"></head><body><div class="wrap"><a class="brand" href="/">ToolScout</a><main><h1>Figma</h1></main></div></body></html>';
  const response=new Response(source,{status:200,headers:{'content-type':'text/html; charset=UTF-8'}});
  const out=await transformPublicRedesignResponse(new Request('https://trytoolscout.org/tools/figma'),response);
  const html=await out.text();
  assert.match(html,/data-toolscout-public-redesign="2"/);
  assert.match(html,/<html[^>]*data-toolscout-redesign="2"/);
  assert.match(html,/class="ts2-global-nav"/);
  assert.match(html,/rel="canonical" href="https:\/\/trytoolscout\.org\/tools\/figma"/);
  assert.match(html,/>Figma</);
});

test('public redesign skips private Command Center and homepage',async()=>{
  for(const url of ['https://trytoolscout.org/analytics','https://trytoolscout.org/']){
    const source='<!doctype html><html><head></head><body><main>Untouched</main></body></html>';
    const response=new Response(source,{status:200,headers:{'content-type':'text/html'}});
    const out=await transformPublicRedesignResponse(new Request(url),response);
    assert.equal(await out.text(),source);
  }
});


test('compute router applies redesign to direct public decision and navigation owners',()=>{
  const router=read('compute-router-worker.js');
  assert.match(router,/ownership\.owner==='public_decision'\|\|ownership\.owner==='public_navigation'/);
  assert.match(router,/response=await transformPublicRedesignResponse\(request,response\)/);
});


test('public redesign removes direct vendor source links from commercial decision pages',async()=>{
  const source='<!doctype html><html><head></head><body><main><h1>Example tool</h1><p class="small"><strong>Editorial evidence:</strong> <a href="https://vendor.example/pricing" target="_blank" rel="noopener">Official product source</a>. Information last checked 2026-10-05.</p><p class="source-note"><strong>Primary sources:</strong> <a href="https://vendor.example/">Example official source</a>.</p><a href="/go/example" rel="nofollow sponsored">Explore Example</a></main></body></html>';
  const response=new Response(source,{status:200,headers:{'content-type':'text/html; charset=UTF-8'}});
  const out=await transformPublicRedesignResponse(new Request('https://trytoolscout.org/tools/example'),response);
  const html=await out.text();
  assert.doesNotMatch(html,/https:\/\/vendor\.example/);
  assert.doesNotMatch(html,/Official product source|Primary sources:/);
  assert.match(html,/href="\/go\/example"/);
});
