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
end.setUTCDate(end.getUTCDate() - 2); // Search Console data can lag; use final-ish data.
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
const response = await fetch(endpoint, {
  method: 'POST',
  headers: {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json'
  },
  body: JSON.stringify({
    startDate,
    endDate,
    dimensions: ['page'],
    type: 'web',
    dataState: 'final',
    rowLimit: 25000
  })
});

if (!response.ok) {
  const detail = await response.text();
  throw new Error(`Search Console API failed for ${property}: ${response.status} ${detail}`);
}

const json = await response.json();
const byIntent = new Map();
for (const row of json.rows || []) {
  const page = String(row.keys?.[0] || '');
  let url;
  try { url = new URL(page); } catch { continue; }
  if (url.hostname !== 'trytoolscout.org' && url.hostname !== 'www.trytoolscout.org') continue;
  const intent = path.basename(url.pathname).replace(/\.html$/i, '');
  if (!/^best-[a-z0-9-]+$/.test(intent)) continue;
  const impressions = Number(row.impressions || 0);
  const clicks = Number(row.clicks || 0);
  const ctr = Number(row.ctr || 0) * 100;
  const position = Number(row.position || 0);
  const current = byIntent.get(intent) || { intent, page, clicks: 0, impressions: 0, ctrNumerator: 0, positionNumerator: 0 };
  current.clicks += clicks;
  current.impressions += impressions;
  current.ctrNumerator += ctr * impressions;
  current.positionNumerator += position * impressions;
  byIntent.set(intent, current);
}

const items = [...byIntent.values()].map(x => ({
  intent: x.intent,
  page: x.page,
  clicks: x.clicks,
  impressions: x.impressions,
  ctr: x.impressions ? Number((x.ctrNumerator / x.impressions).toFixed(4)) : 0,
  position: x.impressions ? Number((x.positionNumerator / x.impressions).toFixed(4)) : 0
})).sort((a,b) => b.impressions - a.impressions || b.clicks - a.clicks);

fs.mkdirSync('reports', { recursive: true });
const reportPath='reports/gsc-signals.json';
const reportPayload={
  source: 'Google Search Console Search Analytics API',
  property,
  startDate,
  endDate,
  count: items.length,
  items
};
const checkedAt=new Date().toISOString();
let generatedAt=checkedAt;
let unchanged=false;
if(fs.existsSync(reportPath)){
  try{
    const previous=JSON.parse(fs.readFileSync(reportPath,'utf8'));
    const previousPayload={source:previous?.source,property:previous?.property,startDate:previous?.startDate,endDate:previous?.endDate,count:previous?.count,items:previous?.items||[]};
    if(JSON.stringify(previousPayload)===JSON.stringify(reportPayload)&&previous?.generatedAt){
      generatedAt=previous.generatedAt;
      unchanged=true;
    }
  }catch{}
}
fs.writeFileSync(reportPath, JSON.stringify({generatedAt,...reportPayload}, null, 2) + '\n');

console.log(JSON.stringify({
  synced: items.length,
  property,
  startDate,
  endDate,
  checkedAt,
  dataChanged: !unchanged,
  impressions: items.reduce((n,x) => n + x.impressions, 0),
  clicks: items.reduce((n,x) => n + x.clicks, 0)
}));
