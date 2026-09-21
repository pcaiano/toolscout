import base,{rebalanceDistributionPriorities} from './distribution-priority-worker.js';
import {distributionSurfaceMetrics} from './distribution-impact-worker.js';
import {runWithLedger} from './engine-run-ledger.js';
import { verifyBatch as auditVerifyCatalogBatch } from './catalog-autonomy-worker.js';
import {runGrowthSupervisorAudit,growthSupervisorSnapshot,growthSupervisorDirective} from './growth-supervisor.js';
import {syncExecutionContracts,reconcileExecutionContracts,reconcileExecutionDeadlines,claimExecutorTasks,markExecutorAttempt,verifySupervisorExecutorTasks,recordExecutionProof,deferExecutionTask,runExecutionIntegritySelfTest,executionContractSnapshot} from './growth-execution-contract.js';
import {runAutonomousDistributionCycle} from './distribution-autonomous-worker.js';
import {runDistributionNetworkCycle} from './distribution-network-worker.js';
import {runAffiliateCoverageCycle} from './affiliate-coverage-cycle-worker.js';
import {verifyBatch as contractVerifyCatalogBatch,admitTrustedCandidates as contractAdmitCatalogCandidates,executeCatalogGrowthTask,auditCatalogQualityBatch,catalogQualitySnapshot} from './catalog-autonomy-worker.js';
import {runContentSocialIntelligenceCycle,issueGrowthContentBrief} from './content-engine-intelligence-worker.js';
import {runVendorContactDiscovery} from './distribution-contact-worker.js';
import {auditArchitectureEscalations,publicEscalationCandidates,markEscalationEmailStatus,architectureEscalationSnapshot} from './growth-architecture-escalation.js';

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
function coordinatedGrowthPriority(subjectType,score,audienceStrategy){
  let priority=Math.max(0,Math.min(100,Number(score)||0));
  const apply=(mode)=>{
    if(subjectType==='surface')priority=Math.min(100,priority+(mode==='borrowed'?10:20));
    else if(subjectType==='tool')priority=Math.min(100,priority+(mode==='borrowed'?6:15));
    else if(subjectType==='news_update')priority=Math.min(100,priority+(mode==='borrowed'?3:12));
    else if(subjectType==='affiliate')priority=Math.min(priority,45);
    else if(['catalog_tool','catalog_category','catalog_gap','catalog_system'].includes(subjectType)&&priority<90)priority=Math.min(priority,55);
  };
  if(audienceStrategy?.borrowedFirst)apply('borrowed');
  if(humanSprintActive())apply('sprint');
  return Number(priority.toFixed(2));
}
const safe=(v,n=3000)=>String(v??'').slice(0,n);
async function auth(request,env){const t=(request.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');return Boolean(env.ADMIN_TOKEN&&t===env.ADMIN_TOKEN)}
const GROWTH_ESCALATION_HANDOFF_SHA256='54ed9bf169f84acd97387ebbb4f69c603606b074dccf2552c32e781f0a627178';
async function sha256Hex(v){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(v||'')));return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,'0')).join('')}
async function growthEscalationHandoffOk(request){const h=String(request.headers.get('X-ToolScout-Handoff')||'');return Boolean(h)&&(await sha256Hex(h))===GROWTH_ESCALATION_HANDOFF_SHA256}
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
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_growth_rnd_status ON growth_rnd_experiments(status,updated_at DESC)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS growth_asset_cache(
      path TEXT PRIMARY KEY,
      payload_json TEXT NOT NULL,
      source_generated_at TEXT,
      cached_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`)
  ]).catch(error=>{growthSchemaReady=null;throw error});
  return growthSchemaReady;
}
async function growthRows(env,sql){try{return (await env.DB.prepare(sql).all()).results||[]}catch{return[]}}
async function flushGrowthWrites(env,writes,chunkSize=40){
  for(let i=0;i<writes.length;i+=chunkSize)await env.DB.batch(writes.slice(i,i+chunkSize));
  return writes.length;
}
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
async function growthAssetJson(env,path,fallback){
  try{
    const r=await env.ASSETS.fetch(new Request('https://trytoolscout.org'+path));
    if(r.ok){
      const value=await r.json();
      try{
        const payload=JSON.stringify(value);
        if(payload.length<=800000){
          const generatedAt=value?.generatedAt||value?.generated_at||value?.updatedAt||value?.updated_at||value?.summary?.generatedAt||null;
          await env.DB.prepare(`INSERT INTO growth_asset_cache(path,payload_json,source_generated_at,cached_at,updated_at)
            VALUES(?,?,?,datetime('now'),datetime('now'))
            ON CONFLICT(path) DO UPDATE SET payload_json=excluded.payload_json,source_generated_at=excluded.source_generated_at,cached_at=datetime('now'),updated_at=datetime('now')
            WHERE growth_asset_cache.payload_json IS NOT excluded.payload_json
               OR growth_asset_cache.source_generated_at IS NOT excluded.source_generated_at`)
            .bind(path,payload,generatedAt==null?null:String(generatedAt)).run();
        }
      }catch{}
      return value;
    }
  }catch{}
  try{
    const row=await env.DB.prepare(`SELECT payload_json FROM growth_asset_cache WHERE path=? LIMIT 1`).bind(path).first();
    if(row?.payload_json)return JSON.parse(row.payload_json);
  }catch{}
  return fallback;
}
function assetAgeHours(value){
  const t=Date.parse(String(value||''));return Number.isFinite(t)?Math.max(0,(Date.now()-t)/3600000):Infinity;
}
async function coordinateGrowthOpportunities(env){
  await ensureGrowthSchema(env);
  await env.DB.prepare(`UPDATE engine_runs
    SET status='failed',completed_at=datetime('now'),detail='superseded_stale_growth_run',evidence_json='{"reason":"superseded_stale_growth_run"}',updated_at=datetime('now')
    WHERE engine='growth' AND mission='opportunity_coordination' AND status='running' AND started_at<datetime('now','-10 minutes')`).run().catch(()=>{});
  const growthWrites=[],activeKeys=[];
  const audienceStrategy=await audiencePhaseSnapshot(env);
  const supervisorRows=await growthRows(env,`SELECT engine,status,directive,directive_json FROM growth_supervisor_state`);
  const supervisor=new Map(supervisorRows.map(row=>{let config={};try{config=JSON.parse(row.directive_json||'{}')}catch{}return[String(row.engine),{status:row.status,directive:row.directive,config}]}));
  const distBoost=Math.max(0,Math.min(30,Number(supervisor.get('distribution')?.config?.priority_boost||0)));
  const seoBoost=Math.max(0,Math.min(30,Number(supervisor.get('seo_geo_aio')?.config?.priority_boost||0)));
  const backlinkConfig={...(supervisor.get('seo_geo_aio')?.config||{}),...(supervisor.get('distribution')?.config||{})};
  const backlinkAcquisition=Boolean(backlinkConfig.backlink_acquisition);
  const verifiedReferringDomains=Math.max(0,Number(backlinkConfig.verified_referring_domains||0));
  const backlinkBootstrapFloor=Math.max(0,Number(backlinkConfig.referring_domain_bootstrap_floor||0));
  const authorityUrgencyBoost=backlinkAcquisition?Math.min(22,(backlinkConfig.backlink_stagnating?14:0)+(backlinkConfig.backlink_throughput_gap?8:0)):0;
  const affiliateCap=Math.max(5,Math.min(45,Number(supervisor.get('affiliate')?.config?.priority_cap||45)));
  const catalogCap=Math.max(15,Math.min(55,Number(supervisor.get('catalog')?.config?.priority_cap||55)));
  const [surfaces,tools,affiliateRows,catalogRuntime,catalogCandidates,catalogGaps,newsCandidates,organicGrowth,gscSignals,aeoGeo,machineReadability,catalogFreshness,catalogHealth,toolProfileHolds,catalogEngine,catalogTools,softwareUpdates]=await Promise.all([
    growthRows(env,`SELECT o.surface_slug,o.surface_name,o.surface_type,o.status,o.distribution_score,o.backlink_value,
      EXISTS(SELECT 1 FROM distribution_placements bp WHERE bp.surface_slug=o.surface_slug AND bp.backlink_verified=1) backlink_verified,
      l.evidence_grade,l.browser_confirmed_sessions_30d,l.outbound_clicks_30d,l.monetized_outbound_30d,
      n.status network_status,n.adoption_kind,
      COALESCE(ra.route_actions,0) route_actions,
      COALESCE(ra.route_auto,0) route_auto,
      COALESCE(ra.route_content,0) route_content,
      COALESCE(ra.route_human,0) route_human,
      COALESCE(ra.route_auth,0) route_auth,
      COALESCE(ra.route_verified,0) route_verified,
      COALESCE(ra.route_stalled,0) route_stalled
      FROM distribution_opportunities o
      LEFT JOIN distribution_economic_learning l ON l.surface_slug=o.surface_slug
      LEFT JOIN distribution_network_outreach n ON n.surface_slug=o.surface_slug
      LEFT JOIN (
        SELECT surface_slug,COUNT(*) route_actions,
          SUM(CASE WHEN execution_mode='autonomous_qualification' AND status NOT IN ('policy_blocked','exhausted') THEN 1 ELSE 0 END) route_auto,
          SUM(CASE WHEN execution_mode='content_amplification' AND status NOT IN ('verified_human_impact','verified_placement','exhausted') THEN 1 ELSE 0 END) route_content,
          SUM(CASE WHEN status='human_action_required' THEN 1 ELSE 0 END) route_human,
          SUM(CASE WHEN status='auth_required' THEN 1 ELSE 0 END) route_auth,
          SUM(CASE WHEN status IN ('verified_human_impact','verified_placement') THEN 1 ELSE 0 END) route_verified,
          SUM(CASE WHEN status='stalled' THEN 1 ELSE 0 END) route_stalled
        FROM distribution_contact_route_actions GROUP BY surface_slug
      ) ra ON ra.surface_slug=o.surface_slug
      WHERE o.surface_slug IS NOT NULL AND o.surface_type!='publisher_contact_route' AND o.status NOT IN ('policy_blocked','rejected','skipped','unavailable_free')`),
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
  const inputFreshness={
    organicGrowth:{ageHours:assetAgeHours(organicGrowth?.generatedAt),fresh:false},
    gsc:{ageHours:assetAgeHours(gscSignals?.generatedAt),fresh:false},
    aeoGeo:{ageHours:assetAgeHours(aeoGeo?.generatedAt),fresh:false},
    machineReadability:{ageHours:assetAgeHours(machineReadability?.generatedAt),fresh:false},
    catalogFreshness:{ageHours:assetAgeHours(catalogFreshness?.generatedAt),fresh:false},
    catalogHealth:{ageHours:assetAgeHours(catalogHealth?.summary?.generatedAt||catalogHealth?.generatedAt),fresh:false},
    toolProfileHolds:{ageHours:assetAgeHours(toolProfileHolds?.generatedAt),fresh:false}
  };
  inputFreshness.organicGrowth.fresh=inputFreshness.organicGrowth.ageHours<=72;
  inputFreshness.gsc.fresh=inputFreshness.gsc.ageHours<=36;
  inputFreshness.aeoGeo.fresh=inputFreshness.aeoGeo.ageHours<=72;
  inputFreshness.machineReadability.fresh=inputFreshness.machineReadability.ageHours<=72;
  inputFreshness.catalogFreshness.fresh=inputFreshness.catalogFreshness.ageHours<=36;
  inputFreshness.catalogHealth.fresh=inputFreshness.catalogHealth.ageHours<=36;
  inputFreshness.toolProfileHolds.fresh=inputFreshness.toolProfileHolds.ageHours<=72;
  const searchOpportunities=inputFreshness.organicGrowth.fresh&&Array.isArray(organicGrowth?.opportunities)?organicGrowth.opportunities:[];
  const directGscPages=inputFreshness.gsc.fresh&&Array.isArray(gscSignals?.pages)?gscSignals.pages:[];
  const normalizedGscPages=directGscPages
    .filter(x=>Number(x?.impressions||0)>0)
    .map(x=>{
      let pathname='/';try{pathname=new URL(String(x?.page||'https://trytoolscout.org/')).pathname.replace(/\.html$/i,'')||'/'}catch{}
      const impressions=Math.max(0,Number(x?.impressions||0)),clicks=Math.max(0,Number(x?.clicks||0)),position=Math.max(0,Number(x?.position||0)),ctr=Math.max(0,Number(x?.ctr||0));
      const rankFactor=position>0&&position<=10?15:(position<=20?12:(position<=40?8:4));
      const demandFactor=Math.min(55,Math.log10(impressions+1)*25);
      const clickFactor=Math.min(15,clicks*8);
      let priority=Math.max(1,Math.min(100,Math.round(12+demandFactor+rankFactor+clickFactor)));
      if(impressions<3)priority=Math.min(priority,35);
      else if(impressions<5)priority=Math.min(priority,40);
      else if(impressions<10)priority=Math.min(priority,50);
      else if(impressions<20)priority=Math.min(priority,60);
      const evidenceConfidence=impressions>=20?'meaningful':(impressions>=10?'emerging':(impressions>=5?'directional':'low'));
      return{page:String(x?.page||''),pathname,clicks,impressions,ctr,position,topQueries:Array.isArray(x?.topQueries)?x.topQueries.slice(0,5):[],priority,evidenceConfidence};
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
  const criticalInputs={
    gsc:Boolean(gscSignals?.generatedAt&&Array.isArray(gscSignals?.pages)),
    catalogTools:Array.isArray(catalogTools)&&catalogTools.length>0,
    catalogEngine:Boolean(catalogEngine&&typeof catalogEngine==='object')
  };
  if(!criticalInputs.gsc||!criticalInputs.catalogTools||!criticalInputs.catalogEngine){
    return {ok:false,reason:'critical_growth_asset_unavailable',criticalInputs,
      gscSnapshot:{generatedAt:gscSignals?.generatedAt||null,startDate:gscSignals?.startDate||null,endDate:gscSignals?.endDate||null,pages:Array.isArray(gscSignals?.pages)?gscSignals.pages.length:0},
      preservedExistingOpportunities:true};
  }
  let active=0,toolCount=0,surfaceCount=0,searchCount=0,affiliateCount=0,catalogCount=0,newsCount=0;
  for(const row of surfaces){
    const evidence=String(row.evidence_grade||'none');
    const network=String(row.network_status||'');
    const externalSurface=!['rss','toolscout-ard','toolscout-machine-discovery','indexnow'].includes(String(row.surface_slug||''));
    const backlinkVerified=Number(row.backlink_verified||0)>0;
    const backlinkSurfaceBoost=backlinkAcquisition&&externalSurface&&!backlinkVerified?Math.min(20,Math.max(4,Number(row.backlink_value||0)*0.2)):0;
    const score=Math.min(100,Math.max(0,Number(row.distribution_score||0)
      +(GROWTH_EVIDENCE_RANK[evidence]||0)*4
      +(network==='contact_route_found'?4:0)+(network==='contact_found'?7:0)+(network==='sent'?10:0)+(network==='adopted'?18:0)
      +(audienceStrategy.borrowedFirst?15:0)+distBoost+backlinkSurfaceBoost+authorityUrgencyBoost));
    const actions=['distribution_measurement'];
    if(backlinkAcquisition&&externalSurface&&['live','verified'].includes(String(row.status||''))&&!backlinkVerified)actions.unshift('verify_backlink_acquisition');
    if(!network||network==='queued'||network==='send_failed')actions.unshift('publisher_contact_discovery');
    if(network==='contact_route_found'&&Number(row.route_actions||0)>0)actions.unshift('execute_alternate_routes');
    if(Number(row.route_content||0)>0)actions.unshift('content_relevance_amplification');
    if(Number(row.route_auto||0)>0)actions.unshift('autonomous_route_qualification');
    if(Number(row.route_auth||0)>0)actions.unshift('resolve_supported_route_auth');
    if(Number(row.route_human||0)>0)actions.unshift('surface_only_true_human_route_gate');
    if(Number(row.route_stalled||0)>0)actions.unshift('repair_stalled_route_execution');
    if(network==='contact_found')actions.unshift('publisher_outreach');
    if(network==='adopted'||Number(row.route_verified||0)>0)actions.unshift('scale_proven_surface');
    const signals={surface_status:row.status,network_status:network||null,evidence_grade:evidence,browser_confirmed_sessions_30d:Number(row.browser_confirmed_sessions_30d||0),outbound_clicks_30d:Number(row.outbound_clicks_30d||0),monetized_outbound_30d:Number(row.monetized_outbound_30d||0),adoption_kind:row.adoption_kind||null,alternate_routes:Number(row.route_actions||0),alternate_routes_autonomous:Number(row.route_auto||0),alternate_routes_content:Number(row.route_content||0),alternate_routes_human:Number(row.route_human||0),alternate_routes_auth:Number(row.route_auth||0),alternate_routes_verified:Number(row.route_verified||0),alternate_routes_stalled:Number(row.route_stalled||0),audience_strategy:audienceStrategy.phase,acquisition_mode:'borrowed_audience',borrowed_first_boost:audienceStrategy.borrowedFirst?15:0,backlink_acquisition:backlinkAcquisition,backlink_value:Number(row.backlink_value||0),backlink_verified:backlinkVerified,backlink_priority_boost:Number((backlinkSurfaceBoost+authorityUrgencyBoost).toFixed(2)),backlink_quality_only:true,backlink_throughput_gap:Boolean(backlinkConfig.backlink_throughput_gap),backlink_stagnating:Boolean(backlinkConfig.backlink_stagnating),authority_urgency_boost:authorityUrgencyBoost};
    growthWrites.push(env.DB.prepare(`INSERT INTO growth_opportunity_state(opportunity_key,subject_type,subject_key,priority_score,signal_json,action_json,status,first_seen_at,last_evaluated_at,updated_at)
      VALUES(?,?,?,?,?,?,'active',datetime('now'),datetime('now'),datetime('now'))
      ON CONFLICT(opportunity_key) DO UPDATE SET priority_score=excluded.priority_score,signal_json=excluded.signal_json,action_json=excluded.action_json,status='active',last_evaluated_at=datetime('now'),updated_at=datetime('now')
      WHERE growth_opportunity_state.priority_score IS NOT excluded.priority_score
         OR growth_opportunity_state.signal_json IS NOT excluded.signal_json
         OR growth_opportunity_state.action_json IS NOT excluded.action_json
         OR growth_opportunity_state.status IS NOT 'active'`).bind(`surface:${row.surface_slug}`,'surface',row.surface_slug,coordinatedGrowthPriority('surface',score,audienceStrategy),JSON.stringify(signals),JSON.stringify(actions)));activeKeys.push(`surface:${row.surface_slug}`);
    active++;surfaceCount++;
  }
  for(const row of tools){
    const profile=String(row.profile_status||'')==='verified';
    const affiliate=Number(row.organic_social_allowed)===1&&Number(row.direct_affiliate_link_allowed)===1;
    const vendor=String(row.vendor_status||'');
    const toolSlug=String(row.tool_slug||'').toLowerCase(),searchBoost=Number(searchBoostByTool.get(toolSlug)||0),newsBoost=Number(newsByTool.get(toolSlug)||0);
    const backlinkBoost=backlinkAcquisition?Math.min(18,8+Math.max(0,searchBoost)*0.35):0;
    const score=Math.min(100,Math.max(0,Number(row.priority_score||0)+(profile?8:0)+(affiliate?12:0)+(vendor==='contact_found'?6:0)+(vendor==='sent'?10:0)+searchBoost+newsBoost+(audienceStrategy.borrowedFirst?10:0)+distBoost+backlinkBoost+authorityUrgencyBoost));
    const actions=[];
    const vendorExecutable=!['needs_contact_fallback','fallback_exhausted'].includes(vendor);
    if(vendorExecutable&&backlinkAcquisition)actions.push('backlink_reference_outreach');
    if(vendorExecutable)actions.push('vendor_amplification');
    if(profile)actions.push('content_mention');
    if(affiliate)actions.push('affiliate_social');
    if(!actions.length)continue;
    const signals={vendor_status:vendor,vendor_execution_available:vendorExecutable,verified_social_profile:profile,affiliate_social_allowed:affiliate,search_priority_boost:Number(searchBoost.toFixed(2)),news_priority_boost:Number(newsBoost.toFixed(2)),asset_url:row.asset_url||null,policy_status:row.policy_status||null,audience_strategy:audienceStrategy.phase,acquisition_mode:'vendor_borrowed_audience',borrowed_first_boost:audienceStrategy.borrowedFirst?10:0,backlink_acquisition:backlinkAcquisition,backlink_quality_only:true,verified_referring_domains:verifiedReferringDomains,referring_domain_bootstrap_floor:backlinkBootstrapFloor,backlink_priority_boost:Number((backlinkBoost+authorityUrgencyBoost).toFixed(2)),backlink_throughput_gap:Boolean(backlinkConfig.backlink_throughput_gap),backlink_stagnating:Boolean(backlinkConfig.backlink_stagnating),authority_urgency_boost:authorityUrgencyBoost,paid_links_allowed:false,reciprocal_links_required:false};
    growthWrites.push(env.DB.prepare(`INSERT INTO growth_opportunity_state(opportunity_key,subject_type,subject_key,priority_score,signal_json,action_json,status,first_seen_at,last_evaluated_at,updated_at)
      VALUES(?,?,?,?,?,?,'active',datetime('now'),datetime('now'),datetime('now'))
      ON CONFLICT(opportunity_key) DO UPDATE SET priority_score=excluded.priority_score,signal_json=excluded.signal_json,action_json=excluded.action_json,status='active',last_evaluated_at=datetime('now'),updated_at=datetime('now')
      WHERE growth_opportunity_state.priority_score IS NOT excluded.priority_score
         OR growth_opportunity_state.signal_json IS NOT excluded.signal_json
         OR growth_opportunity_state.action_json IS NOT excluded.action_json
         OR growth_opportunity_state.status IS NOT 'active'`).bind(`tool:${row.tool_slug}`,'tool',row.tool_slug,coordinatedGrowthPriority('tool',score,audienceStrategy),JSON.stringify(signals),JSON.stringify(actions)));activeKeys.push(`tool:${row.tool_slug}`);
    active++;toolCount++;
  }
  const affiliateStateWeight={research_required:18,program_exists:28,ready_to_apply:42,human_action_required:46,submitted:24,pending_review:24,approved_needs_link:72,link_acquired:88,active:52,verified:8,earning:4,rejected:2,watchlist:3,paused:2,blocked:18,no_program_found:1};
  for(const row of affiliateRows){
    const slug=String(row.tool_slug||'').toLowerCase();if(!slug)continue;
    const state=String(row.status||'research_required'),unmonetized=Math.max(0,Number(row.unmonetized_30d||0)),outbound=Math.max(0,Number(row.outbound_30d||0)),monetized=Math.max(0,Number(row.monetized_30d||0));
    const searchBoost=Number(searchBoostByTool.get(slug)||0);
    const leakageBoost=Math.min(40,unmonetized*8+Math.max(0,outbound-monetized)*2);
    const score=Math.min(affiliateCap,Math.max(0,Number(affiliateStateWeight[state]||10)+leakageBoost+searchBoost));
    const actions=[];
    if(state==='research_required'||state==='program_exists')actions.push('discover_and_qualify_affiliate_program');
    if(state==='ready_to_apply'||state==='human_action_required')actions.push('prepare_affiliate_application_pack','surface_only_true_human_gate');
    if(state==='submitted'||state==='pending_review')actions.push('monitor_affiliate_decision');
    if(state==='approved_needs_link')actions.push('capture_approved_referral_link');
    if(state==='link_acquired')actions.push('activate_affiliate_route');
    if(state==='active')actions.push('production_verify_affiliate_route');
    if(state==='verified'||state==='earning')actions.push('measure_affiliate_yield');
    if(state==='blocked'||state==='rejected'||state==='paused')actions.push('monitor_retry_evidence');
    if(state==='no_program_found'||state==='watchlist')actions.push('recheck_affiliate_program_on_evidence_or_cadence');
    if(!actions.length)actions.push('reconcile_affiliate_state');
    const signals={affiliate_status:state,network:row.network||null,blocker:row.blocker||null,outbound_30d:outbound,unmonetized_outbound_30d:unmonetized,monetized_outbound_30d:monetized,search_priority_boost:Number(searchBoost.toFixed(2)),application_url:row.application_url||null,affiliate_url_present:Boolean(row.affiliate_url),updated_at:row.updated_at||null};
    growthWrites.push(env.DB.prepare(`INSERT INTO growth_opportunity_state(opportunity_key,subject_type,subject_key,priority_score,signal_json,action_json,status,first_seen_at,last_evaluated_at,updated_at)
      VALUES(?,?,?,?,?,?,'active',datetime('now'),datetime('now'),datetime('now'))
      ON CONFLICT(opportunity_key) DO UPDATE SET priority_score=excluded.priority_score,signal_json=excluded.signal_json,action_json=excluded.action_json,status='active',last_evaluated_at=datetime('now'),updated_at=datetime('now')
      WHERE growth_opportunity_state.priority_score IS NOT excluded.priority_score
         OR growth_opportunity_state.signal_json IS NOT excluded.signal_json
         OR growth_opportunity_state.action_json IS NOT excluded.action_json
         OR growth_opportunity_state.status IS NOT 'active'`).bind(`affiliate:${slug}`,'affiliate',slug,coordinatedGrowthPriority('affiliate',score,audienceStrategy),JSON.stringify(signals),JSON.stringify(actions)));activeKeys.push(`affiliate:${slug}`);
    active++;affiliateCount++;
  }

  const runtimeStateBySlug=new Map((catalogRuntime||[]).map(x=>[String(x.tool_slug||'').toLowerCase(),x]));
  const runtimeCandidateSet=new Set((catalogCandidates||[]).filter(x=>['published','admitted_coverage'].includes(x.status)).map(x=>String(x.tool_slug||'').toLowerCase()));
  const runtimeGapMap=new Map((catalogGaps||[]).map(x=>[String(x.tool_slug||'').toLowerCase(),x]));
  const catalogBySlug=new Map((Array.isArray(catalogTools)?catalogTools:[]).map(x=>[String(x?.slug||'').toLowerCase(),x]));
  const changed=new Map((inputFreshness.catalogFreshness.fresh&&Array.isArray(catalogFreshness?.contentChanges)?catalogFreshness.contentChanges:[]).map(x=>[String(x?.slug||'').toLowerCase(),x]));
  const quarantined=new Map((inputFreshness.catalogFreshness.fresh&&Array.isArray(catalogFreshness?.quarantined)?catalogFreshness.quarantined:[]).map(x=>[String(x?.slug||'').toLowerCase(),x]));
  const healthBySlug=new Map((inputFreshness.catalogHealth.fresh&&Array.isArray(catalogHealth?.tools)?catalogHealth.tools:[]).map(x=>[String(x?.slug||'').toLowerCase(),x]));
  const heldBySlug=new Map((inputFreshness.toolProfileHolds.fresh&&Array.isArray(toolProfileHolds?.items)?toolProfileHolds.items:[]).map(x=>[String(x?.slug||'').toLowerCase(),x]));
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
    score=Math.min(catalogCap,score+searchBoost);
    const runtime=runtimeStateBySlug.get(slug)||null;if(runtime?.quality_status==='change_detected'){score+=34;actions.push('verify_changed_catalog_facts','refresh_profile_if_confirmed')}if(runtime?.quality_status==='confirmed_broken'){score+=45;actions.push('suppress_unverifiable_profile')}if(runtimeCandidateSet.has(slug)){score+=8;actions.push('monitor_runtime_coverage_profile')}
    if(searchBoost>0)actions.push('refresh_catalog_profile_for_observed_search_demand');
    if(!actions.length)continue;
    const signals={tool_name:tool?.name||h?.name||slug,category:tool?.category||null,content_changed:Boolean(change)||runtime?.quality_status==='change_detected',quarantined:Boolean(quarantine)||runtime?.quality_status==='confirmed_broken',needs_weekly_review:Boolean(h?.needsWeeklyReview),overdue:Boolean(h?.overdue),missing_critical:Array.isArray(h?.missingCritical)?h.missingCritical:[],profile_hold:hold?.reason||null,source_status:runtime?.source_status||h?.source?.status||change?.sourceStatus||null,source_http_status:runtime?.http_status||h?.source?.httpStatus||change?.httpStatus||null,runtime_quality_status:runtime?.quality_status||null,runtime_last_checked_at:runtime?.last_checked_at||null,runtime_candidate:runtimeCandidateSet.has(slug),search_priority_boost:Number(searchBoost.toFixed(2)),freshness_report_generated_at:catalogFreshness?.generatedAt||null,catalog_health_generated_at:catalogHealth?.summary?.generatedAt||null};
    growthWrites.push(env.DB.prepare(`INSERT INTO growth_opportunity_state(opportunity_key,subject_type,subject_key,priority_score,signal_json,action_json,status,first_seen_at,last_evaluated_at,updated_at)
      VALUES(?,?,?,?,?,?,'active',datetime('now'),datetime('now'),datetime('now'))
      ON CONFLICT(opportunity_key) DO UPDATE SET priority_score=excluded.priority_score,signal_json=excluded.signal_json,action_json=excluded.action_json,status='active',last_evaluated_at=datetime('now'),updated_at=datetime('now')
      WHERE growth_opportunity_state.priority_score IS NOT excluded.priority_score
         OR growth_opportunity_state.signal_json IS NOT excluded.signal_json
         OR growth_opportunity_state.action_json IS NOT excluded.action_json
         OR growth_opportunity_state.status IS NOT 'active'`).bind(`catalog-tool:${slug}`,'catalog_tool',slug,coordinatedGrowthPriority('catalog_tool',score,audienceStrategy),JSON.stringify(signals),JSON.stringify([...new Set(actions)])));activeKeys.push(`catalog-tool:${slug}`);
    active++;catalogCount++;
  }
  for(const gap of inputFreshness.catalogFreshness.fresh&&Array.isArray(catalogFreshness?.coverage)?catalogFreshness.coverage:[]){
    const category=String(gap?.category||'').trim();const missing=Math.max(0,Number(gap?.gap||0));if(!category||missing<=0)continue;
    const score=Math.min(100,35+missing*9+Math.min(15,Number(gap?.intentSurfaces||0)*1.5));
    const signals={category,current_tools:Number(gap?.tools||0),target:Number(gap?.target||0),gap:missing,intent_surfaces:Number(gap?.intentSurfaces||0),catalog_entry_does_not_imply_ranking:true,affiliate_neutral:true,freshness_report_generated_at:catalogFreshness?.generatedAt||null};
    const actions=['discover_catalog_candidates','verify_first_party_sources','admit_only_after_quality_gates'];
    growthWrites.push(env.DB.prepare(`INSERT INTO growth_opportunity_state(opportunity_key,subject_type,subject_key,priority_score,signal_json,action_json,status,first_seen_at,last_evaluated_at,updated_at)
      VALUES(?,?,?,?,?,?,'active',datetime('now'),datetime('now'),datetime('now'))
      ON CONFLICT(opportunity_key) DO UPDATE SET priority_score=excluded.priority_score,signal_json=excluded.signal_json,action_json=excluded.action_json,status='active',last_evaluated_at=datetime('now'),updated_at=datetime('now')
      WHERE growth_opportunity_state.priority_score IS NOT excluded.priority_score
         OR growth_opportunity_state.signal_json IS NOT excluded.signal_json
         OR growth_opportunity_state.action_json IS NOT excluded.action_json
         OR growth_opportunity_state.status IS NOT 'active'`).bind(`catalog-category:${category}`,'catalog_category',category,coordinatedGrowthPriority('catalog_category',score,audienceStrategy),JSON.stringify(signals),JSON.stringify(actions)));activeKeys.push(`catalog-category:${category}`);
    active++;catalogCount++;
  }
  for(const [slug,gap] of runtimeGapMap){
    if(!slug||String(gap?.status||'')!=='research_required')continue;
    const signalsCount=Math.max(0,Number(gap?.signals||0)),score=Math.min(100,28+signalsCount*10);
    let sources=[];try{sources=JSON.parse(gap?.sources_json||'[]')}catch{}
    const signals={market_signals:signalsCount,market_sources:sources,first_party_profile_required:true,affiliate_neutral:true,updated_at:gap?.updated_at||null};
    growthWrites.push(env.DB.prepare(`INSERT INTO growth_opportunity_state(opportunity_key,subject_type,subject_key,priority_score,signal_json,action_json,status,first_seen_at,last_evaluated_at,updated_at)
      VALUES(?,?,?,?,?,?,'active',datetime('now'),datetime('now'),datetime('now'))
      ON CONFLICT(opportunity_key) DO UPDATE SET priority_score=excluded.priority_score,signal_json=excluded.signal_json,action_json=excluded.action_json,status='active',last_evaluated_at=datetime('now'),updated_at=datetime('now')
      WHERE growth_opportunity_state.priority_score IS NOT excluded.priority_score
         OR growth_opportunity_state.signal_json IS NOT excluded.signal_json
         OR growth_opportunity_state.action_json IS NOT excluded.action_json
         OR growth_opportunity_state.status IS NOT 'active'`).bind(`catalog-gap:${slug}`,'catalog_gap',slug,coordinatedGrowthPriority('catalog_gap',score,audienceStrategy),JSON.stringify(signals),JSON.stringify(['research_first_party_candidate_profile','verify_official_source','admit_only_after_quality_gates'])));activeKeys.push(`catalog-gap:${slug}`);
    active++;catalogCount++;
  }

  const freshnessDays=Math.max(1,Number(catalogEngine?.cadence?.freshnessTargetDays||7));
  const freshnessMs=freshnessDays*86400000;
  const freshnessEpoch=Math.floor(nowMs/freshnessMs);
  for(const tool of Array.isArray(catalogTools)?catalogTools:[]){
    const slug=String(tool?.slug||'').toLowerCase();if(!slug)continue;
    const runtime=runtimeStateBySlug.get(slug)||null;
    const checkedAt=Date.parse(String(runtime?.last_checked_at||'').replace(' ','T')+'Z');
    const ageDays=Number.isFinite(checkedAt)?Math.max(0,(nowMs-checkedAt)/86400000):999;
    if(Number.isFinite(checkedAt)&&nowMs-checkedAt<freshnessMs)continue;
    const score=Math.min(catalogCap,Math.max(25,38+Math.min(17,Math.floor(Math.max(0,ageDays-freshnessDays)))));
    const opportunityKey=`catalog-freshness:${slug}:${freshnessEpoch}`;
    const signals={tool_name:tool?.name||slug,category:tool?.category||null,last_checked_at:runtime?.last_checked_at||null,age_bucket_days:Number.isFinite(ageDays)?Math.floor(ageDays):null,target_days:freshnessDays,reason:'Runtime first-party verification is due or missing.',runtime_freshness_contract:true};
    growthWrites.push(env.DB.prepare(`INSERT INTO growth_opportunity_state(opportunity_key,subject_type,subject_key,priority_score,signal_json,action_json,status,first_seen_at,last_evaluated_at,updated_at)
      VALUES(?,?,?,?,?,?,'active',datetime('now'),datetime('now'),datetime('now'))
      ON CONFLICT(opportunity_key) DO UPDATE SET priority_score=excluded.priority_score,signal_json=excluded.signal_json,action_json=excluded.action_json,status='active',last_evaluated_at=datetime('now'),updated_at=datetime('now')
      WHERE growth_opportunity_state.priority_score IS NOT excluded.priority_score
         OR growth_opportunity_state.signal_json IS NOT excluded.signal_json
         OR growth_opportunity_state.action_json IS NOT excluded.action_json
         OR growth_opportunity_state.status IS NOT 'active'`).bind(opportunityKey,'catalog_tool',slug,coordinatedGrowthPriority('catalog_tool',score,audienceStrategy),JSON.stringify(signals),JSON.stringify(['verify_first_party_sources'])));
    activeKeys.push(opportunityKey);active++;catalogCount++;
  }

  for(const item of Array.isArray(softwareUpdates?.items)?softwareUpdates.items:[]){
    const id=String(item?.id||'').trim(),slug=String(item?.toolSlug||'').toLowerCase();if(!id)continue;
    const t=Date.parse(item?.publishedAt||''),ageDays=Number.isFinite(t)?Math.max(0,(Date.now()-t)/86400000):30,ageBucketDays=Math.floor(ageDays),recency=Math.max(0,25-Math.min(25,ageBucketDays*3)),searchBoost=Number(searchBoostByTool.get(slug)||0);
    const score=Math.min(100,35+recency+searchBoost+(slug?8:0));
    const actions=['catalog_impact_review','search_update_angle','content_amplification','distribution_amplification'];
    const signals={tool_slug:slug||null,title:item?.title||null,source_url:item?.sourceUrl||null,article_url:item?.articleUrl||null,published_at:item?.publishedAt||null,partner_update:Boolean(item?.partnerUpdate),search_priority_boost:Number(searchBoost.toFixed(2)),verified_source:true};
    growthWrites.push(env.DB.prepare(`INSERT INTO growth_opportunity_state(opportunity_key,subject_type,subject_key,priority_score,signal_json,action_json,status,first_seen_at,last_evaluated_at,updated_at)
      VALUES(?,?,?,?,?,?,'active',datetime('now'),datetime('now'),datetime('now'))
      ON CONFLICT(opportunity_key) DO UPDATE SET priority_score=excluded.priority_score,signal_json=excluded.signal_json,action_json=excluded.action_json,status='active',last_evaluated_at=datetime('now'),updated_at=datetime('now')
      WHERE growth_opportunity_state.priority_score IS NOT excluded.priority_score
         OR growth_opportunity_state.signal_json IS NOT excluded.signal_json
         OR growth_opportunity_state.action_json IS NOT excluded.action_json
         OR growth_opportunity_state.status IS NOT 'active'`).bind(`news:${id}`,'news_update',slug||id,coordinatedGrowthPriority('news_update',score,audienceStrategy),JSON.stringify(signals),JSON.stringify(actions)));activeKeys.push(`news:${id}`);
    active++;newsCount++;
  }
  for(const item of newsCandidates||[]){
    const id=String(item?.candidate_id||'').trim(),slug=String(item?.tool_slug||'').toLowerCase();if(!id)continue;
    const score=Math.min(100,40+Math.max(0,Number(item?.materiality_score||0))*0.5+Number(searchBoostByTool.get(slug)||0));
    const actions=['verify_news_materiality','catalog_impact_review','search_update_angle','prepare_whats_new_candidate'];
    const signals={tool_slug:slug||null,title:item?.title||null,summary:item?.summary||null,source_url:item?.source_url||null,status:item?.status||null,detected_at:item?.detected_at||null};
    growthWrites.push(env.DB.prepare(`INSERT INTO growth_opportunity_state(opportunity_key,subject_type,subject_key,priority_score,signal_json,action_json,status,first_seen_at,last_evaluated_at,updated_at)
      VALUES(?,?,?,?,?,?,'active',datetime('now'),datetime('now'),datetime('now'))
      ON CONFLICT(opportunity_key) DO UPDATE SET priority_score=excluded.priority_score,signal_json=excluded.signal_json,action_json=excluded.action_json,status='active',last_evaluated_at=datetime('now'),updated_at=datetime('now')
      WHERE growth_opportunity_state.priority_score IS NOT excluded.priority_score
         OR growth_opportunity_state.signal_json IS NOT excluded.signal_json
         OR growth_opportunity_state.action_json IS NOT excluded.action_json
         OR growth_opportunity_state.status IS NOT 'active'`).bind(`news-candidate:${id}`,'news_update',slug||id,coordinatedGrowthPriority('news_update',score,audienceStrategy),JSON.stringify(signals),JSON.stringify(actions)));activeKeys.push(`news-candidate:${id}`);
    active++;newsCount++;
  }

  for(const op of searchOpportunities.slice(0,40)){
    const intent=String(op?.intent||'').trim();if(!intent)continue;
    const priority=Math.max(0,Math.min(100,Number(op?.priorityScore||0)+(audienceStrategy.borrowedFirst?15:0)+seoBoost));
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
      aeo_geo_failures:inputFreshness.aeoGeo.fresh?Number(aeoGeo?.failures||0):null,
      aeo_geo_warnings:inputFreshness.aeoGeo.fresh?Number(aeoGeo?.warnings||0):null,
      machine_readability_failures:inputFreshness.machineReadability.fresh?Number(machineReadability?.failures||0):null,
      machine_readability_warnings:inputFreshness.machineReadability.fresh?Number(machineReadability?.warnings||0):null,
      organic_report_generated_at:organicGrowth?.generatedAt||null,
      audience_strategy:audienceStrategy.phase,
      acquisition_mode:'existing_demand_search',
      borrowed_first_boost:audienceStrategy.borrowedFirst?15:0
    };
    growthWrites.push(env.DB.prepare(`INSERT INTO growth_opportunity_state(opportunity_key,subject_type,subject_key,priority_score,signal_json,action_json,status,first_seen_at,last_evaluated_at,updated_at)
      VALUES(?,?,?,?,?,?,'active',datetime('now'),datetime('now'),datetime('now'))
      ON CONFLICT(opportunity_key) DO UPDATE SET priority_score=excluded.priority_score,signal_json=excluded.signal_json,action_json=excluded.action_json,status='active',last_evaluated_at=datetime('now'),updated_at=datetime('now')
      WHERE growth_opportunity_state.priority_score IS NOT excluded.priority_score
         OR growth_opportunity_state.signal_json IS NOT excluded.signal_json
         OR growth_opportunity_state.action_json IS NOT excluded.action_json
         OR growth_opportunity_state.status IS NOT 'active'`).bind(`search:${intent}`,'search',intent,coordinatedGrowthPriority('search',priority,audienceStrategy),JSON.stringify(signals),JSON.stringify(actions)));activeKeys.push(`search:${intent}`);
    active++;searchCount++;
  }
  for(const row of normalizedGscPages){
    const key=row.pathname==='/'?'home':row.pathname;
    const actions=['search_measurement'];
    if(row.position>20&&row.impressions>=20)actions.unshift('content_amplification','distribution_amplification','deepen_existing_search_asset');
    else if(row.position>10&&row.position<=20&&row.impressions>=10)actions.unshift('content_amplification','distribution_amplification','strengthen_internal_links');
    else if(row.position>0&&row.position<=10&&row.impressions>=10)actions.unshift('protect_current_ranking','improve_click_capture');
    else if(row.position>0&&row.position<=20)actions.unshift('observe_low_sample_ranking');
    const signals={
      lane:row.impressions<10&&row.position>0&&row.position<=20?'seo_low_sample_observation':(row.position>20?'seo_authority_depth':(row.position>10?'seo_striking_distance':(row.position>0?'seo_first_page':'seo_measure'))),
      action:row.impressions<10&&row.position>0&&row.position<=20?'measure_low_sample':(row.position>20?'deepen_existing':(row.position>10?'strengthen_existing':(row.position>0?'protect_and_improve_ctr':'measure'))),
      evidence_confidence:row.evidenceConfidence,
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
      north_star:HUMAN_ACQUISITION_SPRINT.northStar,
      audience_strategy:audienceStrategy.phase,
      acquisition_mode:'existing_demand_search'
    };
    const meaningful=row.impressions>=20||row.clicks>0;
    const basePriority=Math.min(100,(audienceStrategy.borrowedFirst?row.priority+(meaningful?10:2):row.priority)+seoBoost);
    const priority=humanSprintActive()?Math.min(100,basePriority+(meaningful?10:2)):basePriority;
    growthWrites.push(env.DB.prepare(`INSERT INTO growth_opportunity_state(opportunity_key,subject_type,subject_key,priority_score,signal_json,action_json,status,first_seen_at,last_evaluated_at,updated_at)
      VALUES(?,?,?,?,?,?,'active',datetime('now'),datetime('now'),datetime('now'))
      ON CONFLICT(opportunity_key) DO UPDATE SET priority_score=excluded.priority_score,signal_json=excluded.signal_json,action_json=excluded.action_json,status='active',last_evaluated_at=datetime('now'),updated_at=datetime('now')
      WHERE growth_opportunity_state.priority_score IS NOT excluded.priority_score
         OR growth_opportunity_state.signal_json IS NOT excluded.signal_json
         OR growth_opportunity_state.action_json IS NOT excluded.action_json
         OR growth_opportunity_state.status IS NOT 'active'`).bind(`gsc-page:${key}`,'search',row.pathname,coordinatedGrowthPriority('search',priority,audienceStrategy),JSON.stringify(signals),JSON.stringify(actions)));activeKeys.push(`gsc-page:${key}`);
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
      growthWrites.push(env.DB.prepare(`INSERT INTO growth_opportunity_state(opportunity_key,subject_type,subject_key,priority_score,signal_json,action_json,status,first_seen_at,last_evaluated_at,updated_at)
        VALUES(?,?,?,?,?,?,'active',datetime('now'),datetime('now'),datetime('now'))
        ON CONFLICT(opportunity_key) DO UPDATE SET priority_score=excluded.priority_score,signal_json=excluded.signal_json,action_json=excluded.action_json,status='active',last_evaluated_at=datetime('now'),updated_at=datetime('now')
      WHERE growth_opportunity_state.priority_score IS NOT excluded.priority_score
         OR growth_opportunity_state.signal_json IS NOT excluded.signal_json
         OR growth_opportunity_state.action_json IS NOT excluded.action_json
         OR growth_opportunity_state.status IS NOT 'active'`).bind(`sprint-search:${target.key}`,'search',target.path,coordinatedGrowthPriority('search',Math.min(100,target.priority+seoBoost),audienceStrategy),JSON.stringify(signals),JSON.stringify(actions)));activeKeys.push(`sprint-search:${target.key}`);
      active++;searchCount++;
    }
  }
  await flushGrowthWrites(env,growthWrites,40);
  try{
    const activeSet=new Set(activeKeys);
    const currentActive=await env.DB.prepare(`SELECT opportunity_key FROM growth_opportunity_state WHERE status='active'`).all();
    const stale=(currentActive.results||[]).map(row=>String(row.opportunity_key||'')).filter(key=>key&&!activeSet.has(key));
    for(let i=0;i<stale.length;i+=40){
      await env.DB.batch(stale.slice(i,i+40).map(key=>env.DB.prepare(`UPDATE growth_opportunity_state SET status='dormant',updated_at=datetime('now') WHERE opportunity_key=? AND status='active'`).bind(key)));
    }
  }catch{}
  const actualTypeRows=await growthRows(env,`SELECT subject_type,COUNT(*) n FROM growth_opportunity_state WHERE status='active' GROUP BY subject_type`);
  const actualTypeCounts=Object.fromEntries(actualTypeRows.map(row=>[String(row.subject_type||''),Number(row.n||0)]));
  surfaceCount=actualTypeCounts.surface||0;
  toolCount=actualTypeCounts.tool||0;
  affiliateCount=actualTypeCounts.affiliate||0;
  newsCount=actualTypeCounts.news_update||0;
  searchCount=actualTypeCounts.search||0;
  catalogCount=Object.entries(actualTypeCounts).filter(([type])=>type.startsWith('catalog')).reduce((sum,[,n])=>sum+Number(n||0),0);
  active=Object.values(actualTypeCounts).reduce((sum,n)=>sum+Number(n||0),0);
    await env.DB.prepare(`INSERT INTO distribution_events(event_id,event_type,status,asset_type,detail,observed_at,created_at) VALUES(?,?,?,?,?,datetime('now'),datetime('now'))`)
    .bind(`growthcoord_${crypto.randomUUID()}`,'growth_opportunity_coordination','completed','growth_system',`Autonomous growth coordinator refreshed ${active} active opportunities: ${surfaceCount} distribution surfaces, ${toolCount} tool/vendor, ${affiliateCount} affiliate, ${catalogCount} catalog/quality, ${newsCount} What's New and ${searchCount} Search/GEO/AEO opportunities. Audience phase: ${audienceStrategy.phase}. 30d strict sessions: ${audienceStrategy.strictVerifiedHumanSessions30d??'unavailable'}; proven external acquisition sources: ${audienceStrategy.provenExternalSources30d??'unavailable'}. Existing demand, external distribution and vendor borrowed audiences remain the primary acquisition engine. ${audienceStrategy.ownedExpansionEligible?'Owned channels may now receive additional support because external acquisition has become repeatable, but they do not replace external-demand acquisition.':'Owned channels remain support/measurement until external acquisition reaches the repeatability gate.'} ${humanSprintActive()?'Human Acquisition Sprint is active: strict verified human sessions dominate priority; acquisition surfaces, Search, vendor/content amplification and timely news are boosted while affiliate and routine catalog work are subordinated.':'Shared priority state coordinates acquisition, monetization, news, catalog growth and factual quality while keeping affiliate economics separate from editorial ranking.'}`).run().catch(()=>{});
  return {ok:true,active,surfaces:surfaceCount,tools:toolCount,affiliate:affiliateCount,catalog:catalogCount,news:newsCount,search:searchCount,searchEvidenceGeneratedAt:organicGrowth?.generatedAt||null,gscSnapshot:{generatedAt:gscSignals?.generatedAt||null,startDate:gscSignals?.startDate||null,endDate:gscSignals?.endDate||null,pages:directGscPages.length,directOpportunities:normalizedGscPages.length},catalogEvidenceGeneratedAt:catalogFreshness?.generatedAt||null,inputFreshness,audienceStrategy,humanAcquisitionSprint:{active:humanSprintActive(),...HUMAN_ACQUISITION_SPRINT}};
}

