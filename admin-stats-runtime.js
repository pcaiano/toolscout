import legacyStatsBase from './authority-acquisition-worker.js';
import {reconcileOperationalTruth} from './operational-truth-reconciliation-runtime.js';
import {isAccessAuthenticated} from './dynamic-worker.js';

// ToolScout 2.0 owns /api/stats at the router boundary while preserving the
// mature protected stats composition behind a read-only compatibility facade.
// This is intentionally explicit so the legacy enrichers can be extracted
// incrementally without changing auth, payload shape or business truth.
export async function handleAdminStatsRoute(request,env,ctx){
  const url=new URL(request.url);
  if(request.method!=='GET'||url.pathname!=='/api/stats')return null;

  const publicHost=url.hostname==='trytoolscout.org';
  const token=String(request.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');
  const authorized=publicHost
    ?await isAccessAuthenticated(request,ctx)
    :Boolean(env.ADMIN_TOKEN&&token===env.ADMIN_TOKEN);
  if(!authorized){
    const headers=new Headers({
      'Content-Type':'application/json; charset=UTF-8',
      'Cache-Control':'private, no-store',
      'X-ToolScout-Read-Mode':'read-only',
      'X-ToolScout-Route-Contract':'v2',
      'X-ToolScout-Compatibility-Composition':'legacy-stats-v1'
    });
    return Response.json({error:'unauthorized'},{status:401,headers});
  }

  let response=await legacyStatsBase.fetch(request,env,ctx);
  response=await reconcileOperationalTruth(response,env);
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
