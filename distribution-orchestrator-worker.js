import base from './distribution-priority-worker.js';
import {distributionSurfaceMetrics} from './distribution-impact-worker.js';
import {runWithLedger} from './engine-run-ledger.js';

const H={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'no-store'};
const HUMAN_ACQUISITION_SPRINT=Object.freeze({
  id:'human-acquisition-sprint-2026-09',
  startAt:'2026-09-18T23:00:00.000Z',
  endAt:'2026-09-28T23:00:00.000Z',
  northStar:'strict_verified_human_sessions'
});
const AUDIENCE_ACQUISITION_POLICY=Object.freeze({
  id:'external-demand-first-v2',
  objective:'Continuously acquire new humans from existing demand and external audiences. Owned channels may support acquisition but never replace external-demand acquisition as the primary engine.',
  primaryModes:['existing_demand_search','borrowed_audience_distribution','vendor_audience_amplification'],
  ownedChannelsRole:'support_and_optional_expansion_after_repeatable_external_acquisition',
  externalDemandRemainsPrimary:true,
  ownedExpansionGate:{strictVerifiedHumanSessions30d:100,provenExternalSources:2,strictHumansPerProvenSource30d:3}
});
const HUMAN_ACQUISITION_GSC_TARGETS=Object.freeze([
  {key:'project-management',cluster:'project_management',path:'/best-project-management-tools',title:'Best Project Management Tools',impressions:93,position:38.66,priority:98},
  {key:'seo-agencies',cluster:'seo_agencies',path:'/best-seo-tools-for-agencies',title:'Best SEO Tools for Agencies',impressions:727,position:76.02,priority:96},
  {key:'no-code-automation',cluster:'no_code_automation',path:'/best-no-code-automation-tools',title:'Best No Code Automation Tools',impressions:254,position:74.05,priority:94},
  {key:'semrush-profile',cluster:'semrush_airtable_profiles',path:'/tools/semrush',title:'Semrush',tool_slug:'semrush',impressions:303,position:55.77,priority:92},
  {key:'airtable-profile',cluster:'semrush_airtable_profiles',path:'/tools/airtable',title:'Airtable',tool_slug:'airtable',impressions:234,position:73.82,priority:90},
  {key:'funnel-builders',cluster:'funnel_builders',path:'/best-funnel-builder',title:'Best Funnel Builder',impressions:176,position:76.46,priority:88}
]);
function humanSprintActive(now=Date.now()){return now>=Date.parse(HUMAN_ACQUISITION_SPRINT.startAt)&&now<Date.parse(HUMAN_ACQUISITION_SPRINT.endAt);}
const safe=(v,n=3000)=>String(v??'').slice(0,n);
async function auth(request,env){const t=(request.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');return Boolean(env.ADMIN_TOKEN&&t===env.ADMIN_TOKEN)}
function classify(url){const p=new URL(url).pathname.toLowerCase();if(p.includes('-vs-'))return'comparison';if(p.includes('best-'))return'best_of';if(p.includes('alternatives'))return'alternatives';return'decision_asset';}
function angle(url,type){const slug=new URL(url).pathname.split('/').filter(Boolean).pop()?.replace(/\.html$/,'').replace(/-/g,' ')||'software decision';if(type==='comparison')return`Independent comparison data and decision framing for ${slug}.`;if(type==='best_of')return`Evidence-led shortlist for ${slug}, with a buyer-intent angle rather than a generic tool dump.`;return`Independent ToolScout decision resource about ${slug}.`;}
function confirmedSessions(metric){return Math.max(0,Number(metric?.browser_confirmed_sessions??metric?.human_sessions??0)||0)}
function economicBoost(metric){
  if(!metric)return 0;
  const sessions=confirmedSessions(metric),outbound=Math.max(0,Number(metric.outbound_clicks)||0),monetized=Math.max(0,Number(metric.monetized_outbound)||0),revenue=Math.max(0,Number(metric.revenue)||0);
  if(humanSprintActive()){
    const humanAcquisition=Math.min(45,sessions*9);
    const secondary=Math.min(4,outbound*1.25+monetized*1.5);
    const revenueSignal=Math.min(1,revenue*0.25);
    return Number(Math.min(50,humanAcquisition+secondary+revenueSignal).toFixed(2));
  }
  const confidence=Math.min(1,sessions/5);
  const observed=Math.min(22,sessions*1.25+outbound*2+monetized*5)*(0.35+0.65*confidence);
  const revenueBoost=Math.min(28,revenue*2.5);
  return Number(Math.min(50,observed+revenueBoost).toFixed(2));
}
function evidenceGrade(metric){
  const sessions=confirmedSessions(metric),monetized=Math.max(0,Number(metric?.monetized_outbound)||0),revenue=Math.max(0,Number(metric?.revenue)||0);
  if(humanSprintActive()){
    if(sessions>=10)return'strong';
    if(sessions>=3)return'emerging';
    if(sessions>=1)return'directional';
    return'none';
  }
  if(revenue>0)return'revenue_confirmed';
  if(sessions>=10&&monetized>=2)return'strong';
  if(sessions>=3||monetized>=1)return'emerging';
  if(sessions>=1)return'directional';
  return'none';
}
const GROWTH_EVIDENCE_RANK={none:0,directional:1,emerging:2,strong:3,revenue_confirmed:4};
let growthSchemaReady=null;
async function ensureGrowthSchema(env){
  if(growthSchemaReady)return growthSchemaReady;
  growthSchemaReady=env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS growth_opportunity_state(
      opportunity_key TEXT PRIMARY KEY,
      subject_type TEXT NOT NULL,
      subject_key TEXT NOT NULL,
      priority_score REAL NOT NULL DEFAULT 0,
      signal_json TEXT NOT NULL,
      action_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_evaluated_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_growth_opportunity_priority ON growth_opportunity_state(status,priority_score DESC)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_growth_opportunity_subject ON growth_opportunity_state(subject_type,subject_key)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS growth_rnd_experiments(
      experiment_key TEXT PRIMARY KEY,
      experiment_type TEXT NOT NULL,
      subject_key TEXT,
      hypothesis TEXT NOT NULL,
      action_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'proposed',
      risk_class TEXT NOT NULL DEFAULT 'bounded',
      expected_signal TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_evaluated_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_growth_rnd_status ON growth_rnd_experiments(status,updated_at DESC)`)
  ]).catch(error=>{growthSchemaReady=null;throw error});
  return growthSchemaReady;
}
async function growthRows(env,sql){try{return (await env.DB.prepare(sql).all()).results||[]}catch{return[]}}
async function audiencePhaseSnapshot(env){
  try{
    const strictRow=await env.DB.prepare(`SELECT COUNT(DISTINCT session_id) strict_sessions_30d
      FROM traffic_human_evidence
      WHERE first_evidence_at>=datetime('now','-30 days')`).first();
    const sourceRows=await env.DB.prepare(`SELECT
        LOWER(COALESCE(NULLIF(v.referrer_host,''),NULLIF(v.source,''),'unknown')) acquisition_source,
        COUNT(DISTINCT h.session_id) strict_sessions
      FROM traffic_human_evidence h
      LEFT JOIN confirmed_visitor_events v ON v.session_id=h.session_id
      WHERE h.first_evidence_at>=datetime('now','-30 days')
      GROUP BY LOWER(COALESCE(NULLIF(v.referrer_host,''),NULLIF(v.source,''),'unknown'))
      HAVING COUNT(DISTINCT h.session_id)>=?`)
      .bind(AUDIENCE_ACQUISITION_POLICY.ownedExpansionGate.strictHumansPerProvenSource30d).all();
    const strict=Math.max(0,Number(strictRow?.strict_sessions_30d||0));
    const sourceItems=(sourceRows?.results||[]).filter(x=>{
      const s=String(x?.acquisition_source||'').toLowerCase();
      return s&&s!=='unknown'&&s!=='direct'&&s!=='internal-test'&&s!=='outbound-proof'&&!s.includes('trytoolscout.org');
    });
    const provenExternalSources=sourceItems.length;
    const ownedExpansionEligible=
      strict>=AUDIENCE_ACQUISITION_POLICY.ownedExpansionGate.strictVerifiedHumanSessions30d&&
      provenExternalSources>=AUDIENCE_ACQUISITION_POLICY.ownedExpansionGate.provenExternalSources;
    return{
      status:'observed',
      phase:ownedExpansionEligible?'external_demand_first_with_owned_support':'external_demand_first',
      borrowedFirst:true,
      externalDemandPrimary:true,
      strictVerifiedHumanSessions30d:strict,
      provenExternalSources30d:provenExternalSources,
      provenExternalSourceBreakdown:sourceItems.slice(0,12).map(x=>({source:String(x.acquisition_source),strictSessions:Number(x.strict_sessions||0)})),
      ownedExpansionEligible,
      thresholds:AUDIENCE_ACQUISITION_POLICY.ownedExpansionGate,
      policy:AUDIENCE_ACQUISITION_POLICY.id
    };
  }catch(error){
    return{
      status:'unavailable',
      phase:'external_demand_first',
      borrowedFirst:true,
      externalDemandPrimary:true,
      ownedExpansionEligible:false,
      thresholds:AUDIENCE_ACQUISITION_POLICY.ownedExpansionGate,
      policy:AUDIENCE_ACQUISITION_POLICY.id,
      reason:String(error?.message||error).slice(0,240)
    };
  }
}
async function growthAssetJson(env,path,fallback){try{const r=await env.ASSETS.fetch(new Request('https://trytoolscout.org'+path));return r.ok?await r.json():fallback}catch{return fallback}}
async function coordinateGrowthOpportunities(env){
  await ensureGrowthSchema(env);
  const audienceStrategy=await audiencePhaseSnapshot(env);
  const [surfaces,tools,affiliateRows,catalogRuntime,catalogCandidates,catalogGaps,newsCandidates,organicGrowth,gscSignals,aeoGeo,machineReadability,catalogFreshness,catalogHealth,toolProfileHolds,catalogEngine,catalogTools,softwareUpdates]=await Promise.all([
    growthRows(env,`SELECT o.surface_slug,o.surface_name,o.surface_type,o.status,o.distribution_score,
      l.evidence_grade,l.browser_confirmed_sessions_30d,l.outbound_clicks_30d,l.monetized_outbound_30d,
      n.status network_status,n.adoption_kind
      FROM distribution_opportunities o
      LEFT JOIN distribution_economic_learning l ON l.surface_slug=o.surface_slug
      LEFT JOIN distribution_network_outreach n ON n.surface_slug=o.surface_slug
      WHERE o.surface_slug IS NOT NULL AND o.status NOT IN ('policy_blocked','rejected','skipped','unavailable_free')`),
    growthRows(env,`SELECT v.tool_slug,v.priority_score,v.status vendor_status,v.asset_url,
      p.status profile_status,a.policy_status,a.organic_social_allowed,a.direct_affiliate_link_allowed
      FROM distribution_vendor_amplification v
      LEFT JOIN content_social_profiles p ON p.tool_slug=v.tool_slug
      LEFT JOIN affiliate_social_policy a ON a.tool_slug=v.tool_slug
      WHERE v.tool_slug IS NOT NULL`),
    growthRows(env,`SELECT w.tool_slug,w.status,w.network,w.blocker,w.application_url,w.program_url,w.affiliate_url,w.updated_at,
      SUM(CASE WHEN c.session_id IS NOT NULL THEN 1 ELSE 0 END) outbound_30d,
      SUM(CASE WHEN c.session_id IS NOT NULL AND COALESCE(c.affiliate_active_at_click,0)=0 THEN 1 ELSE 0 END) unmonetized_30d,
      SUM(CASE WHEN c.session_id IS NOT NULL AND COALESCE(c.affiliate_active_at_click,0)=1 THEN 1 ELSE 0 END) monetized_30d
    FROM affiliate_workflow w
    LEFT JOIN verified_outbound_events c ON c.tool_slug=w.tool_slug AND c.created_at>=datetime('now','-30 days')
    GROUP BY w.tool_slug,w.status,w.network,w.blocker,w.application_url,w.program_url,w.affiliate_url,w.updated_at`),
    growthRows(env,`SELECT tool_slug,source_status,http_status,content_changed,broken_consecutive,quality_status,last_checked_at,last_change_at FROM catalog_runtime_state`),
    growthRows(env,`SELECT tool_slug,status,source_status,verified_at FROM catalog_runtime_candidates`),
    growthRows(env,`SELECT tool_slug,signals,sources_json,status,updated_at FROM catalog_market_gaps`),
    growthRows(env,`SELECT candidate_id,tool_slug,source_url,title,summary,status,materiality_score,detected_at,updated_at FROM software_news_candidates WHERE status IN ('verified','published') OR (status='candidate' AND materiality_score>=50)`),
    growthAssetJson(env,'/reports/organic-growth-opportunities.json',{generatedAt:null,opportunities:[],summary:{}}),
    growthAssetJson(env,'/reports/gsc-signals.json',{generatedAt:null,source:null,startDate:null,endDate:null,siteTotals:{},pages:[],items:[]}),
    growthAssetJson(env,'/reports/aeo-geo-readiness.json',{generatedAt:null,failures:null,warnings:null}),
    growthAssetJson(env,'/reports/machine-readability.json',{generatedAt:null,failures:null,warnings:null}),
    growthAssetJson(env,'/reports/catalog-freshness-coverage.json',{generatedAt:null,summary:{},coverage:[],contentChanges:[],quarantined:[]}),
    growthAssetJson(env,'/reports/catalog-health.json',{summary:{},tools:[]}),
    growthAssetJson(env,'/reports/tool-profile-holds.json',{generatedAt:null,count:0,items:[]}),
    growthAssetJson(env,'/data/catalog-engine.json',{cadence:{freshnessTargetDays:7},coverage:{minimumToolsPerIntentCategory:5}}),
    growthAssetJson(env,'/data/tools.json',[]),
    growthAssetJson(env,'/data/software-updates.json',{updatedAt:null,items:[]})
  ]);
  const searchOpportunities=Array.isArray(organicGrowth?.opportunities)?organicGrowth.opportunities:[];
  const directGscPages=Array.isArray(gscSignals?.pages)?gscSignals.pages:[];
  const normalizedGscPages=directGscPages
    .filter(x=>Number(x?.impressions||0)>0)
    .map(x=>{
      let pathname='/';try{pathname=new URL(String(x?.page||'https://trytoolscout.org/')).pathname.replace(/\.html$/i,'')||'/'}catch{}
      const impressions=Math.max(0,Number(x?.impressions||0)),clicks=Math.max(0,Number(x?.clicks||0)),position=Math.max(0,Number(x?.position||0)),ctr=Math.max(0,Number(x?.ctr||0));
      const rankFactor=position>0?Math.max(0,60-Math.min(60,position)):0;
      const demandFactor=Math.min(35,Math.log10(impressions+1)*14);
      const clickFactor=Math.min(20,clicks*10);
      const priority=Math.max(1,Math.min(100,Math.round(35+demandFactor+rankFactor*0.45+clickFactor)));
      return{page:String(x?.page||''),pathname,clicks,impressions,ctr,position,topQueries:Array.isArray(x?.topQueries)?x.topQueries.slice(0,5):[],priority};
    })
    .sort((a,b)=>b.priority-a.priority||b.impressions-a.impressions)
    .slice(0,50);
  const searchBoostByTool=new Map();
  for(const op of searchOpportunities){
    const score=Math.max(0,Math.min(100,Number(op?.priorityScore||0)));
    for(const tool of Array.isArray(op?.topTools)?op.topTools:[]){
      const slug=String(tool||'').toLowerCase();if(!slug)continue;
      searchBoostByTool.set(slug,Math.max(searchBoostByTool.get(slug)||0,Math.min(15,score*0.2)));
    }
  }
  if(humanSprintActive()){
    for(const target of HUMAN_ACQUISITION_GSC_TARGETS){
      if(target.tool_slug)searchBoostByTool.set(target.tool_slug,Math.max(searchBoostByTool.get(target.tool_slug)||0,25));
    }
  }
  const newsByTool=new Map(),nowMs=Date.now();
  for(const item of Array.isArray(softwareUpdates?.items)?softwareUpdates.items:[]){
    const slug=String(item?.toolSlug||'').toLowerCase();if(!slug)continue;
    const t=Date.parse(item?.publishedAt||'');if(!Number.isFinite(t))continue;
    const ageDays=Math.max(0,(nowMs-t)/86400000),boost=Math.max(0,12-Math.min(12,ageDays));
    if(boost>0)newsByTool.set(slug,Math.max(newsByTool.get(slug)||0,boost));
  }
  for(const item of newsCandidates||[]){
    const slug=String(item?.tool_slug||'').toLowerCase();if(!slug)continue;
    const boost=Math.max(0,Math.min(15,Number(item?.materiality_score||0)*0.15));
    newsByTool.set(slug,Math.max(newsByTool.get(slug)||0,boost));
  }
  await env.DB.prepare(`UPDATE growth_opportunity_state SET status='dormant',updated_at=datetime('now') WHERE status='active'`).run().catch(()=>{});
  let active=0,toolCount=0,surfaceCount=0,searchCount=0,affiliateCount=0,catalogCount=0,newsCount=0;
  for(const row of surfaces){
    const evidence=String(row.evidence_grade||'none');
    const network=String(row.network_status||'');
    const score=Math.min(100,Math.max(0,Number(row.distribution_score||0)
      +(GROWTH_EVIDENCE_RANK[evidence]||0)*4
      +(network==='contact_route_found'?4:0)+(network==='contact_found'?7:0)+(network==='sent'?10:0)+(network==='adopted'?18:0)
      +(audienceStrategy.borrowedFirst?15:0)));
    const actions=['distribution_measurement'];
    if(!network||network==='queued'||network==='send_failed')actions.unshift('publisher_contact_discovery');
    if(network==='contact_route_found')actions.unshift('content_relevance_amplification');
    if(network==='contact_found')actions.unshift('publisher_outreach');
    if(network==='adopted')actions.unshift('scale_proven_surface');
    const signals={surface_status:row.status,network_status:network||null,evidence_grade:evidence,browser_confirmed_sessions_30d:Number(row.browser_confirmed_sessions_30d||0),outbound_clicks_30d:Number(row.outbound_clicks_30d||0),monetized_outbound_30d:Number(row.monetized_outbound_30d||0),adoption_kind:row.adoption_kind||null,audience_strategy:audienceStrategy.phase,acquisition_mode:'borrowed_audience',borrowed_first_boost:audienceStrategy.borrowedFirst?15:0};
    await env.DB.prepare(`INSERT INTO growth_opportunity_state(opportunity_key,subject_type,subject_key,priority_score,signal_json,action_json,status,first_seen_at,last_evaluated_at,updated_at)
      VALUES(?,?,?,?,?,?,'active',datetime('now'),datetime('now'),datetime('now'))
      ON CONFLICT(opportunity_key) DO UPDATE SET priority_score=excluded.priority_score,signal_json=excluded.signal_json,action_json=excluded.action_json,status='active',last_evaluated_at=datetime('now'),updated_at=datetime('now')`)
      .bind(`surface:${row.surface_slug}`,'surface',row.surface_slug,Number(score.toFixed(2)),JSON.stringify(signals),JSON.stringify(actions)).run();
    active++;surfaceCount++;
  }
  for(const row of tools){
    const profile=String(row.profile_status||'')==='verified';
    const affiliate=Number(row.organic_social_allowed)===1&&Number(row.direct_affiliate_link_allowed)===1;
    const vendor=String(row.vendor_status||'');
    const toolSlug=String(row.tool_slug||'').toLowerCase(),searchBoost=Number(searchBoostByTool.get(toolSlug)||0),newsBoost=Number(newsByTool.get(toolSlug)||0);
    const score=Math.min(100,Math.max(0,Number(row.priority_score||0)+(profile?8:0)+(affiliate?12:0)+(vendor==='contact_found'?6:0)+(vendor==='sent'?10:0)+searchBoost+newsBoost+(audienceStrategy.borrowedFirst?10:0)));
    const actions=['vendor_amplification'];
    if(profile)actions.push('content_mention');
    if(affiliate)actions.push('affiliate_social');
    const signals={vendor_status:vendor,verified_social_profile:profile,affiliate_social_allowed:affiliate,search_priority_boost:Number(searchBoost.toFixed(2)),news_priority_boost:Number(newsBoost.toFixed(2)),asset_url:row.asset_url||null,policy_status:row.policy_status||null,audience_strategy:audienceStrategy.phase,acquisition_mode:'vendor_borrowed_audience',borrowed_first_boost:audienceStrategy.borrowedFirst?10:0};
    await env.DB.prepare(`INSERT INTO growth_opportunity_state(opportunity_key,subject_type,subject_key,priority_score,signal_json,action_json,status,first_seen_at,last_evaluated_at,updated_at)
      VALUES(?,?,?,?,?,?,'active',datetime('now'),datetime('now'),datetime('now'))
      ON CONFLICT(opportunity_key) DO UPDATE SET priority_score=excluded.priority_score,signal_json=excluded.signal_json,action_json=excluded.action_json,status='active',last_evaluated_at=datetime('now'),updated_at=datetime('now')`)
      .bind(`tool:${row.tool_slug}`,'tool',row.tool_slug,Number(score.toFixed(2)),JSON.stringify(signals),JSON.stringify(actions)).run();
    active++;toolCount++;
  }
  const affiliateStateWeight={research_required:18,program_exists:28,ready_to_apply:42,human_action_required:46,submitted:24,pending_review:24,approved_needs_link:72,link_acquired:88,active:52,verified:8,earning:4,rejected:2,watchlist:3,paused:2,blocked:18,no_program_found:1};
  for(const row of affiliateRows){
    const slug=String(row.tool_slug||'').toLowerCase();if(!slug)continue;
    const state=String(row.status||'research_required'),unmonetized=Math.max(0,Number(row.unmonetized_30d||0)),outbound=Math.max(0,Number(row.outbound_30d||0)),monetized=Math.max(0,Number(row.monetized_30d||0));
    const searchBoost=Number(searchBoostByTool.get(slug)||0);
    const leakageBoost=Math.min(40,unmonetized*8+Math.max(0,outbound-monetized)*2);
    const score=Math.min(100,Math.max(0,Number(affiliateStateWeight[state]||10)+leakageBoost+searchBoost));
    const actions=[];
    if(state==='research_required'||state==='program_exists')actions.push('discover_and_qualify_affiliate_program');
    if(state==='ready_to_apply'||state==='human_action_required')actions.push('prepare_affiliate_application_pack','surface_only_true_human_gate');
    if(state==='submitted'||state==='pending_review')actions.push('monitor_affiliate_decision');
    if(state==='approved_needs_link')actions.push('capture_approved_referral_link');
    if(state==='link_acquired')actions.push('activate_affiliate_route');
    if(state==='active')actions.push('production_verify_affiliate_route');
    if(state==='verified'||state==='earning')actions.push('measure_affiliate_yield');
    if(state==='blocked'||state==='rejected'||state==='paused')actions.push('monitor_retry_evidence');
    const signals={affiliate_status:state,network:row.network||null,blocker:row.blocker||null,outbound_30d:outbound,unmonetized_outbound_30d:unmonetized,monetized_outbound_30d:monetized,search_priority_boost:Number(searchBoost.toFixed(2)),application_url:row.application_url||null,affiliate_url_present:Boolean(row.affiliate_url),updated_at:row.updated_at||null};
    await env.DB.prepare(`INSERT INTO growth_opportunity_state(opportunity_key,subject_type,subject_key,priority_score,signal_json,action_json,status,first_seen_at,last_evaluated_at,updated_at)
      VALUES(?,?,?,?,?,?,'active',datetime('now'),datetime('now'),datetime('now'))
      ON CONFLICT(opportunity_key) DO UPDATE SET priority_score=excluded.priority_score,signal_json=excluded.signal_json,action_json=excluded.action_json,status='active',last_evaluated_at=datetime('now'),updated_at=datetime('now')`)
      .bind(`affiliate:${slug}`,'affiliate',slug,Number(score.toFixed(2)),JSON.stringify(signals),JSON.stringify(actions)).run();
    active++;affiliateCount++;
  }

  const runtimeStateBySlug=new Map((catalogRuntime||[]).map(x=>[String(x.tool_slug||'').toLowerCase(),x]));
  const runtimeCandidateSet=new Set((catalogCandidates||[]).filter(x=>x.status==='admitted_coverage').map(x=>String(x.tool_slug||'').toLowerCase()));
  const runtimeGapMap=new Map((catalogGaps||[]).map(x=>[String(x.tool_slug||'').toLowerCase(),x]));
  const catalogBySlug=new Map((Array.isArray(catalogTools)?catalogTools:[]).map(x=>[String(x?.slug||'').toLowerCase(),x]));
  const changed=new Map((Array.isArray(catalogFreshness?.contentChanges)?catalogFreshness.contentChanges:[]).map(x=>[String(x?.slug||'').toLowerCase(),x]));
  const quarantined=new Map((Array.isArray(catalogFreshness?.quarantined)?catalogFreshness.quarantined:[]).map(x=>[String(x?.slug||'').toLowerCase(),x]));
  const healthBySlug=new Map((Array.isArray(catalogHealth?.tools)?catalogHealth.tools:[]).map(x=>[String(x?.slug||'').toLowerCase(),x]));
  const heldBySlug=new Map((Array.isArray(toolProfileHolds?.items)?toolProfileHolds.items:[]).map(x=>[String(x?.slug||'').toLowerCase(),x]));
  const catalogSlugs=new Set([...changed.keys(),...quarantined.keys(),...heldBySlug.keys(),...runtimeStateBySlug.keys(),...runtimeCandidateSet]);
  for(const [slug,h] of healthBySlug){
    if(h?.needsWeeklyReview||h?.overdue||Array.isArray(h?.missingCritical)&&h.missingCritical.length)catalogSlugs.add(slug);
  }
  for(const slug of catalogSlugs){
    if(!slug)continue;
    const tool=catalogBySlug.get(slug)||{},h=healthBySlug.get(slug)||{},change=changed.get(slug)||null,quarantine=quarantined.get(slug)||null,hold=heldBySlug.get(slug)||null;
    const searchBoost=Number(searchBoostByTool.get(slug)||0);
    let score=30,actions=[];
    if(change){score+=32;actions.push('verify_changed_catalog_facts','refresh_profile_if_confirmed');}
    if(h?.needsWeeklyReview){score+=12;actions.push('refresh_volatile_catalog_facts');}
    if(h?.overdue){score+=22;actions.push('deep_catalog_review');}
    if(Array.isArray(h?.missingCritical)&&h.missingCritical.length){score+=28;actions.push('resolve_missing_critical_catalog_fields');}
    if(hold){score+=18;actions.push('resolve_profile_evidence_hold');}
    if(quarantine){score+=55;actions.push('confirm_source_breakage','suppress_unverifiable_profile');}
    score=Math.min(100,score+searchBoost);
    const runtime=runtimeStateBySlug.get(slug)||null;if(runtime?.quality_status==='change_detected'){score+=34;actions.push('verify_changed_catalog_facts','refresh_profile_if_confirmed')}if(runtime?.quality_status==='confirmed_broken'){score+=45;actions.push('suppress_unverifiable_profile')}if(runtimeCandidateSet.has(slug)){score+=8;actions.push('monitor_runtime_coverage_profile')}
    const signals={tool_name:tool?.name||h?.name||slug,category:tool?.category||null,content_changed:Boolean(change)||runtime?.quality_status==='change_detected',quarantined:Boolean(quarantine)||runtime?.quality_status==='confirmed_broken',needs_weekly_review:Boolean(h?.needsWeeklyReview),overdue:Boolean(h?.overdue),missing_critical:Array.isArray(h?.missingCritical)?h.missingCritical:[],profile_hold:hold?.reason||null,source_status:runtime?.source_status||h?.source?.status||change?.sourceStatus||null,source_http_status:runtime?.http_status||h?.source?.httpStatus||change?.httpStatus||null,runtime_quality_status:runtime?.quality_status||null,runtime_last_checked_at:runtime?.last_checked_at||null,runtime_candidate:runtimeCandidateSet.has(slug),search_priority_boost:Number(searchBoost.toFixed(2)),freshness_report_generated_at:catalogFreshness?.generatedAt||null,catalog_health_generated_at:catalogHealth?.summary?.generatedAt||null};
    await env.DB.prepare(`INSERT INTO growth_opportunity_state(opportunity_key,subject_type,subject_key,priority_score,signal_json,action_json,status,first_seen_at,last_evaluated_at,updated_at)
      VALUES(?,?,?,?,?,?,'active',datetime('now'),datetime('now'),datetime('now'))
      ON CONFLICT(opportunity_key) DO UPDATE SET priority_score=excluded.priority_score,signal_json=excluded.signal_json,action_json=excluded.action_json,status='active',last_evaluated_at=datetime('now'),updated_at=datetime('now')`)
      .bind(`catalog-tool:${slug}`,'catalog_tool',slug,Number(score.toFixed(2)),JSON.stringify(signals),JSON.stringify([...new Set(actions)])).run();
    active++;catalogCount++;
  }
  for(const gap of Array.isArray(catalogFreshness?.coverage)?catalogFreshness.coverage:[]){
    const category=String(gap?.category||'').trim();const missing=Math.max(0,Number(gap?.gap||0));if(!category||missing<=0)continue;
    const score=Math.min(100,35+missing*9+Math.min(15,Number(gap?.intentSurfaces||0)*1.5));
    const signals={category,current_tools:Number(gap?.tools||0),target:Number(gap?.target||0),gap:missing,intent_surfaces:Number(gap?.intentSurfaces||0),catalog_entry_does_not_imply_ranking:true,affiliate_neutral:true,freshness_report_generated_at:catalogFreshness?.generatedAt||null};
    const actions=['discover_catalog_candidates','verify_first_party_sources','admit_only_after_quality_gates'];
    await env.DB.prepare(`INSERT INTO growth_opportunity_state(opportunity_key,subject_type,subject_key,priority_score,signal_json,action_json,status,first_seen_at,last_evaluated_at,updated_at)
      VALUES(?,?,?,?,?,?,'active',datetime('now'),datetime('now'),datetime('now'))
      ON CONFLICT(opportunity_key) DO UPDATE SET priority_score=excluded.priority_score,signal_json=excluded.signal_json,action_json=excluded.action_json,status='active',last_evaluated_at=datetime('now'),updated_at=datetime('now')`)
      .bind(`catalog-category:${category}`,'catalog_category',category,Number(score.toFixed(2)),JSON.stringify(signals),JSON.stringify(actions)).run();
    active++;catalogCount++;
  }
  for(const [slug,gap] of runtimeGapMap){
    if(!slug||String(gap?.status||'')!=='research_required')continue;
    const signalsCount=Math.max(0,Number(gap?.signals||0)),score=Math.min(100,28+signalsCount*10);
    let sources=[];try{sources=JSON.parse(gap?.sources_json||'[]')}catch{}
    const signals={market_signals:signalsCount,market_sources:sources,first_party_profile_required:true,affiliate_neutral:true,updated_at:gap?.updated_at||null};
    await env.DB.prepare(`INSERT INTO growth_opportunity_state(opportunity_key,subject_type,subject_key,priority_score,signal_json,action_json,status,first_seen_at,last_evaluated_at,updated_at)
      VALUES(?,?,?,?,?,?,'active',datetime('now'),datetime('now'),datetime('now'))
      ON CONFLICT(opportunity_key) DO UPDATE SET priority_score=excluded.priority_score,signal_json=excluded.signal_json,action_json=excluded.action_json,status='active',last_evaluated_at=datetime('now'),updated_at=datetime('now')`)
      .bind(`catalog-gap:${slug}`,'catalog_gap',slug,Number(score.toFixed(2)),JSON.stringify(signals),JSON.stringify(['research_first_party_candidate_profile','verify_official_source','admit_only_after_quality_gates'])).run();
    active++;catalogCount++;
  }

  const freshnessDays=Number(catalogEngine?.cadence?.freshnessTargetDays||7),reportMs=Date.parse(catalogFreshness?.generatedAt||'');
  const reportAgeDays=Number.isFinite(reportMs)?Math.floor((Date.now()-reportMs)/86400000):999;
  if(reportAgeDays>=freshnessDays){
    const signals={report_age_days:reportAgeDays,target_days:freshnessDays,catalog_tools:Number(catalogFreshness?.summary?.tools||catalogTools?.length||0),reason:'Catalog verification evidence is older than the configured freshness target.'};
    await env.DB.prepare(`INSERT INTO growth_opportunity_state(opportunity_key,subject_type,subject_key,priority_score,signal_json,action_json,status,first_seen_at,last_evaluated_at,updated_at)
      VALUES('catalog:quality-refresh','catalog_system','quality-refresh',?,?,?,'active',datetime('now'),datetime('now'),datetime('now'))
      ON CONFLICT(opportunity_key) DO UPDATE SET priority_score=excluded.priority_score,signal_json=excluded.signal_json,action_json=excluded.action_json,status='active',last_evaluated_at=datetime('now'),updated_at=datetime('now')`)
      .bind(Math.min(100,60+(reportAgeDays-freshnessDays)*4),JSON.stringify(signals),JSON.stringify(['run_catalog_freshness_verification','run_catalog_quality_control','regenerate_verified_profiles'])).run();
    active++;catalogCount++;
  }

  for(const item of Array.isArray(softwareUpdates?.items)?softwareUpdates.items:[]){
    const id=String(item?.id||'').trim(),slug=String(item?.toolSlug||'').toLowerCase();if(!id)continue;
    const t=Date.parse(item?.publishedAt||''),ageDays=Number.isFinite(t)?Math.max(0,(Date.now()-t)/86400000):30,recency=Math.max(0,25-Math.min(25,ageDays*3)),searchBoost=Number(searchBoostByTool.get(slug)||0);
    const score=Math.min(100,35+recency+searchBoost+(slug?8:0));
    const actions=['catalog_impact_review','search_update_angle','content_amplification','distribution_amplification'];
    const signals={tool_slug:slug||null,title:item?.title||null,source_url:item?.sourceUrl||null,article_url:item?.articleUrl||null,published_at:item?.publishedAt||null,partner_update:Boolean(item?.partnerUpdate),search_priority_boost:Number(searchBoost.toFixed(2)),verified_source:true};
    await env.DB.prepare(`INSERT INTO growth_opportunity_state(opportunity_key,subject_type,subject_key,priority_score,signal_json,action_json,status,first_seen_at,last_evaluated_at,updated_at)
      VALUES(?,?,?,?,?,?,'active',datetime('now'),datetime('now'),datetime('now'))
      ON CONFLICT(opportunity_key) DO UPDATE SET priority_score=excluded.priority_score,signal_json=excluded.signal_json,action_json=excluded.action_json,status='active',last_evaluated_at=datetime('now'),updated_at=datetime('now')`)
      .bind(`news:${id}`,'news_update',slug||id,Number(score.toFixed(2)),JSON.stringify(signals),JSON.stringify(actions)).run();
    active++;newsCount++;
  }
  for(const item of newsCandidates||[]){
    const id=String(item?.candidate_id||'').trim(),slug=String(item?.tool_slug||'').toLowerCase();if(!id)continue;
    const score=Math.min(100,40+Math.max(0,Number(item?.materiality_score||0))*0.5+Number(searchBoostByTool.get(slug)||0));
    const actions=['verify_news_materiality','catalog_impact_review','search_update_angle','prepare_whats_new_candidate'];
    const signals={tool_slug:slug||null,title:item?.title||null,summary:item?.summary||null,source_url:item?.source_url||null,status:item?.status||null,detected_at:item?.detected_at||null};
    await env.DB.prepare(`INSERT INTO growth_opportunity_state(opportunity_key,subject_type,subject_key,priority_score,signal_json,action_json,status,first_seen_at,last_evaluated_at,updated_at)
      VALUES(?,?,?,?,?,?,'active',datetime('now'),datetime('now'),datetime('now'))
      ON CONFLICT(opportunity_key) DO UPDATE SET priority_score=excluded.priority_score,signal_json=excluded.signal_json,action_json=excluded.action_json,status='active',last_evaluated_at=datetime('now'),updated_at=datetime('now')`)
      .bind(`news-candidate:${id}`,'news_update',slug||id,Number(score.toFixed(2)),JSON.stringify(signals),JSON.stringify(actions)).run();
    active++;newsCount++;
  }

  for(const op of searchOpportunities.slice(0,40)){
    const intent=String(op?.intent||'').trim();if(!intent)continue;
    const priority=Math.max(0,Math.min(100,Number(op?.priorityScore||0)+(audienceStrategy.borrowedFirst?15:0)));
    const execution=Array.isArray(op?.executionPlan)?op.executionPlan:[];
    const actions=[...new Set([...execution,'content_amplification','distribution_amplification','search_measurement'])];
    const signals={
      lane:op?.lane||null,
      action:op?.action||null,
      evidence_confidence:op?.evidenceConfidence||null,
      monetization_readiness:op?.monetizationReadiness||null,
      impressions:Number(op?.searchSignal?.impressions||0),
      clicks:Number(op?.searchSignal?.clicks||0),
      ctr:Number(op?.searchSignal?.ctr||0),
      position:Number(op?.searchSignal?.position||0),
      top_tools:Array.isArray(op?.topTools)?op.topTools.slice(0,5):[],
      aeo_geo_failures:Number(aeoGeo?.failures||0),
      aeo_geo_warnings:Number(aeoGeo?.warnings||0),
      machine_readability_failures:Number(machineReadability?.failures||0),
      machine_readability_warnings:Number(machineReadability?.warnings||0),
      organic_report_generated_at:organicGrowth?.generatedAt||null,
      audience_strategy:audienceStrategy.phase,
      acquisition_mode:'existing_demand_search',
      borrowed_first_boost:audienceStrategy.borrowedFirst?15:0
    };
    await env.DB.prepare(`INSERT INTO growth_opportunity_state(opportunity_key,subject_type,subject_key,priority_score,signal_json,action_json,status,first_seen_at,last_evaluated_at,updated_at)
      VALUES(?,?,?,?,?,?,'active',datetime('now'),datetime('now'),datetime('now'))
      ON CONFLICT(opportunity_key) DO UPDATE SET priority_score=excluded.priority_score,signal_json=excluded.signal_json,action_json=excluded.action_json,status='active',last_evaluated_at=datetime('now'),updated_at=datetime('now')`)
      .bind(`search:${intent}`,'search',intent,Number(priority.toFixed(2)),JSON.stringify(signals),JSON.stringify(actions)).run();
    active++;searchCount++;
  }
  for(const row of normalizedGscPages){
    const key=row.pathname==='/'?'home':row.pathname;
    const actions=['search_measurement'];
    if(row.position>20&&row.impressions>=20)actions.unshift('content_amplification','distribution_amplification','deepen_existing_search_asset');
    else if(row.position>10&&row.position<=20)actions.unshift('content_amplification','distribution_amplification','strengthen_internal_links');
    else if(row.position>0&&row.position<=10)actions.unshift('protect_current_ranking','improve_click_capture');
    const signals={
      lane:row.position>20?'seo_authority_depth':(row.position>10?'seo_striking_distance':(row.position>0?'seo_first_page':'seo_measure')),
      action:row.position>20?'deepen_existing':(row.position>10?'strengthen_existing':(row.position>0?'protect_and_improve_ctr':'measure')),
      evidence_confidence:row.impressions>=20?'meaningful':'low',
      source:'Google Search Console Search Analytics',
      gsc_snapshot_generated_at:gscSignals?.generatedAt||null,
      gsc_start_date:gscSignals?.startDate||null,
      gsc_end_date:gscSignals?.endDate||null,
      impressions:row.impressions,
      clicks:row.clicks,
      ctr:row.ctr,
      position:row.position,
      top_queries:row.topQueries,
      asset_path:row.pathname,
      asset_url:row.page,
      freshness_hours:gscSignals?.generatedAt?Math.max(0,(Date.now()-Date.parse(gscSignals.generatedAt))/3600000):null,
      north_star:HUMAN_ACQUISITION_SPRINT.northStar,
      audience_strategy:audienceStrategy.phase,
      acquisition_mode:'existing_demand_search'
    };
    const basePriority=audienceStrategy.borrowedFirst?Math.min(100,row.priority+15):row.priority;
    const priority=humanSprintActive()?Math.min(100,basePriority+12):basePriority;
    await env.DB.prepare(`INSERT INTO growth_opportunity_state(opportunity_key,subject_type,subject_key,priority_score,signal_json,action_json,status,first_seen_at,last_evaluated_at,updated_at)
      VALUES(?,?,?,?,?,?,'active',datetime('now'),datetime('now'),datetime('now'))
      ON CONFLICT(opportunity_key) DO UPDATE SET priority_score=excluded.priority_score,signal_json=excluded.signal_json,action_json=excluded.action_json,status='active',last_evaluated_at=datetime('now'),updated_at=datetime('now')`)
      .bind(`gsc-page:${key}`,'search',row.pathname,Number(priority.toFixed(2)),JSON.stringify(signals),JSON.stringify(actions)).run();
    active++;searchCount++;
  }
  if(humanSprintActive()){
    for(const target of HUMAN_ACQUISITION_GSC_TARGETS){
      const actions=['content_amplification','distribution_amplification','search_measurement'];
      if(target.tool_slug)actions.unshift('vendor_amplification','content_mention');
      const signals={
        lane:'human_acquisition_sprint',
        action:'amplify_gsc_observed_demand',
        evidence_confidence:'gsc_observed',
        source:'Google Search Console',
        evidence_settled_through:'2026-09-16',
        cluster:target.cluster,
        asset_path:target.path,
        asset_url:'https://trytoolscout.org'+target.path,
        title:target.title,
        impressions:target.impressions,
        clicks:0,
        ctr:0,
        position:target.position,
        tool_slug:target.tool_slug||null,
        north_star:HUMAN_ACQUISITION_SPRINT.northStar,
        sprint_id:HUMAN_ACQUISITION_SPRINT.id
      };
      await env.DB.prepare(`INSERT INTO growth_opportunity_state(opportunity_key,subject_type,subject_key,priority_score,signal_json,action_json,status,first_seen_at,last_evaluated_at,updated_at)
        VALUES(?,?,?,?,?,?,'active',datetime('now'),datetime('now'),datetime('now'))
        ON CONFLICT(opportunity_key) DO UPDATE SET priority_score=excluded.priority_score,signal_json=excluded.signal_json,action_json=excluded.action_json,status='active',last_evaluated_at=datetime('now'),updated_at=datetime('now')`)
        .bind(`sprint-search:${target.key}`,'search',target.path,target.priority,JSON.stringify(signals),JSON.stringify(actions)).run();
      active++;searchCount++;
    }
  }
  if(audienceStrategy.borrowedFirst){
    await env.DB.prepare(`UPDATE growth_opportunity_state
      SET priority_score=CASE
        WHEN subject_type='surface' THEN MIN(100,priority_score+10)
        WHEN subject_type='search' THEN MIN(100,priority_score+10)
        WHEN subject_type='tool' THEN MIN(100,priority_score+6)
        WHEN subject_type='news_update' THEN MIN(100,priority_score+3)
        WHEN subject_type='affiliate' THEN MIN(priority_score,45)
        WHEN subject_type IN ('catalog_tool','catalog_category','catalog_gap','catalog_system') AND priority_score<90 THEN MIN(priority_score,55)
        ELSE priority_score
      END,
      updated_at=datetime('now')
      WHERE status='active'`).run().catch(()=>{});
  }
  if(humanSprintActive()){
    await env.DB.prepare(`UPDATE growth_opportunity_state
      SET priority_score=CASE
        WHEN subject_type='surface' THEN MIN(100,priority_score+20)
        WHEN subject_type='search' THEN MIN(100,priority_score+20)
        WHEN subject_type='tool' THEN MIN(100,priority_score+15)
        WHEN subject_type='news_update' THEN MIN(100,priority_score+12)
        WHEN subject_type='affiliate' THEN MIN(priority_score,45)
        WHEN subject_type IN ('catalog_tool','catalog_category','catalog_gap','catalog_system') AND priority_score<90 THEN MIN(priority_score,55)
        ELSE priority_score
      END,
      updated_at=datetime('now')
      WHERE status='active'`).run().catch(()=>{});
  }
  await env.DB.prepare(`INSERT INTO distribution_events(event_id,event_type,status,asset_type,detail,observed_at,created_at) VALUES(?,?,?,?,?,datetime('now'),datetime('now'))`)
    .bind(`growthcoord_${crypto.randomUUID()}`,'growth_opportunity_coordination','completed','growth_system',`Autonomous growth coordinator refreshed ${active} active opportunities: ${surfaceCount} distribution surfaces, ${toolCount} tool/vendor, ${affiliateCount} affiliate, ${catalogCount} catalog/quality, ${newsCount} What's New and ${searchCount} Search/GEO/AEO opportunities. Audience phase: ${audienceStrategy.phase}. 30d strict sessions: ${audienceStrategy.strictVerifiedHumanSessions30d??'unavailable'}; proven external acquisition sources: ${audienceStrategy.provenExternalSources30d??'unavailable'}. Existing demand, external distribution and vendor borrowed audiences remain the primary acquisition engine. ${audienceStrategy.ownedExpansionEligible?'Owned channels may now receive additional support because external acquisition has become repeatable, but they do not replace external-demand acquisition.':'Owned channels remain support/measurement until external acquisition reaches the repeatability gate.'} ${humanSprintActive()?'Human Acquisition Sprint is active: strict verified human sessions dominate priority; acquisition surfaces, Search, vendor/content amplification and timely news are boosted while affiliate and routine catalog work are subordinated.':'Shared priority state coordinates acquisition, monetization, news, catalog growth and factual quality while keeping affiliate economics separate from editorial ranking.'}`).run().catch(()=>{});
  return {ok:true,active,surfaces:surfaceCount,tools:toolCount,affiliate:affiliateCount,catalog:catalogCount,news:newsCount,search:searchCount,searchEvidenceGeneratedAt:organicGrowth?.generatedAt||null,gscSnapshot:{generatedAt:gscSignals?.generatedAt||null,startDate:gscSignals?.startDate||null,endDate:gscSignals?.endDate||null,pages:directGscPages.length,directOpportunities:normalizedGscPages.length},catalogEvidenceGeneratedAt:catalogFreshness?.generatedAt||null,audienceStrategy,humanAcquisitionSprint:{active:humanSprintActive(),...HUMAN_ACQUISITION_SPRINT}};
}

async function publicSearchDirectives(env){
  await ensureGrowthSchema(env);
  const q=await env.DB.prepare(`SELECT opportunity_key,subject_key,priority_score,signal_json,action_json,last_evaluated_at FROM growth_opportunity_state WHERE status='active' AND subject_type='search' ORDER BY priority_score DESC LIMIT 100`).all();
  return {brain:'shared-growth-v3',generatedAt:new Date().toISOString(),directives:(q.results||[]).map(row=>{let signals={},actions=[];try{signals=JSON.parse(row.signal_json||'{}')}catch{}try{actions=JSON.parse(row.action_json||'[]')}catch{}return{opportunity_key:row.opportunity_key,intent:row.subject_key,priority_score:Number(row.priority_score||0),lane:signals.lane||null,action:signals.action||null,evidence_confidence:signals.evidence_confidence||null,impressions:Number(signals.impressions||0),clicks:Number(signals.clicks||0),ctr:Number(signals.ctr||0),position:Number(signals.position||0),actions:Array.isArray(actions)?actions:[],last_evaluated_at:row.last_evaluated_at||null}})};
}
async function runGrowthRndAudit(env){
  await ensureGrowthSchema(env);
  const policy=await growthAssetJson(env,'/data/growth-rnd-policy.json',{mode:'locked',autonomousPrimitives:[],resourcePolicy:{maxNewExperimentsPerAudit:0}});
  const allowed=new Set(Array.isArray(policy?.autonomousPrimitives)?policy.autonomousPrimitives:[]);
  const maxExperiments=Math.max(0,Math.min(10,Number(policy?.resourcePolicy?.maxNewExperimentsPerAudit||0)));
  const [types,human,actions]=await Promise.all([
    growthRows(env,`SELECT subject_type,COUNT(*) n,MAX(priority_score) max_score FROM growth_opportunity_state WHERE status='active' GROUP BY subject_type`),
    growthRows(env,`SELECT event_type,COUNT(*) n FROM distribution_events WHERE created_at>=datetime('now','-7 days') AND event_type IN ('human_gate_resolved','editorial_human_resolved') GROUP BY event_type`),
    growthRows(env,`SELECT engine,COUNT(*) actions,SUM(CASE WHEN status IN ('sent','verified','completed') THEN 1 ELSE 0 END) completed FROM growth_action_events WHERE created_at>=datetime('now','-7 days') GROUP BY engine`)
  ]);
  const counts=Object.fromEntries(types.map(x=>[x.subject_type,{count:Number(x.n||0),max:Number(x.max_score||0)}]));
  const experiments=[];
  const add=(key,type,subject,hypothesis,steps,signal)=>experiments.push({key,type,subject,hypothesis,steps,signal});
  if((counts.search?.max||0)>=65)add('rnd:search-amplification','search_amplification','search',humanSprintActive()?'Observed GSC demand should compound faster when Content and Distribution reinforce the same intent during the Human Acquisition Sprint.':'Observed search demand should compound faster when Content and Distribution reinforce the same intent.',['content_amplification','distribution_amplification','measure_search_lift'],humanSprintActive()?'strict_verified_human_sessions':'search_sessions_and_impressions');
  if((counts.news_update?.count||0)>0)add('rnd:news-compounding','news_compounding','whats_new','Verified product changes can create timely search, content, catalog and vendor-distribution opportunities.',['catalog_impact_review','content_amplification','search_update_angle','vendor_amplification'],'attributed_sessions_from_news');
  if(!humanSprintActive()&&(counts.affiliate?.max||0)>=70)add('rnd:affiliate-leakage','affiliate_leakage_recovery','affiliate','High-priority affiliate leakage should be closed before lower-value coverage work.',['prepare_application','capture_link','activate_route','verify_route'],'monetized_outbound');
  if(!humanSprintActive()&&((counts.catalog_category?.count||0)>0||(counts.catalog_gap?.count||0)>0))add('rnd:catalog-expansion','catalog_expansion','catalog','Coverage gaps can create new searchable and monetizable decision surfaces when official-source quality gates pass.',['discover_candidates','verify_first_party','admit_coverage_only'],'qualified_catalog_coverage');
  const humanCount=human.reduce((s,x)=>s+Number(x.n||0),0);
  if(humanCount>=3)add('rnd:human-gate-reduction','automation_gap_reduction','operations','Repeated human gates are candidates for automation when identity, legal and paid-action boundaries are not involved.',['audit_human_gates','convert_machine_resolvable_gates'],'owner_minutes_reduced');
  let upserted=0,blocked=0;
  for(const x of experiments.slice(0,maxExperiments)){
    const permitted=policy?.mode==='bounded_autonomy'&&x.steps.every(step=>allowed.has(step));
    if(!permitted){blocked++;continue}
    await env.DB.prepare(`INSERT INTO growth_rnd_experiments(experiment_key,experiment_type,subject_key,hypothesis,action_json,status,risk_class,expected_signal,created_at,last_evaluated_at,updated_at)
      VALUES(?,?,?,?,?,'active','bounded',?,datetime('now'),datetime('now'),datetime('now'))
      ON CONFLICT(experiment_key) DO UPDATE SET hypothesis=excluded.hypothesis,action_json=excluded.action_json,status='active',expected_signal=excluded.expected_signal,last_evaluated_at=datetime('now'),updated_at=datetime('now')`)
      .bind(x.key,x.type,x.subject,x.hypothesis,JSON.stringify(x.steps),x.signal).run();upserted++;
  }
  return {ok:true,policy_mode:policy?.mode||'locked',active_experiments:upserted,blocked_by_policy:blocked,opportunity_types:counts,human_gates_7d:humanCount,observed_action_engines:actions,guardrail:'Growth R&D may instantiate only pre-approved bounded action classes. Arbitrary code changes, new paid spend, credentials, legal commitments and irreversible third-party actions remain gated.'};
}

function paidPolicy(metric,cost){
  if(!cost)return{decision:'free_default',roi:null};
  const sessions=confirmedSessions(metric),revenue=metric?.revenue==null?null:Number(metric.revenue),sameCurrency=Boolean(metric?.currency&&cost.currency&&metric.currency===cost.currency);
  if(sameCurrency&&revenue!=null&&Number.isFinite(revenue)){
    const roi=cost.cost_amount>0?Number(((revenue-cost.cost_amount)/cost.cost_amount).toFixed(4)):null;
    if(revenue>cost.cost_amount)return{decision:'evidence_positive',roi};
    if(sessions>=10)return{decision:'hold_no_return',roi};
    return{decision:'experiment_measuring',roi};
  }
  return{decision:'experiment_measuring',roi:null};
}
async function learnEconomics(env){
  let metrics=[];
  try{metrics=await distributionSurfaceMetrics(env)}catch{return{ok:false,observed:0,updated:0,reason:'surface_metrics_unavailable'}}
  const bySlug=new Map(metrics.map(m=>[m.surface_slug,m]));
  const [q,costRows]=await Promise.all([
    env.DB.prepare(`SELECT surface_slug,distribution_score FROM distribution_opportunities WHERE surface_slug IS NOT NULL`).all(),
    env.DB.prepare(`SELECT surface_slug,cost_amount,currency,cost_type FROM distribution_surface_costs`).all().catch(()=>({results:[]}))
  ]);
  const costs=new Map((costRows.results||[]).map(c=>[c.surface_slug,{...c,cost_amount:Number(c.cost_amount||0)}]));
  let updated=0,positive=0,withEvidence=0,paidMeasuring=0;
  for(const row of q.results||[]){
    const existing=await env.DB.prepare(`SELECT baseline_score FROM distribution_economic_learning WHERE surface_slug=?`).bind(row.surface_slug).first();
    const baseline=Number(existing?.baseline_score??row.distribution_score??0);
    const metric=bySlug.get(row.surface_slug)||null;
    const sessions=confirmedSessions(metric),outbound=Math.max(0,Number(metric?.outbound_clicks)||0),monetized=Math.max(0,Number(metric?.monetized_outbound)||0);
    const boost=economicBoost(metric),learned=Number(Math.min(100,baseline+boost).toFixed(2)),grade=evidenceGrade(metric),cost=costs.get(row.surface_slug)||null,policy=paidPolicy(metric,cost);
    const sessionToOutbound=sessions?Number((outbound/sessions*100).toFixed(2)):0,monetizationRate=outbound?Number((monetized/outbound*100).toFixed(2)):0;
    if(boost>0)positive++;if(grade!=='none')withEvidence++;if(policy.decision==='experiment_measuring')paidMeasuring++;
    await env.DB.prepare(`INSERT INTO distribution_economic_learning(surface_slug,baseline_score,learned_score,human_sessions_30d,outbound_clicks_30d,monetized_outbound_30d,confirmed_revenue_30d,currency,economic_boost,last_observed_at,created_at,updated_at,browser_confirmed_sessions_30d,session_to_outbound_rate,monetization_rate,evidence_grade,paid_policy_decision,observed_cost,observed_cost_currency,observed_roi) VALUES(?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'),datetime('now'),?,?,?,?,?,?,?,?) ON CONFLICT(surface_slug) DO UPDATE SET learned_score=excluded.learned_score,human_sessions_30d=excluded.human_sessions_30d,outbound_clicks_30d=excluded.outbound_clicks_30d,monetized_outbound_30d=excluded.monetized_outbound_30d,confirmed_revenue_30d=excluded.confirmed_revenue_30d,currency=excluded.currency,economic_boost=excluded.economic_boost,last_observed_at=datetime('now'),updated_at=datetime('now'),browser_confirmed_sessions_30d=excluded.browser_confirmed_sessions_30d,session_to_outbound_rate=excluded.session_to_outbound_rate,monetization_rate=excluded.monetization_rate,evidence_grade=excluded.evidence_grade,paid_policy_decision=excluded.paid_policy_decision,observed_cost=excluded.observed_cost,observed_cost_currency=excluded.observed_cost_currency,observed_roi=excluded.observed_roi`).bind(row.surface_slug,baseline,learned,sessions,outbound,monetized,metric?.revenue==null?null:Number(metric.revenue),metric?.currency||null,boost,sessions,sessionToOutbound,monetizationRate,grade,policy.decision,cost?.cost_amount??null,cost?.currency??null,policy.roi).run();
    await env.DB.prepare(`UPDATE distribution_opportunities SET distribution_score=?,observed_human_sessions=?,observed_outbound_clicks=?,observed_revenue=?,performance_score=?,learned_at=datetime('now'),updated_at=datetime('now') WHERE surface_slug=?`).bind(learned,sessions,outbound,metric?.revenue==null?0:Number(metric.revenue),boost,row.surface_slug).run();
    updated++;
  }
  await env.DB.prepare(`INSERT INTO distribution_events(event_id,event_type,status,asset_type,detail,observed_at,created_at) VALUES(?,?,?,?,?,datetime('now'),datetime('now'))`).bind(`econ_${crypto.randomUUID()}`,'distribution_economic_learning','completed','distribution_engine',`Economic learning updated ${updated} surface(s) using browser-confirmed sessions only; ${withEvidence} surface(s) have evidence, ${positive} received a positive observed-performance boost and ${paidMeasuring} paid experiment(s) remain in measurement. Missing evidence is never treated as traffic.`).run();
  return{ok:true,observed:metrics.length,updated,positive_boosts:positive,surfaces_with_evidence:withEvidence,paid_experiments_measuring:paidMeasuring,evidence_basis:'browser_confirmed'};
}
async function prepareEditorial(env,url,type){const targets=[['community','Hacker News / Show HN','https://news.ycombinator.com/'],['community','Indie Hackers','https://www.indiehackers.com/'],['community','Relevant Reddit communities','https://www.reddit.com/'],['community','Stremit','https://stremit.io/feed']];let n=0;for(const [channel,name,target] of targets){const id=`ed_${crypto.randomUUID()}`;const a=angle(url,type);const title=type==='comparison'?`We compared ${new URL(url).pathname.split('/').pop()?.replace(/\.html$/,'').replace(/-/g,' ')}`:`ToolScout research: ${new URL(url).pathname.split('/').pop()?.replace(/\.html$/,'').replace(/-/g,' ')}`;const body=name==='Stremit'?`${a}\n\nI built this around a practical question: which option fits the job, constraints and workflow best? The page keeps the facts structured, then adds a concise editorial view of the tradeoffs.\n\n${url}`:`${a}\n\nToolScout: ${url}\n\nPrepared automatically. Review community rules and context before posting.`;await env.DB.prepare(`INSERT INTO distribution_editorial_queue(queue_id,asset_url,channel_type,target_name,target_url,angle,suggested_title,suggested_body,status,human_required,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?, 'autonomy_pending',0,datetime('now'),datetime('now'))`).bind(id,url,channel,name,target,a,safe(title,300),safe(body,3000)).run();n++;}return n;}
let editorialQueueNormalized=null;
async function normalizeEditorialQueue(env){
  if(editorialQueueNormalized)return editorialQueueNormalized;
  editorialQueueNormalized=env.DB.prepare(`UPDATE distribution_editorial_queue SET status='autonomy_pending',human_required=0,updated_at=datetime('now') WHERE human_required=1 AND status='prepared' AND channel_type IN ('community','community_stack')`).run().catch(()=>null);
  return editorialQueueNormalized;
}
async function fanout(env,url){await normalizeEditorialQueue(env);const type=classify(url);await env.DB.prepare(`INSERT INTO distribution_asset_state(asset_url,asset_type,first_seen_at,last_seen_at,distributed_at) VALUES(?,?,datetime('now'),datetime('now'),datetime('now')) ON CONFLICT(asset_url) DO UPDATE SET asset_type=excluded.asset_type,last_seen_at=datetime('now'),distributed_at=COALESCE(distribution_asset_state.distributed_at,datetime('now'))`).bind(url,type).run();const editorial=await prepareEditorial(env,url,type);await env.DB.prepare(`INSERT INTO distribution_events(event_id,event_type,status,asset_type,asset_id,destination_url,detail,observed_at,created_at) VALUES(?,?,?,?,?,?,?,datetime('now'),datetime('now'))`).bind(`asset_${crypto.randomUUID()}`,'asset_distribution_triggered','completed',type,url,url,`Event-driven fanout prepared: syndication feed exposure, Submission Engine eligibility, Vendor Amplification eligibility and ${editorial} internal editorial/community autonomy candidates. They do not enter Chairman Queue unless a genuine human-only gate is later proven.`).run();return {ok:true,asset_url:url,asset_type:type,editorialPrepared:editorial};}
async function scanNew(request,env){let r=null;const sitemapRequest=new Request(new URL('/sitemap.xml',request.url));try{r=await env.ASSETS.fetch(sitemapRequest.clone());}catch{}if(!r||!r.ok){try{r=await base.fetch(sitemapRequest.clone(),env,{waitUntil(){}});}catch{}}if(!r)return{ok:false,scanned:0,newAssets:0,reason:'sitemap_fetch_failed'};if(!r.ok)return{ok:false,scanned:0,newAssets:0,reason:`sitemap_http_${r.status}`};const xml=await r.text();const urls=[...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1]).filter(u=>/^https:\/\/trytoolscout\.org\//.test(u)&&/(best-|\-vs-|alternatives|compare)/i.test(u));let added=0;for(const url of urls.slice(0,150)){const row=await env.DB.prepare('SELECT asset_url FROM distribution_asset_state WHERE asset_url=?').bind(url).first();if(row)continue;await fanout(env,url);added++;}return{ok:true,scanned:urls.length,newAssets:added};}
export default {async fetch(request,env,ctx){const u=new URL(request.url);if(u.pathname==='/api/distribution/orchestrate'&&request.method==='POST'){if(!(await auth(request,env)))return Response.json({error:'unauthorized'},{status:401,headers:H});let b={};try{b=await request.json()}catch{return Response.json({error:'invalid_json'},{status:400,headers:H})}if(!b.asset_url||!/^https:\/\/trytoolscout\.org\//.test(String(b.asset_url)))return Response.json({error:'valid_toolscout_asset_url_required'},{status:400,headers:H});return Response.json(await runWithLedger(env,{engine:'distribution',mission:'asset_fanout',triggerName:'manual_api'},()=>fanout(env,String(b.asset_url))),{headers:H});}if(u.pathname==='/api/distribution/orchestrate/scan'&&request.method==='POST'){if(!(await auth(request,env)))return Response.json({error:'unauthorized'},{status:401,headers:H});return Response.json(await runWithLedger(env,{engine:'distribution',mission:'asset_scan',triggerName:'manual_api'},()=>scanNew(request,env)),{headers:H});}if(u.pathname==='/api/distribution/economic-learning'&&request.method==='POST'){if(!(await auth(request,env)))return Response.json({error:'unauthorized'},{status:401,headers:H});return Response.json(await runWithLedger(env,{engine:'distribution',mission:'economic_learning',triggerName:'manual_api'},()=>learnEconomics(env)),{headers:H});}if(u.pathname==='/api/growth/search-directives'&&request.method==='GET'){return Response.json(await publicSearchDirectives(env),{headers:{...H,'Cache-Control':'public, max-age=300','Access-Control-Allow-Origin':'*'}});}if(u.pathname==='/api/growth/rnd/audit'&&request.method==='POST'){if(!(await auth(request,env)))return Response.json({error:'unauthorized'},{status:401,headers:H});return Response.json(await runWithLedger(env,{engine:'growth',mission:'rnd_audit',triggerName:'manual_api'},()=>runGrowthRndAudit(env)),{headers:H});}if(u.pathname==='/api/growth/rnd'&&request.method==='GET'){if(!(await auth(request,env)))return Response.json({error:'unauthorized'},{status:401,headers:H});await ensureGrowthSchema(env);const q=await env.DB.prepare(`SELECT * FROM growth_rnd_experiments ORDER BY updated_at DESC LIMIT 100`).all();return Response.json({status:'connected',items:q.results||[]},{headers:H});}if(u.pathname==='/api/growth/opportunities/refresh'&&request.method==='POST'){if(!(await auth(request,env)))return Response.json({error:'unauthorized'},{status:401,headers:H});return Response.json(await runWithLedger(env,{engine:'growth',mission:'opportunity_coordination',triggerName:'manual_api'},()=>coordinateGrowthOpportunities(env)),{headers:H});}if(u.pathname==='/api/growth/opportunities'&&request.method==='GET'){if(!(await auth(request,env)))return Response.json({error:'unauthorized'},{status:401,headers:H});await ensureGrowthSchema(env);const q=await env.DB.prepare(`SELECT opportunity_key,subject_type,subject_key,priority_score,signal_json,action_json,status,last_evaluated_at FROM growth_opportunity_state WHERE status='active' ORDER BY priority_score DESC LIMIT 100`).all();return Response.json({status:'connected',items:q.results||[]},{headers:H});}if(u.pathname==='/api/distribution/editorial-queue'&&request.method==='GET'){if(!(await auth(request,env)))return Response.json({error:'unauthorized'},{status:401,headers:H});await normalizeEditorialQueue(env);const q=await env.DB.prepare(`SELECT queue_id,asset_url,channel_type,target_name,target_url,angle,suggested_title,suggested_body,status,human_required,updated_at FROM distribution_editorial_queue ORDER BY created_at DESC LIMIT 100`).all();return Response.json({status:'connected',items:q.results||[]},{headers:H});}return base.fetch(request,env,ctx);},async scheduled(event,env,ctx){await normalizeEditorialQueue(env);await runWithLedger(env,{engine:'distribution',mission:'economic_learning',triggerName:event?.cron||'scheduled'},()=>learnEconomics(env));if(event?.cron==='15 3 * * *'||humanSprintActive()){await runWithLedger(env,{engine:'growth',mission:'opportunity_coordination',triggerName:event?.cron||'scheduled'},()=>coordinateGrowthOpportunities(env));}if(event?.cron==='15 3 * * *'){await runWithLedger(env,{engine:'growth',mission:'rnd_audit',triggerName:event.cron},()=>runGrowthRndAudit(env));}if(base.scheduled)await base.scheduled(event,env,ctx);if(event?.cron==='15 3 * * *')await runWithLedger(env,{engine:'distribution',mission:'asset_scan',triggerName:event.cron},()=>scanNew(new Request('https://trytoolscout.org/'),env));}};
