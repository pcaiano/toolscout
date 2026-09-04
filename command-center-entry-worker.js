import base from './affiliate-workflow-worker.js';

const SESSION_COOKIE = 'toolscout_cc';
const SESSION_TTL_SECONDS = 900;

function commandCenterPage(url) {
  return url.pathname === '/analytics' || url.pathname === '/analytics/';
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
  const url = new URL(request.url);
  url.pathname = '/analytics.html';
  const authenticated = await base.fetch(new Request(url.toString(), request), env, ctx);
  if (!authenticated.ok || !env.ADMIN_TOKEN) return authenticated;
  const headers = new Headers(authenticated.headers);
  const value = await sessionValue(env.ADMIN_TOKEN, sessionBucket());
  headers.append('Set-Cookie', `${SESSION_COOKIE}=${value}; Max-Age=${SESSION_TTL_SECONDS}; Path=/analytics; HttpOnly; Secure; SameSite=Strict`);
  headers.set('Cache-Control', 'private, no-store');
  return new Response(authenticated.body, { status: authenticated.status, headers });
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
