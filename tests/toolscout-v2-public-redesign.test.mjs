import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {transformPublicOutboundPolicyResponse,transformPublicRedesignResponse} from '../public-redesign-runtime.js';
import {injectToolScoutSocialFooter} from '../social-profiles.js';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('homepage keeps canonical, structured data, recommendation ids and editorial pulse',()=>{
  const html=read('index.html');
  assert.match(html,/rel="canonical" href="https:\/\/trytoolscout\.org\/"/);
  assert.match(html,/application\/ld\+json/);
  for(const id of ['need','go','guidedStart','guided','progress','question','choices','back','results','softwarePulse'])assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(html,/Independent\. No sponsored rankings\./);
  assert.match(html,/What's new · live/);
  assert.match(html,/href="\/guides">Guides<\/a>/);
  assert.match(html,/href="\/software-trends-index">Trends<\/a>/);
  assert.match(html,/href="\/distribution\/publisher-kit">Publisher Kit<\/a>/);
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

test('desktop homepage hero reveals the next section and keeps an explicit scroll cue',()=>{
  const html=read('index.html');
  assert.match(html,/\.hero\{min-height:410px;/);
  assert.match(html,/\.heroCopy\{padding:34px 0 36px;/);
  assert.match(html,/content:"Explore ↓"/);
  assert.match(html,/\.contentShell\{padding-top:52px;/);
});

test('Guides hub does not regress the redundant Trends promo block',()=>{
  const html=read('guides.html');
  assert.doesNotMatch(html,/Original research[\s\S]*Software Trends Index/);
  assert.match(html,/Buying guides/);
});

test('commercial detail families are owned by explicit ToolScout 2.0 surfaces',async()=>{
  const cases=[
    ['/tools/figma','tool-profile','Tools'],
    ['/best-project-management-tools','guide-detail','Guides'],
    ['/make-vs-zapier','compare','Compare'],
    ['/distribution/publisher-kit','publisher-kit','Publisher Kit']
  ];
  for(const [path,surface,label] of cases){
    const source='<!doctype html><html><head></head><body><div class="wrap"><a class="brand" href="./">ToolScout</a><main class="hero"><h1>Page</h1></main><section class="grid"><article class="card">Card</article></section></div></body></html>';
    const out=await transformPublicRedesignResponse(new Request('https://trytoolscout.org'+path),new Response(source,{status:200,headers:{'content-type':'text/html; charset=UTF-8'}}));
    const html=await out.text();
    assert.match(html,new RegExp('data-toolscout-surface="'+surface+'"'),path);
    assert.ok(html.includes('>'+label+'<'),path);
    assert.match(html,/data-toolscout-public-redesign="2"/,path);
  }
  const runtime=read('public-redesign-runtime.js');
  assert.match(runtime,/ToolScout 2\.0 tool profiles/);
  assert.match(runtime,/ToolScout 2\.0 individual buying guides/);
  assert.match(runtime,/data-toolscout-surface="publisher-kit"/);
  assert.match(runtime,/data-toolscout-surface="tools"\] \.tool-visit/);
  assert.match(runtime,/toolscout-v2-native\.css/);
  const nativeCss=read('toolscout-v2-native.css');
  assert.match(nativeCss,/TOOL PROFILES/);
  assert.match(nativeCss,/WHAT'S NEW/);
  assert.match(nativeCss,/grid-template-columns:minmax\(0,1fr\) 260px/);
  assert.match(nativeCss,/background:var\(--ts2-g\)!important/);
});

test('public redesign is idempotent and collapses duplicate current and legacy navigation',async()=>{
  const source='<!doctype html><html><head><style data-toolscout-public-redesign="2"></style></head><body><header class="ts2-global-nav"><div>Old v2 A</div></header><script data-toolscout-sticky-nav="2">void 0</script><header class="ts2-global-nav"><div>Old v2 B</div></header><nav><a class="brand" href="./">ToolScout</a><div class="links"><a href="./tools">Tools</a></div></nav><div class="wrap"><main><h1>Compare</h1></main></div></body></html>';
  const first=await transformPublicRedesignResponse(new Request('https://trytoolscout.org/compare'),new Response(source,{status:200,headers:{'content-type':'text/html; charset=UTF-8'}}));
  const second=await transformPublicRedesignResponse(new Request('https://trytoolscout.org/compare'),first);
  const html=await second.text();
  assert.equal((html.match(/class="ts2-global-nav"/g)||[]).length,1);
  assert.equal((html.match(/data-toolscout-sticky-nav="2"/g)||[]).length,1);
  assert.doesNotMatch(html,/<nav\b[^>]*>[\s\S]*?<a\b[^>]*class=["']brand["'][^>]*>\s*ToolScout\s*<\/a>[\s\S]*?<\/nav>/i);
  assert.doesNotMatch(html,/Old v2 A|Old v2 B/);
});

test('public redesign injects the shared shell without changing canonical content',async()=>{
  const source='<!doctype html><html><head><link rel="canonical" href="https://trytoolscout.org/tools/figma"></head><body><div class="wrap"><a class="brand" href="/">ToolScout</a><main><h1>Figma</h1></main></div></body></html>';
  const response=new Response(source,{status:200,headers:{'content-type':'text/html; charset=UTF-8'}});
  const out=await transformPublicRedesignResponse(new Request('https://trytoolscout.org/tools/figma'),response);
  const html=await out.text();
  assert.match(html,/data-toolscout-public-redesign="2"/);
  assert.match(html,/<html[^>]*data-toolscout-redesign="2"/);
  assert.match(html,/class="ts2-global-nav"/);
  assert.match(html,/data-toolscout-surface="tool-profile"/);
  assert.doesNotMatch(html,/<a\b[^>]*class=["'][^"']*\bbrand\b[^"']*["'][^>]*>\s*ToolScout\s*<\/a>/i);
  assert.match(html,/rel="canonical" href="https:\/\/trytoolscout\.org\/tools\/figma"/);
  assert.match(html,/>Figma</);
});

test('tool profile generator no longer emits the pre-2.0 standalone ToolScout header',()=>{
  const generator=read('scripts/generate-tool-pages.mjs');
  assert.doesNotMatch(generator,/<div class="wrap"><a class="brand" href="\/">ToolScout<\/a>/);
  assert.doesNotMatch(generator,/\.brand\{font-size:22px/);
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
    ['/whats-new.html','whats-new',">What's new<"],
    ['/software-trends-index','trends','>Trends<']
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
  assert.match(runtime,/\.ts2-global-nav\{position:sticky;top:0;z-index:1000;background:var\(--ts-g\)/);
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

test('public social footer is integrated, responsive and isolated from legacy nav CSS',async()=>{
  const social=read('social-profiles.js');
  assert.match(social,/ToolScout elsewhere/);
  assert.match(social,/Independent Software Discovery & Decision Engine · trytoolscout\.org/);
  assert.match(social,/data-toolscout-social-footer="2"/);
  assert.match(social,/data-toolscout-social-link="1"/);
  assert.match(social,/class="ts-social-follow-links" role="navigation"/);
  assert.doesNotMatch(social,/<nav[^>]*ToolScout social profiles/);
  assert.match(social,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important/);
  assert.match(social,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);

  const source='<!doctype html><html><head></head><body><main>Page</main><section class="trust"><p>Trust copy</p><div class="badgeRow">Badges</div></section></body></html>';
  const response=new Response(source,{status:200,headers:{'content-type':'text/html; charset=UTF-8'}});
  const out=await injectToolScoutSocialFooter(response);
  const html=await out.text();
  assert.equal((html.match(/<div data-toolscout-social-footer="2"/g)||[]).length,1);
  assert.match(html,/class="badgeRow">Badges<\/div><div data-toolscout-social-footer="2"/);
  assert.doesNotMatch(html,/<footer class="ts-social-footer-shell"/);
  assert.match(html,/href="https:\/\/x\.com\/trytoolscout"/);
});


test('tool profiles do not expose preliminary generic decision-depth blocks',()=>{
  const seo=read('seo-cloudflare-runtime-worker.js');
  assert.match(seo,/stripGenericToolDecisionDepth\(html,pathname\)/);
  assert.match(seo,/cloudflare-decision-depth-v1/);
  assert.match(seo,/const observedBestPageDepth=state&&String\(state\.reason\|\|''\)==='observed_search_demand'&&pathname\.startsWith\('\/best-'\)/);
  assert.match(seo,/if\(\(taskSpecificDepth\|\|observedBestPageDepth\)&&!html\.includes\('organic-growth:runtime-start'\)/);
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


test('core public sources and guide generator no longer carry pre-2.0 navigation',()=>{
  const tools=read('tools.html');
  const guides=read('guides.html');
  const compare=read('compare.html');
  const whatsNew=read('whats-new.html');
  const generator=read('scripts/generate-seo-pages.mjs');
  assert.doesNotMatch(tools,/<nav><a class="brand"/);
  assert.doesNotMatch(guides,/<a class="brand" href="\.\/">ToolScout<\/a>/);
  assert.doesNotMatch(compare,/<nav><a class="brand"/);
  assert.doesNotMatch(whatsNew,/<div class="top"><a class="brand"/);
  assert.doesNotMatch(generator,/<div class="wrap"><a class="brand" href="\/">ToolScout<\/a><main class="hero">/);
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
  assert.match(runtime,/data-toolscout-sticky-nav="2"/);
  assert.match(runtime,/href="\/software-trends-index"\$\{current\('trends'\)\}>Trends<\/a>/);
  assert.match(runtime,/href="\/distribution\/publisher-kit"\$\{current\('publisher-kit'\)\}>Publisher Kit<\/a>/);
  assert.match(runtime,/classList\.toggle\('is-scrolled',window\.scrollY>8\)/);
  assert.doesNotMatch(runtime,/is-compact/);
  assert.doesNotMatch(runtime,/backdrop-filter/);
  assert.match(runtime,/min-height:72px;padding:14px 20px 11px/);
  assert.doesNotMatch(runtime,/min-height:62px/);
  assert.match(runtime,/justify-content:space-between!important;gap:0;overflow-x:visible/);
  assert.match(runtime,/font-size:clamp\(10px,2\.8vw,11px\);line-height:1\.1;color:#BAC0BA/);
});


test('homepage header leaves the finder as the primary action',()=>{
  const html=read('index.html');
  assert.doesNotMatch(html,/class="navCta"/);
  assert.doesNotMatch(html,/href="#finder">Find my tools/);
  assert.match(html,/id="need"/);
  assert.match(html,/class="homeGlobalNav darkBand"/);
  assert.match(html,/\.homeGlobalNav\{position:sticky;top:0;z-index:1000/);
  assert.match(html,/data-toolscout-sticky-nav="home"/);
  assert.match(html,/classList\.toggle\('is-scrolled',window\.scrollY>8\)/);
  assert.doesNotMatch(html,/is-compact/);
  assert.doesNotMatch(html,/backdrop-filter/);
  assert.match(html,/min-height:64px;padding:12px 0 9px/);
  assert.doesNotMatch(html,/homeGlobalNav\.is-compact/);
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

test('ToolScout 2.0 emits one primary navigation and removes legacy branded navigation variants',async()=>{
  const cases=[
    ['/tools','<!doctype html><html><head></head><body><div class="wrap"><nav><a class="brand" href="/">ToolScout</a><div class="links"><a href="/tools">Tools</a></div></nav><main><h1>Tools</h1></main></div></body></html>'],
    ['/compare','<!doctype html><html><head></head><body><div class="wrap"><nav><a class="brand" href="/">ToolScout</a><div class="links"><a href="/compare">Compare</a></div></nav><main><h1>Compare</h1></main></div></body></html>'],
    ['/whats-new','<!doctype html><html><head></head><body><div class="wrap"><div class="top"><a class="brand" href="/">ToolScout</a><nav><a href="/tools">Tools</a><a href="/guides">Guides</a></nav></div><main><h1>What\'s new</h1></main></div></body></html>']
  ];
  for(const [path,source] of cases){
    const out=await transformPublicRedesignResponse(new Request('https://trytoolscout.org'+path),new Response(source,{status:200,headers:{'content-type':'text/html; charset=UTF-8'}}));
    const html=await out.text();
    assert.equal((html.match(/class="ts2-global-nav"/g)||[]).length,1,path);
    assert.doesNotMatch(html,/<nav\b[^>]*>[\s\S]*?<a\b[^>]*class=["']brand["'][^>]*>\s*ToolScout\s*<\/a>[\s\S]*?<\/nav>/i,path);
    assert.doesNotMatch(html,/<div\b[^>]*class=["'][^"']*\btop\b[^"']*["'][^>]*>[\s\S]*?<a\b[^>]*class=["']brand["'][^>]*>\s*ToolScout\s*<\/a>/i,path);
    assert.doesNotMatch(html,/class=["'][^"']*\bts-global-nav\b/i,path);
  }
});

test('public outbound policy removes direct external anchors but preserves internal profile, monetizable CTA routes and marked official social profiles',async()=>{
  const source='<!doctype html><html><head></head><body><a href="https://vendor.example/source">Source</a><a href="/tools/example">Profile</a><a href="/go/example?source=software-news">Visit example</a><a href="https://x.com/trytoolscout" data-toolscout-social-link="1" data-social-network="x">Follow on X</a><a href="https://x.com/someone-else">Unmarked X</a><a href="https://evil.example/fake" data-toolscout-social-link="1">Fake social</a></body></html>';
  const response=new Response(source,{status:200,headers:{'content-type':'text/html; charset=UTF-8'}});
  const out=await transformPublicOutboundPolicyResponse(new Request('https://trytoolscout.org/news/example-story'),response);
  const html=await out.text();
  assert.doesNotMatch(html,/href="https:\/\/vendor\.example\/source"/);
  assert.match(html,/>Source</);
  assert.match(html,/href="\/tools\/example"/);
  assert.match(html,/href="\/go\/example\?source=software-news"/);
  assert.match(html,/href="https:\/\/x\.com\/trytoolscout"[^>]*data-toolscout-social-link="1"/);
  assert.doesNotMatch(html,/href="https:\/\/x\.com\/someone-else"/);
  assert.doesNotMatch(html,/href="https:\/\/evil\.example\/fake"/);
  const sameOrigin=await transformPublicOutboundPolicyResponse(new Request('https://trytoolscout.org/news/example-story'),new Response('<html><body><a href="https://trytoolscout.org/tools/example">Same origin</a></body></html>',{status:200,headers:{'content-type':'text/html'}}));
  assert.match(await sameOrigin.text(),/href="https:\/\/trytoolscout\.org\/tools\/example"/);
});

test('public outbound policy also applies to the homepage while private surfaces remain untouched',async()=>{
  const source='<!doctype html><html><head></head><body><a href="https://external.example/">External</a></body></html>';
  const home=await transformPublicOutboundPolicyResponse(new Request('https://trytoolscout.org/'),new Response(source,{status:200,headers:{'content-type':'text/html'}}));
  assert.doesNotMatch(await home.text(),/href="https:\/\/external\.example\//);
  const privateResponse=await transformPublicOutboundPolicyResponse(new Request('https://trytoolscout.org/analytics'),new Response(source,{status:200,headers:{'content-type':'text/html'}}));
  assert.equal(await privateResponse.text(),source);
});


test('sticky headers keep constant geometry while scrolling to prevent mobile jitter',()=>{
  const home=read('index.html');
  const runtime=read('public-redesign-runtime.js');
  assert.doesNotMatch(home,/lastY=window\.scrollY|delta=y-lastY|classList\.toggle\('is-compact'/);
  assert.doesNotMatch(runtime,/lastY=window\.scrollY|delta=y-lastY|classList\.toggle\('is-compact'/);
  assert.match(home,/\.homeGlobalNav\{position:sticky;top:0;z-index:1000;background:var\(--graphite\);isolation:isolate/);
  assert.match(runtime,/\.ts2-global-nav\{position:sticky;top:0;z-index:1000;background:var\(--ts-g\);border-bottom:[^\n]+isolation:isolate/);
});


test('methodology is a native ToolScout 2.0 surface with clean canonical routing',()=>{
  const html=read('methodology.html');
  assert.match(html,/<html[^>]*data-toolscout-redesign="2"[^>]*data-toolscout-surface="methodology"/);
  assert.match(html,/data-toolscout-public-redesign="2"/);
  assert.match(html,/class="ts2-global-nav"/);
  assert.match(html,/Recommendations start with the job\./);
  assert.match(html,/rel="canonical" href="https:\/\/trytoolscout\.org\/methodology"/);
  assert.doesNotMatch(html,/class="ts-global-nav"/);
  assert.doesNotMatch(html,/canonical" href="https:\/\/trytoolscout\.org\/methodology\.html"/);
});

test('legacy category hubs cannot retain old body geometry or navigation after the shared redesign transform',async()=>{
  const source='<!doctype html><html><head></head><body style="font-family:system-ui,sans-serif;max-width:900px;margin:auto;padding:40px 20px"><nav class="ts-global-nav"><a href="/guides">Guides</a></nav><a href="/">ToolScout</a><h1>CRM Software Buying Guides</h1><p>Choose a job.</p><ul><li><a href="/best-free-crm">Best Free CRM</a></li></ul></body></html>';
  const response=new Response(source,{status:200,headers:{'content-type':'text/html; charset=UTF-8'}});
  const out=await transformPublicRedesignResponse(new Request('https://trytoolscout.org/crm-tools'),response);
  const html=await out.text();
  assert.match(html,/data-toolscout-surface="category"/);
  assert.match(html,/max-width:none!important;padding:0!important/);
  assert.match(html,/html\[data-toolscout-redesign="2"\] \.ts-global-nav\{display:none!important\}/);
  assert.match(html,/html\[data-toolscout-surface="category"\] body>ul\{/);
  assert.match(html,/class="ts2-global-nav"/);
});

test('live redesign acceptance audits the complete public sitemap rather than a hand-picked page sample',()=>{
  const verify=read('scripts/verify-redesign-2-live.mjs');
  assert.match(verify,/get\('\/sitemap\.xml'\)/);
  assert.match(verify,/matchAll\(\/<loc>/);
  assert.match(verify,/await pool\(publicPages,12/);
  assert.match(verify,/methodology_v2_content_missing/);
  assert.match(verify,/checkedPublicPages:publicPages\.length\+1/);
});


test('Software Trends source has no second local navigation and relies on the shared sticky header',()=>{
  const html=read('software-trends-index.html');
  assert.doesNotMatch(html,/<nav><a class="brand"/);
  assert.match(html,/rel="canonical" href="https:\/\/trytoolscout\.org\/software-trends-index"/);
  const runtime=read('public-redesign-runtime.js');
  assert.match(runtime,/data-toolscout-surface="trends"/);
  assert.match(runtime,/\.darkBand \.shell>nav:first-child\{display:none!important\}/);
});
