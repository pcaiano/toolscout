import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

const rawCredentials = process.env.GSC_SERVICE_ACCOUNT_JSON;
if (!rawCredentials) {
  console.log(JSON.stringify({ skipped: true, reason: 'GSC_SERVICE_ACCOUNT_JSON is not configured' }));
  process.exit(0);
}

let credentials;
try {
  credentials = JSON.parse(rawCredentials);
} catch {
  throw new Error('GSC_SERVICE_ACCOUNT_JSON must contain valid service-account JSON.');
}

const property = process.env.GSC_PROPERTY || 'sc-domain:trytoolscout.org';
const lookbackDays = Math.max(7, Math.min(90, Number(process.env.GSC_LOOKBACK_DAYS || 28)));
const end = new Date();
const start = new Date(end);
start.setUTCDate(start.getUTCDate() - lookbackDays + 1);
const isoDate = d => d.toISOString().slice(0, 10);
const startDate = isoDate(start);
const endDate = isoDate(end);

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

async function accessToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/webmasters.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  }));
  const unsigned = `${header}.${payload}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(credentials.private_key, 'base64url');
  const assertion = `${unsigned}.${signature}`;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    })
  });
  if (!response.ok) throw new Error(`Google OAuth failed: ${response.status} ${await response.text()}`);
  const json = await response.json();
  if (!json.access_token) throw new Error('Google OAuth response did not include an access token.');
  return json.access_token;
}

const token = await accessToken();
const endpoint = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`;

