// Internal ASSETS reads remain available to the Worker; these URLs are not public.
export const privateAssetPaths = new Set([
  '/data/affiliate-pipeline.json',
  '/data/affiliate-queue.json',
  '/data/business-intelligence.json',
  '/data/business-intelligence-history.json',
]);
export function withPrivateAssets(base) {
  return {
    ...base,
    async fetch(request, env, ctx) {
      let path;
      try { path = decodeURIComponent(new URL(request.url).pathname).replace(/\/+$/, ''); }
      catch { return new Response('Bad request', {status: 400}); }
      if (privateAssetPaths.has(path)) {
        return new Response('Not found', {status: 404, headers: {'Cache-Control': 'no-store'}});
      }
      if (['/data/tools.json', '/data/pending-affiliate-tools.json'].includes(path)) {
        const asset = await env.ASSETS.fetch(request);
        if (!asset.ok) return asset;
        const tools = await asset.json();
        const publicTools = tools.map(({commission, affiliateProgram, affiliateUrl, ...tool}) => tool);
        return Response.json(publicTools, {headers: {'Cache-Control': 'no-store'}});
      }
      return base.fetch(request, env, ctx);
    },
  };
}