async function runGrowthExecutionContractCycle(env){
  const synced=await syncExecutionContracts(env);
  const before=await reconcileExecutionContracts(env);
  const results={};
  let selectedInternalLane=null;
  try{
    const next=await env.DB.prepare("SELECT executor FROM growth_execution_contract WHERE executor IN ('distribution_network','distribution_autonomous','content_issue','affiliate_cycle','catalog_cycle') AND status IN ('pending','stalled') ORDER BY CASE status WHEN 'stalled' THEN 0 ELSE 1 END,priority_score DESC,created_at ASC LIMIT 1").first();
    selectedInternalLane=String(next?.executor||'')||null;
  }catch{}

  const runInternal=async(executor,fn)=>{
    const claim=await claimExecutorTasks(env,executor,{limit:1,maxInFlight:1,result:'growth_brain_dispatched_task_v2'});
    if(!claim.claimed){results[executor]={claimed:0};return}
    const task=claim.tasks?.[0]||null;
    try{
      const out=await fn(task);
      let supervisorProof={verified:0},attemptRecorded=false,directProof=null,deferred=null;
      if(task?.source_kind==='supervisor'){
        await markExecutorAttempt(env,executor,JSON.stringify(out||{}).slice(0,900),{taskIds:claim.taskIds});
        attemptRecorded=true;
        supervisorProof=await verifySupervisorExecutorTasks(env,executor,'supervisor_executor_completed_v3',claim.taskIds);
      }else if(executor==='content_issue'&&out?.brief?.issued===true&&out?.brief?.execution_task_id===task?.task_id){
        directProof=await recordExecutionProof(env,{taskId:task.task_id,executor,status:'verified',detail:'content_brief_task_specific_v3',externalId:out.brief.brief_id||null,evidence:{brief_id:out.brief.brief_id||null,growth_opportunity_key:out.brief.growth_opportunity_key||null}});
      }else if(executor==='catalog_cycle'&&out?.task?.verified===true&&task?.subject_type==='catalog_gap'){
        const related=await env.DB.prepare(`SELECT task_id FROM growth_execution_contract WHERE executor='catalog_cycle' AND subject_type='catalog_gap' AND subject_key=? AND status NOT IN ('verified','blocked','cancelled','human_required')`).bind(task.subject_key).all();
        const ids=(related.results||[]).map(x=>x.task_id);
        for(const taskId of ids)await recordExecutionProof(env,{taskId,executor,status:'verified',detail:out.task.admitted?'catalog_gap_admitted_from_first_party_evidence':'catalog_gap_already_admitted',externalId:out.task.toolscoutUrl||null,evidence:{slug:out.task.slug||task.subject_key,toolscout_url:out.task.toolscoutUrl||null,source_url:out.task.profile?.sourceUrl||null,category:out.task.profile?.category||null,admitted:Boolean(out.task.admitted)}});
        await env.DB.prepare(`UPDATE growth_opportunity_state SET status='resolved',last_evaluated_at=datetime('now'),updated_at=datetime('now') WHERE status='active' AND subject_type='catalog_gap' AND subject_key=?`).bind(task.subject_key).run().catch(()=>{});
        directProof={verified:ids.length,subject_key:task.subject_key,admitted:Boolean(out.task.admitted),toolscout_url:out.task.toolscoutUrl||null};
      }else{
        deferred=await deferExecutionTask(env,task.task_id,'cycle_completed_without_task_specific_proof_v3');
      }
      results[executor]={claimed:claim.claimed,ok:true,task:{task_id:task?.task_id||null,source_kind:task?.source_kind||null,action:task?.action||null,subject_type:task?.subject_type||null,subject_key:task?.subject_key||null},attemptRecorded,supervisorVerified:supervisorProof.verified,directProof,deferred,result:out||null};
    }catch(error){
      const message=String(error?.message||error).slice(0,800);
      await markExecutorAttempt(env,executor,`executor_error:${message}`,{failed:true,taskIds:claim.taskIds});
      results[executor]={claimed:claim.claimed,ok:false,task:{task_id:task?.task_id||null,action:task?.action||null,subject_type:task?.subject_type||null,subject_key:task?.subject_key||null},error:message};
    }
  };

  if(selectedInternalLane==='distribution_network')await runInternal('distribution_network',(task)=>runDistributionNetworkCycle(env,task));
  if(selectedInternalLane==='distribution_autonomous')await runInternal('distribution_autonomous',(task)=>runAutonomousDistributionCycle(env,task));

  const senderClaim=await claimExecutorTasks(env,'make_sender',{limit:1,maxInFlight:1,result:'make_sender_waiting_for_exact_external_send'});
  results.make_sender={claimed:senderClaim.claimed,external:true,task:senderClaim.tasks?.[0]||null};

  if(selectedInternalLane==='content_issue')await runInternal('content_issue',async(task)=>({brief:await issueGrowthContentBrief(env,task)}));
  if(selectedInternalLane==='affiliate_cycle')await runInternal('affiliate_cycle',(task)=>runAffiliateCoverageCycle(env,task));
  if(selectedInternalLane==='catalog_cycle')await runInternal('catalog_cycle',async(task)=>{
    if(task?.source_kind==='opportunity'&&task?.subject_type==='catalog_gap')return{task:await executeCatalogGrowthTask(env,task)};
    const verify=await contractVerifyCatalogBatch(env);
    const admit=await contractAdmitCatalogCandidates(env);
    return{verify,admit};
  });

  const audienceClaim=await claimExecutorTasks(env,'audience_make',{limit:1,maxInFlight:1,result:'audience_make_waiting_for_exact_published_reply'});
  const seoClaim=await claimExecutorTasks(env,'seo_github',{limit:1,maxInFlight:1,result:'seo_github_waiting_for_exact_evidence'});
  results.audience_make={claimed:audienceClaim.claimed,external:true,task:audienceClaim.tasks?.[0]||null};
  results.seo_github={claimed:seoClaim.claimed,external:true,task:seoClaim.tasks?.[0]||null};

  const after=await reconcileExecutionContracts(env);
  const snapshot=await executionContractSnapshot(env);
  return{ok:true,integrityVersion:'task-specific-bounded-v3',synced,before,results,after,boundedExecution:{maxInternalLanesPerRun:1,selectedInternalLane,externalExecutorsClaimOnly:true,duplicatedNetworkPreparation:false},architectureEscalation:{deferred:true,reason:'post_core_mission_audit'},snapshot};
}
async function runBoundedPublicExecutionReconcile(env){
  const synced=await syncExecutionContracts(env);
  const deadlines=await reconcileExecutionDeadlines(env);
  const integrity=await runExecutionIntegritySelfTest(env);
  const snapshot=await executionContractSnapshot(env);
  return{ok:true,mode:'bounded_handoff_v1',synced,deadlines,integrity,snapshot};
}
async function runProtectedGrowthCoreRecovery(env){
  const execution=await runWithLedger(env,{engine:'growth',mission:'execution_contract',triggerName:'architecture_recovery',singleFlightMinutes:20},()=>runGrowthExecutionContractCycle(env));
  const selfAudit=await runWithLedger(env,{engine:'growth',mission:'self_audit',triggerName:'architecture_recovery',singleFlightMinutes:20},()=>runGrowthSupervisorAudit(env));
  const architecture=await auditArchitectureEscalations(env).catch(error=>({ok:false,error:String(error?.message||error).slice(0,500)}));
  return{ok:execution?.status!=='failed'&&selfAudit?.status!=='failed',mode:'protected_core_recovery_v1',execution,selfAudit,architecture};
}
async function runCatalogGapReconcile(env){
  const synced=await syncExecutionContracts(env);
  const before=await reconcileExecutionContracts(env);
  const claim=await claimExecutorTasks(env,'catalog_cycle',{limit:1,maxInFlight:1,result:'catalog_gap_public_reconcile_v1'});
  if(!claim.claimed)return{ok:true,synced,before,claimed:0,after:await reconcileExecutionContracts(env)};
  const task=claim.tasks?.[0]||null;
  if(task?.subject_type!=='catalog_gap'){
    await deferExecutionTask(env,task?.task_id,'catalog_gap_reconcile_skipped_non_gap');
    return{ok:true,synced,before,claimed:1,skipped:true,task,after:await reconcileExecutionContracts(env)};
  }
  try{
    const out=await executeCatalogGrowthTask(env,task);
    if(!out?.verified){
      await deferExecutionTask(env,task.task_id,String(out?.reason||'catalog_gap_not_verified'));
      return{ok:true,synced,before,claimed:1,task:out,deferred:true,after:await reconcileExecutionContracts(env)};
    }
    const related=await env.DB.prepare(`SELECT task_id FROM growth_execution_contract WHERE executor='catalog_cycle' AND subject_type='catalog_gap' AND subject_key=? AND status NOT IN ('verified','blocked','cancelled','human_required')`).bind(task.subject_key).all();
    const ids=(related.results||[]).map(x=>x.task_id);
    for(const taskId of ids)await recordExecutionProof(env,{taskId,executor:'catalog_cycle',status:'verified',detail:out.admitted?'catalog_gap_admitted_from_first_party_evidence':'catalog_gap_already_admitted',externalId:out.toolscoutUrl||null,evidence:{slug:out.slug||task.subject_key,toolscout_url:out.toolscoutUrl||null,source_url:out.profile?.sourceUrl||null,category:out.profile?.category||null,admitted:Boolean(out.admitted)}});
    await env.DB.prepare(`UPDATE growth_opportunity_state SET status='resolved',last_evaluated_at=datetime('now'),updated_at=datetime('now') WHERE status='active' AND subject_type='catalog_gap' AND subject_key=?`).bind(task.subject_key).run().catch(()=>{});
    return{ok:true,synced,before,claimed:1,verified:ids.length,task:out,after:await reconcileExecutionContracts(env)};
  }catch(error){
    await deferExecutionTask(env,task.task_id,'catalog_gap_reconcile_error:'+String(error?.message||error).slice(0,300)).catch(()=>null);
    return{ok:false,synced,before,claimed:1,error:String(error?.message||error).slice(0,500),after:await reconcileExecutionContracts(env)};
  }
}

