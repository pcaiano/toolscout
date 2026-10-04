import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const view=read('command-center-simplified-view.js');
const truth=read('command-center-business-truth-runtime.js');
const ga4=read('command-center-ga4-worker.js');

test('core KPI cards preserve unavailable instead of coercing null to zero',()=>{
  assert.match(view,/metric\('Visitors - today',visitors==null\?'Unavailable':n\(visitors\)/);
  assert.match(view,/metric\('Sessions - 24h',sessions24==null\?'Unavailable':n\(sessions24\)/);
  assert.match(view,/metric\('Google clicks - 28d',googleClicks==null\?'Unavailable':n\(googleClicks\)/);
  assert.match(view,/metric\('Outbound clicks - 24h',outbound24==null\?'Unavailable':n\(outbound24\)/);
  assert.match(view,/metric\('Monetized outbound - 24h',monetized24==null\?'Unavailable':n\(monetized24\)/);
});

test('business KPIs use GA4, GSC and server redirect ledger without mixing populations',()=>{
  assert.match(view,/commerce:'\/analytics\/api\/commerce'/);
  assert.match(view,/ToolScout server redirect ledger is canonical for outbound and monetized outbound/);
  assert.match(view,/businessMeta'\)\.textContent='GA4 \+ Google Search Console \+ server outbound'/);
  assert.match(ga4,/role:'quality_and_browser_population'/);
  assert.match(ga4,/server \/go\/ redirects remain the canonical outbound and monetized-outbound business ledger/);
});

test('GA4 exposes a country list and no map is required',()=>{
  assert.match(ga4,/dimensions:\[\{name:'country'\}\]/);
  assert.match(ga4,/const countries=\(countryReport\?\.rows\|\|\[\]\)/);
  assert.match(view,/Countries MTD/);
  assert.match(view,/countries\.map\(x=>row\(x\.country/);
});

test('GSC freshness uses evidence age and keeps final data explicit',()=>{
  assert.match(truth,/gscEvidenceAgeHours/);
  assert.match(truth,/gscEvidenceFresh/);
  assert.match(truth,/liveWindow:gscEvidenceAvailable/);
  assert.match(truth,/finalizedWindow:gscEvidenceAvailable/);
  assert.match(truth,/seRankingReferringDomains:seRankingFresh\?seRankingReferringDomains:null/);
  assert.match(view,/Search Console evidence unavailable/);
  assert.match(view,/current through/);
  assert.match(view,/final through/);
});

test('canonical server outbound ledger excludes owner-classified sessions without deleting history',()=>{
  assert.match(ga4,/LEFT JOIN sessions s ON s\.session_id=c\.session_id/);
  assert.match(ga4,/COALESCE\(s\.classification,''\)<>'owner'/);
});


test('critical Command Center assets ship and runtime truth has a bounded static fallback',()=>{
  const assets=read('.assetsignore');
  assert.match(assets,/!reports\/editorial-authority-portfolio\.json/);
  assert.match(truth,/const BUSINESS_TRUTH_BUILD_TIMEOUT_MS=8000/);
  assert.match(truth,/buildStaticBusinessTruthFallback/);
  assert.match(truth,/command-center-business-truth-static-fallback-v1/);
  assert.match(truth,/\/data\/se-ranking-backlink-truth\.json/);
  assert.match(truth,/\/data\/gsc-search-reality\.json/);
  assert.match(truth,/\/reports\/editorial-authority-portfolio\.json/);
});
