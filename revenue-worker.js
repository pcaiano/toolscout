import base from './funnel-worker.js';
import { summarizeLedger } from './revenue-attribution.js';
import { buildCommercialPriorities, summarizeCommercialClicks } from './revenue-intelligence.js';

const commercialIntent = value => /(crm|seo|marketing|agency|agencies|automation|lead|sales|email|project|form|survey|keyword|content)/i.test(String(value || ''));

async function readAffiliateMap(request, env) {
  try {
    const response = await env.ASSETS.fetch(new Request(new URL('/data/affiliate.json', request.url)));
    return response.ok ? await response.json() : {};
  } catch {
    return {};
  }
}

async function revenueSnapshot(request, env, stats) {
  const affiliate = await readAffiliateMap(request, env);
  const activeSlugs = new Set(stats?.affiliateCoverage?.activeToolSlugs || []);
  const byTool = Array.isArray(stats?.byTool) ? stats.byTool : [];
  const byIntent = Array.isArray(stats?.byIntent) ? stats.byIntent : [];
  const otherSessions = Number(stats?.funnel?.sessions || 0);

  let ledgerRows = [];
  try {
    const ledger = await env.DB.prepare(`
      SELECT affiliate_slug, tool_slug, intent_slug, conversion_id, status,
             attribution_status, commission, currency, source, confirmed_at,
             paid_at, created_at
      FROM revenue_ledger
      ORDER BY created_at DESC
      LIMIT 5000
    `).all();
    ledgerRows = ledger?.results || [];
  } catch {
    return {
      reportingStatus: 'unavailable',
      reportingNote: 'Revenue ledger is not available yet. Tool-side monetized clicks remain valid, but vendor-side revenue is unknown.',
      conversions: null,
      confirmedRevenue: null,
      pendingRevenue: null,
      paidRevenue: null,
      rpm: null,
      currencies: [],
      opportunity: buildOpportunity(byTool, byIntent, activeSlugs, affiliate)
    };
  }

  const hasVendorData = ledgerRows.length > 0;
  const currencies = [...new Set(ledgerRows.map(row => String(row.currency || 'EUR')))];
  const singleCurrency = currencies.length <= 1;
  const currency = currencies[0] || 'EUR';
  const conversionKeys = new Set(ledgerRows.filter(row => row.conversion_id).map(row => `${row.affiliate_slug}:${row.conversion_id}`));
  const evidenceBreakdown = summarizeLedger(ledgerRows);

  const sumCommission = statuses => ledgerRows
    .filter(row => statuses.includes(String(row.status || '')))
    .reduce((sum, row) => sum + Number(row.commission || 0), 0);

  const confirmedRevenue = hasVendorData && singleCurrency ? sumCommission(['confirmed', 'paid']) : null;
  const pendingRevenue = hasVendorData && singleCurrency ? sumCommission(['pending']) : null;
  const paidRevenue = hasVendorData && singleCurrency ? sumCommission(['paid']) : null;
  const rpm = confirmedRevenue !== null && otherSessions > 0 ? (confirmedRevenue / otherSessions) * 1000 : null;

  return {
    reportingStatus: hasVendorData ? 'connected' : 'not_connected',
    reportingNote: hasVendorData
      ? 'Vendor-side values come only from recorded ledger evidence; no commission is inferred from clicks.'
      : 'No vendor-side revenue records have been imported yet. Revenue is unknown, not zero.',
    conversions: hasVendorData ? conversionKeys.size : null,
    confirmedRevenue,
    pendingRevenue,
    paidRevenue,
    rpm,
    currency: singleCurrency ? currency : null,
    currencies,
    ledgerRows: ledgerRows.length,
    latestEvidenceAt: ledgerRows[0]?.created_at || null,
    lifecycle: evidenceBreakdown.lifecycle,
    attribution: evidenceBreakdown.attribution,
    opportunity: buildOpportunity(byTool, byIntent, activeSlugs, affiliate)
  };
}

