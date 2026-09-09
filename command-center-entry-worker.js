import base from './affiliate-workflow-worker.js';
import { normalizeAffiliateState } from './affiliate-operations.js';

const SESSION_COOKIE = 'toolscout_cc';
const SESSION_TTL_SECONDS = 900;
const OWNER_EMAIL = 'pcaiano@gmail.com';
const ACTIVE_AFFILIATE_STATES = new Set(['active', 'verified', 'earning']);
const PENDING_AFFILIATE_STATES = new Set(['submitted', 'pending_review', 'approved_needs_link', 'link_acquired', 'human_action_required']);
const REJECTED_AFFILIATE_STATES = new Set(['rejected']);

function commandCenterPage(url) {
  return ['/analytics', '/analytics/', '/analytics.html', '/analytics-v2.html'].includes(url.pathname);
}

async function accessAuthenticated(request, ctx) {
  const email = request.headers.get('Cf-Access-Authenticated-User-Email') || request.headers.get('cf-access-authenticated-user-email') || '';
  if (String(email).toLowerCase() === OWNER_EMAIL) return true;
  try {
    if (!ctx?.access) return false;
    const identity = await ctx.access.getIdentity();
    return String(identity?.email || '').toLowerCase() === OWNER_EMAIL;
  } catch {
    return false;
  }
}

async function digestHex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function sessionValue(secret, bucket) {
  return digestHex(`toolscout-command-center:${secret}:${bucket}`);
}

function sessionBucket(now = Date.now()) {
  return Math.floor(now / (SESSION_TTL_SECONDS * 1000));
}

async function validSession(request, env) {
  if (!env.ADMIN_TOKEN) return false;
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  if (!match) return false;
  const supplied = decodeURIComponent(match[1]);
  const bucket = sessionBucket();
  for (const candidate of [bucket, bucket - 1]) {
    if (supplied === await sessionValue(env.ADMIN_TOKEN, candidate)) return true;
  }
  return false;
}

async function assetJson(request, env, path, fallback) {
  try {
    const response = await env.ASSETS.fetch(new Request(new URL(path, request.url)));
    return response.ok ? await response.json() : fallback;
  } catch {
    return fallback;
  }
}

