import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || '16054933850d8af4ba498b772cbe2de9';
const SITE_TAG = process.env.CLOUDFLARE_RUM_SITE_TAG || '91d03dda89d74bc5b6685a68bbe8ef42';
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN || '';
const TIME_ZONE = 'Europe/Lisbon';
const OUT = 'data/traffic-truth.json';
const GSC = 'reports/gsc-signals.json';

const iso = value => new Date(value).toISOString();
const now = new Date();

function zonedParts(date, timeZone = TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  return Object.fromEntries(parts.filter(x => x.type !== 'literal').map(x => [x.type, x.value]));
}

function zonedMidnightUtc(date, { monthStart = false } = {}) {
  const p = zonedParts(date);
  const y = Number(p.year), m = Number(p.month), d = monthStart ? 1 : Number(p.day);
  const guess = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  const gp = zonedParts(guess);
  const represented = Date.UTC(Number(gp.year), Number(gp.month) - 1, Number(gp.day), Number(gp.hour), Number(gp.minute), Number(gp.second));
  const offset = represented - guess.getTime();
  return new Date(guess.getTime() - offset);
}

const bounds = {
  now: iso(now),
  last24: iso(now.getTime() - 24 * 3600 * 1000),
  today: iso(zonedMidnightUtc(now)),
  month: iso(zonedMidnightUtc(now, { monthStart: true }))
};

function cleanHex(value, label) {
  const text = String(value || '').trim();
  if (!/^[a-f0-9]{32}$/i.test(text)) throw new Error(`${label} must be a 32 character hexadecimal id.`);
  return text;
}

cleanHex(ACCOUNT_ID, 'CLOUDFLARE_ACCOUNT_ID');
cleanHex(SITE_TAG, 'CLOUDFLARE_RUM_SITE_TAG');

async function cloudflareRequest(url, options = {}) {
  if (!API_TOKEN) throw new Error('CLOUDFLARE_API_TOKEN is not configured.');
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let json;
  try { json = JSON.parse(text); } catch { json = null; }
  if (!response.ok) throw new Error(`Cloudflare API ${response.status}: ${text.slice(0, 800)}`);
  if (json?.errors?.length) throw new Error(`Cloudflare GraphQL: ${JSON.stringify(json.errors).slice(0, 1200)}`);
  if (json?.success === false) throw new Error(`Cloudflare API: ${JSON.stringify(json.errors || json).slice(0, 1200)}`);
  return json;
}