async function publicAudienceBrief(env){
  const [audience,growth,targets]=await Promise.all([
    growthSupervisorDirective(env,'audience'),
    growthSupervisorDirective(env,'growth_brain'),
    growthRows(env,`SELECT opportunity_key,subject_key,priority_score,signal_json FROM growth_opportunity_state WHERE status='active' AND subject_type='search' AND subject_key NOT IN ('/','/tools') ORDER BY priority_score DESC LIMIT 3`)
  ]);
  return{
    brain:'shared-growth-v3',
    northStar:HUMAN_ACQUISITION_SPRINT.northStar,
    generatedAt:new Date().toISOString(),
    growth:{status:growth?.status||null,directive:growth?.directive||null},
    audience:{
      status:audience?.status||null,
      directive:audience?.directive||null,
      relevance_only:audience?.config?.relevance_only!==false,
      link_only_when_directly_helpful:audience?.config?.link_only_when_directly_helpful!==false
    },
    topSearchTargets:targets.map(row=>{
      let signals={};try{signals=JSON.parse(row.signal_json||'{}')}catch{}
      const base=signals.asset_url||('https://trytoolscout.org'+row.subject_key);
      let audienceUrl=base;
      try{
        const u=new URL(base);
        u.searchParams.set('utm_source','bluesky');
        u.searchParams.set('utm_medium','audience_engagement');
        u.searchParams.set('utm_campaign','growth_supervisor');
        u.searchParams.set('ts_action',`audience:${row.opportunity_key}`);
        u.searchParams.set('ts_growth',row.opportunity_key);
        u.searchParams.set('ts_channel','bluesky');
        audienceUrl=u.toString();
      }catch{}
      return{title:signals.title||row.subject_key,path:row.subject_key,audienceUrl,priority:Number(row.priority_score||0),impressions:Number(signals.impressions||0),position:Number(signals.position||0)};
    })
  };
}