async function querySearchConsole(dimensions, rangeStart = startDate, rangeEnd = endDate) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      startDate: rangeStart,
      endDate: rangeEnd,
      dimensions,
      type: 'web',
      dataState: 'all',
      rowLimit: 25000
    })
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Search Console API failed for ${property}: ${response.status} ${detail}`);
  }
  return response.json();
}

function pageInfo(page) {
  let url;
  try { url = new URL(page); } catch { return null; }
  if (url.hostname !== 'trytoolscout.org' && url.hostname !== 'www.trytoolscout.org') return null;
  let pathname = url.pathname || '/';
  if(pathname==='/index.html')pathname='/';
  else if(/\.html$/i.test(pathname))pathname=pathname.replace(/\.html$/i,'');
  url.protocol='https:';url.hostname='trytoolscout.org';url.pathname=pathname;url.search='';url.hash='';
  const base = path.basename(pathname).replace(/\.html$/i, '');
  let type = 'other';
  if (pathname === '/') type = 'home';
  else if (pathname.startsWith('/blog/')) type = 'blog';
  else if (pathname.startsWith('/tools/')) type = 'tool-profile';
  else if (/^best-[a-z0-9-]+$/.test(base)) type = 'guide';
  else if (/-vs-/.test(base)) type = 'comparison';
  else if (/-alternatives$/.test(base)) type = 'alternatives';
  else if (/^(tools|guides|categories|compare|seo|methodology)$/.test(base)) type = 'directory';
  return { page: url.toString(), pathname, key: base || 'home', type, intent: type === 'guide' ? base : null };
}

const pageJson = await querySearchConsole(['page']);
const pagesByCanonical = new Map();
const byIntent = new Map();
for (const row of pageJson.rows || []) {
  const page = String(row.keys?.[0] || '');
  const info = pageInfo(page);
  if (!info) continue;
  const impressions = Number(row.impressions || 0);
  const clicks = Number(row.clicks || 0);
  const ctr = Number(row.ctr || 0) * 100;
  const position = Number(row.position || 0);
  const pageCurrent=pagesByCanonical.get(info.page)||{...info,clicks:0,impressions:0,positionNumerator:0};
  pageCurrent.clicks+=clicks;pageCurrent.impressions+=impressions;pageCurrent.positionNumerator+=position*impressions;
  pagesByCanonical.set(info.page,pageCurrent);
  if (!info.intent) continue;
  const current = byIntent.get(info.intent) || { intent: info.intent, page: info.page, clicks: 0, impressions: 0, ctrNumerator: 0, positionNumerator: 0 };
  current.clicks += clicks;
  current.impressions += impressions;
  current.ctrNumerator += ctr * impressions;
  current.positionNumerator += position * impressions;
  byIntent.set(info.intent, current);
}
const pages=[...pagesByCanonical.values()].map(x=>({
  page:x.page,pathname:x.pathname,key:x.key,type:x.type,intent:x.intent,
  clicks:x.clicks,impressions:x.impressions,
  ctr:x.impressions?Number((x.clicks/x.impressions*100).toFixed(4)):0,
  position:x.impressions?Number((x.positionNumerator/x.impressions).toFixed(4)):0
}));

const queryJson = await querySearchConsole(['page', 'query']);
const queriesByIntent = new Map();
const queriesByPage = new Map();
for (const row of queryJson.rows || []) {
  const page = String(row.keys?.[0] || '');
  const query = String(row.keys?.[1] || '').trim();
  const info = pageInfo(page);
  if (!info || !query) continue;
  const item = {
    query,
    clicks: Number(row.clicks || 0),
    impressions: Number(row.impressions || 0),
    position: Number(Number(row.position || 0).toFixed(4))
  };
  const pageRows = queriesByPage.get(info.page) || [];
  pageRows.push(item);
  queriesByPage.set(info.page, pageRows);
  if (info.intent) {
    const rows = queriesByIntent.get(info.intent) || [];
    rows.push(item);
    queriesByIntent.set(info.intent, rows);
  }
}

for (const rows of [...queriesByPage.values(), ...queriesByIntent.values()]) {
  rows.sort((a, b) => b.impressions - a.impressions || b.clicks - a.clicks || a.position - b.position);
}

function addDays(dateText, days) {
  const d = new Date(dateText + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return isoDate(d);
}
async function aggregatePeriod(periodStart, periodEnd) {
  const json = await querySearchConsole(['date'], periodStart, periodEnd);
  const rows = json.rows || [];
  const impressions = rows.reduce((s, r) => s + Number(r.impressions || 0), 0);
  const clicks = rows.reduce((s, r) => s + Number(r.clicks || 0), 0);
  const weightedPosition = rows.reduce((s, r) => s + Number(r.position || 0) * Number(r.impressions || 0), 0);
  return {
    startDate: periodStart,
    endDate: periodEnd,
    clicks,
    impressions,
    ctr: impressions ? Number((clicks / impressions * 100).toFixed(4)) : 0,
    position: impressions ? Number((weightedPosition / impressions).toFixed(4)) : 0
  };
}
function deltaPct(current, previous) {
  const c = Number(current || 0), p = Number(previous || 0);
  if (!p) return c ? null : 0;
  return Number(((c - p) / p * 100).toFixed(2));
}
function summarizeDimension(json, keyName, limit = 12) {
  return (json.rows || []).map(r => ({
    [keyName]: String(r.keys?.[0] || 'unknown'),
    clicks: Number(r.clicks || 0),
    impressions: Number(r.impressions || 0),
    ctr: Number((Number(r.ctr || 0) * 100).toFixed(4)),
    position: Number(Number(r.position || 0).toFixed(4))
  })).sort((a,b)=>b.impressions-a.impressions||b.clicks-a.clicks).slice(0, limit);
}

const recent7Start = addDays(endDate, -6);
const previous7End = addDays(recent7Start, -1);
const previous7Start = addDays(previous7End, -6);
const [recent7, previous7, countriesJson, devicesJson] = await Promise.all([
  aggregatePeriod(recent7Start, endDate),
  aggregatePeriod(previous7Start, previous7End),
  querySearchConsole(['country']),
  querySearchConsole(['device'])
]);
const countries = summarizeDimension(countriesJson, 'country', 15);
const devices = summarizeDimension(devicesJson, 'device', 10);

async function listSitemaps() {
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/sitemaps`;
  const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (!response.ok) return { ok:false, status:response.status, error:(await response.text()).slice(0,1000), items:[] };
  const json = await response.json();
  return { ok:true, status:response.status, items:(json.sitemap || []).map(x => ({
    path:x.path || null,
    lastSubmitted:x.lastSubmitted || null,
    isPending:Boolean(x.isPending),
    isSitemapsIndex:Boolean(x.isSitemapsIndex),
    lastDownloaded:x.lastDownloaded || null,
    warnings:Number(x.warnings || 0),
    errors:Number(x.errors || 0),
    contents:Array.isArray(x.contents)?x.contents.map(y=>({type:y.type||null,submitted:Number(y.submitted||0),indexed:Number(y.indexed||0)})):[]
  })) };
}

