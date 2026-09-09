import base from './affiliate-workflow-worker.js';

const SESSION_COOKIE = 'toolscout_cc';
const SESSION_TTL_SECONDS = 900;
const OWNER_EMAIL = 'pcaiano@gmail.com';

function commandCenterPage(url) {
  return url.pathname === '/analytics' || url.pathname === '/analytics/';
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
  const headers = new Headers(asset.headers);
  const value = await sessionValue(env.ADMIN_TOKEN, sessionBucket());
  headers.append('Set-Cookie', `${SESSION_COOKIE}=${value}; Max-Age=${SESSION_TTL_SECONDS}; Path=/analytics; HttpOnly; Secure; SameSite=Strict`);
  headers.set('Content-Type', 'text/html; charset=UTF-8');
  headers.set('Cache-Control', 'private, no-store');
  return new Response(asset.body, { status: asset.status, headers });
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
  const response = await base.fetch(internalRequest, env, ctx);
  const responseHeaders = new Headers(response.headers);
  responseHeaders.set('Cache-Control', 'private, no-store');

  if (response.ok && (response.headers.get('Content-Type') || '').includes('application/json')) {
    try {
      const stats = applyStableMonthlyProjection(await response.json());
      responseHeaders.set('Content-Type', 'application/json; charset=UTF-8');
      responseHeaders.delete('Content-Length');
      return Response.json(stats, { status: response.status, headers: responseHeaders });
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
