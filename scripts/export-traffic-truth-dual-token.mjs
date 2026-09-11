import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const OUT = 'data/traffic-truth.json';
const baseToken = String(process.env.CLOUDFLARE_API_TOKEN || '').trim();
const analyticsToken = String(process.env.CLOUDFLARE_ANALYTICS_TOKEN || '').trim();

if (!baseToken) throw new Error('CLOUDFLARE_API_TOKEN is required for D1 access.');
if (!analyticsToken) throw new Error('CLOUDFLARE_ANALYTICS_TOKEN is required for Cloudflare RUM.');

function runExport(token) {
  execFileSync(process.execPath, ['scripts/export-traffic-truth.mjs'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    env: { ...process.env, CLOUDFLARE_API_TOKEN: token, TRAFFIC_TRUTH_STRICT: '0' },
    maxBuffer: 10 * 1024 * 1024
  });
  return JSON.parse(fs.readFileSync(OUT, 'utf8'));
}

const d1Run = runExport(baseToken);
const rumRun = analyticsToken === baseToken ? d1Run : runExport(analyticsToken);

const d1 = d1Run.d1;
const rum = rumRun.cloudflareRum;
const cloudflareSite = rumRun.cloudflareSite;
const gsc = d1Run.googleSearchConsole?.status === 'observed' ? d1Run.googleSearchConsole : rumRun.googleSearchConsole;

function reconcile() {
  if (d1?.status !== 'observed') return { status: 'degraded', reason: 'D1 browser-confirmed traffic is unavailable.' };
  if (rum?.status !== 'observed') return { status: 'degraded', reason: 'Cloudflare RUM audit is unavailable.', primary: 'd1-browser-confirmed' };
  const a = Number(d1.last24 || 0);
  const b = Number(rum.last24?.visits || 0);
  const max = Math.max(a, b);
  const delta = a - b;
  const absoluteDelta = Math.abs(delta);
  const common = {
    primary: 'd1-browser-confirmed',
    audit: 'cloudflare-rum',
    d1Confirmed24h: a,
    rumVisits24h: b,
    rumPageViews24h: Number(rum.last24?.pageViews || 0),
    serverObservedEntries24h: Number(d1.serverObservedEntries24h || 0),
    delta
  };
  if (max < 10) return { status: 'low-volume-learning', ...common, note: 'Volume is too low for a useful percentage divergence alarm.' };
  const relativeDelta = max ? absoluteDelta / max : 0;
  if (absoluteDelta >= 4 && relativeDelta >= 0.5) return { status: 'degraded', ...common, relativeDelta: Number((relativeDelta * 100).toFixed(1)), reason: 'Independent browser traffic sources diverge materially.' };
  return { status: 'healthy', ...common, relativeDelta: Number((relativeDelta * 100).toFixed(1)) };
}

const reconciliation = reconcile();
const report = {
  ...d1Run,
  generatedAt: new Date().toISOString(),
  cloudflareSite,
  cloudflareRum: rum,
  d1,
  googleSearchConsole: gsc,
  reconciliation,
  status: reconciliation.status === 'degraded' ? 'degraded' : 'observed'
};

fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({
  status: report.status,
  reconciliation,
  cloudflareRum: rum?.status,
  d1: d1?.status,
  gsc: gsc?.status,
  eeaCoverage: cloudflareSite?.eeaCoverage ?? 'unknown'
}, null, 2));

if (process.env.TRAFFIC_TRUTH_STRICT === '1' && reconciliation.status === 'degraded') process.exitCode = 2;