async function inspectUrl(inspectionUrl) {
  try {
    const response = await fetch('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', {
      method:'POST',
      headers:{ authorization:`Bearer ${token}`, 'content-type':'application/json' },
      body:JSON.stringify({ inspectionUrl, siteUrl:property, languageCode:'en-US' })
    });
    if (!response.ok) return { url:inspectionUrl, ok:false, httpStatus:response.status, error:(await response.text()).slice(0,1000) };
    const json = await response.json();
    const r = json.inspectionResult || {};
    const i = r.indexStatusResult || {};
    const rich = r.richResultsResult || {};
    return {
      url:inspectionUrl,
      ok:true,
      inspectionResultLink:r.inspectionResultLink || null,
      verdict:i.verdict || null,
      coverageState:i.coverageState || null,
      robotsTxtState:i.robotsTxtState || null,
      indexingState:i.indexingState || null,
      lastCrawlTime:i.lastCrawlTime || null,
      pageFetchState:i.pageFetchState || null,
      googleCanonical:i.googleCanonical || null,
      userCanonical:i.userCanonical || null,
      crawledAs:i.crawledAs || null,
      sitemaps:Array.isArray(i.sitemap)?i.sitemap:[],
      referringUrls:Array.isArray(i.referringUrls)?i.referringUrls.slice(0,10):[],
      richResultsVerdict:rich.verdict || null,
      richResultTypes:Array.isArray(rich.detectedItems)?rich.detectedItems.map(x=>x.richResultType).filter(Boolean):[]
    };
  } catch (error) {
    return { url:inspectionUrl, ok:false, httpStatus:0, error:String(error?.message || error).slice(0,1000) };
  }
}
function normalizeUrl(value) {
  try {
    const u = new URL(String(value));
    if (!['trytoolscout.org','www.trytoolscout.org'].includes(u.hostname)) return null;
    u.hash='';u.search='';
    return u.toString();
  } catch { return null; }
}
function canonicalPublicUrl(value) {
  try {
    const u = new URL(String(value));
    if (!['trytoolscout.org','www.trytoolscout.org'].includes(u.hostname)) return null;
    u.protocol='https:';u.hostname='trytoolscout.org';u.hash='';u.search='';
    if(u.pathname==='/index.html')u.pathname='/';
    else if(/\.html$/i.test(u.pathname))u.pathname=u.pathname.replace(/\.html$/i,'');
    return u.toString();
  } catch { return null; }
}
const sitemapXml = fs.existsSync('sitemap.xml') ? fs.readFileSync('sitemap.xml','utf8') : '';
const sitemapUrls = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>normalizeUrl(String(m[1]).replaceAll('&amp;','&'))).filter(Boolean);
const inspectionLimit = Math.max(20, Math.min(500, Number(process.env.GSC_INSPECTION_LIMIT || 250)));
const inspectionCandidates = [];
const seenInspection = new Set();
for (const raw of [...pages.map(x=>x.page), ...sitemapUrls]) {
  const url = normalizeUrl(raw);
  if (!url || seenInspection.has(url)) continue;
  seenInspection.add(url);inspectionCandidates.push(url);
}
const inspectionTargets = inspectionCandidates.slice(0, inspectionLimit);
const inspections = [];
for (let i=0;i<inspectionTargets.length;i+=10) {
  const batch = inspectionTargets.slice(i,i+10);
  inspections.push(...await Promise.all(batch.map(inspectUrl)));
}
const successfulInspections = inspections.filter(x=>x.ok);
const inspectionErrors = inspections.filter(x=>!x.ok);
const canonicalUniverse = new Set(sitemapUrls.map(normalizeUrl).filter(Boolean));
const canonicalInspections = successfulInspections.filter(x=>canonicalUniverse.has(normalizeUrl(x.url)));
const legacyObservedInspections = successfulInspections.filter(x=>!canonicalUniverse.has(normalizeUrl(x.url)));
const indexedInspections = canonicalInspections.filter(x=>x.verdict==='PASS');
const excludedInspections = canonicalInspections.filter(x=>x.verdict==='NEUTRAL');
const failedInspections = canonicalInspections.filter(x=>x.verdict==='FAIL');
const unknownVerdictInspections = canonicalInspections.filter(x=>!x.verdict||x.verdict==='VERDICT_UNSPECIFIED');
const redirectedInspections = canonicalInspections.filter(x=>x.coverageState==='Page with redirect');
const unknownToGoogleInspections = canonicalInspections.filter(x=>x.coverageState==='URL is unknown to Google');
const discoveredNotIndexedInspections = canonicalInspections.filter(x=>x.coverageState==='Discovered - currently not indexed');
const crawledNotIndexedInspections = canonicalInspections.filter(x=>x.coverageState==='Crawled - currently not indexed');
const indexRecoveryCandidates = canonicalInspections.filter(x=>x.verdict==='FAIL'||['URL is unknown to Google','Discovered - currently not indexed','Crawled - currently not indexed'].includes(String(x.coverageState||'')));
const otherExcludedInspections = excludedInspections.filter(x=>!['Page with redirect','URL is unknown to Google','Discovered - currently not indexed','Crawled - currently not indexed'].includes(String(x.coverageState||'')));
const canonicalMismatches = canonicalInspections.filter(x=>x.googleCanonical&&x.userCanonical&&normalizeUrl(x.googleCanonical)!==normalizeUrl(x.userCanonical));
const canonicalDisagreementsAll = successfulInspections.filter(x=>x.googleCanonical&&x.userCanonical&&normalizeUrl(x.googleCanonical)!==normalizeUrl(x.userCanonical));
const robotsBlocked = canonicalInspections.filter(x=>x.robotsTxtState==='DISALLOWED');
const noindexBlocked = canonicalInspections.filter(x=>['BLOCKED_BY_META_TAG','BLOCKED_BY_HTTP_HEADER'].includes(String(x.indexingState||'')));
const fetchIssues = canonicalInspections.filter(x=>x.pageFetchState&&!['SUCCESSFUL','PAGE_FETCH_STATE_UNSPECIFIED'].includes(x.pageFetchState));
const sitemapState = await listSitemaps();

