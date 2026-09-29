import {handleAdminStatsBaseRoute} from './worker.js';
import {augmentCommandCenterStats} from './command-center-integrity-worker.js';
import {augmentMissionIntegrityHealth} from './mission-integrity-worker.js';
import {normalizeAdminStatsResponse} from './command-center-final-integrity-worker.js';
import {reconcileOperationalTruth} from './operational-truth-reconciliation-worker.js';

export async function handleAdminStatsRoute(request,env){
  const url=new URL(request.url);
  if(request.method!=='GET'||url.pathname!=='/api/stats')return null;

  let response=await handleAdminStatsBaseRoute(request,env);
  if(!response)return null;
  if(response.ok){
    response=await augmentCommandCenterStats(response,env);
    response=await augmentMissionIntegrityHealth(response,env);
    response=await normalizeAdminStatsResponse(response);
    response=await reconcileOperationalTruth(response,env);

    const headers=new Headers(response.headers);
    headers.set('X-ToolScout-Read-Mode','read-only');
    headers.set('X-ToolScout-Route-Contract','v2');
    headers.delete('Content-Length');
    return new Response(response.body,{
      status:response.status,
      statusText:response.statusText,
      headers
    });
  }
  return response;
}
