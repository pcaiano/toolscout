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
  assert.match(html,/class="decisionDoors"/);
  assert.match(html,/class="doorTag">Guides<\/span>/);
  assert.doesNotMatch(html,/doorLogos/);
  const compare=html.indexOf('id="compare"');
  const updates=html.indexOf('id="updates"');
  const picks=html.indexOf('id="picks"');
  const editorial=html.indexOf('class="section editorialProof"');
  const trust=html.indexOf('class="trust"');
  assert.ok(compare<updates&&updates<picks&&picks<editorial&&editorial<trust);
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


test('public hubs receive ToolScout 2.0 surface styling and active navigation',async()=>{
  const source='<!doctype html><html><head></head><body><div class="wrap"><main><h1>Hub</h1></main></div></body></html>';
  for(const item of [
    ['/tools.html','tools','>Tools<'],
    ['/guides.html','guides','>Guides<'],
    ['/compare.html','compare','>Compare<'],
    ['/whats-new.html','whats-new',">What's new<"]
  ]){
    const [path,surface,label]=item;
    const response=new Response(source,{status:200,headers:{'content-type':'text/html; charset=UTF-8'}});
    const out=await transformPublicRedesignResponse(new Request('https://trytoolscout.org'+path),response);
    const html=await out.text();
    assert.ok(html.includes('data-toolscout-surface="'+surface+'"'));
    assert.ok(html.includes(label));
    assert.match(html,/aria-current="page"/);
  }
  const runtime=read('public-redesign-runtime.js');
  assert.match(runtime,/ToolScout 2\.0 hub surfaces/);
  assert.match(runtime,/data-toolscout-surface="whats-new"/);
  assert.match(runtime,/\.ts2-global-nav\{background:var\(--ts-g\)/);
});


test('tool directory exposes profile and vendor visit actions side by side',()=>{
  const html=read('tools.html');
  assert.match(html,/class="tool-actions"/);
  assert.match(html,/class="tool-link" href="\$\{profile\}">View profile<\/a>/);
  assert.match(html,/class="tool-visit" href="\/go\/\$\{encodeURIComponent\(t\.slug\)\}\?source=tools-directory"/);
  assert.match(html,/Visit tool ↗/);
});
