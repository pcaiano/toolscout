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
      grant_type: 'urn:ietf:params:oauth2:grant-type:jwt-bearer',
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

async function querySearchConsole(dimensions) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      startDate,
      endDate,
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
  const pathname = url.pathname || '/';
  const base = path.basename(pathname).replace(/\.html$/i, '');
  let type = 'other';
  if (pathname === '/' || pathname === '/index.html') type = 'home';
  else if (pathname.startsWith('/blog/')) type = 'blog';
  else if (pathname.startsWith('/tools/')) type = 'tool-profile';
  else if (/^best-[a-z0-9-]+$/.test(base)) type = 'guide';
  else if (/-vs-/.test(base)) type = 'comparison';
  else if (/-alternatives$/.test(base)) type = 'alternatives';
  else if (/^(tools|guides|categories|compare|seo|methodology)$/.test(base)) type = 'directory';
  return { page: url.toString(), pathname, key: base || 'home', type, intent: type === 'guide' ? base : null };
}

const pageJson = await querySearchConsole(['page']);
const pages = [];
const byIntent = new Map();
for (const row of pageJson.rows || []) {
  const page = String(row.keys?.[0] || '');
  const info = pageInfo(page);
  if (!info) continue;
  const impressions = Number(row.impressions || 0);
  const clicks = Number(row.clicks || 0);
  const ctr = Number(row.ctr || 0) * 100;
  const position = Number(row.position || 0);
  pages.push({ ...info, clicks, impressions, ctr: Number(ctr.toFixed(4)), position: Number(position.toFixed(4)) });
  if (!info.intent) continue;
  const current = byIntent.get(info.intent) || { intent: info.intent, page: info.page, clicks: 0, impressions: 0, ctrNumerator: 0, positionNumerator: 0 };
  current.clicks += clicks;
  current.impressions += impressions;
  current.ctrNumerator += ctr * impressions;
  current.positionNumerator += position * impressions;
  byIntent.set(info.intent, current);
}

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
  queryRows: [...queriesByPage.values()].reduce((n, rows) => n + rows.length, 0)
}));
