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

async function monetizedClickBreakdown(env) {
  try {
    const result = await env.DB.prepare(`
      SELECT COALESCE(s.classification, 'unknown/legacy') AS classification,
             COUNT(*) AS clicks
      FROM click_events c
      LEFT JOIN sessions s ON s.session_id = c.session_id
      WHERE c.affiliate_active_at_click = 1
        AND c.source != 'internal-test'
      GROUP BY COALESCE(s.classification, 'unknown/legacy')
    `).all();
    const breakdown = {
      'likely-human': 0,
      'known-bot/crawler': 0,
      'synthetic/test': 0,
      owner: 0,
      'unknown/legacy': 0
    };
    for (const row of result?.results || []) {
      const key = String(row.classification || 'unknown/legacy');
      breakdown[key] = Number(row.clicks || 0);
    }
    return breakdown;
  } catch {
    return null;
  }
}

function lisbonOffsetMinutes(date = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
    }).formatToParts(date);
    const values = Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
    const localAsUtc = Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), Number(values.hour), Number(values.minute), Number(values.second));
    return Math.round((localAsUtc - date.getTime()) / 60000);
  } catch {
    return 0;
  }
}

function sqliteOffsetModifier(minutes) {
  if (!minutes) return '+0 minutes';
  return `${minutes >= 0 ? '+' : ''}${minutes} minutes`;
}

async function trackingHealth(env) {
  try {
    const [lastHumanSession, lastHumanEvent, sessions1h, sessions24h, events15m] = await Promise.all([
      env.DB.prepare(`SELECT MAX(first_seen_at) AS at FROM sessions WHERE classification='likely-human'`).first(),
      env.DB.prepare(`SELECT MAX(f.created_at) AS at FROM funnel_events f JOIN sessions s ON s.session_id=f.session_id WHERE s.classification='likely-human'`).first(),
      env.DB.prepare(`SELECT COUNT(*) AS n FROM sessions WHERE classification='likely-human' AND first_seen_at>=datetime('now','-1 hour')`).first(),
      env.DB.prepare(`SELECT COUNT(*) AS n FROM sessions WHERE classification='likely-human' AND first_seen_at>=datetime('now','-24 hours')`).first(),
      env.DB.prepare(`SELECT COUNT(*) AS n FROM funnel_events f JOIN sessions s ON s.session_id=f.session_id WHERE s.classification='likely-human' AND f.created_at>=datetime('now','-15 minutes')`).first()
    ]);
    return {
      status: 'observed',
      api: 'live',
      lastHumanSessionAt: lastHumanSession?.at || null,
      lastHumanEventAt: lastHumanEvent?.at || null,
      humanSessionsLastHour: Number(sessions1h?.n || 0),
      humanSessionsLast24Hours: Number(sessions24h?.n || 0),
      humanEventsLast15Minutes: Number(events15m?.n || 0),
      checkedAt: new Date().toISOString()
    };
  } catch (error) {
    return { status: 'unavailable', api: 'live', reason: `Tracking health aggregation unavailable: ${String(error?.message || error)}`, checkedAt: new Date().toISOString() };
  }
}

