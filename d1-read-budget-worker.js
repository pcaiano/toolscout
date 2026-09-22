import base from './command-center-health-language-worker.js';

const READ_TTLS = new Map([
  ['/analytics/api/stats', 300],
  ['/api/stats', 300],
  ['/api/autonomous-growth-health', 300],
  ['/api/distribution/discovery-health', 600],
  ['/api/distribution/authority/closed-loop-health', 300]
]);
const CIRCUIT_TTL_SECONDS = 300;
const inFlight = new Map();

function cacheKey(request, suffix = '') {
  const u = new URL(request.url);
  u.hostname = 'd1-budget-cache.trytoolscout.org';
  u.protocol = 'https:';
  if (suffix) u.pathname = `/__d1_budget__/${suffix}`;
  return new Request(u.toString(), { method: 'GET' });
}

function withHeader(response, name, value) {
  const headers = new Headers(response.headers);
  headers.set(name, value);
  headers.delete('Content-Length');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

async function circuitIsOpen(cache, request) {
  return Boolean(await cache.match(cacheKey(request, 'circuit')));
}

async function openCircuit(cache, request, detail = 'D1 read quota unavailable') {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=UTF-8',
    'Cache-Control': `public, max-age=${CIRCUIT_TTL_SECONDS}`
  });
  const marker = new Response(JSON.stringify({ openedAt: new Date().toISOString(), detail }), { headers });
  await cache.put(cacheKey(request, 'circuit'), marker);
}

function d1ReadFailure(status, text) {
  if (status < 500 && status !== 429) return false;
  const s = String(text || '').toLowerCase();
  return s.includes('d1') || s.includes('rows read') || s.includes('row read') || s.includes('quota') || s.includes('too many requests');
}

function circuitResponse() {
  return new Response(JSON.stringify({
    ok: false,
    stale: true,
    error: 'd1_read_budget_circuit_open',
    detail: 'ToolScout has temporarily paused expensive D1 reads to protect the daily read budget. No business metric is being inferred while the circuit is open.'
  }), {
    status: 503,
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      'Cache-Control': 'private, no-store, max-age=0',
      'Retry-After': String(CIRCUIT_TTL_SECONDS),
      'X-ToolScout-D1-Cache': 'CIRCUIT'
    }
  });
}

async function cachedRead(request, env, ctx, ttl) {
  const cache = caches.default;
  const key = cacheKey(request);
  const hit = await cache.match(key);
  if (hit) return withHeader(hit, 'X-ToolScout-D1-Cache', 'HIT');

  if (await circuitIsOpen(cache, request)) return circuitResponse();

  const id = key.url;
  if (inFlight.has(id)) {
    const response = await inFlight.get(id);
    return withHeader(response.clone(), 'X-ToolScout-D1-Cache', 'COALESCED');
  }

  const task = (async () => {
    let response;
    try {
      response = await base.fetch(request, env, ctx);
    } catch (error) {
      const detail = String(error?.message || error || 'D1 read failed');
      if (detail.toLowerCase().includes('d1') || detail.toLowerCase().includes('quota')) {
        await openCircuit(cache, request, detail);
      }
      throw error;
    }

    const text = await response.text();
    if (d1ReadFailure(response.status, text)) {
      await openCircuit(cache, request, text.slice(0, 240));
      return new Response(text, { status: response.status, statusText: response.statusText, headers: response.headers });
    }

    const clientHeaders = new Headers(response.headers);
    clientHeaders.set('Cache-Control', 'private, no-store, max-age=0');
    clientHeaders.set('X-ToolScout-D1-Cache', 'MISS');
    clientHeaders.delete('Content-Length');
    clientHeaders.delete('Content-Encoding');
    const client = new Response(text, { status: response.status, statusText: response.statusText, headers: clientHeaders });

    if (response.ok) {
      const cacheHeaders = new Headers(response.headers);
      cacheHeaders.set('Cache-Control', `public, max-age=${ttl}`);
      cacheHeaders.set('X-ToolScout-D1-Cache', 'HIT');
      cacheHeaders.delete('Content-Length');
      cacheHeaders.delete('Content-Encoding');
      const stored = new Response(text, { status: response.status, statusText: response.statusText, headers: cacheHeaders });
      ctx.waitUntil(cache.put(key, stored));
    }
    return client;
  })();

  inFlight.set(id, task);
  try {
    return await task;
  } finally {
    inFlight.delete(id);
  }
}

async function reduceDashboardPolling(request, env, ctx) {
  const response = await base.fetch(request, env, ctx);
  const type = String(response.headers.get('content-type') || '').toLowerCase();
  if (!response.ok || !type.includes('text/html')) return response;
  let html = await response.text();
  html = html.replaceAll('setInterval(load,30000)', 'setInterval(load,300000)');
  const headers = new Headers(response.headers);
  headers.delete('Content-Length');
  headers.delete('Content-Encoding');
  headers.set('X-ToolScout-D1-Poll-Budget', '300s');
  return new Response(html, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'GET' && READ_TTLS.has(url.pathname) && !request.headers.get('Authorization')) {
      return cachedRead(request, env, ctx, READ_TTLS.get(url.pathname));
    }
    if (request.method === 'GET' && (url.pathname === '/analytics' || url.pathname === '/analytics/' || url.pathname === '/command-center' || url.pathname === '/command-center/')) {
      return reduceDashboardPolling(request, env, ctx);
    }
    return base.fetch(request, env, ctx);
  },
  async scheduled(event, env, ctx) {
    return typeof base.scheduled === 'function' ? base.scheduled(event, env, ctx) : undefined;
  }
};
