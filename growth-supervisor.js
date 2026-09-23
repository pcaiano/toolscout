const NORTH_STAR='strict_verified_human_sessions';
const PRIMARY=new Set(['distribution','content','audience','seo_geo_aio']);
const HOUR=3600000;
const BACKLINK_BOOTSTRAP_REFERRING_DOMAIN_FLOOR=10;
const BACKLINK_ATTEMPT_MIN_24H=10;
const BACKLINK_ATTEMPT_TARGET_24H=15;
const BACKLINK_STAGNATION_HOURS=24;
const BACKLINK_STAGNATION_MIN_ATTEMPTS_7D=12;
const CRITICAL_STRICT_HUMANS_24H_MAX=2;
const BASELINE_EXTERNAL_EXECUTIONS_MIN_24H=10;
const BASELINE_EXTERNAL_EXECUTIONS_TARGET_24H=15;
const BASELINE_EXTERNAL_EXECUTIONS_MAX_24H=20;
const BUSINESS_FUNNEL=['strict_verified_human_sessions','verified_outbound_clicks','monetized_verified_outbound_clicks'];
const n=v=>{const x=Number(v);return Number.isFinite(x)?x:0};
const safe=(v,m=2000)=>String(v??'').slice(0,m);
const ageHours=v=>{const t=Date.parse(String(v||''));return Number.isFinite(t)?Math.max(0,(Date.now()-t)/HOUR):Infinity};

async function first(env,sql){try{return await env.DB.prepare(sql).first()}catch{return null}}
async function all(env,sql){try{return (await env.DB.prepare(sql).all()).results||[]}catch{return[]}}
async function assetJson(env,path,fallback){
  // Cloudflare runtime evidence is authoritative for GSC when it is newer than the
  // immutable asset snapshot. This lets SEO operate without waiting for a GitHub build.
  if(path==='/reports/gsc-signals.json'||path==='/data/gsc-search-reality.json'){
    try{
      const row=await env.DB.prepare('SELECT payload_json,source_generated_at FROM growth_asset_cache WHERE path=? LIMIT 1').bind(path).first();
      if(row?.payload_json){
        const runtime=JSON.parse(row.payload_json),rt=Date.parse(String(row.source_generated_at||runtime?.generatedAt||''));
        let asset=null;try{const r=await env.ASSETS.fetch(new Request('https://trytoolscout.org'+path));if(r.ok)asset=await r.json()}catch{}
        const at=Date.parse(String(asset?.generatedAt||''));
        if(!asset||!Number.isFinite(at)||(Number.isFinite(rt)&&rt>=at))return runtime;
        return asset;
      }
    }catch{}
  }
  try{const r=await env.ASSETS.fetch(new Request('https://trytoolscout.org'+path));return r.ok?await r.json():fallback}catch{return fallback}
}