const pageByUrl = new Map(pages.map(x=>[canonicalPublicUrl(x.page),x]));
const opportunityRows = [];
for (const page of pages) {
  const url=canonicalPublicUrl(page.page), impressions=Number(page.impressions||0), clicks=Number(page.clicks||0), position=Number(page.position||0), ctr=Number(page.ctr||0);
  let kind=null, queue=null, score=0, action=null;
  if(impressions>=20&&position>10&&position<=50){kind='striking_distance';queue='ranking_opportunities';score=Math.min(100,55+Math.log10(impressions+1)*12+(50-position)*0.5);action='authority_and_content_amplification'}
  else if(impressions>=50&&position>50){kind='high_impression_low_rank';queue='ranking_opportunities';score=Math.min(100,48+Math.log10(impressions+1)*14);action='authority_depth_and_query_alignment'}
  else if(impressions>=20&&position>0&&position<=20&&ctr<1){kind='ctr_opportunity';queue='ranking_opportunities';score=Math.min(100,60+Math.log10(impressions+1)*10);action='improve_search_snippet_and_click_capture'}
  else if(impressions>=10&&position>0&&position<=10){kind='protect';queue='protect';score=Math.min(100,58+Math.log10(impressions+1)*10+(10-position));action='protect_current_ranking'}
  if(kind)opportunityRows.push({kind,queue,url,page:url?new URL(url).pathname:page.pathname.replace(/\.html$/i,''),score:Number(score.toFixed(1)),impressions,clicks,ctr,position,action});
}
for(const item of indexRecoveryCandidates){
  const canonicalUrl=canonicalPublicUrl(item.url),page=pageByUrl.get(canonicalUrl);
  const coverage=String(item.coverageState||'');
  const action=coverage==='URL is unknown to Google'?'improve_discovery_and_internal_links':coverage==='Discovered - currently not indexed'?'strengthen_internal_links_and_index_worthiness':coverage==='Crawled - currently not indexed'?'review_quality_and_duplication':'repair_indexing';
  opportunityRows.push({kind:'index_issue',queue:'index_recovery',url:canonicalUrl||item.url,page:new URL(canonicalUrl||item.url).pathname,score:page?.impressions?96:78,impressions:Number(page?.impressions||0),clicks:Number(page?.clicks||0),ctr:Number(page?.ctr||0),position:Number(page?.position||0),action,coverageState:item.coverageState,verdict:item.verdict});
}
for(const item of redirectedInspections){
  const canonicalUrl=canonicalPublicUrl(item.url),page=pageByUrl.get(canonicalUrl);
  opportunityRows.push({kind:'sitemap_redirect',queue:'fix_now',url:canonicalUrl||item.url,page:new URL(item.url).pathname,score:page?.impressions?99:88,impressions:Number(page?.impressions||0),clicks:Number(page?.clicks||0),ctr:Number(page?.ctr||0),position:Number(page?.position||0),action:'repair_canonical_alignment',coverageState:item.coverageState,googleCanonical:item.googleCanonical||null,userCanonical:item.userCanonical||null});
}
for(const item of canonicalMismatches){
  const canonicalUrl=canonicalPublicUrl(item.url),page=pageByUrl.get(canonicalUrl);
  opportunityRows.push({kind:'canonical_mismatch',queue:'fix_now',url:canonicalUrl||item.url,page:new URL(item.url).pathname,score:page?.impressions?98:82,impressions:Number(page?.impressions||0),clicks:Number(page?.clicks||0),ctr:Number(page?.ctr||0),position:Number(page?.position||0),action:'repair_canonical_alignment',googleCanonical:item.googleCanonical,userCanonical:item.userCanonical});
}
opportunityRows.sort((a,b)=>b.score-a.score||b.impressions-a.impressions);
const queueSummary=['fix_now','index_recovery','ranking_opportunities','protect'].reduce((acc,key)=>{
  const rows=opportunityRows.filter(x=>x.queue===key);
  acc[key]={count:rows.length,top:rows.slice(0,10).map(x=>({page:x.page,url:x.url,kind:x.kind,score:x.score,impressions:x.impressions,position:x.position,action:x.action}))};
  return acc;
},{});