async function recordExternalExecutorStatus(env,body={}){
  const executor=String(body.executor||'');
  if(!['audience_make','make_sender','seo_github'].includes(executor))return{ok:false,error:'unsupported_executor'};
  let taskId=String(body.task_id||'').trim();
  if(!taskId){
    const q=await env.DB.prepare(`SELECT task_id FROM growth_execution_contract WHERE executor=? AND status IN ('claimed','attempted') ORDER BY claimed_at DESC,priority_score DESC LIMIT 2`).bind(executor).all();
    const rows=q.results||[];
    if(rows.length!==1)return{ok:false,error:rows.length?'ambiguous_active_task':'no_active_task',active:rows.length};
    taskId=rows[0].task_id;
  }
  const status=body.status==='verified'?'verified':body.status==='blocked'?'blocked':'failed';
  return recordExecutionProof(env,{taskId,executor,status,detail:safe(body.detail||body.error||`external_${status}`,900),externalId:safe(body.external_id||'',300)||null,evidence:{source:'external_executor_callback',reported_status:status}});
}

async function publicSearchDirectives(env){
  await ensureGrowthSchema(env);
  const [q,seoSupervisor,growthSupervisor]=await Promise.all([
    env.DB.prepare(`SELECT opportunity_key,subject_key,priority_score,signal_json,action_json,last_evaluated_at FROM growth_opportunity_state WHERE status='active' AND subject_type='search' ORDER BY priority_score DESC LIMIT 100`).all(),
    growthSupervisorDirective(env,'seo_geo_aio'),
    growthSupervisorDirective(env,'growth_brain')
  ]);
  return {brain:'shared-growth-v3',generatedAt:new Date().toISOString(),northStar:HUMAN_ACQUISITION_SPRINT.northStar,supervisor:{seo:seoSupervisor,growth:growthSupervisor},directives:(q.results||[]).map(row=>{let signals={},actions=[];try{signals=JSON.parse(row.signal_json||'{}')}catch{}try{actions=JSON.parse(row.action_json||'[]')}catch{}return{opportunity_key:row.opportunity_key,intent:row.subject_key,priority_score:Number(row.priority_score||0),lane:signals.lane||null,action:signals.action||null,evidence_confidence:signals.evidence_confidence||null,impressions:Number(signals.impressions||0),clicks:Number(signals.clicks||0),ctr:Number(signals.ctr||0),position:Number(signals.position||0),actions:Array.isArray(actions)?actions:[],last_evaluated_at:row.last_evaluated_at||null}})};
}
async function growthRndAuditDue(env,maxAgeHours=26){
  try{
    const row=await env.DB.prepare(`SELECT status,completed_at,started_at FROM engine_runs WHERE engine='growth' AND mission='rnd_audit' ORDER BY started_at DESC LIMIT 1`).first();
    if(!row||row.status==='failed'||row.status==='degraded'||!row.completed_at)return true;
    const t=Date.parse(String(row.completed_at).replace(' ','T')+'Z');
    return !Number.isFinite(t)||Date.now()-t>Math.max(1,Number(maxAgeHours)||26)*3600000;
  }catch{return true}
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
    env.DB.prepare(`SELECT o.surface_slug,o.distribution_score,l.baseline_score
      FROM distribution_opportunities o
      LEFT JOIN distribution_economic_learning l ON l.surface_slug=o.surface_slug
      WHERE o.surface_slug IS NOT NULL`).all(),
    env.DB.prepare(`SELECT surface_slug,cost_amount,currency,cost_type FROM distribution_surface_costs`).all().catch(()=>({results:[]}))
  ]);
  const costs=new Map((costRows.results||[]).map(c=>[c.surface_slug,{...c,cost_amount:Number(c.cost_amount||0)}]));
  let evaluated=0,updated=0,positive=0,withEvidence=0,paidMeasuring=0;
  for(const row of q.results||[]){
    evaluated++;
    const baseline=Number(row.baseline_score??row.distribution_score??0);
    const metric=bySlug.get(row.surface_slug)||null;
    const sessions=confirmedSessions(metric),outbound=Math.max(0,Number(metric?.outbound_clicks)||0),monetized=Math.max(0,Number(metric?.monetized_outbound)||0);
    const revenue=metric?.revenue==null?null:Number(metric.revenue);
    const opportunityRevenue=revenue==null?0:revenue;
    const boost=economicBoost(metric),learned=Number(Math.min(100,baseline+boost).toFixed(2)),grade=evidenceGrade(metric),cost=costs.get(row.surface_slug)||null,policy=paidPolicy(metric,cost);
    const sessionToOutbound=sessions?Number((outbound/sessions*100).toFixed(2)):0,monetizationRate=outbound?Number((monetized/outbound*100).toFixed(2)):0;
    if(boost>0)positive++;if(grade!=='none')withEvidence++;if(policy.decision==='experiment_measuring')paidMeasuring++;
    const learningWrite=await env.DB.prepare(`INSERT INTO distribution_economic_learning(surface_slug,baseline_score,learned_score,human_sessions_30d,outbound_clicks_30d,monetized_outbound_30d,confirmed_revenue_30d,currency,economic_boost,last_observed_at,created_at,updated_at,browser_confirmed_sessions_30d,session_to_outbound_rate,monetization_rate,evidence_grade,paid_policy_decision,observed_cost,observed_cost_currency,observed_roi)
      VALUES(?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'),datetime('now'),?,?,?,?,?,?,?,?)
      ON CONFLICT(surface_slug) DO UPDATE SET
        learned_score=excluded.learned_score,
        human_sessions_30d=excluded.human_sessions_30d,
        outbound_clicks_30d=excluded.outbound_clicks_30d,
        monetized_outbound_30d=excluded.monetized_outbound_30d,
        confirmed_revenue_30d=excluded.confirmed_revenue_30d,
        currency=excluded.currency,
        economic_boost=excluded.economic_boost,
        last_observed_at=datetime('now'),
        updated_at=datetime('now'),
        browser_confirmed_sessions_30d=excluded.browser_confirmed_sessions_30d,
        session_to_outbound_rate=excluded.session_to_outbound_rate,
        monetization_rate=excluded.monetization_rate,
        evidence_grade=excluded.evidence_grade,
        paid_policy_decision=excluded.paid_policy_decision,
        observed_cost=excluded.observed_cost,
        observed_cost_currency=excluded.observed_cost_currency,
        observed_roi=excluded.observed_roi
      WHERE distribution_economic_learning.learned_score IS NOT excluded.learned_score
         OR distribution_economic_learning.human_sessions_30d IS NOT excluded.human_sessions_30d
         OR distribution_economic_learning.outbound_clicks_30d IS NOT excluded.outbound_clicks_30d
         OR distribution_economic_learning.monetized_outbound_30d IS NOT excluded.monetized_outbound_30d
         OR distribution_economic_learning.confirmed_revenue_30d IS NOT excluded.confirmed_revenue_30d
         OR distribution_economic_learning.currency IS NOT excluded.currency
         OR distribution_economic_learning.economic_boost IS NOT excluded.economic_boost
         OR distribution_economic_learning.browser_confirmed_sessions_30d IS NOT excluded.browser_confirmed_sessions_30d
         OR distribution_economic_learning.session_to_outbound_rate IS NOT excluded.session_to_outbound_rate
         OR distribution_economic_learning.monetization_rate IS NOT excluded.monetization_rate
         OR distribution_economic_learning.evidence_grade IS NOT excluded.evidence_grade
         OR distribution_economic_learning.paid_policy_decision IS NOT excluded.paid_policy_decision
         OR distribution_economic_learning.observed_cost IS NOT excluded.observed_cost
         OR distribution_economic_learning.observed_cost_currency IS NOT excluded.observed_cost_currency
         OR distribution_economic_learning.observed_roi IS NOT excluded.observed_roi`)
      .bind(row.surface_slug,baseline,learned,sessions,outbound,monetized,revenue,metric?.currency||null,boost,sessions,sessionToOutbound,monetizationRate,grade,policy.decision,cost?.cost_amount??null,cost?.currency??null,policy.roi).run();
    const opportunityWrite=await env.DB.prepare(`UPDATE distribution_opportunities
      SET distribution_score=?,observed_human_sessions=?,observed_outbound_clicks=?,observed_revenue=?,performance_score=?,learned_at=datetime('now'),updated_at=datetime('now')
      WHERE surface_slug=?
        AND (distribution_score IS NOT ?
          OR observed_human_sessions IS NOT ?
          OR observed_outbound_clicks IS NOT ?
          OR observed_revenue IS NOT ?
          OR performance_score IS NOT ?)`)
      .bind(learned,sessions,outbound,opportunityRevenue,boost,row.surface_slug,learned,sessions,outbound,opportunityRevenue,boost).run();
    const learningChanges=Number(learningWrite?.meta?.changes||learningWrite?.changes||0);
    const opportunityChanges=Number(opportunityWrite?.meta?.changes||opportunityWrite?.changes||0);
    if(learningChanges||opportunityChanges)updated++;
  }
  await env.DB.prepare(`INSERT INTO distribution_events(event_id,event_type,status,asset_type,detail,observed_at,created_at) VALUES(?,?,?,?,?,datetime('now'),datetime('now'))`).bind(`econ_${crypto.randomUUID()}`,'distribution_economic_learning','completed','distribution_engine',`Economic learning evaluated ${evaluated} surface(s) and materially changed ${updated}; ${withEvidence} surface(s) have strict-human evidence, ${positive} have a positive observed-performance boost and ${paidMeasuring} paid experiment(s) remain in measurement. Unchanged state is not rewritten.`).run();
  return{ok:true,observed:metrics.length,evaluated,updated,positive_boosts:positive,surfaces_with_evidence:withEvidence,paid_experiments_measuring:paidMeasuring,evidence_basis:'strict_verified_human_sessions',write_policy:'material_change_only'};
}

