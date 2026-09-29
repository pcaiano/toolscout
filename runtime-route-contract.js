// ToolScout 2.0 explicit route ownership contract.
// The contract is descriptive first and becomes executable route-by-route.
// Legacy fallback remains available until each route group has parity coverage.

export const EARLY_DISPATCH_OWNERS=Object.freeze(['distribution_priority','distribution_orchestrator','seo_runtime','authority_acquisition','mission_integrity','growth_runtime_closed_loop','authority_health','public_editorial_site','command_center_direct','agent_protocol_core','machine_discovery_catalog','analytics_chairman','analytics_stats','analytics_human_actions']);

export const ROUTE_GROUPS=Object.freeze([
  {id:'compute',owner:'compute_router',plane:'executor',methods:['GET','POST'],prefixes:['/api/compute/','/api/contact-supply/','/api/auth-plane/']},
  {id:'runtime',owner:'compute_router',plane:'control',methods:['GET','POST'],prefixes:['/api/runtime/']},
  {id:'distribution_priority',owner:'distribution_priority',plane:'growth_planner',methods:['GET','POST'],exact:['/api/distribution/operating-decisions','/api/distribution/operating-decisions/rebalance']},
  {id:'distribution_control',owner:'distribution_orchestrator',plane:'growth_planner',methods:['GET','POST'],prefixes:['/api/distribution/orchestrate','/api/distribution/economic-learning','/api/distribution/editorial-queue','/api/distribution/priorities/']},
  {id:'growth_control',owner:'distribution_orchestrator',plane:'growth_planner',methods:['GET','POST'],prefixes:['/api/growth/']},
  {id:'authority_vetted_health',owner:'authority_acquisition',plane:'executor',methods:['GET'],exact:['/api/distribution/authority/vetted-health']},
  {id:'authority_vetted_run',owner:'authority_acquisition',plane:'executor',methods:['POST'],exact:['/api/distribution/authority/vetted-run']},
  {id:'authority_closed_loop_health',owner:'authority_health',plane:'signals',methods:['GET'],exact:['/api/distribution/authority/closed-loop-health']},
  {id:'authority_closed_loop_action',owner:'growth_runtime_closed_loop',plane:'executor',methods:['POST'],exact:['/api/distribution/authority/close-loop']},
  {id:'seo_runtime',owner:'seo_runtime',plane:'signals',methods:['GET','POST'],prefixes:['/api/seo/']},
  {id:'engine_evidence',owner:'mission_integrity',plane:'signals',methods:['POST'],exact:['/api/engine-evidence']},
  {id:'command_center_page',owner:'command_center_direct',plane:'signals',methods:['GET'],exact:['/analytics','/analytics/','/analytics.html','/analytics-v2','/analytics-v2/','/analytics-v2.html','/command-center','/command-center/']},
  {id:'command_center_truth',owner:'command_center_direct',plane:'signals',methods:['GET'],exact:['/api/command-center-business-truth','/api/command-center-simplified-health']},
  {id:'analytics_chairman_queue',owner:'analytics_chairman',plane:'signals',methods:['GET'],exact:['/analytics/api/chairman-queue']},
  {id:'analytics_stats',owner:'analytics_stats',plane:'signals',methods:['GET'],exact:['/analytics/api/stats']},
  {id:'analytics_human_actions',owner:'analytics_human_actions',plane:'signals',methods:['GET'],exact:['/analytics/api/human-actions']},
  {id:'analytics_control',owner:'command_center',plane:'signals',methods:['GET','POST'],prefixes:['/analytics','/api/stats','/api/traffic-integrity-health','/api/command-center-']},
  {id:'public_editorial_news',owner:'public_editorial_site',plane:'public_site',methods:['GET'],prefixes:['/news/']},
  {id:'public_editorial_trends',owner:'public_editorial_site',plane:'public_site',methods:['GET'],exact:['/software-trends-index','/software-trends-index/','/software-trends-index.html','/software-trends-index.json']},
  {id:'public_tools',owner:'public_site',plane:'public_site',methods:['GET'],prefixes:['/tools','/guides','/compare','/best-','/blog/','/categories','/crm-tools','/seo-tools']},
  {id:'affiliate_redirect',owner:'public_site',plane:'public_site',methods:['GET'],prefixes:['/go/']},
  {id:'agent_recommendation_protocol',owner:'agent_protocol_core',plane:'public_site',methods:['GET','POST','OPTIONS'],exact:['/mcp','/mcp/','/a2a','/a2a/','/.well-known/agent-card.json']},
  {id:'agent_discovery_catalog',owner:'machine_discovery_catalog',plane:'public_site',methods:['GET','HEAD'],exact:['/.well-known/toolscout-distribution.json','/.well-known/api-catalog']}
]);

function normalizedPath(value){
  try{return new URL(String(value),'https://trytoolscout.org').pathname||'/';}
  catch{return String(value||'/').split('?')[0]||'/';}
}

export function routeOwner(input,{method='GET'}={}){
  const pathname=normalizedPath(input),verb=String(method||'GET').toUpperCase();
  for(const group of ROUTE_GROUPS){
    if(group.methods&&!group.methods.includes(verb))continue;
    if(group.exact?.includes(pathname))return{...group,pathname,method:verb};
    if(group.prefixes?.some(prefix=>pathname===prefix||pathname.startsWith(prefix)))return{...group,pathname,method:verb};
  }
  return{id:'legacy_fallback',owner:'legacy_chain',plane:'legacy',pathname,method:verb};
}

export function routeContract(){
  return{
    version:2,
    architecture:'toolscout-2.0',
    groups:ROUTE_GROUPS,
    earlyDispatchOwners:EARLY_DISPATCH_OWNERS,
    fallback:'legacy_chain',
    invariant:'one_declared_owner_per_route_group'
  };
}