async function ensureSchema(env){
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS growth_supervisor_state(
      engine TEXT PRIMARY KEY,role TEXT NOT NULL,status TEXT NOT NULL,north_star TEXT NOT NULL,
      strict_humans_24h INTEGER NOT NULL DEFAULT 0,strict_humans_7d INTEGER NOT NULL DEFAULT 0,
      attributed_humans_24h INTEGER NOT NULL DEFAULT 0,attributed_humans_7d INTEGER NOT NULL DEFAULT 0,
      external_executions_24h INTEGER NOT NULL DEFAULT 0,external_executions_7d INTEGER NOT NULL DEFAULT 0,
      evidence_age_hours REAL,directive TEXT NOT NULL,directive_json TEXT NOT NULL,
      correction_count INTEGER NOT NULL DEFAULT 0,last_correction_at TEXT,last_execution_at TEXT,
      last_evaluated_at TEXT NOT NULL DEFAULT (datetime('now')),updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_growth_supervisor_status ON growth_supervisor_state(status,updated_at)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS growth_supervisor_events(
      event_id TEXT PRIMARY KEY,engine TEXT NOT NULL,previous_status TEXT,new_status TEXT NOT NULL,
      directive TEXT NOT NULL,strict_humans_24h INTEGER NOT NULL DEFAULT 0,strict_humans_7d INTEGER NOT NULL DEFAULT 0,
      external_executions_24h INTEGER NOT NULL DEFAULT 0,external_executions_7d INTEGER NOT NULL DEFAULT 0,
      detail TEXT,created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_growth_supervisor_events_engine ON growth_supervisor_events(engine,created_at DESC)`)
  ]);
}

function classifyAcquisition(source,referrer){
  const s=String(source||'').toLowerCase(),r=String(referrer||'').toLowerCase().replace(/^www\./,'');
  if(/(^|\.)google\.|(^|\.)bing\.|duckduckgo|search\.brave|ecosia|yahoo\./.test(r)||/ref:(google|bing|duckduckgo|search\.brave|ecosia|yahoo)/.test(s))return'seo_geo_aio';
  if(/audience[_-]?engine|audience[_-]?growth|audience_engagement|bluesky[_-]?engagement/.test(s))return'audience';
  if(/utm_source=(linkedin|x|twitter|bluesky)|organic_social|content_engine/.test(s)||/(^|\.)(linkedin\.com|x\.com|twitter\.com|bsky\.app)$/.test(r))return'content';
  if(/vendor_outreach|distribution|publisher|directory|launch|community|stremit|uneed|producthunt|product_hunt|saashub|startupfame|startup_fame|peerlist|reddit|hackernews|hacker-news|indiehackers/.test(s))return'distribution';
  if(r&&r!=='trytoolscout.org'&&!r.endsWith('.trytoolscout.org'))return'distribution';
  return'unattributed';
}

function backlinkPolicy(c){
  const verifiedBacklinks=n(c.verifiedBacklinks),verifiedReferringDomains=n(c.verifiedReferringDomains);
  const attempts24=n(c.backlinkAttempts24),attempts7=n(c.backlinkAttempts7),authorityQueue=n(c.authorityQueue);
  const lastVerifiedAge=Number.isFinite(Number(c.backlinkLastVerifiedAgeHours))?Number(c.backlinkLastVerifiedAgeHours):Infinity;
  const bootstrapGap=verifiedReferringDomains<BACKLINK_BOOTSTRAP_REFERRING_DOMAIN_FLOOR;
  const backlogActive=authorityQueue>0;
  const acquisitionRequired=bootstrapGap||backlogActive;
  const throughputGap=acquisitionRequired&&attempts24<BACKLINK_ATTEMPT_MIN_24H;
  const stagnating=acquisitionRequired&&attempts7>=BACKLINK_STAGNATION_MIN_ATTEMPTS_7D&&lastVerifiedAge>=BACKLINK_STAGNATION_HOURS;
  return{
    backlink_acquisition:acquisitionRequired,
    backlink_acquisition_mode:'exhaustive_backlog',
    backlink_bootstrap_incomplete:bootstrapGap,
    backlink_backlog_active:backlogActive,
    backlink_slowdown_allowed:!bootstrapGap&&!backlogActive,
    backlink_quality_only:true,
    backlink_paid_links_allowed:false,
    backlink_reciprocal_links_required:false,
    backlink_verified:verifiedBacklinks,
    verified_referring_domains:verifiedReferringDomains,
    referring_domain_bootstrap_floor:BACKLINK_BOOTSTRAP_REFERRING_DOMAIN_FLOOR,
    backlink_attempt_min_24h:BACKLINK_ATTEMPT_MIN_24H,
    backlink_attempts_24h:attempts24,
    backlink_attempts_7d:attempts7,
    backlink_authority_queue:authorityQueue,
    backlink_last_verified_age_hours:Number.isFinite(lastVerifiedAge)?Number(lastVerifiedAge.toFixed(1)):null,
    backlink_throughput_gap:throughputGap,
    backlink_stagnating:stagnating,
    backlink_stagnation_hours:BACKLINK_STAGNATION_HOURS,
    backlink_priority_basis:'relevance + editorial legitimacy + observed search demand + potential human referrals'
  };
}
function acquisitionBaseline(config={}){return{operating_mode:'always_on_acquisition',always_on_acquisition:true,strict_human_truth_only:true,probable_human_metric:false,critical_strict_humans_24h_max:CRITICAL_STRICT_HUMANS_24H_MAX,external_execution_min_24h:BASELINE_EXTERNAL_EXECUTIONS_MIN_24H,external_execution_target_24h:BASELINE_EXTERNAL_EXECUTIONS_TARGET_24H,external_execution_max_24h:BASELINE_EXTERNAL_EXECUTIONS_MAX_24H,optimize_funnel:BUSINESS_FUNNEL,...config}}
function withBacklinks(config,c){return{...acquisitionBaseline(config),...backlinkPolicy(c)}}
function policy(engine,c){
  const h24=n(c.h24),h7=n(c.h7),e24=n(c.e24),e7=n(c.e7),age=c.lastExecutionAgeHours;
  if(engine==='distribution'){
    const bp=backlinkPolicy(c);
    if(bp.backlink_stagnating)return{status:'underperforming',directive:'rotate_authority_channel_mix_and_execute',config:withBacklinks({mode:'rotate_authority_channel_mix_and_execute',execute_now:true,priority_boost:50,exploration_slots:14,no_wait_for_maturity:true,reallocate_by_verified_humans:true,reallocate_by_outbounds:true,authority_first:true,rotate_surface_families:true},c)};
    if(bp.backlink_throughput_gap)return{status:'underpowered',directive:'expand_authority_routes_and_execute',config:withBacklinks({mode:'expand_authority_routes_and_execute',execute_now:true,priority_boost:45,exploration_slots:12,no_wait_for_maturity:true,authority_first:true,replenish_empty_sender_queue:true},c)};
    if(h24>0)return{status:'working',directive:'scale_proven_sources_and_keep_exploring',config:withBacklinks({mode:'scale_proven_sources_and_keep_exploring',execute_now:true,priority_boost:30,exploration_slots:6,reallocate_by_verified_humans:true,reallocate_by_outbounds:true},c)};
    if(e24>=BASELINE_EXTERNAL_EXECUTIONS_MIN_24H)return{status:'underperforming',directive:'rotate_expand_and_execute_now',config:withBacklinks({mode:'rotate_expand_and_execute_now',execute_now:true,priority_boost:40,exploration_slots:10,no_wait_for_maturity:true,reallocate_by_verified_humans:true,reallocate_by_outbounds:true},c)};
    if(c.activeOpportunities>0)return{status:'active',directive:'execute_highest_probability_external_actions',config:withBacklinks({mode:'execute_highest_probability_external_actions',execute_now:true,priority_boost:35,exploration_slots:8,no_wait_for_maturity:true},c)};
    return{status:'discovery_required',directive:'discover_and_execute_new_routes',config:withBacklinks({mode:'discover_and_execute_new_routes',execute_now:true,priority_boost:25,exploration_slots:8},c)};
  }
  if(engine==='content'){
    if(h7>0)return{status:'working',directive:'scale_human_generating_topics_and_distribute',config:acquisitionBaseline({mode:'scale_human_generating_topics_and_distribute',search_demand_first:true,require_tracked_target:true,quality_floor:true})};
    if(age>48)return{status:'execution_gap',directive:'restore_and_publish_from_observed_demand',config:acquisitionBaseline({mode:'restore_and_publish_from_observed_demand',search_demand_first:true,require_tracked_target:true,generic_content:false,quality_floor:true})};
    return{status:'active',directive:'publish_from_observed_demand_and_distribute',config:acquisitionBaseline({mode:'publish_from_observed_demand_and_distribute',search_demand_first:true,generic_content:false,require_tracked_target:true,quality_floor:true})};
  }
  if(engine==='audience'){
    if(h7>0)return{status:'working',directive:'scale_relevant_conversations_and_keep_exploring',config:acquisitionBaseline({mode:'scale_relevant_conversations_and_keep_exploring',relevance_only:true,link_only_when_directly_helpful:true})};
    if(e7>=10)return{status:'underperforming',directive:'rotate_conversation_targets_and_execute',config:acquisitionBaseline({mode:'rotate_conversation_targets_and_execute',relevance_only:true,link_only_when_directly_helpful:true,avoid_activity_for_activity_sake:true,no_wait_for_maturity:true})};
    if(age>24)return{status:'execution_gap',directive:'restore_audience_execution_now',config:acquisitionBaseline({mode:'restore_audience_execution_now',relevance_only:true,link_only_when_directly_helpful:true})};
    return{status:'active',directive:'execute_qualified_conversations',config:acquisitionBaseline({mode:'execute_qualified_conversations',relevance_only:true,link_only_when_directly_helpful:true,avoid_activity_for_activity_sake:true})};
  }
  if(engine==='seo_geo_aio'){
    if(c.gscAgeHours>36)return{status:'evidence_stale',directive:'refresh_search_evidence_and_execute',config:withBacklinks({mode:'refresh_search_evidence_and_execute',run_executor:true,priority_boost:30,no_wait_for_maturity:true},c)};
    if(c.organicActionsAgeHours>48)return{status:'executor_stale',directive:'run_targeted_seo_executor_now',config:withBacklinks({mode:'run_targeted_seo_executor_now',run_executor:true,priority_boost:30,observed_demand_only:true},c)};
    if(h7>0)return{status:'working',directive:'scale_queries_generating_humans_and_authority',config:withBacklinks({mode:'scale_queries_generating_humans_and_authority',run_executor:true,priority_boost:20,observed_demand_only:true},c)};
    if(c.gscImpressions>0&&c.backlinkAcquisitionRequired)return{status:'underperforming',directive:'execute_search_demand_and_authority_growth',config:withBacklinks({mode:'execute_search_demand_and_authority_growth',run_executor:true,priority_boost:30,observed_demand_only:true,no_wait_for_maturity:true},c)};
    if(c.gscImpressions>0)return{status:'active',directive:'execute_observed_search_demand',config:withBacklinks({mode:'execute_observed_search_demand',run_executor:true,priority_boost:25,observed_demand_only:true},c)};
    return{status:'active',directive:'build_search_visibility_and_execute',config:withBacklinks({mode:'build_search_visibility_and_execute',run_executor:true,priority_boost:20},c)};
  }
  if(engine==='affiliate')return{status:'supporting',directive:'maintain_monetization_readiness',config:{mode:'maintenance_only',priority_cap:35,north_star_secondary:true,business_funnel:BUSINESS_FUNNEL}};
  if(engine==='catalog')return{status:'supporting',directive:'demand_led_quality_only',config:{mode:'demand_led_quality',priority_cap:50,admit_when_search_or_quality_evidence:true,north_star_secondary:true,business_funnel:BUSINESS_FUNNEL}};
  return{status:'observed',directive:'observe',config:{mode:'observe'}};
}

function countSince(rows,field,hours,pred=()=>true){
  const cutoff=Date.now()-hours*HOUR;let count=0,last=0;
  for(const row of rows){
    if(!pred(row))continue;
    const raw=String(row?.[field]||'');const t=Date.parse(raw.includes('T')?raw:raw.replace(' ','T')+'Z');
    if(!Number.isFinite(t)||t<cutoff)continue;
    count++;if(t>last)last=t;
  }
  return{count,last};
}

async function strictRows(env){
  return all(env,`WITH fv AS (
    SELECT session_id,source,referrer_host,created_at,
      ROW_NUMBER() OVER(PARTITION BY session_id ORDER BY created_at ASC,id ASC) rn
    FROM confirmed_visitor_events WHERE created_at>=datetime('now','-7 days')
  )
  SELECT h.session_id,h.first_evidence_at,v.source,v.referrer_host
  FROM traffic_human_evidence h
  LEFT JOIN fv v ON v.session_id=h.session_id AND v.rn=1
  WHERE h.first_evidence_at>=datetime('now','-7 days')`);
}

async function executionRows(env){
  const [actions,submissions,audience]=await Promise.all([
    all(env,`SELECT engine,status,created_at,updated_at FROM growth_action_events WHERE created_at>=datetime('now','-7 days')`),
    all(env,`SELECT surface_slug,status,attempts,COALESCE(last_attempt_at,created_at) at FROM distribution_submissions WHERE surface_slug<>'indexnow' AND attempts>0 AND COALESCE(last_attempt_at,created_at)>=datetime('now','-7 days')`),
    all(env,`SELECT event_type,status,platform,created_at FROM audience_events WHERE created_at>=datetime('now','-7 days') AND status='published'`)
  ]);
  return{actions,submissions,audience};
}

async function saveEngine(env,engine,role,global,ctx,p){
  const prev=await env.DB.prepare(`SELECT status,directive,directive_json,correction_count FROM growth_supervisor_state WHERE engine=?`).bind(engine).first();
  const json=JSON.stringify(p.config),changed=!prev||prev.status!==p.status||prev.directive!==p.directive||String(prev.directive_json||'')!==json;
  const lastExecution=Number.isFinite(ctx.lastExecutionAgeHours)&&ctx.lastExecutionAgeHours<1e6?new Date(Date.now()-ctx.lastExecutionAgeHours*HOUR).toISOString().replace('T',' ').slice(0,19):null;
  const evidenceAge=engine==='seo_geo_aio'?Math.min(ctx.gscAgeHours,ctx.organicActionsAgeHours):(Number.isFinite(ctx.lastExecutionAgeHours)?ctx.lastExecutionAgeHours:null);
  const corrections=n(prev?.correction_count)+(changed?1:0);
  await env.DB.prepare(`INSERT INTO growth_supervisor_state(
      engine,role,status,north_star,strict_humans_24h,strict_humans_7d,attributed_humans_24h,attributed_humans_7d,
      external_executions_24h,external_executions_7d,evidence_age_hours,directive,directive_json,correction_count,last_correction_at,last_execution_at,last_evaluated_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,CASE WHEN ?=1 THEN datetime('now') ELSE NULL END,?,datetime('now'),datetime('now'))
    ON CONFLICT(engine) DO UPDATE SET
      role=excluded.role,status=excluded.status,north_star=excluded.north_star,
      strict_humans_24h=excluded.strict_humans_24h,strict_humans_7d=excluded.strict_humans_7d,
      attributed_humans_24h=excluded.attributed_humans_24h,attributed_humans_7d=excluded.attributed_humans_7d,
      external_executions_24h=excluded.external_executions_24h,external_executions_7d=excluded.external_executions_7d,
      evidence_age_hours=excluded.evidence_age_hours,directive=excluded.directive,directive_json=excluded.directive_json,
      correction_count=excluded.correction_count,
      last_correction_at=CASE WHEN ?=1 THEN datetime('now') ELSE growth_supervisor_state.last_correction_at END,
      last_execution_at=excluded.last_execution_at,last_evaluated_at=datetime('now'),updated_at=datetime('now')`)
    .bind(engine,role,p.status,NORTH_STAR,global.strict24,global.strict7,n(ctx.h24),n(ctx.h7),n(ctx.e24),n(ctx.e7),evidenceAge,p.directive,json,corrections,changed?1:0,lastExecution,changed?1:0).run();
  if(changed){
    await env.DB.prepare(`INSERT INTO growth_supervisor_events(event_id,engine,previous_status,new_status,directive,strict_humans_24h,strict_humans_7d,external_executions_24h,external_executions_7d,detail,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,datetime('now'))`)
      .bind(`gs_${crypto.randomUUID()}`,engine,prev?.status||null,p.status,p.directive,global.strict24,global.strict7,n(ctx.e24),n(ctx.e7),
        safe(`North star ${NORTH_STAR}. Attributed humans 24h/7d ${n(ctx.h24)}/${n(ctx.h7)}. External executions 24h/7d ${n(ctx.e24)}/${n(ctx.e7)}.`)).run();
  }
  return{engine,role,status:p.status,directive:p.directive,directiveConfig:p.config,attributedHumans24h:n(ctx.h24),attributedHumans7d:n(ctx.h7),externalExecutions24h:n(ctx.e24),externalExecutions7d:n(ctx.e7)};
}

export async function runGrowthSupervisorAudit(env){
  await ensureSchema(env);
  const [humansRows,exec,gsc,gscReality,organic,seoRuntime,active,executionContract,architectureIncidents,backlinkPlacements,outboundMetrics,authorityMetrics]=await Promise.all([
    strictRows(env),executionRows(env),
    assetJson(env,'/reports/gsc-signals.json',{generatedAt:null,siteTotals:{}}),
    assetJson(env,'/data/gsc-search-reality.json',{generatedAt:null,searchPerformance:{},indexHealth:{},sitemaps:{}}),
    assetJson(env,'/reports/organic-growth-actions.json',{generatedAt:null,newInterventions:[],activeOptimizations:[]}),
    first(env,`SELECT MAX(updated_at) last_run_at,
      SUM(CASE WHEN updated_at>=datetime('now','-7 days') THEN 1 ELSE 0 END) interventions_7d
      FROM seo_runtime_state`),
    all(env,`SELECT subject_type,COUNT(*) n FROM growth_opportunity_state WHERE status='active' GROUP BY subject_type`),
    first(env,`SELECT
      SUM(CASE WHEN status='executor_missing' THEN 1 ELSE 0 END) missing_executors,
      SUM(CASE WHEN status='stalled' THEN 1 ELSE 0 END) stalled,
      SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) pending,
      SUM(CASE WHEN status='claimed' THEN 1 ELSE 0 END) claimed,
      SUM(CASE WHEN status='attempted' THEN 1 ELSE 0 END) attempted,
      SUM(CASE WHEN status='verified' THEN 1 ELSE 0 END) verified
      FROM growth_execution_contract`),
    first(env,`SELECT COUNT(*) n FROM growth_architecture_incidents WHERE status='open' AND approval_required=1`),
    all(env,`SELECT surface_slug,public_url,link_rel,first_verified_at
      FROM distribution_placements
      WHERE placement_verified=1 AND backlink_verified=1
        AND surface_slug NOT IN ('rss','toolscout-ard','toolscout-machine-discovery')`),
    first(env,`SELECT
      SUM(CASE WHEN created_at>=datetime('now','-24 hours') THEN 1 ELSE 0 END) verified_outbound_24h,
      SUM(CASE WHEN created_at>=datetime('now','-7 days') THEN 1 ELSE 0 END) verified_outbound_7d,
      SUM(CASE WHEN created_at>=datetime('now','-24 hours') AND affiliate_active_at_click=1 THEN 1 ELSE 0 END) monetized_outbound_24h,
      SUM(CASE WHEN created_at>=datetime('now','-7 days') AND affiliate_active_at_click=1 THEN 1 ELSE 0 END) monetized_outbound_7d
      FROM verified_outbound_events`),
    first(env,`SELECT
      (SELECT COUNT(*) FROM distribution_submissions WHERE surface_slug<>'indexnow' AND attempts>0 AND COALESCE(last_attempt_at,created_at)>=datetime('now','-24 hours'))+
      (SELECT COUNT(*) FROM distribution_events WHERE event_type IN ('vendor_outreach_sent','publisher_network_outreach_sent') AND created_at>=datetime('now','-24 hours')) backlink_attempts_24h,
      (SELECT COUNT(*) FROM distribution_submissions WHERE surface_slug<>'indexnow' AND attempts>0 AND COALESCE(last_attempt_at,created_at)>=datetime('now','-7 days'))+
      (SELECT COUNT(*) FROM distribution_events WHERE event_type IN ('vendor_outreach_sent','publisher_network_outreach_sent') AND created_at>=datetime('now','-7 days')) backlink_attempts_7d,
      (SELECT MAX(first_verified_at) FROM distribution_placements WHERE placement_verified=1 AND backlink_verified=1 AND surface_slug NOT IN ('rss','toolscout-ard','toolscout-machine-discovery')) last_verified_at,
      (SELECT COUNT(*) FROM growth_execution_contract WHERE action IN ('backlink_reference_outreach','verify_backlink_acquisition','publisher_contact_discovery','execute_alternate_routes') AND status IN ('pending','claimed','attempted','deferred','stalled')) authority_queue`)
  ]);
  const referringDomains=new Set();
  for(const row of backlinkPlacements||[]){
    try{const host=new URL(String(row.public_url||'')).hostname.replace(/^www\./,'').toLowerCase();if(host&&host!=='trytoolscout.org'&&!host.endsWith('.trytoolscout.org'))referringDomains.add(host)}catch{}
  }
  const verifiedBacklinks=(backlinkPlacements||[]).length;
  const verifiedReferringDomains=referringDomains.size;
  const backlinkAttempts24=n(authorityMetrics?.backlink_attempts_24h),backlinkAttempts7=n(authorityMetrics?.backlink_attempts_7d),authorityQueue=n(authorityMetrics?.authority_queue);
  const backlinkBootstrapIncomplete=verifiedReferringDomains<BACKLINK_BOOTSTRAP_REFERRING_DOMAIN_FLOOR;
  const backlinkAcquisitionRequired=backlinkBootstrapIncomplete||authorityQueue>0;
  const backlinkLastVerifiedAgeHours=authorityMetrics?.last_verified_at?ageHours(String(authorityMetrics.last_verified_at).replace(' ','T')+'Z'):Infinity;
  const backlinkThroughputGap=backlinkAcquisitionRequired&&backlinkAttempts24<BACKLINK_ATTEMPT_MIN_24H;
  const backlinkStagnating=backlinkAcquisitionRequired&&backlinkAttempts7>=BACKLINK_STAGNATION_MIN_ATTEMPTS_7D&&backlinkLastVerifiedAgeHours>=BACKLINK_STAGNATION_HOURS;
  const byType=Object.fromEntries(active.map(x=>[String(x.subject_type),n(x.n)]));
  const humans={distribution:{h24:0,h7:0},content:{h24:0,h7:0},audience:{h24:0,h7:0},seo_geo_aio:{h24:0,h7:0},unattributed:{h24:0,h7:0}};
  const now=Date.now();let strict24=0,strict7=0;
  for(const row of humansRows){
    const raw=String(row.first_evidence_at||'');const t=Date.parse(raw.includes('T')?raw:raw.replace(' ','T')+'Z');if(!Number.isFinite(t))continue;
    strict7++;if(now-t<=24*HOUR)strict24++;
    const k=classifyAcquisition(row.source,row.referrer_host);humans[k]??={h24:0,h7:0};humans[k].h7++;if(now-t<=24*HOUR)humans[k].h24++;
  }

  const valid=r=>['sent','verified','completed','attributed'].includes(String(r.status||''));
  const distAction=r=>/vendor_amplification|distribution_network|distribution_route|distribution/i.test(String(r.engine||''))&&valid(r);
  const contentAction=r=>String(r.engine||'')==='content'&&valid(r);
  const d24=countSince(exec.actions,'created_at',24,distAction),d7=countSince(exec.actions,'created_at',168,distAction);
  const s24=countSince(exec.submissions,'at',24),s7=countSince(exec.submissions,'at',168);
  const cp24=countSince(exec.audience,'created_at',24,r=>r.event_type==='content_published'),cp7=countSince(exec.audience,'created_at',168,r=>r.event_type==='content_published');
  const ca24=countSince(exec.actions,'created_at',24,contentAction),ca7=countSince(exec.actions,'created_at',168,contentAction);
  const au24=countSince(exec.audience,'created_at',24,r=>r.event_type==='outbound_reply'),au7=countSince(exec.audience,'created_at',168,r=>r.event_type==='outbound_reply');
  const gscTruthGeneratedAt=gscReality?.generatedAt||gsc?.generatedAt||null;
  const gscAge=ageHours(gscTruthGeneratedAt);
  const legacyOrganicAge=ageHours(organic?.generatedAt);
  const seoRuntimeAge=seoRuntime?.last_run_at?ageHours(String(seoRuntime.last_run_at).replace(' ','T')+'Z'):Infinity;
  const organicAge=Math.min(legacyOrganicAge,seoRuntimeAge);
  const gscWindow=gscReality?.searchPerformance?.window28d||{};
  const gscImpressions=n(gscWindow?.impressions??gsc?.siteTotals?.impressions),gscClicks=n(gscWindow?.clicks??gsc?.siteTotals?.clicks);
  const gscIndexed=n(gscReality?.indexHealth?.indexed),gscInspected=n(gscReality?.indexHealth?.inspected),gscIndexIssues=n(gscReality?.indexHealth?.indexRecoveryCandidates),gscCanonicalMismatches=n(gscReality?.indexHealth?.canonicalMismatches),gscRedirected=n(gscReality?.indexHealth?.redirected),gscDiscoveredNotIndexed=n(gscReality?.indexHealth?.discoveredNotIndexed),gscUnknownToGoogle=n(gscReality?.indexHealth?.unknownToGoogle);
  const seoInterventions=Math.max(Array.isArray(organic?.newInterventions)?organic.newInterventions.length:0,n(seoRuntime?.interventions_7d));

  const ctx={
    distribution:{...humans.distribution,e24:d24.count+s24.count,e7:d7.count+s7.count,lastExecutionAgeHours:(Math.max(d7.last,s7.last)?(now-Math.max(d7.last,s7.last))/HOUR:Infinity),activeOpportunities:n(byType.surface)+n(byType.tool),verifiedBacklinks,verifiedReferringDomains,backlinkAcquisitionRequired,backlinkAttempts24,backlinkAttempts7,backlinkLastVerifiedAgeHours,backlinkThroughputGap,backlinkStagnating,authorityQueue},
    content:{...humans.content,e24:cp24.count,e7:cp7.count,lastExecutionAgeHours:(cp7.last?(now-cp7.last)/HOUR:Infinity),internalActions24h:ca24.count,internalActions7d:ca7.count,activeOpportunities:n(byType.search)+n(byType.tool)+n(byType.news_update)},
    audience:{...humans.audience,e24:au24.count,e7:au7.count,lastExecutionAgeHours:au7.last?(now-au7.last)/HOUR:Infinity,activeOpportunities:n(byType.surface)+n(byType.tool)},
    seo_geo_aio:{...humans.seo_geo_aio,e24:0,e7:seoInterventions,lastExecutionAgeHours:organicAge,activeOpportunities:n(byType.search),gscAgeHours:gscAge,organicActionsAgeHours:organicAge,gscImpressions,gscClicks,gscIndexed,gscInspected,gscIndexIssues,gscCanonicalMismatches,gscRedirected,gscDiscoveredNotIndexed,gscUnknownToGoogle,verifiedBacklinks,verifiedReferringDomains,backlinkAcquisitionRequired,backlinkAttempts24,backlinkAttempts7,backlinkLastVerifiedAgeHours,backlinkThroughputGap,backlinkStagnating,authorityQueue},
    affiliate:{h24:0,h7:0,e24:0,e7:0,lastExecutionAgeHours:Infinity,activeOpportunities:n(byType.affiliate)},
    catalog:{h24:0,h7:0,e24:0,e7:0,lastExecutionAgeHours:Infinity,activeOpportunities:Object.entries(byType).filter(([k])=>k.startsWith('catalog')).reduce((s,[,v])=>s+n(v),0)}
  };
  const global={strict24,strict7};
  const engines=[];
  for(const engine of ['distribution','content','audience','seo_geo_aio','affiliate','catalog'])engines.push(await saveEngine(env,engine,PRIMARY.has(engine)?'primary_human_acquisition':'supporting',global,ctx[engine],policy(engine,ctx[engine])));

  const exec24=engines.filter(x=>PRIMARY.has(x.engine)).reduce((s,x)=>s+x.externalExecutions24h,0);
  const exec7=engines.filter(x=>PRIMARY.has(x.engine)).reduce((s,x)=>s+x.externalExecutions7d,0);
  const attributed7=n(humans.distribution.h7)+n(humans.content.h7)+n(humans.audience.h7)+n(humans.seo_geo_aio.h7);
  const missingExecutors=n(executionContract?.missing_executors),stalledContracts=n(executionContract?.stalled),openArchitectureIncidents=n(architectureIncidents?.n);
  let status='working',directive='accelerate_and_scale_verified_human_acquisition';
  if(openArchitectureIncidents>0){status='critical';directive='repair_architecture_and_continue_acquisition'}
  else if(missingExecutors>0||stalledContracts>0){status='critical';directive='repair_execution_contract_and_continue_acquisition'}
  else if(strict24<=CRITICAL_STRICT_HUMANS_24H_MAX){status='critical';directive='critical_acquisition_incident_execute_measure_reallocate'}
  else if(exec24<BASELINE_EXTERNAL_EXECUTIONS_MIN_24H){status='underpowered';directive='increase_external_execution_to_baseline'}
  else if(strict7>0&&attributed7===0){status='working_unattributed';directive='improve_attribution_while_accelerating_acquisition'}

  const attributed24=n(humans.distribution.h24)+n(humans.content.h24)+n(humans.audience.h24)+n(humans.seo_geo_aio.h24);
  const gctx={h24:attributed24,h7:attributed7,e24:exec24,e7:exec7,lastExecutionAgeHours:0};
  const gp={status,directive,config:{...acquisitionBaseline({mode:directive}),strict_humans_24h:strict24,strict_humans_7d:strict7,attributed_humans_24h:attributed24,attributed_humans_7d:attributed7,unattributed_humans_7d:n(humans.unattributed.h7),verified_outbound_24h:n(outboundMetrics?.verified_outbound_24h),verified_outbound_7d:n(outboundMetrics?.verified_outbound_7d),monetized_outbound_24h:n(outboundMetrics?.monetized_outbound_24h),monetized_outbound_7d:n(outboundMetrics?.monetized_outbound_7d),acquisition_executions_24h:exec24,acquisition_executions_7d:exec7,backlink_acquisition:{required:backlinkAcquisitionRequired,mode:'exhaustive_backlog',bootstrap_incomplete:backlinkBootstrapIncomplete,backlog_active:authorityQueue>0,slowdown_allowed:!backlinkBootstrapIncomplete&&authorityQueue<=0,quality_only:true,verified_backlinks:verifiedBacklinks,verified_referring_domains:verifiedReferringDomains,bootstrap_referring_domain_floor:BACKLINK_BOOTSTRAP_REFERRING_DOMAIN_FLOOR,attempt_min_24h:BACKLINK_ATTEMPT_MIN_24H,attempt_target_24h:BACKLINK_ATTEMPT_TARGET_24H,attempts_24h:backlinkAttempts24,attempts_7d:backlinkAttempts7,authority_queue:authorityQueue,last_verified_at:authorityMetrics?.last_verified_at||null,last_verified_age_hours:Number.isFinite(backlinkLastVerifiedAgeHours)?Number(backlinkLastVerifiedAgeHours.toFixed(1)):null,throughput_gap:backlinkThroughputGap,stagnating:backlinkStagnating,stagnation_hours:BACKLINK_STAGNATION_HOURS,paid_links_allowed:false,reciprocal_links_required:false},execution_contract:{missing_executors:missingExecutors,stalled:stalledContracts,pending:n(executionContract?.pending),claimed:n(executionContract?.claimed),attempted:n(executionContract?.attempted),verified:n(executionContract?.verified)},architecture_escalation:{open_incidents:openArchitectureIncidents,approval_required:openArchitectureIncidents>0}}};
  const growth=await saveEngine(env,'growth_brain','supervisor',global,gctx,gp);
  return{ok:true,northStar:NORTH_STAR,businessFunnel:BUSINESS_FUNNEL,operatingMode:'always_on_acquisition',criticalStrictHumans24hMax:CRITICAL_STRICT_HUMANS_24H_MAX,externalExecutionBaseline24h:{min:BASELINE_EXTERNAL_EXECUTIONS_MIN_24H,target:BASELINE_EXTERNAL_EXECUTIONS_TARGET_24H,max:BASELINE_EXTERNAL_EXECUTIONS_MAX_24H},status,directive,strictHumans24h:strict24,strictHumans7d:strict7,attributedHumans7d:attributed7,unattributedHumans7d:n(humans.unattributed.h7),verifiedOutbound24h:n(outboundMetrics?.verified_outbound_24h),verifiedOutbound7d:n(outboundMetrics?.verified_outbound_7d),monetizedOutbound24h:n(outboundMetrics?.monetized_outbound_24h),monetizedOutbound7d:n(outboundMetrics?.monetized_outbound_7d),acquisitionExecutions24h:exec24,acquisitionExecutions7d:exec7,backlinkAcquisition:{required:backlinkAcquisitionRequired,mode:'exhaustive_backlog',bootstrapIncomplete:backlinkBootstrapIncomplete,backlogActive:authorityQueue>0,slowdownAllowed:!backlinkBootstrapIncomplete&&authorityQueue<=0,verifiedBacklinks,verifiedReferringDomains,bootstrapReferringDomainFloor:BACKLINK_BOOTSTRAP_REFERRING_DOMAIN_FLOOR,qualityOnly:true,attemptMin24h:BACKLINK_ATTEMPT_MIN_24H,attemptTarget24h:BACKLINK_ATTEMPT_TARGET_24H,attempts24h:backlinkAttempts24,attempts7d:backlinkAttempts7,authorityQueue,lastVerifiedAt:authorityMetrics?.last_verified_at||null,lastVerifiedAgeHours:Number.isFinite(backlinkLastVerifiedAgeHours)?Number(backlinkLastVerifiedAgeHours.toFixed(1)):null,throughputGap:backlinkThroughputGap,stagnating:backlinkStagnating,stagnationHours:BACKLINK_STAGNATION_HOURS},executionContract:{missingExecutors,stalled:stalledContracts,pending:n(executionContract?.pending),claimed:n(executionContract?.claimed),attempted:n(executionContract?.attempted),verified:n(executionContract?.verified)},architectureEscalation:{openIncidents:openArchitectureIncidents,approvalRequired:openArchitectureIncidents>0},gsc:{generatedAt:gscTruthGeneratedAt,ageHours:gscAge,impressions:gscImpressions,clicks:gscClicks,indexed:gscIndexed,inspected:gscInspected,indexRecoveryCandidates:gscIndexIssues,canonicalMismatches:gscCanonicalMismatches,redirected:gscRedirected,discoveredNotIndexed:gscDiscoveredNotIndexed,unknownToGoogle:gscUnknownToGoogle,sitemapApiOk:gscReality?.sitemaps?.apiOk??null,source:gscReality?.source||gsc?.source||'Google Search Console'},organicActions:{generatedAt:organic?.generatedAt||null,runtimeUpdatedAt:seoRuntime?.last_run_at||null,ageHours:organicAge,newInterventions:seoInterventions,source:Number.isFinite(seoRuntimeAge)?'seo_runtime_state':'legacy_report'},growth,engines};
}

export async function growthSupervisorSnapshot(env){
  await ensureSchema(env);
  const rows=await all(env,`SELECT engine,role,status,north_star,strict_humans_24h,strict_humans_7d,attributed_humans_24h,attributed_humans_7d,external_executions_24h,external_executions_7d,evidence_age_hours,directive,directive_json,correction_count,last_correction_at,last_execution_at,last_evaluated_at FROM growth_supervisor_state ORDER BY CASE engine WHEN 'growth_brain' THEN 0 WHEN 'distribution' THEN 1 WHEN 'content' THEN 2 WHEN 'audience' THEN 3 WHEN 'seo_geo_aio' THEN 4 WHEN 'affiliate' THEN 5 ELSE 6 END`);
  return{northStar:NORTH_STAR,generatedAt:new Date().toISOString(),items:rows.map(x=>{let cfg={};try{cfg=JSON.parse(x.directive_json||'{}')}catch{}const y={...x,directiveConfig:cfg};delete y.directive_json;return y})};
}

export async function growthSupervisorDirective(env,engine){
  await ensureSchema(env);
  const row=await env.DB.prepare(`SELECT status,directive,directive_json,last_evaluated_at FROM growth_supervisor_state WHERE engine=?`).bind(engine).first();
  if(!row)return null;let config={};try{config=JSON.parse(row.directive_json||'{}')}catch{}
  return{status:row.status,directive:row.directive,config,lastEvaluatedAt:row.last_evaluated_at};
}
