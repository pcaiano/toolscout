import fs from 'node:fs/promises';

const tools = JSON.parse(await fs.readFile('data/tools.json', 'utf8'));
const affiliate = JSON.parse(await fs.readFile('data/affiliate.json', 'utf8'));
const now = new Date();
const DAY = 86400000;
const timeoutMs = 12000;

const ageDays = value => {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(d.getTime()) ? Math.floor((now - d) / DAY) : null;
};

async function probe(url) {
  if (!url) return { status: 'missing', httpStatus: null, finalUrl: null, error: null };
  try {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol)) return { status: 'invalid', httpStatus: null, finalUrl: null, error: 'unsupported_protocol' };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetch(url, {
        method: 'HEAD',
        redirect: 'follow',
        signal: controller.signal,
        headers: { 'user-agent': 'ToolScout Catalog Health/1.0 (+https://trytoolscout.org)' }
      });
      if ([400, 403, 405, 429].includes(response.status)) {
        response = await fetch(url, {
          method: 'GET',
          redirect: 'follow',
          signal: controller.signal,
          headers: { 'user-agent': 'ToolScout Catalog Health/1.0 (+https://trytoolscout.org)' }
        });
      }
    } finally {
      clearTimeout(timer);
    }
    const code = response.status;
    let status = 'ok';
    if (code === 404 || code === 410) status = 'broken';
    else if (code >= 500) status = 'vendor_error';
    else if (code === 401 || code === 403 || code === 429) status = 'blocked_or_limited';
    else if (code >= 400) status = 'warning';
    return { status, httpStatus: code, finalUrl: response.url || url, error: null };
  } catch (error) {
    const message = String(error?.name === 'AbortError' ? 'timeout' : error?.message || error);
    return { status: 'network_warning', httpStatus: null, finalUrl: null, error: message };
  }
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

const rows = await mapLimit(tools, 8, async tool => {
  const source = await probe(tool.sourceUrl);
  const affiliateConfig = affiliate[tool.slug] || {};
  const affiliateEnabled = Boolean(affiliateConfig.enabled && affiliateConfig.url);
  const affiliateLink = affiliateEnabled ? await probe(affiliateConfig.url) : null;
  const verifiedAgeDays = ageDays(tool.lastVerified);
  const missingCritical = ['slug', 'name', 'category', 'description', 'pricing', 'sourceUrl', 'lastVerified']
    .filter(key => tool[key] === undefined || tool[key] === null || tool[key] === '');
  const needsWeeklyReview = verifiedAgeDays === null || verifiedAgeDays > 7;
  const overdue = verifiedAgeDays === null || verifiedAgeDays > 30;
  return {
    slug: tool.slug,
    name: tool.name,
    lastVerified: tool.lastVerified || null,
    verifiedAgeDays,
    needsWeeklyReview,
    overdue,
    missingCritical,
    source: { url: tool.sourceUrl || null, ...source },
    affiliate: affiliateEnabled ? { enabled: true, url: affiliateConfig.url, ...affiliateLink } : { enabled: false, url: null, status: 'inactive' }
  };
});

const count = predicate => rows.filter(predicate).length;
const summary = {
  tools: rows.length,
  generatedAt: now.toISOString(),
  cadence: {
    linkHealth: 'daily',
    metadataFreshness: 'daily age check; weekly review threshold at 7 days',
    deepReview: 'monthly threshold at 30 days'
  },
  sourceLinks: {
    healthy: count(r => r.source.status === 'ok'),
    confirmedBroken: count(r => r.source.status === 'broken'),
    warnings: count(r => !['ok', 'broken'].includes(r.source.status))
  },
  affiliateLinks: {
    active: count(r => r.affiliate.enabled),
    healthy: count(r => r.affiliate.enabled && r.affiliate.status === 'ok'),
    confirmedBroken: count(r => r.affiliate.enabled && r.affiliate.status === 'broken'),
    warnings: count(r => r.affiliate.enabled && !['ok', 'broken'].includes(r.affiliate.status))
  },
  metadata: {
    verifiedWithin7Days: count(r => r.verifiedAgeDays !== null && r.verifiedAgeDays <= 7),
    needsWeeklyReview: count(r => r.needsWeeklyReview),
    overdue30Days: count(r => r.overdue),
    missingCriticalFields: count(r => r.missingCritical.length > 0)
  }
};

const report = { summary, tools: rows };
await fs.mkdir('reports', { recursive: true });
await fs.writeFile('reports/catalog-health.json', JSON.stringify(report, null, 2) + '\n');

console.log(JSON.stringify(summary, null, 2));
const hardFailures = summary.sourceLinks.confirmedBroken + summary.affiliateLinks.confirmedBroken + summary.metadata.missingCriticalFields;
if (hardFailures > 0) process.exitCode = 2;
