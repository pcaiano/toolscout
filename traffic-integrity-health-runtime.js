import {trafficHealth} from './traffic-integrity-worker.js';
import {augmentTrafficGuardHealth} from './traffic-integrity-guard-worker.js';
import {augmentOutboundIntegrityHealth} from './outbound-integrity-worker.js';
import {augmentVisitorIntegrityHealth} from './visitor-integrity-worker.js';
import {augmentCommandCenterIntegrityHealth} from './command-center-integrity-worker.js';
import {augmentMissionIntegrityHealth} from './mission-integrity-worker.js';
import {reconcileOperationalTruth} from './operational-truth-reconciliation-runtime.js';

export async function handleTrafficIntegrityHealthRoute(request,env){
  const url=new URL(request.url);
  if(request.method!=='GET'||url.pathname!=='/api/traffic-integrity-health')return null;

  let response=Response.json(await trafficHealth(env),{
    headers:{
      'Content-Type':'application/json; charset=UTF-8',
      'Cache-Control':'no-store'
    }
  });
  response=await augmentTrafficGuardHealth(response,env);
  response=await augmentOutboundIntegrityHealth(response,env);
  response=await augmentVisitorIntegrityHealth(response,env);
  response=await augmentCommandCenterIntegrityHealth(response,env);
  response=await augmentMissionIntegrityHealth(response,env);
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
