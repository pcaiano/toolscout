// ToolScout 2.0 explicit route ownership contract.
// The contract is descriptive first and becomes executable route-by-route.
// The generic public asset pipeline is zero-edge; specialized behavior is direct-owned.

export const EARLY_DISPATCH_OWNERS=Object.freeze(['distribution_priority','distribution_orchestrator','seo_runtime','authority_acquisition','mission_integrity','growth_runtime_closed_loop','authority_health','public_editorial_site','public_analytics_consent','command_center_local_login','command_center_growth_actions','affiliate_workflow_runtime','affiliate_human_actions','affiliate_coverage_runtime','content_engine_intelligence','distribution_network_runtime','distribution_public_embed','distribution_linkable_assets','distribution_throughput_runtime','distribution_autonomous_runtime','distribution_submission_runtime','distribution_discovery_runtime','distribution_learning_runtime','distribution_sender_runtime','distribution_contact_runtime','distribution_vendor_runtime','distribution_radar_runtime','distribution_engine_runtime','audience_runtime','catalog_autonomy_runtime','funnel_runtime','dynamic_runtime','core_runtime','toolscout_v2_closure','command_center_direct','command_center_resilient_health','command_center_schema_control','traffic_integrity_health','admin_stats','agent_protocol_core','machine_discovery_catalog','analytics_chairman','analytics_stats','analytics_human_actions','analytics_human_actions_mutation','public_decision','public_navigation','affiliate_redirect','analytics_owner_exclusion','analytics_attribution_24h','d1_read_budget','google_analytics_callback','gsc_trend_surface','public_canonical_surface','visitor_integrity','traffic_integrity_live','traffic_integrity_guard','owner_exclusion','traffic_integrity_core','human_truth_chart_health','human_truth_details_health','human_truth_final_health','human_truth_base_health','command_center_autoload_health','command_center_truth_health','discovery_attribution_health','rss_distribution','month_metrics_health','visitor_accuracy']);

