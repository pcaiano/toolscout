  {id:'visitor_integrity_health',owner:'visitor_integrity',plane:'signals',methods:['GET'],exact:['/api/visitor-session-identity-health']},
// ToolScout 2.0 explicit route ownership contract.
// The contract is descriptive first and becomes executable route-by-route.
// Legacy fallback remains available until each route group has parity coverage.

export const EARLY_DISPATCH_OWNERS=Object.freeze(['distribution_priority','distribution_orchestrator','seo_runtime','authority_acquisition','mission_integrity','growth_runtime_closed_loop','authority_health','public_editorial_site','command_center_direct','command_center_resilient_health','command_center_schema_control','traffic_integrity_health','admin_stats','agent_protocol_core','machine_discovery_catalog','analytics_chairman','analytics_stats','analytics_human_actions','analytics_human_actions_mutation','public_decision','public_navigation','affiliate_redirect','analytics_owner_exclusion','analytics_attribution_24h','d1_read_budget','google_analytics_callback','gsc_trend_surface','public_canonical_surface','visitor_integrity']);

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
  {id:'command_center_resilient_health',owner:'command_center_resilient_health',plane:'signals',methods:['GET'],exact:['/api/command-center-resilient-health']},
  {id:'traffic_integrity_health',owner:'traffic_integrity_health',plane:'signals',methods:['GET'],exact:['/api/traffic-integrity-health']},
  {id:'admin_stats',owner:'admin_stats',plane:'signals',methods:['GET'],exact:['/api/stats']},
  {id:'analytics_chairman_queue',owner:'analytics_chairman',plane:'signals',methods:['GET'],exact:['/analytics/api/chairman-queue']},
  {id:'analytics_stats',owner:'analytics_stats',plane:'signals',methods:['GET'],exact:['/analytics/api/stats']},
  {id:'analytics_owner_exclusion',owner:'analytics_owner_exclusion',plane:'signals',methods:['GET'],exact:['/analytics/api/google/external-24h']},
  {id:'analytics_attribution_24h',owner:'analytics_attribution_24h',plane:'signals',methods:['GET'],exact:['/analytics/api/google/acquisition-24h']},
  {id:'d1_read_budget_get',owner:'d1_read_budget',plane:'signals',methods:['GET'],exact:['/analytics/api/ga4-health','/analytics/api/google/connect','/analytics/api/google/acquisition','/analytics/api/commerce','/api/autonomous-growth-health','/api/distribution/discovery-health']},
  {id:'d1_read_budget_post',owner:'d1_read_budget',plane:'executor',methods:['POST'],exact:['/analytics/api/google/disconnect']},
  {id:'google_analytics_callback',owner:'google_analytics_callback',plane:'signals',methods:['GET'],exact:['/api/google-analytics/callback']},
  {id:'gsc_trend_surface',owner:'gsc_trend_surface',plane:'signals',methods:['GET'],exact:['/api/gsc-trend.svg','/api/gsc-trend.css','/api/health']},
  {id:'analytics_human_actions',owner:'analytics_human_actions',plane:'signals',methods:['GET'],exact:['/analytics/api/human-actions']},
  {id:'analytics_human_action_mutations',owner:'analytics_human_actions_mutation',plane:'executor',methods:['POST'],exact:['/analytics/api/human-actions/credential','/analytics/api/human-actions/gate','/analytics/api/human-actions/editorial']},
  {id:'command_center_schema_reconcile',owner:'command_center_schema_control',plane:'control',methods:['POST'],exact:['/api/command-center-business-truth/reconcile-affiliate-schema']},
  {id:'public_editorial_news',owner:'public_editorial_site',plane:'public_site',methods:['GET'],prefixes:['/news/']},
  {id:'public_editorial_trends',owner:'public_editorial_site',plane:'public_site',methods:['GET'],exact:['/software-trends-index','/software-trends-index/','/software-trends-index.html','/software-trends-index.json']},
  {id:'public_decision_pages',owner:'public_decision',plane:'public_site',methods:['GET'],matcher:'public_decision_page'},
  {id:'public_navigation_hubs',owner:'public_navigation',plane:'public_site',methods:['GET'],exact:['/tools','/tools/','/tools.html','/guides','/guides/','/guides.html','/compare','/compare/','/compare.html','/categories','/categories/','/categories.html','/crm-tools','/crm-tools/','/crm-tools.html','/seo-tools','/seo-tools/','/seo-tools.html','/blog/']},
  {id:'public_canonical_assets',owner:'public_canonical_surface',plane:'public_site',methods:['GET'],exact:['/sitemap.xml','/data/tools.json']},
  {id:'public_legacy_html_redirect',owner:'public_canonical_surface',plane:'public_site',methods:['GET','HEAD'],matcher:'legacy_html_redirect'},
  {id:'affiliate_redirect',owner:'affiliate_redirect',plane:'public_site',methods:['GET'],prefixes:['/go/']},
  {id:'agent_recommendation_protocol',owner:'agent_protocol_core',plane:'public_site',methods:['GET','POST','OPTIONS'],exact:['/mcp','/mcp/','/a2a','/a2a/','/.well-known/agent-card.json']},
  {id:'agent_discovery_catalog',owner:'machine_discovery_catalog',plane:'public_site',methods:['GET','HEAD'],exact:['/.well-known/toolscout-distribution.json','/.well-known/api-catalog']}
]);

function namedMatcher(name,pathname){
  if(name==='public_decision_page'){
    return /^\/tools\/[a-z0-9][a-z0-9-]*(?:\.html)?\/?$/i.test(pathname)
      || /^\/best-[a-z0-9-]+(?:\.html)?\/?$/i.test(pathname);
  }
  if(name==='legacy_html_redirect')return /\.html$/i.test(pathname);
  return false;
}

function normalizedPath(value){
  try{return new URL(String(value),'https://trytoolscout.org').pathname||'/';}
  catch{return String(value||'/').split('?')[0]||'/';}
}

export function routeOwner(input,{method='GET'}={}){
  const pathname=normalizedPath(input),verb=String(method||'GET').toUpperCase();
  for(const group of ROUTE_GROUPS){
    if(group.methods&&!group.methods.includes(verb))continue;
    if(group.exact?.includes(pathname))return{...group,pathname,method:verb};
    if(group.matcher&&namedMatcher(group.matcher,pathname))return{...group,pathname,method:verb};
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