async function prepareEditorial(env,url,type){
  // Community posting is not treated as autonomous unless a safe authenticated executor exists.
  // Borrowed-audience acquisition continues through publisher outreach, vendor amplification,
  // social publishing and verified external submission adapters.
  return 0;
}
let editorialQueueNormalized=null;
async function normalizeEditorialQueue(env){
  if(editorialQueueNormalized)return editorialQueueNormalized;
  editorialQueueNormalized=env.DB.prepare(`UPDATE distribution_editorial_queue
    SET status='retired_no_safe_executor',human_required=0,updated_at=datetime('now')
    WHERE status IN ('autonomy_pending','prepared') AND channel_type IN ('community','community_stack')`).run().catch(()=>null);
  return editorialQueueNormalized;
}
async function fanout(env,url){await normalizeEditorialQueue(env);const type=classify(url);await env.DB.prepare(`INSERT INTO distribution_asset_state(asset_url,asset_type,first_seen_at,last_seen_at,distributed_at) VALUES(?,?,datetime('now'),datetime('now'),datetime('now')) ON CONFLICT(asset_url) DO UPDATE SET asset_type=excluded.asset_type,last_seen_at=datetime('now'),distributed_at=COALESCE(distribution_asset_state.distributed_at,datetime('now'))`).bind(url,type).run();const editorial=await prepareEditorial(env,url,type);await env.DB.prepare(`INSERT INTO distribution_events(event_id,event_type,status,asset_type,asset_id,destination_url,detail,observed_at,created_at) VALUES(?,?,?,?,?,?,?,datetime('now'),datetime('now'))`).bind(`asset_${crypto.randomUUID()}`,'asset_distribution_triggered','completed',type,url,url,`Event-driven fanout prepared: syndication feed exposure, Submission Engine eligibility and Vendor Amplification eligibility. Community posting is intentionally not queued as autonomous without a safe authenticated executor.`).run();return {ok:true,asset_url:url,asset_type:type,editorialPrepared:editorial};}
async function scanNew(request,env){let r=null;const sitemapRequest=new Request(new URL('/sitemap.xml',request.url));try{r=await env.ASSETS.fetch(sitemapRequest.clone());}catch{}if(!r||!r.ok){try{r=await base.fetch(sitemapRequest.clone(),env,{waitUntil(){}});}catch{}}if(!r)return{ok:false,scanned:0,newAssets:0,reason:'sitemap_fetch_failed'};if(!r.ok)return{ok:false,scanned:0,newAssets:0,reason:`sitemap_http_${r.status}`};const xml=await r.text();const urls=[...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1]).filter(u=>/^https:\/\/trytoolscout\.org\//.test(u)&&/(best-|\-vs-|alternatives|compare)/i.test(u));let added=0;for(const url of urls.slice(0,150)){const row=await env.DB.prepare('SELECT asset_url FROM distribution_asset_state WHERE asset_url=?').bind(url).first();if(row)continue;await fanout(env,url);added++;}return{ok:true,scanned:urls.length,newAssets:added};}
export default {async fetch(request,env,ctx){const u=new URL(request.url);if(u.pathname==='/api/distribution/orchestrate'&&request.method==='POST'){if(!(await auth(request,env)))return Response.json({error:'unauthorized'},{status:401,headers:H});let b={};try{b=await request.json()}catch{return Response.json({error:'invalid_json'},{status:400,headers:H})}if(!b.asset_url||!/^https:\/\/trytoolscout\.org\//.test(String(b.asset_url)))return Response.json({error:'valid_toolscout_asset_url_required'},{status:400,headers:H});return Response.json(await runWithLedger(env,{engine:'distribution',mission:'asset_fanout',triggerName:'manual_api'},()=>fanout(env,String(b.asset_url))),{headers:H});}if(u.pathname==='/api/distribution/orchestrate/scan'&&request.method==='POST'){if(!(await auth(request,env)))return Response.json({error:'unauthorized'},{status:401,headers:H});return Response.json(await runWithLedger(env,{engine:'distribution',mission:'asset_scan',triggerName:'manual_api'},()=>scanNew(request,env)),{headers:H});}if(u.pathname==='/api/distribution/economic-learning'&&request.method==='POST'){if(!(await auth(request,env)))return Response.json({error:'unauthorized'},{status:401,headers:H});return Response.json(await runWithLedger(env,{engine:'distribution',mission:'economic_learning',triggerName:'manual_api'},()=>learnEconomics(env)),{headers:H});}if(u.pathname==='/api/growth/search-directives'&&request.method==='GET'){return Response.json(await publicSearchDirectives(env),{headers:{...H,'Cache-Control':'public, max-age=300','Access-Control-Allow-Origin':'*'}});}if(u.pathname==='/api/growth/rnd/audit'&&request.method==='POST'){if(!(await auth(request,env)))return Response.json({error:'unauthorized'},{status:401,headers:H});return Response.json(await runWithLedger(env,{engine:'growth',mission:'rnd_audit',triggerName:'manual_api'},()=>runGrowthRndAudit(env)),{headers:H});}if(u.pathname==='/api/growth/rnd'&&request.method==='GET'){if(!(await auth(request,env)))return Response.json({error:'unauthorized'},{status:401,headers:H});await ensureGrowthSchema(env);const q=await env.DB.prepare(`SELECT * FROM growth_rnd_experiments ORDER BY updated_at DESC LIMIT 100`).all();return Response.json({status:'connected',items:q.results||[]},{headers:H});}if(u.pathname==='/api/growth/opportunities/refresh'&&request.method==='POST'){if(!(await auth(request,env)))return Response.json({error:'unauthorized'},{status:401,headers:H});return Response.json(await runWithLedger(env,{engine:'growth',mission:'opportunity_coordination',triggerName:'manual_api'},()=>coordinateGrowthOpportunities(env)),{headers:H});}
if(u.pathname==='/api/growth/audience-brief/public'&&request.method==='GET'){return Response.json(await publicAudienceBrief(env),{headers:{...H,'Cache-Control':'public, max-age=120','Access-Control-Allow-Origin':'*'}});}
if(u.pathname==='/api/growth/supervisor/audit'&&request.method==='POST'){if(!(await auth(request,env)))return Response.json({error:'unauthorized'},{status:401,headers:H});return Response.json(await runWithLedger(env,{engine:'growth',mission:'self_audit',triggerName:'manual_api',singleFlightMinutes:20},()=>runGrowthSupervisorAudit(env)),{headers:H});}
if(u.pathname==='/api/growth/execution/catalog-public-reconcile'&&request.method==='POST'){
  if(!(await growthEscalationHandoffOk(request)))return Response.json({error:'unauthorized'},{status:401,headers:H});
  return Response.json(await runWithLedger(env,{engine:'catalog',mission:'gap_growth',triggerName:'make_handoff'},()=>runCatalogGapReconcile(env)),{headers:H});
}
if(u.pathname==='/api/growth/execution/catalog-quality-reconcile'&&request.method==='POST'){
  if(!(await growthEscalationHandoffOk(request)))return Response.json({error:'unauthorized'},{status:401,headers:H});
  let body={};try{body=await request.json()}catch{}
  const limit=Math.max(1,Math.min(25,Number(body?.limit||12)||12));
  return Response.json(await runWithLedger(env,{engine:'catalog',mission:'quality_control',triggerName:'make_handoff'},()=>auditCatalogQualityBatch(env,{limit})),{headers:H});
}
if(u.pathname==='/api/growth/execution/catalog-quality-status'&&request.method==='GET'){
  if(!(await growthEscalationHandoffOk(request)))return Response.json({error:'unauthorized'},{status:401,headers:H});
  return Response.json(await catalogQualitySnapshot(env),{headers:H});
}
if(u.pathname==='/api/growth/execution/public-reconcile'&&request.method==='POST'){
  if(!(await growthEscalationHandoffOk(request)))return Response.json({error:'unauthorized'},{status:401,headers:H});
  return Response.json(await runBoundedPublicExecutionReconcile(env),{headers:H});
}
if(u.pathname==='/api/growth/rnd/public-reconcile'&&request.method==='POST'){
  if(!(await growthEscalationHandoffOk(request)))return Response.json({error:'unauthorized'},{status:401,headers:H});
  return Response.json(await runWithLedger(env,{engine:'growth',mission:'rnd_audit',triggerName:'make_handoff_recovery'},()=>runGrowthRndAudit(env)),{headers:H});
}
if(u.pathname==='/api/distribution/priorities/public-reconcile'&&request.method==='POST'){
  if(!(await growthEscalationHandoffOk(request)))return Response.json({error:'unauthorized'},{status:401,headers:H});
  return Response.json(await runWithLedger(env,{engine:'distribution',mission:'operating_priorities',triggerName:'make_handoff_recovery'},()=>rebalanceDistributionPriorities(env)),{headers:H});
}
if(u.pathname==='/api/growth/execution/core-recover'&&request.method==='POST'){
  if(!(await growthEscalationHandoffOk(request)))return Response.json({error:'unauthorized'},{status:401,headers:H});
  return Response.json(await runProtectedGrowthCoreRecovery(env),{headers:H});
}
if(u.pathname==='/api/growth/execution/integrity-self-test'&&request.method==='POST'){
  if(!(await growthEscalationHandoffOk(request)))return Response.json({error:'unauthorized'},{status:401,headers:H});
  return Response.json(await runExecutionIntegritySelfTest(env),{headers:H});
}
if(u.pathname==='/api/growth/execution/external-status'&&request.method==='POST'){
  if(!(await growthEscalationHandoffOk(request)))return Response.json({error:'unauthorized'},{status:401,headers:H});
  let body={};try{body=await request.json()}catch{return Response.json({error:'invalid_json'},{status:400,headers:H})}
  const out=await recordExternalExecutorStatus(env,body);
  return Response.json(out,{status:out?.ok?200:409,headers:H});
}
if(u.pathname==='/api/growth/execution/dispatch'&&request.method==='POST'){if(!(await auth(request,env)))return Response.json({error:'unauthorized'},{status:401,headers:H});return Response.json(await runWithLedger(env,{engine:'growth',mission:'execution_contract',triggerName:'manual_api',singleFlightMinutes:20},()=>runGrowthExecutionContractCycle(env)),{headers:H});}
if(u.pathname==='/api/growth/execution'&&request.method==='GET'){if(!(await auth(request,env)))return Response.json({error:'unauthorized'},{status:401,headers:H});return Response.json(await executionContractSnapshot(env),{headers:H});}
if(u.pathname==='/api/growth/architecture-escalations/public-candidates'&&request.method==='GET'){
  if(!(await growthEscalationHandoffOk(request)))return Response.json({error:'unauthorized'},{status:401,headers:H});
  await auditArchitectureEscalations(env).catch(()=>null);
  return Response.json(await publicEscalationCandidates(env,u.searchParams.get('limit')),{headers:H});
}
if(u.pathname==='/api/growth/architecture-escalations/public-status'&&request.method==='POST'){
  if(!(await growthEscalationHandoffOk(request)))return Response.json({error:'unauthorized'},{status:401,headers:H});
  let body={};try{body=await request.json()}catch{}
  return Response.json(await markEscalationEmailStatus(env,body.dispatch_token,body.status),{headers:H});
}
if(u.pathname==='/api/growth/architecture-escalations'&&request.method==='GET'){
  if(!(await auth(request,env)))return Response.json({error:'unauthorized'},{status:401,headers:H});
  return Response.json(await architectureEscalationSnapshot(env),{headers:H});
}
if(u.pathname==='/api/growth/supervisor'&&request.method==='GET'){if(!(await auth(request,env)))return Response.json({error:'unauthorized'},{status:401,headers:H});return Response.json(await growthSupervisorSnapshot(env),{headers:H});}if(u.pathname==='/api/growth/supervisor/public'&&request.method==='GET'){const s=await growthSupervisorSnapshot(env);const targets=await growthRows(env,`SELECT opportunity_key,subject_key,priority_score,signal_json FROM growth_opportunity_state WHERE status='active' AND subject_type='search' AND subject_key NOT IN ('/','/tools') ORDER BY priority_score DESC LIMIT 5`);const executionContract=await executionContractSnapshot(env).catch(()=>({states:{},missingExecutors:0,stalled:0}));return Response.json({brain:'shared-growth-v3',northStar:s.northStar,generatedAt:s.generatedAt,d1WritePolicy:{version:'material-change-only-v3',publicReadsWriteFree:true,passiveMeasurementTasksPersisted:false,timeSignalsBucketed:'daily'},executionContract,directives:(s.items||[]).map(x=>({engine:x.engine,role:x.role,status:x.status,directive:x.directive,directiveConfig:x.directiveConfig,lastEvaluatedAt:x.last_evaluated_at})),topSearchTargets:targets.map(x=>{let signals={};try{signals=JSON.parse(x.signal_json||'{}')}catch{}const url=signals.asset_url||('https://trytoolscout.org'+x.subject_key);let audienceUrl=url;try{const a=new URL(url);a.searchParams.set('utm_source','bluesky');a.searchParams.set('utm_medium','audience_engagement');a.searchParams.set('utm_campaign','growth_supervisor');a.searchParams.set('ts_action',`audience:${x.opportunity_key}`);a.searchParams.set('ts_growth',x.opportunity_key);a.searchParams.set('ts_channel','bluesky');audienceUrl=a.toString()}catch{}return{opportunityKey:x.opportunity_key,path:x.subject_key,url,audienceUrl,title:signals.title||x.subject_key,priority:Number(x.priority_score||0),impressions:Number(signals.impressions||0),position:Number(signals.position||0)}})},{headers:{...H,'Cache-Control':'public, max-age=120','Access-Control-Allow-Origin':'*'}});}if(u.pathname==='/api/growth/opportunities'&&request.method==='GET'){if(!(await auth(request,env)))return Response.json({error:'unauthorized'},{status:401,headers:H});await ensureGrowthSchema(env);const q=await env.DB.prepare(`SELECT opportunity_key,subject_type,subject_key,priority_score,signal_json,action_json,status,last_evaluated_at FROM growth_opportunity_state WHERE status='active' ORDER BY priority_score DESC LIMIT 100`).all();return Response.json({status:'connected',items:q.results||[]},{headers:H});}if(u.pathname==='/api/distribution/editorial-queue'&&request.method==='GET'){if(!(await auth(request,env)))return Response.json({error:'unauthorized'},{status:401,headers:H});await normalizeEditorialQueue(env);const q=await env.DB.prepare(`SELECT queue_id,asset_url,channel_type,target_name,target_url,angle,suggested_title,suggested_body,status,human_required,updated_at FROM distribution_editorial_queue ORDER BY created_at DESC LIMIT 100`).all();return Response.json({status:'connected',items:q.results||[]},{headers:H});}return base.fetch(request,env,ctx);},async scheduled(event,env,ctx){await normalizeEditorialQueue(env);await runWithLedger(env,{engine:'distribution',mission:'economic_learning',triggerName:event?.cron||'scheduled'},()=>learnEconomics(env));if(event?.cron==='35 3 * * *'||humanSprintActive()){await runWithLedger(env,{engine:'growth',mission:'opportunity_coordination',triggerName:event?.cron||'scheduled'},()=>coordinateGrowthOpportunities(env)).catch(()=>null);}if(event?.cron==='35 3 * * *'){await runWithLedger(env,{engine:'growth',mission:'rnd_audit',triggerName:event.cron},()=>runGrowthRndAudit(env));}else if(event?.cron==='15 * * * *'&&await growthRndAuditDue(env,26)){await runWithLedger(env,{engine:'growth',mission:'rnd_audit',triggerName:event.cron+':cadence_recovery'},()=>runGrowthRndAudit(env)).catch(()=>null);}if(event?.cron==='15 * * * *'||event?.cron==='35 3 * * *'){await runWithLedger(env,{engine:'growth',mission:'execution_contract',triggerName:event?.cron||'scheduled',singleFlightMinutes:20},()=>runGrowthExecutionContractCycle(env)).catch(()=>null);await runWithLedger(env,{engine:'growth',mission:'self_audit',triggerName:event?.cron||'scheduled',singleFlightMinutes:20},()=>runGrowthSupervisorAudit(env)).catch(()=>null);await auditArchitectureEscalations(env).catch(()=>null);}if(base.scheduled)await base.scheduled(event,env,ctx);if(event?.cron==='35 3 * * *')await runWithLedger(env,{engine:'distribution',mission:'asset_scan',triggerName:event.cron},()=>scanNew(new Request('https://trytoolscout.org/'),env));}};