async function commercialSnapshot(env, stats) {
  const clickResult = await env.DB.prepare(`
    SELECT c.tool_slug,c.session_id,c.affiliate_active_at_click,
      CASE WHEN c.intent_slug IS NOT NULL AND c.intent_slug!='general' THEN c.intent_slug END AS page_slug,
      COALESCE(
        CASE WHEN c.intent_slug IS NOT NULL AND c.intent_slug!='general' THEN c.intent_slug END,
        (SELECT f.intent_slug FROM funnel_events f WHERE f.session_id=c.session_id
          AND f.event_type IN ('recommendation_completed','recommendation_result_viewed')
          AND f.intent_slug IS NOT NULL AND f.created_at<=c.created_at ORDER BY f.created_at DESC LIMIT 1)
      ) AS attributed_intent,
      CASE WHEN EXISTS (SELECT 1 FROM funnel_events f WHERE f.session_id=c.session_id
        AND f.event_type IN ('recommendation_completed','recommendation_result_viewed')
        AND f.created_at<=c.created_at) THEN 1 ELSE 0 END AS recommendation_assisted
    FROM click_events c JOIN sessions s ON s.session_id=c.session_id
    WHERE c.created_at>=datetime('now','-30 days') AND s.classification='likely-human'
    ORDER BY c.created_at DESC LIMIT 5000
  `).all();
  const [pageSessions, intentSessions] = await Promise.all([
    env.DB.prepare(`SELECT CASE WHEN path='/' THEN 'home' ELSE trim(replace(path,'.html',''),'/') END AS slug,COUNT(DISTINCT f.session_id) AS sessions
      FROM funnel_events f JOIN sessions s ON s.session_id=f.session_id
      WHERE f.created_at>=datetime('now','-30 days') AND s.classification='likely-human' AND f.event_type='session_started' AND path IS NOT NULL
      GROUP BY slug`).all(),
    env.DB.prepare(`SELECT intent_slug AS slug,COUNT(DISTINCT f.session_id) AS sessions
      FROM funnel_events f JOIN sessions s ON s.session_id=f.session_id
      WHERE f.created_at>=datetime('now','-30 days') AND s.classification='likely-human'
        AND f.event_type IN ('recommendation_completed','recommendation_result_viewed') AND intent_slug IS NOT NULL
      GROUP BY intent_slug`).all()
  ]);
  const toMap = result => Object.fromEntries((result?.results || []).filter(row=>row.slug).map(row=>[row.slug,Number(row.sessions||0)]));
  const summary=summarizeCommercialClicks(clickResult?.results||[],{page:toMap(pageSessions),intent:toMap(intentSessions)},Number(stats?.funnel?.sessions||0));
  return {...summary,...buildCommercialPriorities(summary),windowDays:30,status:'observed',definition:'Likely-human clicks only. Monetization is the immutable click-time snapshot. Page/intent attribution is emitted only from a recorded referrer slug or a prior recommendation event in the same session.',toolRateDefinition:'Tool outbound rate is tool clicks divided by all likely-human sessions in the window; page and intent rates use observed sessions for that page/intent.'};
}

function buildOpportunity(byTool, byIntent, activeSlugs, affiliate) {
  const intentStrength = new Map();
  for (const row of byIntent || []) {
    const slug = String(row.intent_slug || 'general');
    const clicks = Number(row.clicks || 0);
    intentStrength.set(slug, { clicks, multiplier: commercialIntent(slug) ? 2 : 1 });
  }
  const strongestIntentMultiplier = Math.max(1, ...[...intentStrength.values()].map(x => x.multiplier));
  const items = (byTool || [])
    .filter(row => !activeSlugs.has(String(row.tool_slug || '')))
    .map(row => {
      const tool = String(row.tool_slug || 'unknown');
      const clicks = Number(row.clicks || 0);
      const tracked = Object.prototype.hasOwnProperty.call(affiliate || {}, tool);
      const score = clicks * strongestIntentMultiplier * (tracked ? 1.25 : 1);
      return {
        tool_slug: tool,
        clicks,
        affiliateStatus: tracked ? 'tracked_inactive' : 'untracked',
        score: Number(score.toFixed(1))
      };
    })
    .sort((a, b) => b.score - a.score || b.clicks - a.clicks)
    .slice(0, 10);
  return {
    method: 'directional_score',
    note: 'Opportunity score prioritizes unmonetized click volume, with a commercial-intent and tracked-program boost. It is not an estimate of euros.',
    items
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/api/stats' && request.method === 'GET') {
      const response = await base.fetch(request, env, ctx);
      if (!response.ok) return response;
      const stats = await response.json();
      const [revenue,commercial] = await Promise.all([
        revenueSnapshot(request, env, stats),
        commercialSnapshot(env,stats).catch(()=>({status:'unavailable',reason:'Revenue Intelligence v2 aggregation is unavailable; core analytics remain intact.'}))
      ]);
      return Response.json({ ...stats, revenue, commercial }, {
        headers: {
          'Content-Type': 'application/json; charset=UTF-8',
          'Cache-Control': 'private, max-age=60'
        }
      });
    }
    return base.fetch(request, env, ctx);
  },
  async scheduled(event, env, ctx) {
    if (typeof base.scheduled === 'function') return base.scheduled(event, env, ctx);
  }
};
