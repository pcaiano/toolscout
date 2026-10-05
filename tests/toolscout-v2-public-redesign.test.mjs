import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {transformPublicOutboundPolicyResponse,transformPublicRedesignResponse} from '../public-redesign-runtime.js';

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
  assert.match(html,/Editorial evidence:/);
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
  assert.match(runtime,/\.ts2-global-nav\{position:sticky;top:0;z-index:1000;background:rgba\(11,13,12,\.96\)/);
});


test('tool directory exposes profile and vendor visit actions side by side',()=>{
  const html=read('tools.html');
  assert.match(html,/class="tool-actions"/);
  assert.match(html,/class="tool-link" href="\$\{profile\}">View profile<\/a>/);
  assert.match(html,/class="tool-visit" href="\/go\/\$\{encodeURIComponent\(t\.slug\)\}\?source=tools-directory"/);
  assert.match(html,/Visit tool ↗/);
});


test('core public hubs do not append SEO link farms beneath the product UI',()=>{
  const discovery=read('public-discovery-links.js');
  const seo=read('seo-cloudflare-runtime-worker.js');
  assert.match(discovery,/\['\/tools','\/guides','\/compare'\]\.includes\(path\)/);
  assert.doesNotMatch(seo,/if\(\['\/guides','\/tools','\/compare'\]\.includes\(pathname\).*data-toolscout-index-recovery-links/);
  assert.match(seo,/Do not append search-demand link farms to the visible page/);
});

test('public social footer stays compact in ToolScout 2.0',()=>{
  const social=read('social-profiles.js');
  assert.match(social,/ToolScout elsewhere/);
  assert.match(social,/margin:24px auto 0/);
  assert.doesNotMatch(social,/Follow ToolScout/);
});


test('tool profiles do not expose preliminary generic decision-depth blocks',()=>{
  const seo=read('seo-cloudflare-runtime-worker.js');
  assert.match(seo,/stripGenericToolDecisionDepth\(html,pathname\)/);
  assert.match(seo,/cloudflare-decision-depth-v1/);
  assert.match(seo,/const bestPageDepth=state&&pathname\.startsWith\('\/best-'\)/);
  assert.match(seo,/if\(bestPageDepth&&!html\.includes\('organic-growth:runtime-start'\)/);
});

test('commercial source cleanup leaves readable verification wording',async()=>{
  const source='<!doctype html><html><head></head><body><p class="small"><strong>Editorial evidence:</strong> <a href="https://vendor.example/docs">Official product source</a>. Source data last checked 2026-09-01. Vendor pricing can change.</p></body></html>';
  const response=new Response(source,{status:200,headers:{'content-type':'text/html; charset=UTF-8'}});
  const out=await transformPublicRedesignResponse(new Request('https://trytoolscout.org/tools/example'),response);
  const html=await out.text();
  assert.doesNotMatch(html,/https:\/\/vendor\.example|Source data last checked/);
  assert.match(html,/Editorial evidence:/);
  assert.match(html,/Information last checked 2026-09-01/);
});


test('tools directory keeps the intro concise, shows catalog count and spaces AI editorial copy',()=>{
  const html=read('tools.html');
  assert.match(html,/Use the directory to narrow the decision\./);
  assert.doesNotMatch(html,/A larger feature list is not automatically better/);
  assert.match(html,/id="catalogCount"/);
  assert.match(html,/catalogTotal=catalog\.length/);
  assert.match(html,/catalogTotal===1\?'tool':'tools'/);
  assert.match(html,/in catalog/);
  assert.match(html,/\.ai-badge\+\.tool-view\{margin-top:16px\}/);
});


test('shared public navigation is isolated from legacy nav CSS and matches homepage spacing',()=>{
  const runtime=read('public-redesign-runtime.js');
  assert.match(runtime,/class="ts2-links" role="navigation" aria-label="Primary"/);
  assert.doesNotMatch(runtime,/<nav class="ts2-links"/);
  assert.match(runtime,/justify-content:flex-start!important/);
  assert.match(runtime,/flex:0 0 auto!important/);
  assert.match(runtime,/height:84px;max-width:1440px/);
  assert.match(runtime,/\.ts2-global-nav\{position:sticky;top:0;z-index:1000/);
  assert.match(runtime,/\.ts2-global-nav\.is-compact \.ts2-global-nav-inner\{height:64px\}/);
  assert.match(runtime,/data-toolscout-sticky-nav="2"/);
  assert.match(runtime,/classList\.toggle\('is-compact',delta>0\)/);
  assert.match(runtime,/min-height:72px;padding:14px 20px 11px/);
  assert.match(runtime,/min-height:62px;padding:8px 20px 7px/);
  assert.match(runtime,/font-size:12px;color:#BAC0BA/);
});


test('homepage header leaves the finder as the primary action',()=>{
  const html=read('index.html');
  assert.doesNotMatch(html,/class="navCta"/);
  assert.doesNotMatch(html,/href="#finder">Find my tools/);
  assert.match(html,/id="need"/);
  assert.match(html,/class="homeGlobalNav darkBand"/);
  assert.match(html,/\.homeGlobalNav\{position:sticky;top:0;z-index:1000/);
  assert.match(html,/\.homeGlobalNav\.is-compact nav\{height:64px\}/);
  assert.match(html,/data-toolscout-sticky-nav="home"/);
  assert.match(html,/classList\.toggle\('is-compact',delta>0\)/);
  assert.match(html,/min-height:64px;padding:12px 0 9px/);
  assert.match(html,/min-height:58px;padding:7px 0 6px/);
});


test('software news receives the ToolScout 2.0 news surface',async()=>{
  const source='<!doctype html><html><head></head><body><div class="wrap article"><div class="top"><a class="brand" href="/">ToolScout</a></div><main><header class="hero"><h1>News</h1></header></main></div></body></html>';
  const response=new Response(source,{status:200,headers:{'content-type':'text/html; charset=UTF-8'}});
  const out=await transformPublicRedesignResponse(new Request('https://trytoolscout.org/news/example-story'),response);
  const html=await out.text();
  assert.match(html,/data-toolscout-surface="news"/);
  assert.match(html,/data-toolscout-public-redesign="2"/);
  assert.match(html,/\.ts2-global-nav \+ \.wrap > \.top:first-child\{display:none!important\}/);
});

test('public outbound policy removes direct external anchors but preserves internal profile and monetizable CTA routes',async()=>{
  const source='<!doctype html><html><head></head><body><a href="https://vendor.example/source">Source</a><a href="/tools/example">Profile</a><a href="/go/example?source=software-news">Visit example</a></body></html>';
  const response=new Response(source,{status:200,headers:{'content-type':'text/html; charset=UTF-8'}});
  const out=await transformPublicOutboundPolicyResponse(new Request('https://trytoolscout.org/news/example-story'),response);
  const html=await out.text();
  assert.doesNotMatch(html,/href="https:\/\/vendor\.example\/source"/);
  assert.match(html,/>Source</);
  assert.match(html,/href="\/tools\/example"/);
  assert.match(html,/href="\/go\/example\?source=software-news"/);
});

test('public outbound policy also applies to the homepage while private surfaces remain untouched',async()=>{
  const source='<!doctype html><html><head></head><body><a href="https://external.example/">External</a></body></html>';
  const home=await transformPublicOutboundPolicyResponse(new Request('https://trytoolscout.org/'),new Response(source,{status:200,headers:{'content-type':'text/html'}}));
  assert.doesNotMatch(await home.text(),/href="https:\/\/external\.example\//);
  const privateResponse=await transformPublicOutboundPolicyResponse(new Request('https://trytoolscout.org/analytics'),new Response(source,{status:200,headers:{'content-type':'text/html'}}));
  assert.equal(await privateResponse.text(),source);
});