export const ROUTE_GROUPS=Object.freeze([
  {id:'compute',owner:'compute_router',plane:'executor',methods:['GET','POST'],prefixes:['/api/compute/','/api/contact-supply/','/api/auth-plane/']},
  {id:'runtime_closure_health',owner:'toolscout_v2_closure',plane:'observability',methods:['GET'],exact:['/api/runtime/closure-health']},
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
  {id:'visitor_integrity_health',owner:'visitor_integrity',plane:'signals',methods:['GET'],exact:['/api/visitor-session-identity-health']},
  {id:'traffic_integrity_feed',owner:'traffic_integrity_live',plane:'public_site',methods:['GET'],exact:['/api/distribution/feed.json','/api/distribution/feed.xml']},
  {id:'traffic_integrity_forensics',owner:'traffic_integrity_guard',plane:'signals',methods:['GET'],exact:['/api/traffic-forensics-48h']},
  {id:'owner_exclusion_status',owner:'owner_exclusion',plane:'signals',methods:['GET'],exact:['/analytics/api/owner-exclusion']},
  {id:'owner_exclusion_audit',owner:'owner_exclusion',plane:'executor',methods:['POST'],exact:['/analytics/api/owner-retrospective-audit']},
  {id:'confirmed_visitor',owner:'traffic_integrity_core',plane:'signals',methods:['POST','OPTIONS'],exact:['/api/confirmed-visitor']},
  {id:'human_truth_chart_health',owner:'human_truth_chart_health',plane:'signals',methods:['GET'],exact:['/api/command-center-human-truth-chart-health']},
  {id:'human_truth_details_health',owner:'human_truth_details_health',plane:'signals',methods:['GET'],exact:['/api/command-center-human-truth-details-health']},
  {id:'human_truth_final_health',owner:'human_truth_final_health',plane:'signals',methods:['GET'],exact:['/api/command-center-human-truth-final-health']},
  {id:'human_truth_base_health',owner:'human_truth_base_health',plane:'signals',methods:['GET'],exact:['/api/command-center-human-truth-health']},
  {id:'command_center_autoload_health',owner:'command_center_autoload_health',plane:'signals',methods:['GET'],exact:['/api/command-center-autoload-health']},
  {id:'command_center_truth_health',owner:'command_center_truth_health',plane:'signals',methods:['GET'],exact:['/api/command-center-truth-health']},
  {id:'discovery_attribution_health',owner:'discovery_attribution_health',plane:'signals',methods:['GET'],exact:['/api/discovery-attribution-health']},
  {id:'rss_distribution_status',owner:'rss_distribution',plane:'signals',methods:['GET'],exact:['/api/distribution/rss/status']},
  {id:'rss_distribution_publish',owner:'rss_distribution',plane:'executor',methods:['POST'],exact:['/api/distribution/rss/publish']},
  {id:'month_metrics_health',owner:'month_metrics_health',plane:'signals',methods:['GET'],exact:['/api/month-metrics-health']},
  {id:'visitor_accuracy_write',owner:'visitor_accuracy',plane:'signals',methods:['OPTIONS','POST'],exact:['/api/visitor']},
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
  {id:'public_analytics_consent',owner:'public_analytics_consent',plane:'public_site',methods:['GET'],exact:['/analytics-consent']},
  {id:'command_center_local_login',owner:'command_center_local_login',plane:'control',methods:['GET'],exact:['/analytics/login','/analytics/login/']},
  {id:'command_center_growth_actions',owner:'command_center_growth_actions',plane:'executor',methods:['POST'],exact:['/analytics/api/reputation-review','/analytics/api/distribution-human-action']},
  {id:'affiliate_workflow_pages',owner:'affiliate_workflow_runtime',plane:'control',methods:['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS'],exact:['/affiliate-workflow.html','/affiliate-workflow','/affiliate-workflow/']},
  {id:'affiliate_workflow_api',owner:'affiliate_workflow_runtime',plane:'control',methods:['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS'],exact:['/affiliate-workflow/api'],prefixes:['/affiliate-workflow/api/']},
  {id:'distribution_workflow_page',owner:'affiliate_workflow_runtime',plane:'control',methods:['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS'],exact:['/distribution-workflow.html','/distribution-workflow']},
  {id:'distribution_workflow_api',owner:'affiliate_workflow_runtime',plane:'control',methods:['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS'],exact:['/distribution-workflow/api'],prefixes:['/distribution-workflow/api/']},
  {id:'audience_health',owner:'affiliate_human_actions',plane:'observability',methods:['GET'],exact:['/api/audience-health']},
  {id:'affiliate_human_action_mutations',owner:'affiliate_human_actions',plane:'executor',methods:['POST'],exact:['/analytics/api/audience-action','/api/audience-suggestion','/analytics/api/affiliate-human-action']},
  {id:'affiliate_coverage_runtime',owner:'affiliate_coverage_runtime',plane:'executor',methods:['GET','POST','PUT','PATCH','DELETE','OPTIONS'],exact:['/api/affiliate-workflow/firecrawl','/api/affiliate-replies/ingest','/api/affiliate-coverage/run']},
  {id:'content_engine_refresh',owner:'content_engine_intelligence',plane:'executor',methods:['POST'],exact:['/api/content-engine/intelligence/refresh']},
  {id:'content_engine_reads',owner:'content_engine_intelligence',plane:'signals',methods:['GET'],exact:['/api/content-engine/brief','/api/content-engine/intelligence/metrics']},
  {id:'distribution_network_refresh',owner:'distribution_network_runtime',plane:'executor',methods:['POST'],exact:['/api/distribution/network/refresh']},
  {id:'distribution_network_metrics',owner:'distribution_network_runtime',plane:'signals',methods:['GET'],exact:['/api/distribution/network/metrics']},
  {id:'distribution_public_embed',owner:'distribution_public_embed',plane:'public_site',methods:['GET'],exact:['/distribution/publisher-kit','/api/recommend','/embed/toolscout.js','/embed/badge.svg','/distribution/feed.xml']},
  {id:'distribution_linkable_assets',owner:'distribution_linkable_assets',plane:'executor',methods:['POST'],exact:['/api/distribution/linkable-assets/sync']},
  {id:'distribution_autonomous_refresh',owner:'distribution_throughput_runtime',plane:'executor',methods:['POST'],exact:['/api/distribution/autonomous/refresh']},
  {id:'distribution_submission_execute',owner:'distribution_throughput_runtime',plane:'executor',methods:['POST'],exact:['/api/distribution/submissions/execute']},
  {id:'distribution_delivery_metrics',owner:'distribution_throughput_runtime',plane:'signals',methods:['GET'],exact:['/api/distribution/delivery/metrics']},
  {id:'distribution_autonomy_metrics',owner:'distribution_autonomous_runtime',plane:'signals',methods:['GET'],exact:['/api/distribution/autonomy/metrics']},
  {id:'distribution_submission_package',owner:'distribution_submission_runtime',plane:'executor',methods:['POST'],exact:['/api/distribution/submissions/package']},
  {id:'distribution_submission_verify',owner:'distribution_submission_runtime',plane:'executor',methods:['POST'],exact:['/api/distribution/submissions/verify']},
  {id:'distribution_submission_list',owner:'distribution_submission_runtime',plane:'signals',methods:['GET'],exact:['/api/distribution/submissions']},
  {id:'distribution_discovery_refresh',owner:'distribution_discovery_runtime',plane:'executor',methods:['POST'],exact:['/api/distribution/discovery/refresh']},
  {id:'distribution_embed_event',owner:'distribution_learning_runtime',plane:'signals',methods:['POST','OPTIONS'],exact:['/api/distribution/embed-event']},
  {id:'distribution_learning_refresh',owner:'distribution_learning_runtime',plane:'signals',methods:['POST'],exact:['/api/distribution/learning/refresh']},
  {id:'distribution_sender_ready',owner:'distribution_sender_runtime',plane:'executor',methods:['GET'],exact:['/api/distribution/vendor-amplification/ready','/api/distribution/vendor-amplification/public-candidates']},
  {id:'distribution_sender_mutations',owner:'distribution_sender_runtime',plane:'executor',methods:['POST'],exact:['/api/distribution/outbound-reputation/check','/api/distribution/outbound-reputation/override-validate','/api/distribution/outbound-reputation/override-status','/api/distribution/vendor-amplification/public-status']},
  {id:'distribution_contact_mutations',owner:'distribution_contact_runtime',plane:'executor',methods:['POST'],exact:['/api/distribution/vendor-amplification/contact-scan','/api/distribution/vendor-amplification/status']},
  {id:'distribution_vendor_queue',owner:'distribution_vendor_runtime',plane:'signals',methods:['GET'],exact:['/api/distribution/vendor-amplification']},
  {id:'distribution_vendor_refresh',owner:'distribution_vendor_runtime',plane:'executor',methods:['POST'],exact:['/api/distribution/vendor-amplification/refresh']},
  {id:'distribution_radar_refresh',owner:'distribution_radar_runtime',plane:'executor',methods:['POST'],exact:['/api/distribution/radar/refresh']},
  {id:'distribution_engine_event',owner:'distribution_engine_runtime',plane:'signals',methods:['POST'],exact:['/api/distribution-event']},
  {id:'audience_public_signals',owner:'audience_runtime',plane:'signals',methods:['GET'],exact:['/api/audience/platform-capabilities','/api/audience/dev-comments/candidates','/api/audience/bluesky-reply/health']},
  {id:'audience_observation',owner:'audience_runtime',plane:'signals',methods:['POST'],exact:['/api/audience-event','/api/audience/dev-comment/observe']},
  {id:'audience_reply_prepare',owner:'audience_runtime',plane:'executor',methods:['POST'],exact:['/api/audience/bluesky-reply/prepare']},
  {id:'catalog_autonomy_status',owner:'catalog_autonomy_runtime',plane:'signals',methods:['GET'],exact:['/api/catalog-autonomy/status','/data/catalog-inventory.json','/api/catalog-inventory']},
  {id:'catalog_autonomy_run',owner:'catalog_autonomy_runtime',plane:'executor',methods:['POST'],exact:['/api/catalog-autonomy/run']},
  {id:'funnel_events',owner:'funnel_runtime',plane:'signals',methods:['POST','OPTIONS'],exact:['/api/events']},
  {id:'dynamic_tracking',owner:'dynamic_runtime',plane:'signals',methods:['POST'],exact:['/api/click','/api/search']},
  {id:'dynamic_content_signals',owner:'dynamic_runtime',plane:'signals',methods:['GET'],exact:['/api/content-signals']},
  {id:'public_robots',owner:'dynamic_runtime',plane:'public_site',methods:['GET'],exact:['/robots.txt']},
  {id:'core_opportunities_refresh',owner:'core_runtime',plane:'executor',methods:['POST'],exact:['/api/opportunities/refresh']},
  {id:'public_decision_pages',owner:'public_decision',plane:'public_site',methods:['GET'],matcher:'public_decision_page'},
  {id:'public_navigation_hubs',owner:'public_navigation',plane:'public_site',methods:['GET'],exact:['/tools','/tools/','/tools.html','/guides','/guides/','/guides.html','/compare','/compare/','/compare.html','/categories','/categories/','/categories.html','/crm-tools','/crm-tools/','/crm-tools.html','/seo-tools','/seo-tools/','/seo-tools.html','/blog/']},
  {id:'public_canonical_assets',owner:'public_canonical_surface',plane:'public_site',methods:['GET'],exact:['/sitemap.xml','/data/tools.json']},
  {id:'public_legacy_html_redirect',owner:'public_canonical_surface',plane:'public_site',methods:['GET','HEAD'],matcher:'legacy_html_redirect'},
  {id:'affiliate_redirect',owner:'affiliate_redirect',plane:'public_site',methods:['GET'],prefixes:['/go/']},
  {id:'agent_recommendation_protocol',owner:'agent_protocol_core',plane:'public_site',methods:['GET','POST','OPTIONS'],exact:['/mcp','/mcp/','/a2a','/a2a/','/.well-known/agent-card.json']},
  {id:'agent_discovery_catalog',owner:'machine_discovery_catalog',plane:'public_site',methods:['GET','HEAD'],exact:['/.well-known/toolscout-distribution.json','/.well-known/api-catalog']},
  {id:'core_options',owner:'core_runtime',plane:'public_site',methods:['OPTIONS'],prefixes:['/']}
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