function timeValue(value) {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function effectiveAffiliateStatus({ active, pipelineRow, workflowRow }) {
  const persisted = normalizeAffiliateState(workflowRow?.status);
  if (active) return ACTIVE_AFFILIATE_STATES.has(persisted) ? persisted : 'active';
  if (!pipelineRow && !workflowRow) return 'research_required';
  const pipelineState = normalizeAffiliateState(pipelineRow?.status);
  if (!workflowRow) return pipelineState;
  if (!pipelineRow) return persisted;
  const rank = {
    research_required: 0,
    program_exists: 1,
    ready_to_apply: 2,
    human_action_required: 3,
    submitted: 4,
    pending_review: 4,
    blocked: 5,
    rejected: 5,
    paused: 5,
    no_program_found: 5,
    approved_needs_link: 6,
    link_acquired: 7,
    active: 8,
    verified: 9,
    earning: 10
  };
  const pipelineRank = rank[pipelineState] || 0;
  const persistedRank = rank[persisted] || 0;
  if (pipelineRank !== persistedRank) return pipelineRank > persistedRank ? pipelineState : persisted;
  return timeValue(pipelineRow?.last_verified) > timeValue(workflowRow?.updated_at) ? pipelineState : persisted;
}

async function affiliateCoverageStatusSnapshot(request, env) {
  try {
    const [tools, pipeline, affiliate, workflowResult, clickResult] = await Promise.all([
      assetJson(request, env, '/data/tools.json', []),
      assetJson(request, env, '/data/affiliate-pipeline.json', { verified_programs: [] }),
      assetJson(request, env, '/data/affiliate.json', {}),
      env.DB.prepare('SELECT tool_slug,status,updated_at FROM affiliate_workflow').all(),
      env.DB.prepare(`
        SELECT c.tool_slug, COUNT(*) AS clicks
        FROM click_events c
        JOIN sessions s ON s.session_id=c.session_id
        WHERE c.created_at>=datetime('now','-30 days')
          AND s.classification='likely-human'
          AND c.source!='internal-test'
        GROUP BY c.tool_slug
      `).all()
    ]);

    const pipelineMap = new Map((pipeline?.verified_programs || []).map(row => [row.slug, row]));
    const workflowMap = new Map((workflowResult?.results || []).map(row => [row.tool_slug, row]));
    const clickMap = new Map((clickResult?.results || []).map(row => [row.tool_slug, Number(row.clicks || 0)]));

    const groups = { active: [], pending: [], rejected: [] };
    for (const tool of tools || []) {
      const route = affiliate?.[tool.slug] || {};
      const active = Boolean(route.enabled && route.url);
      const status = effectiveAffiliateStatus({
        active,
        pipelineRow: pipelineMap.get(tool.slug) || null,
        workflowRow: workflowMap.get(tool.slug) || null
      });
      let group = null;
      if (ACTIVE_AFFILIATE_STATES.has(status)) group = 'active';
      else if (PENDING_AFFILIATE_STATES.has(status)) group = 'pending';
      else if (REJECTED_AFFILIATE_STATES.has(status)) group = 'rejected';
      if (!group) continue;
      groups[group].push({
        slug: tool.slug,
        name: tool.name || tool.slug,
        status,
        clicks30d: clickMap.get(tool.slug) || 0
      });
    }

    for (const items of Object.values(groups)) {
      items.sort((a, b) => b.clicks30d - a.clicks30d || a.name.localeCompare(b.name));
    }

    const summarize = items => ({
      count: items.length,
      clicks30d: items.reduce((sum, item) => sum + Number(item.clicks30d || 0), 0),
      items
    });

    return {
      status: 'observed',
      windowDays: 30,
      clickDefinition: 'Likely-human outbound clicks only; internal-test traffic excluded.',
      active: summarize(groups.active),
      pending: summarize(groups.pending),
      rejected: summarize(groups.rejected)
    };
  } catch (error) {
    return {
      status: 'unavailable',
      reason: `Affiliate coverage status unavailable: ${String(error?.message || error)}`
    };
  }
}

function affiliateCoverageV2Widget() {
  return `<section class="widget" data-widget="affiliate-status" style="--w:12;--h:6">
      <div class="widgetHead"><div><div class="widgetKicker">Affiliate · status · clicks</div><div class="widgetTitle">Affiliate Coverage Status</div></div><div class="widgetMeta">Likely-human clicks · 30d</div></div>
      <div class="widgetBody" id="affiliateCoverageStatusBody"><div class="empty">Refresh to load affiliate status.</div></div><div class="resizeHandle"></div>
    </section>`;
}

function affiliateCoverageV2Script() {
  return `<style>
.affiliateStatusTable{width:100%;border-collapse:collapse;font-size:12px}.affiliateStatusTable th,.affiliateStatusTable td{padding:9px 8px;border-top:1px solid var(--line);text-align:left}.affiliateStatusTable thead th{border-top:0;color:var(--muted);font-size:9px;text-transform:uppercase;letter-spacing:.08em}.affiliateStatusTable th:last-child,.affiliateStatusTable td:last-child{text-align:right}.affiliateStatusSummary{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}.affiliateStatusSummary .pill{font-size:10px}
</style>
<script>
(function(){
 const acEsc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
 const acN=v=>Number(v||0).toLocaleString();
 const acStatus=v=>String(v||'').replaceAll('_',' ');
 function rowsFor(group,label){
   return (Array.isArray(group?.items)?group.items:[]).map(item=>({name:item.name,status:item.status||label,clicks:item.clicks30d||0,group:label}));
 }
 function renderAffiliateCoverageStatus(d){
   const root=document.getElementById('affiliateCoverageStatusBody');if(!root)return;
   const s=d?.affiliateCoverageStatus||{};
   if(s.status!=='observed'){root.innerHTML='<div class="empty">Affiliate coverage status is temporarily unavailable.</div>';return;}
   const rows=[...rowsFor(s.active,'active'),...rowsFor(s.pending,'pending'),...rowsFor(s.rejected,'rejected')]
     .sort((a,b)=>{const order={active:0,pending:1,rejected:2};return order[a.group]-order[b.group]||b.clicks-a.clicks||a.name.localeCompare(b.name)});
   const summary='<div class="affiliateStatusSummary">'+
     '<span class="pill good">Active '+acN(s.active?.count)+' · '+acN(s.active?.clicks30d)+' clicks</span>'+ 
     '<span class="pill info">Pending '+acN(s.pending?.count)+' · '+acN(s.pending?.clicks30d)+' clicks</span>'+ 
     '<span class="pill bad">Rejected '+acN(s.rejected?.count)+' · '+acN(s.rejected?.clicks30d)+' clicks</span></div>';
   const table=rows.length?'<table class="affiliateStatusTable"><thead><tr><th>Affiliate</th><th>Status</th><th>Clicks</th></tr></thead><tbody>'+rows.map(x=>'<tr><td>'+acEsc(x.name)+'</td><td>'+acEsc(acStatus(x.status))+'</td><td>'+acN(x.clicks)+'</td></tr>').join('')+'</tbody></table>':'<div class="empty">No active, pending or rejected affiliate programmes found.</div>';
   root.innerHTML=summary+table;
 }
 const originalRender=window.render;
 if(typeof originalRender==='function')window.render=function(d){originalRender(d);renderAffiliateCoverageStatus(d)};
})();
</script>`;
}

async function serveProtectedPage(request, env, ctx) {
  if (!(await accessAuthenticated(request, ctx))) {
    return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=UTF-8', 'Cache-Control': 'no-store' } });
  }
  if (!env.ADMIN_TOKEN) {
    return new Response('Command Center unavailable', { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  const assetUrl = new URL('/analytics-v2.html', request.url);
  const asset = await env.ASSETS.fetch(new Request(assetUrl.toString(), request));
  if (!asset.ok) return asset;
  const headers = new Headers(asset.headers);
  const value = await sessionValue(env.ADMIN_TOKEN, sessionBucket());
  headers.append('Set-Cookie', `${SESSION_COOKIE}=${value}; Max-Age=${SESSION_TTL_SECONDS}; Path=/analytics; HttpOnly; Secure; SameSite=Strict`);
  headers.set('Content-Type', 'text/html; charset=UTF-8');
  headers.set('Cache-Control', 'private, no-store');

  let html = await asset.text();
  const footprintAnchor = '<section class="widget" data-widget="footprint"';
  if (!html.includes('data-widget="affiliate-status"')) html = html.replace(footprintAnchor, affiliateCoverageV2Widget() + '\n\n    ' + footprintAnchor);
  if (!html.includes('renderAffiliateCoverageStatus')) html = html.replace('</body>', affiliateCoverageV2Script() + '</body>');
  headers.delete('Content-Length');
  return new Response(html, { status: asset.status, headers });
}

function applyStableMonthlyProjection(stats) {
  if (!stats || typeof stats !== 'object' || !stats.traffic || typeof stats.traffic !== 'object') return stats;
  const tracking24h = Number(stats.tracking?.humanSessionsLast24Hours);
  const mtdAverage = Number(stats.traffic.dailyAverageMTD);
  const daysInMonth = Number(stats.traffic.daysInMonth);
  if (!Number.isFinite(daysInMonth) || daysInMonth <= 0) return stats;

  const hasRolling24h = Number.isFinite(tracking24h) && tracking24h >= 0;
  const hasMtdAverage = Number.isFinite(mtdAverage) && mtdAverage >= 0;
  const dailyRate = hasRolling24h ? tracking24h : (hasMtdAverage ? mtdAverage : null);
  if (dailyRate === null) return stats;

  stats.traffic = {
    ...stats.traffic,
    projectedMonth: Math.round(dailyRate * daysInMonth),
    projectionDailyRate: Number(dailyRate.toFixed(1)),
    projectionBasis: hasRolling24h ? 'rolling_24h' : 'mtd_daily_average'
  };
  return stats;
}

async function serveProtectedStats(request, env, ctx) {
  if (!(await validSession(request, env))) {
    return Response.json({ error: 'unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
  const internalUrl = new URL(request.url);
  internalUrl.protocol = 'https:';
  internalUrl.hostname = 'toolscout-command-center.internal';
  internalUrl.pathname = '/api/stats';
  internalUrl.search = '';
  const headers = new Headers(request.headers);
  headers.set('Authorization', `Bearer ${env.ADMIN_TOKEN}`);
  headers.delete('Cookie');
  const internalRequest = new Request(internalUrl.toString(), { method: 'GET', headers });
  const [response, affiliateCoverageStatus] = await Promise.all([
    base.fetch(internalRequest, env, ctx),
    affiliateCoverageStatusSnapshot(request, env)
  ]);
  const responseHeaders = new Headers(response.headers);
  responseHeaders.set('Cache-Control', 'private, no-store');

  if (response.ok && (response.headers.get('Content-Type') || '').includes('application/json')) {
    try {
      const stats = applyStableMonthlyProjection(await response.json());
      responseHeaders.set('Content-Type', 'application/json; charset=UTF-8');
      responseHeaders.delete('Content-Length');
      return Response.json({ ...stats, affiliateCoverageStatus }, { status: response.status, headers: responseHeaders });
    } catch {
      return new Response('Command Center stats unavailable', { status: 502, headers: { 'Content-Type': 'text/plain; charset=UTF-8', 'Cache-Control': 'no-store' } });
    }
  }

  return new Response(response.body, { status: response.status, headers: responseHeaders });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'GET' && commandCenterPage(url)) return serveProtectedPage(request, env, ctx);
    if (request.method === 'GET' && url.pathname === '/analytics/api/stats') return serveProtectedStats(request, env, ctx);
    return base.fetch(request, env, ctx);
  },
  async scheduled(event, env, ctx) {
    if (typeof base.scheduled === 'function') return base.scheduled(event, env, ctx);
  }
};