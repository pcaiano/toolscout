import {ROUTE_GROUPS,EARLY_DISPATCH_OWNERS} from './runtime-route-contract.js';

export const TOOLSCOUT_V2_PHASE=107;
export const TOOLSCOUT_V2_RELEASE_PHASE=260;
export const TOOLSCOUT_V2_RELEASE='toolscout-2.0-final';
export const TOOLSCOUT_V2_LEGACY_EDGES=0;
export const TOOLSCOUT_V2_DEPLOYMENT_FINGERPRINT='toolscout-2.0-final-phase-260';

function ownershipSnapshot(){
  const directGroups=ROUTE_GROUPS.filter(group=>group.owner==='compute_router'||EARLY_DISPATCH_OWNERS.includes(group.owner));
  const legacyGroups=ROUTE_GROUPS.filter(group=>!directGroups.includes(group));
  return {
    declaredGroups:ROUTE_GROUPS.length,
    directGroups:directGroups.length,
    legacyDeclaredGroups:legacyGroups.length,
    directCoveragePct:ROUTE_GROUPS.length?Number((directGroups.length/ROUTE_GROUPS.length*100).toFixed(1)):100,
    legacyGroupIds:legacyGroups.map(group=>group.id)
  };
}

export async function handleToolScoutV2ClosureRoute(request){
  const url=new URL(request.url);
  if(request.method!=='GET'||url.pathname!=='/api/runtime/closure-health')return null;
  const routeOwnership=ownershipSnapshot();
  const closed=TOOLSCOUT_V2_LEGACY_EDGES===0&&routeOwnership.legacyDeclaredGroups===0&&routeOwnership.directCoveragePct===100;
  return Response.json({
    ok:closed,
    architecture:'toolscout-2.0',
    phase:TOOLSCOUT_V2_PHASE,
    release:TOOLSCOUT_V2_RELEASE,
    releasePhase:TOOLSCOUT_V2_RELEASE_PHASE,
    deploymentFingerprint:TOOLSCOUT_V2_DEPLOYMENT_FINGERPRINT,
    legacyEdges:TOOLSCOUT_V2_LEGACY_EDGES,
    routeOwnership,
    productionClosure:{status:closed?'architecture_closed':'incomplete',releaseStatus:closed?'production_accepted':'incomplete',definition:'Zero generic legacy traversal plus complete declared route ownership.'}
  },{headers:{
    'Content-Type':'application/json; charset=UTF-8',
    'Cache-Control':'no-store',
    'X-ToolScout-Route-Owner':'toolscout_v2_closure',
    'X-ToolScout-Runtime':TOOLSCOUT_V2_DEPLOYMENT_FINGERPRINT
  }});
}

export default {fetch:handleToolScoutV2ClosureRoute};