async function trafficSnapshot(env) {
  try {
    const offsetMinutes = lisbonOffsetMinutes();
    const offset = sqliteOffsetModifier(offsetMinutes);
    const localDate = `date(first_seen_at,'${offset}')`;
    const localNowDate = `date('now','${offset}')`;
    const [dailyResult, todayRow, yesterdayRow, monthRow, last7Row, previous7Row] = await Promise.all([
      env.DB.prepare(`
        SELECT ${localDate} AS day, COUNT(*) AS sessions
        FROM sessions
        WHERE classification='likely-human'
          AND ${localDate} >= date('now','${offset}','-29 days')
        GROUP BY ${localDate}
        ORDER BY day
      `).all(),
      env.DB.prepare(`SELECT COUNT(*) AS sessions FROM sessions WHERE classification='likely-human' AND ${localDate}=${localNowDate}`).first(),
      env.DB.prepare(`SELECT COUNT(*) AS sessions FROM sessions WHERE classification='likely-human' AND ${localDate}=date('now','${offset}','-1 day')`).first(),
      env.DB.prepare(`SELECT COUNT(*) AS sessions FROM sessions WHERE classification='likely-human' AND ${localDate}>=date('now','${offset}','start of month')`).first(),
      env.DB.prepare(`SELECT COUNT(*) AS sessions FROM sessions WHERE classification='likely-human' AND ${localDate}>=date('now','${offset}','-6 days')`).first(),
      env.DB.prepare(`SELECT COUNT(*) AS sessions FROM sessions WHERE classification='likely-human' AND ${localDate}>=date('now','${offset}','-13 days') AND ${localDate}<=date('now','${offset}','-7 days')`).first()
    ]);
    const now = new Date();
    const lisbonParts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone:'Europe/Lisbon', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(now).filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));
    const year = Number(lisbonParts.year);
    const month = Number(lisbonParts.month);
    const dayOfMonth = Number(lisbonParts.day);
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const observed = new Map((dailyResult?.results || []).map(row => [String(row.day), Number(row.sessions || 0)]));
    const daily = [];
    const localToday = new Date(Date.UTC(year, month - 1, dayOfMonth));
    for (let daysAgo = 29; daysAgo >= 0; daysAgo -= 1) {
      const date = new Date(localToday.getTime() - daysAgo * 86400000);
      const day = date.toISOString().slice(0, 10);
      daily.push({ day, sessions: Number(observed.get(day) || 0) });
    }
    const today = Number(todayRow?.sessions || 0);
    const yesterday = Number(yesterdayRow?.sessions || 0);
    const monthToDate = Number(monthRow?.sessions || 0);
    const last7Days = Number(last7Row?.sessions || 0);
    const previous7Days = Number(previous7Row?.sessions || 0);
    const dailyAverageMTD = dayOfMonth > 0 ? monthToDate / dayOfMonth : 0;
    const last7DailyAverage = last7Days / 7;
    const sevenDayChangeRate = previous7Days > 0 ? ((last7Days - previous7Days) / previous7Days) * 100 : null;
    const projectedMonth = dayOfMonth > 0 ? dailyAverageMTD * daysInMonth : null;
    const best = daily.reduce((current, row) => row.sessions > (current?.sessions || 0) ? row : current, null);
    return {
      status: 'observed',
      timezone: 'Europe/Lisbon',
      offsetMinutes,
      today,
      yesterday,
      monthToDate,
      dayOfMonth,
      daysInMonth,
      dailyAverageMTD: Number(dailyAverageMTD.toFixed(1)),
      last7Days,
      last7DailyAverage: Number(last7DailyAverage.toFixed(1)),
      previous7Days,
      sevenDayChangeRate: sevenDayChangeRate === null ? null : Number(sevenDayChangeRate.toFixed(1)),
      projectedMonth: projectedMonth === null ? null : Math.round(projectedMonth),
      bestDay: best && best.sessions > 0 ? best : null,
      daily
    };
  } catch (error) {
    return { status: 'unavailable', reason: `Temporal traffic aggregation unavailable: ${String(error?.message || error)}` };
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

function commandCenterSection() {
  return `<section class="section live" id="trafficOverTime"><div class="sectionHead"><h2>Traffic over time</h2><span>Likely-human · Europe/Lisbon · auto-refresh 15s</span></div><div class="grid4" id="trafficMetrics"><div class="note">Loading temporal analytics…</div></div><div class="grid2" style="margin-top:14px"><div class="panel"><div class="sectionHead"><h2>Daily sessions</h2><span>Last 14 days</span></div><div id="dailyTraffic"><div class="note">Loading…</div></div></div><div class="panel"><div class="sectionHead"><h2>Traffic pace</h2><span>Trend & projection</span></div><div id="trafficPace"><div class="note">Loading…</div></div></div></div></section>\n`;
}

function commandCenterScript() {
  return `<script>
(function(){
  const tsDateLabel=value=>{try{return new Date(value+'T12:00:00Z').toLocaleDateString(undefined,{month:'short',day:'numeric',timeZone:'Europe/Lisbon'})}catch{return value}};
  const tsSigned=value=>value===null||value===undefined?'Not enough history':(Number(value)>=0?'+':'')+Number(value).toFixed(1)+'%';
  function tsDailyRows(items){
    const rows=(items||[]).slice(-14);if(!rows.length)return '<div class="note">No daily traffic yet.</div>';
    const max=Math.max(1,...rows.map(x=>Number(x.sessions||0)));
    return rows.map(x=>{const v=Number(x.sessions||0);return '<div class="row"><div style="flex:1"><div class="name">'+esc(tsDateLabel(x.day))+'</div><div class="bar"><i style="width:'+Math.max(v?3:0,Math.round(v/max*100))+'%"></i></div></div><div class="value">'+n(v)+'</div></div>'}).join('');
  }
  function tsRenderTraffic(d){
    const t=d?.traffic||{};const f=d?.funnel||{};
    const metrics=document.getElementById('trafficMetrics'),daily=document.getElementById('dailyTraffic'),pace=document.getElementById('trafficPace');
    if(!metrics||!daily||!pace)return;
    if(t.status!=='observed'){
      metrics.innerHTML='<div class="note">Temporal analytics are temporarily unavailable.</div>';daily.innerHTML='';pace.innerHTML='';return;
    }
    metrics.innerHTML=card('Today',n(t.today),'Likely-human sessions · today so far')+card('This month',n(t.monthToDate),'Month-to-date')+card('MTD daily average',Number(t.dailyAverageMTD||0).toFixed(1),'Includes today so far')+card('Last 7 days',n(t.last7Days),Number(t.last7DailyAverage||0).toFixed(1)+' per day');
    daily.innerHTML=tsDailyRows(t.daily);
    const trendClass=Number(t.sevenDayChangeRate||0)>=0?'good':'warn';
    const best=t.bestDay?tsDateLabel(t.bestDay.day)+' · '+n(t.bestDay.sessions):'No traffic yet';
    pace.innerHTML='<div class="row"><div><div class="name">Yesterday</div><div class="meta">Completed Lisbon day</div></div><div class="value">'+n(t.yesterday)+'</div></div>'+
      '<div class="row"><div><div class="name">Previous 7 days</div><div class="meta">Comparison period</div></div><div class="value">'+n(t.previous7Days)+'</div></div>'+
      '<div class="row"><div><div class="name">7-day trend</div><div class="meta">Current 7 days vs previous 7</div></div><div class="value '+trendClass+'">'+esc(tsSigned(t.sevenDayChangeRate))+'</div></div>'+
      '<div class="row"><div><div class="name">Best day</div><div class="meta">Within the last 30 Lisbon calendar days</div></div><div class="value">'+esc(best)+'</div></div>'+
      '<div class="row"><div><div class="name">Projected month</div><div class="meta">Simple projection at current MTD pace</div></div><div class="value">'+(t.projectedMonth==null?'—':n(t.projectedMonth))+'</div></div>'+
      '<div class="row"><div><div class="name">Rolling 30 days</div><div class="meta">Primary likely-human audience window</div></div><div class="value">'+n(f.sessions)+'</div></div>';
    statusEl.textContent='Live · updated '+new Date().toLocaleString()+' · auto-refresh 15s';
  }
  const tsBaseRender=window.render;
  if(typeof tsBaseRender==='function')window.render=function(d){tsBaseRender(d);tsRenderTraffic(d)};
  let tsBusy=false;
  async function tsRefresh(){if(tsBusy||document.hidden||typeof window.load!=='function')return;tsBusy=true;try{await window.load()}finally{tsBusy=false}}
  setTimeout(tsRefresh,900);
  setInterval(tsRefresh,15000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)tsRefresh()});
})();
</script>`;
}

async function enhanceCommandCenter(request, env, ctx) {
  const response = await base.fetch(request, env, ctx);
  if (!response.ok) return response;
  const type = response.headers.get('Content-Type') || '';
  if (!type.includes('text/html')) return response;
  let html = await response.text();
  const anchor = '<section class="section"><div class="sectionHead"><h2>End-to-end funnel</h2>';
  if (!html.includes('id="trafficOverTime"')) html = html.replace(anchor, commandCenterSection() + anchor);
  if (!html.includes('tsRenderTraffic')) html = html.replace('</body>', commandCenterScript() + '</body>');
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'private, no-store');
  headers.delete('Content-Length');
  return new Response(html, { status: response.status, headers });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/api/stats' && request.method === 'GET') {
      const response = await base.fetch(request, env, ctx);
      if (!response.ok) return response;
      const stats = await response.json();
      const [revenue,commercial,breakdown,traffic,tracking] = await Promise.all([
        revenueSnapshot(request, env, stats),
        commercialSnapshot(env,stats).catch(()=>({status:'unavailable',reason:'Revenue Intelligence v2 aggregation is unavailable; core analytics remain intact.'})),
        monetizedClickBreakdown(env),
        trafficSnapshot(env),
        trackingHealth(env)
      ]);
      const affiliateCoverage = breakdown
        ? { ...(stats.affiliateCoverage || {}), monetizedClickBreakdown: breakdown }
        : stats.affiliateCoverage;
      return Response.json({ ...stats, affiliateCoverage, revenue, commercial, traffic, tracking }, {
        headers: {
          'Content-Type': 'application/json; charset=UTF-8',
          'Cache-Control': 'private, no-store'
        }
      });
    }
    if (url.pathname === '/analytics.html' && request.method === 'GET') return enhanceCommandCenter(request, env, ctx);
    return base.fetch(request, env, ctx);
  },
  async scheduled(event, env, ctx) {
    if (typeof base.scheduled === 'function') return base.scheduled(event, env, ctx);
  }
};