const searchReality = {
  generatedAt:new Date().toISOString(),
  source:'Google Search Console first-party APIs',
  property,
  authorizationScope:'https://www.googleapis.com/auth/webmasters.readonly',
  searchPerformance:{
    window28d:{startDate,endDate,clicks:pages.reduce((n,x)=>n+x.clicks,0),impressions:pages.reduce((n,x)=>n+x.impressions,0),ctr:0,position:0},
    recent7,
    previous7,
    change7d:{clicksPct:deltaPct(recent7.clicks,previous7.clicks),impressionsPct:deltaPct(recent7.impressions,previous7.impressions),positionDelta:Number((recent7.position-previous7.position).toFixed(4))},
    countries,
    devices,
    observedPages:pages.length
  },
  indexHealth:{
    inspectionUniverseUrls:canonicalUniverse.size,
    inspectionLimit,
    inspected:canonicalInspections.length,
    indexed:indexedInspections.length,
    excluded:excludedInspections.length,
    failed:failedInspections.length,
    unknownVerdict:unknownVerdictInspections.length,
    redirected:redirectedInspections.length,
    unknownToGoogle:unknownToGoogleInspections.length,
    discoveredNotIndexed:discoveredNotIndexedInspections.length,
    crawledNotIndexed:crawledNotIndexedInspections.length,
    otherExcluded:otherExcludedInspections.length,
    indexRecoveryCandidates:indexRecoveryCandidates.length,
    errors:inspectionErrors.length,
    legacyObservedVariantsInspected:legacyObservedInspections.length,
    inspectionCoveragePct:canonicalUniverse.size?Number((canonicalInspections.length/canonicalUniverse.size*100).toFixed(1)):0,
    indexedPct:canonicalInspections.length?Number((indexedInspections.length/canonicalInspections.length*100).toFixed(1)):0,
    canonicalMismatches:canonicalMismatches.length,
    canonicalDisagreementsAll:canonicalDisagreementsAll.length,
    robotsBlocked:robotsBlocked.length,
    noindexBlocked:noindexBlocked.length,
    fetchIssues:fetchIssues.length,
    note:'Primary index-health metrics use canonical URLs in the current ToolScout sitemap. Legacy or alternate URLs observed in Search Analytics are inspected separately and do not count as canonical index failures.'
  },
  sitemaps:{
    apiOk:sitemapState.ok,
    apiStatus:sitemapState.status,
    apiError:sitemapState.error||null,
    localSitemapUrls:sitemapUrls.length,
    submittedCount:sitemapState.items.length,
    items:sitemapState.items
  },
  queues:queueSummary,
  opportunities:opportunityRows.slice(0,50),
  inspections,
  limitations:[
    'Search Analytics returns top rows and is not guaranteed to include every row available in Search Console.',
    'URL Inspection describes the version in the Google index and does not perform a live indexability test.',
    canonicalInspections.length<canonicalUniverse.size?'Canonical index health is based on the inspected sitemap sample shown in this report.':'The current inspection run covered the full canonical sitemap universe.'
  ]
};
searchReality.searchPerformance.window28d.ctr = searchReality.searchPerformance.window28d.impressions ? Number((searchReality.searchPerformance.window28d.clicks/searchReality.searchPerformance.window28d.impressions*100).toFixed(4)) : 0;
searchReality.searchPerformance.window28d.position = pages.reduce((s,x)=>s+Number(x.position||0)*Number(x.impressions||0),0) / Math.max(1,searchReality.searchPerformance.window28d.impressions);
searchReality.searchPerformance.window28d.position = Number(searchReality.searchPerformance.window28d.position.toFixed(4));

