import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('public canonical surface has explicit route ownership',()=>{
  const runtime=read('command-center-light-theme-worker.js');
  const contract=read('runtime-route-contract.js');
  const compute=read('compute-router-worker.js');

  assert.match(runtime,/export async function handlePublicCanonicalSurfaceRoute/);
  assert.match(runtime,/export async function transformPublicCanonicalResponse/);
  assert.match(contract,/owner:'public_canonical_surface'/);
  assert.match(compute,/ownership\.owner==='public_canonical_surface'/);
  assert.match(compute,/handlePublicCanonicalSurfaceRoute/);

  for(const path of ['/sitemap.xml','/data/tools.json'])assert.ok(contract.includes(path),path+' must be canonical-surface owned');
  assert.match(contract,/legacy_html_redirect/);
});

test('legacy html redirects preserve extensionless canonical behavior',()=>{
  const runtime=read('command-center-light-theme-worker.js');
  assert.match(runtime,/request\.method==='GET'\|\|request\.method==='HEAD'/);
  assert.match(runtime,/\.html\$\/i/);
  assert.match(runtime,/canonicalSeoPath\(url\.pathname\)/);
  assert.match(runtime,/Response\.redirect\(target\.toString\(\),308\)/);
});

test('sitemap and tools data preserve canonical public behavior',()=>{
  const runtime=read('command-center-light-theme-worker.js');
  assert.match(runtime,/publicMergedTools\(env\)/);
  assert.match(runtime,/Cache-Control':'public, max-age=60/);
  assert.match(runtime,/publicMergedSitemap\(await base\.fetch\(request,env,ctx\),env\)/);
  assert.match(runtime,/canonicalizeSitemapResponse/);
  assert.match(runtime,/X-ToolScout-SEO-Sitemap/);
});

test('generic fallback preserves canonical transform ordering before attribution SEO and footer',()=>{
  const compute=read('compute-router-worker.js');
  const lower=compute.indexOf('await base.fetch(request,env,ctx)');
  const canonical=compute.indexOf('await transformPublicCanonicalResponse(request,response)');
  const owner=compute.indexOf('await applyMarkedOwnerAnalytics(request,response)');
  const seo=compute.indexOf('await transformSeoPublicPage(request,response,env)');
  const footer=compute.indexOf('injectToolScoutSocialFooter(response)');
  assert.ok(lower>=0&&canonical>lower&&owner>canonical&&seo>owner&&footer>seo,'fallback order must remain lower -> canonical -> owner attribution -> SEO -> footer');
  assert.match(compute,/import base from '\.\/funnel-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/posthog-behavior-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/visitor-accuracy-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/visitor-dashboard-metrics-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/lemlist-profile-correction-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/discovery-attribution-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/discovery-attribution-health-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/command-center-truth-consolidation-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/command-center-autoload-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/command-center-resilient-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/command-center-human-truth-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/command-center-human-truth-final-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/command-center-human-truth-details-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/command-center-human-truth-chart-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/traffic-integrity-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/owner-exclusion-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/traffic-integrity-guard-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/traffic-integrity-live-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/outbound-integrity-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/visitor-integrity-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/command-center-integrity-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/mission-integrity-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/mission-integrity-v2-worker\.js'/);
  assert.match(compute,/handleMissionIntegrityRoute.*from '\.\/mission-integrity-v2-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/command-center-final-integrity-worker\.js'/);
  assert.doesNotMatch(compute,/import base from '\.\/command-center-light-theme-worker\.js'/);
});

test('canonical response transform preserves markup canonicalization and discovery links',()=>{
  const runtime=read('command-center-light-theme-worker.js');
  assert.match(runtime,/canonicalizeOwnedMarkup\(await response\.text\(\)\)/);
  assert.match(runtime,/injectSeoDiscoveryLinks\(body,pathname\)/);
  assert.match(runtime,/X-ToolScout-SEO-Canonical/);
});