async function rumSiteInfo() {
  try {
    const json = await cloudflareRequest(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/rum/site_info/list`);
    const rows = Array.isArray(json?.result) ? json.result : [];
    const site = rows.find(x => String(x.site_tag || x.siteTag || '') === SITE_TAG) || rows.find(x => String(x.host || x.ruleset?.zone_name || '').replace(/^www\./, '') === 'trytoolscout.org') || null;
    if (!site) return { status: 'not-found' };
    return {
      status: 'observed',
      siteTag: site.site_tag || site.siteTag || SITE_TAG,
      autoInstall: site.auto_install ?? site.autoInstall ?? null,
      enabled: site.enabled ?? site.ruleset?.enabled ?? null,
      lite: site.lite ?? null,
      zoneName: site.ruleset?.zone_name || site.zone_name || null
    };
  } catch (error) {
    return { status: 'unavailable', reason: String(error?.message || error) };
  }
}

function rumFilter(from, to) {
  return `{datetime_geq:${JSON.stringify(from)},datetime_leq:${JSON.stringify(to)},siteTag:${JSON.stringify(SITE_TAG)},bot:0}`;
}

function rumSummary(groups) {
  const row = Array.isArray(groups) && groups.length ? groups[0] : null;
  if (!row) return { pageViews: 0, visits: 0, sampleInterval: 1 };
  return {
    pageViews: Number(row.count || 0),
    visits: Number(row.sum?.visits || 0),
    sampleInterval: Number(row.avg?.sampleInterval || 1)
  };
}

async function rumSnapshot() {
  try {
    const query = `query TrafficTruth {
      viewer {
        accounts(filter:{accountTag:${JSON.stringify(ACCOUNT_ID)}}) {
          last24: rumPageloadEventsAdaptiveGroups(limit:1,filter:${rumFilter(bounds.last24,bounds.now)}) { count avg { sampleInterval } sum { visits } }
          today: rumPageloadEventsAdaptiveGroups(limit:1,filter:${rumFilter(bounds.today,bounds.now)}) { count avg { sampleInterval } sum { visits } }
          mtd: rumPageloadEventsAdaptiveGroups(limit:1,filter:${rumFilter(bounds.month,bounds.now)}) { count avg { sampleInterval } sum { visits } }
          topPaths: rumPageloadEventsAdaptiveGroups(limit:20,orderBy:[count_DESC],filter:${rumFilter(bounds.month,bounds.now)}) { count avg { sampleInterval } sum { visits } dimensions { requestPath } }
          topReferers: rumPageloadEventsAdaptiveGroups(limit:20,orderBy:[count_DESC],filter:${rumFilter(bounds.month,bounds.now)}) { count avg { sampleInterval } sum { visits } dimensions { refererHost } }
        }
      }
    }`;
    const json = await cloudflareRequest('https://api.cloudflare.com/client/v4/graphql', { method: 'POST', body: JSON.stringify({ query }) });
    const account = json?.data?.viewer?.accounts?.[0];
    if (!account) throw new Error('Cloudflare RUM account result is empty.');
    return {
      status: 'observed',
      excludeBots: true,
      dataset: 'rumPageloadEventsAdaptiveGroups',
      last24: rumSummary(account.last24),
      today: rumSummary(account.today),
      monthToDate: rumSummary(account.mtd),
      topPaths: (account.topPaths || []).map(row => ({ path: row.dimensions?.requestPath || '/', pageViews: Number(row.count || 0), visits: Number(row.sum?.visits || 0), sampleInterval: Number(row.avg?.sampleInterval || 1) })),
      topReferers: (account.topReferers || []).map(row => ({ referer: row.dimensions?.refererHost || 'direct', pageViews: Number(row.count || 0), visits: Number(row.sum?.visits || 0), sampleInterval: Number(row.avg?.sampleInterval || 1) }))
    };
  } catch (error) {
    return { status: 'unavailable', reason: String(error?.message || error) };
  }
}

function wranglerBlock(parsed) {
  if (Array.isArray(parsed)) return parsed.find(item => item && (Array.isArray(item.results) || item.meta)) || {};
  if (Array.isArray(parsed?.result)) return parsed.result.find(item => item && (Array.isArray(item.results) || item.meta)) || {};
  return parsed || {};
}

function sqlTime(value) { return String(value).replace('T', ' ').replace(/\.\d{3}Z$/, ''); }

function d1Snapshot() {
  try {
    const sql = `WITH
      likely AS (
        SELECT session_id
        FROM sessions
        WHERE classification='likely-human'
      ),
      confirmed AS (
        SELECT f.session_id, MIN(f.created_at) AS created_at
        FROM funnel_events f
        JOIN likely l ON l.session_id=f.session_id
        WHERE f.event_type='page_confirmed'
          AND f.created_at >= '${sqlTime(bounds.month)}'
        GROUP BY f.session_id
      ),
      started AS (
        SELECT f.session_id, MIN(f.created_at) AS created_at
        FROM funnel_events f
        JOIN likely l ON l.session_id=f.session_id
        WHERE f.event_type='session_started'
          AND f.created_at >= '${sqlTime(bounds.last24)}'
        GROUP BY f.session_id
      )
      SELECT
        COALESCE(SUM(CASE WHEN confirmed.created_at >= '${sqlTime(bounds.last24)}' THEN 1 ELSE 0 END),0) AS confirmed_24h,
        COALESCE(SUM(CASE WHEN confirmed.created_at >= '${sqlTime(bounds.today)}' THEN 1 ELSE 0 END),0) AS confirmed_today,
        COUNT(confirmed.session_id) AS confirmed_mtd,
        (SELECT COUNT(*) FROM started) AS server_entries_24h,
        (SELECT COUNT(*) FROM started st WHERE NOT EXISTS (
          SELECT 1 FROM funnel_events c2
          WHERE c2.session_id=st.session_id AND c2.event_type='page_confirmed'
        )) AS server_only_24h
      FROM confirmed;`;
    const stdout = execFileSync('npx', ['--yes', 'wrangler@4', 'd1', 'execute', 'toolscout', '--remote', '--command', sql, '--json'], {
      encoding: 'utf8',
      env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: ACCOUNT_ID },
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 5 * 1024 * 1024
    });
    const block = wranglerBlock(JSON.parse(stdout));
    const row = (block.results || [])[0] || {};
    const meta = block.meta || {};
    return {
      status: 'observed',
      metric: 'browser-confirmed sessions',
      last24: Number(row.confirmed_24h || 0),
      today: Number(row.confirmed_today || 0),
      monthToDate: Number(row.confirmed_mtd || 0),
      serverObservedEntries24h: Number(row.server_entries_24h || 0),
      serverOnlyUnconfirmed24h: Number(row.server_only_24h || 0),
      queryRowsRead: Number(meta.rows_read ?? meta.rowsRead ?? 0),
      queryRowsWritten: Number(meta.rows_written ?? meta.rowsWritten ?? 0),
      queryDurationMs: Number(meta.duration ?? 0)
    };
  } catch (error) {
    return { status: 'unavailable', reason: String(error?.stderr || error?.message || error).slice(0, 1600) };
  }
}

function gscSnapshot() {
  try {
    if (!fs.existsSync(GSC)) return { status: 'unavailable', reason: 'reports/gsc-signals.json is missing' };
    const data = JSON.parse(fs.readFileSync(GSC, 'utf8'));
    const totals = data.siteTotals || {
      clicks: (data.items || []).reduce((n, x) => n + Number(x.clicks || 0), 0),
      impressions: (data.items || []).reduce((n, x) => n + Number(x.impressions || 0), 0)
    };
    return {
      status: data.siteTotals ? 'observed' : 'partial',
      generatedAt: data.generatedAt || null,
      startDate: data.startDate || null,
      endDate: data.endDate || null,
      dataState: data.dataState || 'legacy-partial',
      clicks: Number(totals.clicks || 0),
      impressions: Number(totals.impressions || 0),
      pageCount: Number(data.pageCount || data.count || 0),
      coverage: data.siteTotals ? 'site-wide' : 'guide-pages-only'
    };
  } catch (error) {
    return { status: 'unavailable', reason: String(error?.message || error) };
  }
}

const [siteInfo, rum] = await Promise.all([rumSiteInfo(), rumSnapshot()]);
const d1 = d1Snapshot();
const gsc = gscSnapshot();

function reconciliationStatus() {
  if (d1.status !== 'observed') return { status: 'degraded', reason: 'D1 browser-confirmed traffic is unavailable.' };
  if (rum.status !== 'observed') return { status: 'degraded', reason: 'Cloudflare RUM audit is unavailable.', primary: 'd1-browser-confirmed' };
  const a = Number(d1.last24 || 0), b = Number(rum.last24?.visits || 0);
  const max = Math.max(a, b), delta = a - b, absoluteDelta = Math.abs(delta);
  if (max < 10) return { status: 'low-volume-learning', primary: 'd1-browser-confirmed', audit: 'cloudflare-rum', d1Confirmed24h: a, rumVisits24h: b, rumPageViews24h: Number(rum.last24?.pageViews || 0), serverObservedEntries24h: Number(d1.serverObservedEntries24h || 0), delta, note: 'Volume is too low for a useful percentage divergence alarm.' };
  const relativeDelta = max ? absoluteDelta / max : 0;
  if (absoluteDelta >= 4 && relativeDelta >= 0.5) return { status: 'degraded', primary: 'd1-browser-confirmed', audit: 'cloudflare-rum', d1Confirmed24h: a, rumVisits24h: b, rumPageViews24h: Number(rum.last24?.pageViews || 0), serverObservedEntries24h: Number(d1.serverObservedEntries24h || 0), delta, relativeDelta: Number((relativeDelta * 100).toFixed(1)), reason: 'Independent browser traffic sources diverge materially.' };
  return { status: 'healthy', primary: 'd1-browser-confirmed', audit: 'cloudflare-rum', d1Confirmed24h: a, rumVisits24h: b, rumPageViews24h: Number(rum.last24?.pageViews || 0), serverObservedEntries24h: Number(d1.serverObservedEntries24h || 0), delta, relativeDelta: Number((relativeDelta * 100).toFixed(1)) };
}

const reconciliation = reconciliationStatus();
const eeaCoverage = siteInfo.status === 'observed' && siteInfo.lite === true ? 'excluded' : siteInfo.status === 'observed' && siteInfo.lite === false ? 'included' : 'unknown';
const report = {
  generatedAt: now.toISOString(),
  timezone: TIME_ZONE,
  objective: 'Maintain a faithful traffic picture by separating browser-confirmed first-party sessions from server-only requests and auditing them against Cloudflare RUM and Google Search Console.',
  primaryMetric: 'D1 browser-confirmed public sessions',
  rules: [
    'A server HTML request alone does not count as human traffic.',
    'A direct /go/ redirect cannot create a human session.',
    'A browser must confirm a public page entry before its session or outbound activity enters headline human KPIs.',
    'Cloudflare RUM is an independent browser-side audit, not a replacement for first-party funnel attribution.',
    'Cloudflare RUM pageViews use the dataset count field directly; sampleInterval is retained only as a diagnostic.',
    'Google Search Console is the source of truth for Google Search clicks and impressions.'
  ],
  windowsUtc: bounds,
  cloudflareSite: { ...siteInfo, eeaCoverage },
  cloudflareRum: rum,
  d1,
  googleSearchConsole: gsc,
  reconciliation,
  status: reconciliation.status === 'degraded' ? 'degraded' : 'observed'
};

fs.mkdirSync('data', { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, reconciliation, cloudflareRum: rum.status, d1, gsc: gsc.status, eeaCoverage }, null, 2));

if (process.env.TRAFFIC_TRUTH_STRICT === '1' && reconciliation.status === 'degraded') process.exitCode = 2;
