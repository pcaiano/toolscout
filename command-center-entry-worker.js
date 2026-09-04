import base from './affiliate-workflow-worker.js';

function isCommandCenterPath(url) {
  return url.pathname === '/analytics' || url.pathname === '/analytics/';
}

function normalizeCommandCenterRequest(request) {
  if (request.method !== 'GET') return request;
  const url = new URL(request.url);
  if (isCommandCenterPath(url) && url.searchParams.get('stats') === '1') {
    url.pathname = '/api/stats';
    url.search = '';
    return new Request(url.toString(), request);
  }
  if (url.pathname === '/analytics/api/stats') {
    url.pathname = '/api/stats';
    return new Request(url.toString(), request);
  }
  return request;
}

async function serveCommandCenter(request, env) {
  const assetUrl = new URL('/analytics.html', request.url);
  const asset = await env.ASSETS.fetch(new Request(assetUrl.toString(), request));
  if (!asset.ok) return asset;
  let html = await asset.text();
  html = html.replace("const API='/analytics/api/stats';", "const API='/analytics?stats=1';");
  const headers = new Headers(asset.headers);
  headers.set('Content-Type', 'text/html; charset=UTF-8');
  headers.set('Cache-Control', 'private, no-store');
  return new Response(html, { status: asset.status, headers });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'GET' && isCommandCenterPath(url) && url.searchParams.get('stats') !== '1') {
      return serveCommandCenter(request, env);
    }
    return base.fetch(normalizeCommandCenterRequest(request), env, ctx);
  },
  async scheduled(event, env, ctx) {
    if (typeof base.scheduled === 'function') return base.scheduled(event, env, ctx);
  }
};
