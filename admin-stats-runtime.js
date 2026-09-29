import legacy from './operational-truth-reconciliation-worker.js';

// ToolScout 2.0 owns /api/stats at the router boundary while preserving the
// mature protected stats composition behind a read-only compatibility facade.
// This is intentionally explicit so the legacy enrichers can be extracted
// incrementally without changing auth, payload shape or business truth.
export async function handleAdminStatsRoute(request,env,ctx){
  const url=new URL(request.url);
  if(request.method!=='GET'||url.pathname!=='/api/stats')return null;

  const response=await legacy.fetch(request,env,ctx);
  const headers=new Headers(response.headers);
  headers.set('X-ToolScout-Read-Mode','read-only');
  headers.set('X-ToolScout-Route-Contract','v2');
  headers.set('X-ToolScout-Compatibility-Composition','legacy-stats-v1');
  headers.delete('Content-Length');
  return new Response(response.body,{
    status:response.status,
    statusText:response.statusText,
    headers
  });
}
