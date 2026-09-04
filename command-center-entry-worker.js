import base from './affiliate-workflow-worker.js';

function normalizeCommandCenterRequest(request) {
  if (request.method !== 'GET') return request;
  const url = new URL(request.url);
  if (url.pathname === '/analytics' || url.pathname === '/analytics/') {
    if (url.searchParams.get('stats') === '1') {
      url.pathname = '/api/stats';
      url.search = '';
      return new Request(url.toString(), request);
    }
    url.pathname = '/analytics.html';
    return new Request(url.toString(), request);
  }
  if (url.pathname === '/analytics/api/stats') {
    url.pathname = '/api/stats';
    return new Request(url.toString(), request);
  }
  return request;
}

export default {
  async fetch(request, env, ctx) {
    return base.fetch(normalizeCommandCenterRequest(request), env, ctx);
  },
  async scheduled(event, env, ctx) {
    if (typeof base.scheduled === 'function') return base.scheduled(event, env, ctx);
  }
};