for (const page of pages) page.topQueries = (queriesByPage.get(page.page) || []).slice(0, 10);
pages.sort((a,b) => b.impressions - a.impressions || b.clicks - a.clicks);

const items = [...byIntent.values()].map(x => ({
  intent: x.intent,
  page: x.page,
  clicks: x.clicks,
  impressions: x.impressions,
  ctr: x.impressions ? Number((x.ctrNumerator / x.impressions).toFixed(4)) : 0,
  position: x.impressions ? Number((x.positionNumerator / x.impressions).toFixed(4)) : 0,
  topQueries: (queriesByIntent.get(x.intent) || []).slice(0, 10)
})).sort((a,b) => b.impressions - a.impressions || b.clicks - a.clicks);

const siteTotals = {
  clicks: pages.reduce((n,x) => n + x.clicks, 0),
  impressions: pages.reduce((n,x) => n + x.impressions, 0)
};
siteTotals.ctr = siteTotals.impressions ? Number((siteTotals.clicks / siteTotals.impressions * 100).toFixed(4)) : 0;
const pageTypeSummary = Object.fromEntries([...new Set(pages.map(x => x.type))].sort().map(type => {
  const subset = pages.filter(x => x.type === type);
  return [type, { pages: subset.length, clicks: subset.reduce((n,x) => n + x.clicks, 0), impressions: subset.reduce((n,x) => n + x.impressions, 0) }];
}));

fs.mkdirSync('reports', { recursive: true });
fs.mkdirSync('data', { recursive: true });
fs.writeFileSync('reports/gsc-search-reality.json', JSON.stringify(searchReality, null, 2) + '\n');
fs.writeFileSync('data/gsc-search-reality.json', JSON.stringify(searchReality, null, 2) + '\n');
fs.writeFileSync('reports/gsc-signals.json', JSON.stringify({
  generatedAt: new Date().toISOString(),
  source: 'Google Search Console Search Analytics API',
  property,
  dataState: 'all',
  includesFreshData: true,
  startDate,
  endDate,
  siteTotals,
  pageTypeSummary,
  pageCount: pages.length,
  pages,
  count: items.length,
  items
}, null, 2) + '\n');

console.log(JSON.stringify({
  syncedGuideIntents: items.length,
  syncedPages: pages.length,
  property,
  startDate,
  endDate,
  dataState: 'all',
  impressions: siteTotals.impressions,
  clicks: siteTotals.clicks,
  queryRows: [...queriesByPage.values()].reduce((n, rows) => n + rows.length, 0),
  inspectedUrls: searchReality.indexHealth.inspected,
  indexedUrls: searchReality.indexHealth.indexed,
  indexRecoveryCandidates: searchReality.indexHealth.indexRecoveryCandidates,
  redirectedInSitemap: searchReality.indexHealth.redirected,
  discoveredNotIndexed: searchReality.indexHealth.discoveredNotIndexed,
  unknownToGoogle: searchReality.indexHealth.unknownToGoogle,
  canonicalMismatches: searchReality.indexHealth.canonicalMismatches,
  sitemapApiOk: searchReality.sitemaps.apiOk
}));
