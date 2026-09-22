import fs from 'node:fs';
import crypto from 'node:crypto';

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
  const assertion = `${unsigned}.${signer.sign(credentials.private_key, 'base64url')}`;
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

function toolScoutPage(value) {
  try {
    const url = new URL(String(value || ''));
    return ['trytoolscout.org', 'www.trytoolscout.org'].includes(url.hostname);
  } catch {
    return false;
  }
}

function addDays(dateText, days) {
  const date = new Date(`${dateText}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return isoDate(date);
}

const [dateJson, pageDateJson] = await Promise.all([
  querySearchConsole(['date']),
  querySearchConsole(['date', 'page'])
]);

const visiblePagesByDate = new Map();
for (const row of pageDateJson.rows || []) {
  const date = String(row.keys?.[0] || '');
  const page = String(row.keys?.[1] || '');
  if (!date || !toolScoutPage(page)) continue;
  const set = visiblePagesByDate.get(date) || new Set();
  set.add(page);
  visiblePagesByDate.set(date, set);
}

const rawByDate = new Map((dateJson.rows || []).map(row => [String(row.keys?.[0] || ''), row]));
const daily = [];
for (let index = 0; index < lookbackDays; index += 1) {
  const date = addDays(startDate, index);
  const row = rawByDate.get(date);
  const clicks = Number(row?.clicks || 0);
  const impressions = Number(row?.impressions || 0);
  daily.push({
    date,
    clicks,
    impressions,
    ctr: impressions ? Number((clicks / impressions * 100).toFixed(4)) : 0,
    position: impressions > 0 && row && Number.isFinite(Number(row.position)) ? Number(Number(row.position).toFixed(4)) : null,
    searchVisiblePages: visiblePagesByDate.get(date)?.size || 0
  });
}

const report = {
  generatedAt: new Date().toISOString(),
  source: 'Google Search Console Search Analytics API - daily trend',
  property,
  authorizationScope: 'https://www.googleapis.com/auth/webmasters.readonly',
  dataState: 'all',
  range: { startDate, endDate, days: lookbackDays },
  metrics: ['impressions', 'clicks', 'position', 'ctr', 'searchVisiblePages'],
  daily,
  limitations: [
    'Search Analytics is the source of truth for Google search visibility, but it does not guarantee every row.',
    'Search-visible pages are pages returned by Search Analytics for a date, not a count of all URLs in the Google index.',
    'Average position is a Search Console aggregate. Lower values indicate stronger average ranking.'
  ]
};

fs.mkdirSync('reports', { recursive: true });
fs.mkdirSync('data', { recursive: true });
fs.writeFileSync('reports/gsc-daily-trend.json', JSON.stringify(report, null, 2) + '\n');
fs.writeFileSync('data/gsc-daily-trend.json', JSON.stringify(report, null, 2) + '\n');

console.log(JSON.stringify({
  generatedAt: report.generatedAt,
  property,
  startDate,
  endDate,
  days: daily.length,
  impressions: daily.reduce((sum, row) => sum + row.impressions, 0),
  clicks: daily.reduce((sum, row) => sum + row.clicks, 0),
  latestVisiblePages: daily.at(-1)?.searchVisiblePages || 0
}));
