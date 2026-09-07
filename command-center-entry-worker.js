import base from './distribution-impact-worker.js';

const SESSION_COOKIE = 'toolscout_cc';
const SESSION_TTL_SECONDS = 900;
const OWNER_EMAIL = 'pcaiano@gmail.com';

function commandCenterPage(url) {
  return url.pathname === '/analytics' || url.pathname === '/analytics/';
}

function distributionImpactSection() {
  return `<section class="section" id="distributionImpactSection"><div class="sectionHead"><h2>Distribution Engine impact</h2><span>Attributed likely-human · 30 days</span></div><div class="grid4" id="distributionImpactMetrics"><div class="card"><small>Status</small><b>Idle</b><span>Refresh to measure attributed impact</span></div></div><div class="grid2" style="margin-top:14px"><div class="panel"><div class="sectionHead"><h2>Attribution quality</h2><span>First-touch</span></div><div id="distributionImpactQuality" class="note">Refresh to load.</div></div><div class="panel"><div class="sectionHead"><h2>Top distribution surfaces</h2><span>Human sessions</span></div><div id="distributionImpactSurfaces" class="note">Refresh to load.</div></div></div></section>`;
}

function distributionImpactScript() {
  return `<script>
(function(){
 const baseRender=window.render;
 function money(value,currency){if(value===null||value===undefined)return 'Unknown';try{return new Intl.NumberFormat(undefined,{style:'currency',currency:currency||'EUR',maximumFractionDigits:2}).format(Number(value||0))}catch{return String(value)}}
 function renderDistributionImpact(d){
   const x=d&&d.distributionImpact||{};
   const metrics=document.getElementById('distributionImpactMetrics'),quality=document.getElementById('distributionImpactQuality'),surfaces=document.getElementById('distributionImpactSurfaces');
   if(!metrics||!quality||!surfaces)return;
   if(x.status!=='observed'){
     metrics.innerHTML=card('Status','Unavailable',x.reason||'Distribution attribution could not be calculated');
     quality.innerHTML='<div class="note">No distribution impact is inferred when attribution is unavailable.</div>';surfaces.innerHTML='';return;
   }
   metrics.innerHTML=card('Human sessions',n(x.humanSessions),pct(x.humanTrafficShare)+' of likely-human traffic')+card('Human outbound',n(x.outboundClicks),pct(x.sessionToOutboundCtr)+' session → outbound')+card('Monetized outbound',n(x.monetizedOutbound),pct(x.monetizationCoverage)+' of attributed outbound')+card('Confirmed revenue',money(x.confirmedRevenue,x.currency),x.confirmedRevenue==null?'No attributable single-currency vendor evidence yet':n(x.activeSurfaces)+' surfaces produced human traffic');
   quality.innerHTML=row('Window',n(x.windowDays)+' days','Rolling attribution window')+row('Active surfaces',n(x.activeSurfaces),'Known surfaces with attributed human sessions')+row('Traffic share',pct(x.humanTrafficShare),'Share of all likely-human sessions')+row('Method','First-touch','UTM/source marker or matching known referrer')+'<div class="meta" style="margin-top:10px">'+esc(x.attribution||'')+'</div>';
   const items=Array.isArray(x.topSurfaces)?x.topSurfaces:[];
   surfaces.innerHTML=items.length?items.map(s=>row(s.surface_name||s.surface_slug,n(s.human_sessions),n(s.outbound_clicks)+' outbound · '+n(s.monetized_outbound)+' monetized')).join(''):'<div class="note">No likely-human sessions have yet been attributed to a distribution surface in this window.</div>';
 }
 if(typeof baseRender==='function')window.render=function(d){baseRender(d);renderDistributionImpact(d)};
})();
</script>`;
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

async function serveProtectedPage(request, env, ctx) {
  if (!(await accessAuthenticated(request, ctx))) {
    return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=UTF-8', 'Cache-Control': 'no-store' } });
  }
  if (!env.ADMIN_TOKEN) {
    return new Response('Command Center unavailable', { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  const assetUrl = new URL('/analytics.html', request.url);
  const asset = await env.ASSETS.fetch(new Request(assetUrl.toString(), request));
  if (!asset.ok) return asset;
  let html=await asset.text();
  const revenueAnchor='<section class="section"><div class="sectionHead"><h2>Revenue & coverage</h2>';
  if(!html.includes('distributionImpactSection'))html=html.replace(revenueAnchor,distributionImpactSection()+revenueAnchor);
  if(!html.includes('renderDistributionImpact'))html=html.replace('</body>',distributionImpactScript()+'</body>');
  const headers = new Headers(asset.headers);
  const value = await sessionValue(env.ADMIN_TOKEN, sessionBucket());
  headers.append('Set-Cookie', `${SESSION_COOKIE}=${value}; Max-Age=${SESSION_TTL_SECONDS}; Path=/analytics; HttpOnly; Secure; SameSite=Strict`);
  headers.set('Content-Type', 'text/html; charset=UTF-8');
  headers.set('Cache-Control', 'private, no-store');
  headers.delete('Content-Length');
  return new Response(html, { status: asset.status, headers });
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
  const response = await base.fetch(internalRequest, env, ctx);
  const responseHeaders = new Headers(response.headers);
  responseHeaders.set('Cache-Control', 'private, no-store');
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
