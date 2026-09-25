import base from './authority-acquisition-worker.js';
import {injectToolScoutSocialFooter} from './social-profiles.js';
import {commandCenterHtml} from './command-center-simplified-view.js';
import {publicRuntimeToolResponse} from './catalog-autonomy-worker.js';

function jsonHeaders(response){
  const h=new Headers(response.headers);
  h.set('Content-Type','application/json; charset=UTF-8');
  h.set('Cache-Control','private, no-store, max-age=0');
  h.delete('Content-Length');h.delete('Content-Encoding');
  return h;
}
const FACTS_CACHE_MS=60000;
const AUTHORITY_POLICY_MIN_24H=4;
const AUTHORITY_POLICY_TARGET_24H=50;
const ACQUISITION_SURGE_MIN_24H=0;
const ACQUISITION_SURGE_TARGET_24H=50;
const ACQUISITION_SURGE_MAX_24H=60;
const MACHINE_SAFE_EXTERNAL_MAX_24H=300;
const RESEARCH_EXTERNAL_MAX_24H=1500;
const EMAIL_TARGET_24H=50;
const EMAIL_MAX_24H=60;
let factsCache={at:0,value:null,promise:null};
async function facts(env){
  const [oauth,authority,content,distributionRuns]=await Promise.all([
    env.DB.prepare(`SELECT provider,updated_at,last_refresh_at,last_error
      FROM google_oauth_connections WHERE provider='google_analytics' LIMIT 1`).first().catch(()=>null),
    env.DB.prepare(`SELECT
      (SELECT COUNT(*) FROM distribution_submissions WHERE surface_slug<>'indexnow' AND attempts>0 AND COALESCE(last_attempt_at,created_at)>=datetime('now','-24 hours'))+
      (SELECT COUNT(*) FROM distribution_events WHERE event_type IN ('vendor_outreach_sent','publisher_network_outreach_sent') AND created_at>=datetime('now','-24 hours')) attempts24`).first().catch(()=>null),
    env.DB.prepare(`SELECT status,directive,last_evaluated_at FROM growth_supervisor_state WHERE engine='content' LIMIT 1`).first().catch(()=>null),
    env.DB.prepare(`SELECT mission,status,started_at,completed_at,detail FROM engine_runs
      WHERE engine='distribution' AND mission IN ('operating_priorities','autonomous_cycle','network_cycle')
        AND status='completed'
      ORDER BY started_at DESC LIMIT 30`).all().then(r=>r.results||[]).catch(()=>[])
  ]);
  const latestCompleted={};
  for(const row of distributionRuns||[])if(!latestCompleted[row.mission])latestCompleted[row.mission]=row;
  return {ga4Connected:Boolean(oauth?.provider==='google_analytics'),authorityAttempts24:Number(authority?.attempts24||0),contentStatus:content?.status||null,contentDirective:content?.directive||null,contentEvaluatedAt:content?.last_evaluated_at||null,distributionCompleted:latestCompleted};
}
async function cachedFacts(env,{fresh=false}={}){
  const now=Date.now();
  if(!fresh&&factsCache.value&&now-factsCache.at<FACTS_CACHE_MS)return factsCache.value;
  if(!fresh&&factsCache.promise)return factsCache.promise;
  const work=facts(env).then(value=>{factsCache={at:Date.now(),value,promise:null};return value}).catch(error=>{factsCache.promise=null;throw error});
  factsCache.promise=work;
  return work;
}
function keepIssue(issue,f){
  const metric=String(issue?.metric||''),reason=String(issue?.reason||'');
  if(reason==='superseded_by_single_path_scheduler_fix')return false;
  if(f.ga4Connected&&metric==='ga4')return false;
  if(f.authorityAttempts24>=AUTHORITY_POLICY_MIN_24H&&metric==='engine:distribution:authority_execution_recovery')return false;
  if(metric==='engine:distribution'||metric==='engine:distribution:autonomous_cycle'||metric==='engine:distribution:network_cycle'){
    const completed=f.distributionCompleted||{};
    if(completed.autonomous_cycle&&completed.network_cycle)return false;
  }
  return true;
}
function reconcileAudit(a,f){
  if(!a||typeof a!=='object')return a;
  const issues=(Array.isArray(a.issues)?a.issues:[]).filter(x=>keepIssue(x,f));
  const sources={...(a.sources||{})};
  if(f.ga4Connected)sources.ga4={status:'live_on_demand',generated_at:new Date().toISOString(),age_minutes:0,source:'Google Analytics 4 Data API via OAuth'};
  const engines={...(a.engines||{})};
  const dc=f.distributionCompleted||{};
  if(engines.distribution&&dc.autonomous_cycle&&dc.network_cycle){
    const control=dc.operating_priorities?{status:'healthy',last_run_at:dc.operating_priorities.started_at,last_completed_at:dc.operating_priorities.completed_at,mission:'operating_priorities',detail:dc.operating_priorities.detail||'Mission completed',proof:'latest completed engine_run'}:(engines.distribution.components?.control||null);
    const autonomous={status:'healthy',last_run_at:dc.autonomous_cycle.started_at,last_completed_at:dc.autonomous_cycle.completed_at,mission:'autonomous_cycle',detail:dc.autonomous_cycle.detail||'Mission completed',proof:'latest completed engine_run'};
    const network={status:'healthy',last_run_at:dc.network_cycle.started_at,last_completed_at:dc.network_cycle.completed_at,mission:'network_cycle',detail:dc.network_cycle.detail||'Mission completed',proof:'latest completed engine_run'};
    engines.distribution={...engines.distribution,status:'healthy',detail:'Latest completed Distribution component runs remain canonical after scheduler deduplication.',components:{control,autonomous,network}};
  }
  if(f.contentStatus==='execution_gap'&&engines.content){
    engines.content={...engines.content,status:'degraded',detail:`Growth Brain content execution gap: ${f.contentDirective||'publication overdue'}`,supervisor_evaluated_at:f.contentEvaluatedAt};
    if(!issues.some(x=>x?.metric==='engine:content'))issues.push({metric:'engine:content',severity:'error',reason:'execution_gap'});
  }
  const status=issues.some(x=>x?.severity==='error')?'degraded':issues.length?'warning':'healthy';
  return {...a,status,issues,sources,engines};
}
async function reconcile(response,env){
  if(!response?.ok||!String(response.headers.get('Content-Type')||'').toLowerCase().includes('application/json'))return response;
  let d;try{d=await response.json()}catch{return response}
  const f=await cachedFacts(env);
  if(d.commandCenterIntegrity)d.commandCenterIntegrity=reconcileAudit(d.commandCenterIntegrity,f);
  if(d.measurementAudit)d.measurementAudit=reconcileAudit(d.measurementAudit,f);
  if(d?.growthOps?.health?.issues){
    const issues=d.growthOps.health.issues.filter(x=>keepIssue(x,f));
    d.growthOps={...d.growthOps,health:{...d.growthOps.health,issues}};
  }
  if(d.resilientCommandCenter&&d.measurementAudit)d.resilientCommandCenter={...d.resilientCommandCenter,integrityStatus:d.measurementAudit.status};
  d.operationalTruthReconciliation={version:'live-runtime-v1',ga4Connected:f.ga4Connected,authorityAttempts24:f.authorityAttempts24,authorityThroughputHealthy:f.authorityAttempts24>=AUTHORITY_POLICY_MIN_24H,contentStatus:f.contentStatus,generatedAt:new Date().toISOString()};
  return new Response(JSON.stringify(d),{status:response.status,statusText:response.statusText,headers:jsonHeaders(response)});
}

const COMMAND_CENTER_PATHS=new Set(['/analytics','/analytics/','/analytics.html','/analytics-v2','/analytics-v2/','/analytics-v2.html','/command-center','/command-center/']);
const COMMAND_CENTER_SESSION_COOKIE='toolscout_cc';
const COMMAND_CENTER_SESSION_TTL_SECONDS=86400;
async function commandCenterDigestHex(value){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value||'')));
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}
function commandCenterSessionBucket(now=Date.now()){return Math.floor(now/(COMMAND_CENTER_SESSION_TTL_SECONDS*1000))}
async function commandCenterSessionValue(secret,bucket){return commandCenterDigestHex(`toolscout-command-center:${secret}:${bucket}`)}
async function simplifiedPage(response,env){
  const headers=new Headers(response?.headers||undefined);
  headers.set('Content-Type','text/html; charset=UTF-8');
  headers.set('Cache-Control','private, no-store, max-age=0');
  headers.delete('Content-Length');headers.delete('Content-Encoding');
  if(env?.ADMIN_TOKEN){
    const value=await commandCenterSessionValue(env.ADMIN_TOKEN,commandCenterSessionBucket());
    headers.append('Set-Cookie',`${COMMAND_CENTER_SESSION_COOKIE}=${value}; Max-Age=${COMMAND_CENTER_SESSION_TTL_SECONDS}; Path=/; HttpOnly; Secure; SameSite=Lax`);
  }
  return new Response(commandCenterHtml(),{status:200,headers});
}


const truthNum=v=>Number.isFinite(Number(v))?Number(v):0;
const truthMaybeNum=v=>v===null||v===undefined||v===''?null:(Number.isFinite(Number(v))?Number(v):null);
const BUSINESS_TRUTH_CACHE_MS=120000;
let businessTruthCache={at:0,value:null,promise:null};
async function ccAssetJson(request,env,path,fallback){
  try{
    const url=new URL(path,request.url);
    const r=env.ASSETS?await env.ASSETS.fetch(new Request(url.toString(),{headers:{Accept:'application/json'}})):null;
    if(!r||!r.ok)return fallback;
    return await r.json();
  }catch{return fallback}
}
async function buildCommandCenterBusinessTruth(request,env){
  const [supervisorRows,contractRows,gscSignals,gscReality,gscHealth,affiliateRegistry,affiliatePipeline,affiliateWorkflow,audienceRows,submissionRows,placementRows,actionRows,strictDailyRows,verifiedBacklinkRows,verifiedPlacementHistoryRows,engineActivityRows,actionPipelineRows,executionActionRows,emailCapacity,makeSenderConfig,contactSupplyMetrics,seRankingBacklinkTruth]=await Promise.all([
    env.DB.prepare(`SELECT engine,status,directive,directive_json,strict_humans_24h,strict_humans_7d,attributed_humans_7d,external_executions_24h,external_executions_7d,correction_count,last_correction_at,last_evaluated_at
      FROM growth_supervisor_state ORDER BY CASE engine WHEN 'growth_brain' THEN 0 ELSE 1 END,engine`).all().then(r=>r.results||[]).catch(()=>[]),
    env.DB.prepare(`SELECT executor,status,COUNT(*) n FROM growth_execution_contract GROUP BY executor,status`).all().then(r=>r.results||[]).catch(()=>[]),
    env.DB.prepare(`SELECT payload_json,source_generated_at,updated_at FROM growth_asset_cache WHERE path='/reports/gsc-signals.json' LIMIT 1`).first().catch(()=>null),
    env.DB.prepare(`SELECT payload_json,source_generated_at,updated_at FROM growth_asset_cache WHERE path='/data/gsc-search-reality.json' LIMIT 1`).first().catch(()=>null),
    env.DB.prepare(`SELECT payload_json,source_generated_at,updated_at FROM growth_asset_cache WHERE path='/runtime/gsc-refresh-health.json' LIMIT 1`).first().catch(()=>null),
    ccAssetJson(request,env,'/data/affiliate.json',{}),
    ccAssetJson(request,env,'/data/affiliate-pipeline.json',{verified_programs:[]}),
    env.DB.prepare(`SELECT tool_slug,status,updated_at FROM affiliate_workflow ORDER BY tool_slug`).all().then(r=>r.results||[]).catch(()=>[]),
    env.DB.prepare(`SELECT event_id,platform,event_type,status,post_uri,content_id,created_at
      FROM audience_events WHERE status='published' AND created_at>=datetime('now','-7 days')
        AND event_type IN ('content_published','outbound_reply')
      ORDER BY created_at DESC LIMIT 20`).all().then(r=>r.results||[]).catch(()=>[]),
    env.DB.prepare(`SELECT submission_id,surface_slug,submission_type,status,attempts,
        COALESCE(last_attempt_at,created_at) at,response_url,error
      FROM distribution_submissions
      WHERE surface_slug<>'indexnow' AND attempts>0 AND COALESCE(last_attempt_at,created_at)>=datetime('now','-7 days')
      ORDER BY COALESCE(last_attempt_at,created_at) DESC LIMIT 20`).all().then(r=>r.results||[]).catch(()=>[]),
    env.DB.prepare(`SELECT surface_slug,public_url,placement_verified,backlink_verified,first_verified_at,last_checked_at
      FROM distribution_placements
      WHERE placement_verified=1 AND COALESCE(first_verified_at,last_checked_at)>=datetime('now','-7 days')
      ORDER BY COALESCE(first_verified_at,last_checked_at) DESC LIMIT 20`).all().then(r=>r.results||[]).catch(()=>[]),
    env.DB.prepare(`SELECT action_id,opportunity_key,engine,channel,target_url,status,created_at
      FROM growth_action_events
      WHERE created_at>=datetime('now','-7 days') AND status IN ('sent','verified','completed','attributed')
        AND (engine='vendor_amplification' OR engine LIKE 'distribution%' OR engine='content' OR engine='audience')
      ORDER BY created_at DESC LIMIT 30`).all().then(r=>r.results||[]).catch(()=>[]),
    env.DB.prepare(`SELECT substr(first_evidence_at,1,10) day,COUNT(*) humans
      FROM traffic_human_evidence
      WHERE first_evidence_at>=datetime('now','-29 days')
      GROUP BY substr(first_evidence_at,1,10)
      ORDER BY day`).all().then(r=>r.results||[]).catch(()=>[]),
    env.DB.prepare(`SELECT surface_slug,public_url,first_verified_at
      FROM distribution_placements
      WHERE placement_verified=1 AND backlink_verified=1
        AND surface_slug NOT IN ('rss','toolscout-ard','toolscout-machine-discovery')
      ORDER BY first_verified_at`).all().then(r=>r.results||[]).catch(()=>[]),
    env.DB.prepare(`SELECT surface_slug,public_url,first_verified_at,last_checked_at
      FROM distribution_placements
      WHERE placement_verified=1
        AND surface_slug NOT IN ('rss','toolscout-ard','toolscout-machine-discovery')
      ORDER BY COALESCE(first_verified_at,last_checked_at)`).all().then(r=>r.results||[]).catch(()=>[]),
    env.DB.prepare(`SELECT engine,mission,status,trigger_name,started_at,completed_at,detail
      FROM engine_runs
      WHERE started_at>=datetime('now','-12 hours')
      ORDER BY started_at DESC LIMIT 30`).all().then(r=>r.results||[]).catch(()=>[]),
    env.DB.prepare(`SELECT action_id,opportunity_key,engine,channel,target_url,status,created_at,updated_at
      FROM growth_action_events
      WHERE created_at>=datetime('now','-12 hours')
      ORDER BY updated_at DESC,created_at DESC LIMIT 20`).all().then(r=>r.results||[]).catch(()=>[]),
    env.DB.prepare(`SELECT task_id,opportunity_key,subject_type,subject_key,action,executor,engine,status,claimed_at,attempted_at,updated_at
      FROM growth_execution_contract
      WHERE updated_at>=datetime('now','-12 hours') AND status IN ('pending','claimed','attempted','verified','human_required')
      ORDER BY updated_at DESC LIMIT 20`).all().then(r=>r.results||[]).catch(()=>[]),
    env.DB.prepare(`SELECT
      (SELECT COUNT(*) FROM distribution_events
        WHERE event_type IN ('vendor_outreach_sent','publisher_network_outreach_sent')
          AND status='completed' AND created_at>=datetime('now','-24 hours')) sent24,
      (SELECT COUNT(*) FROM distribution_vendor_amplification
        WHERE public_dispatch_leased_at>=datetime('now','-20 minutes') AND status<>'sent')+
      (SELECT COUNT(*) FROM distribution_network_outreach
        WHERE public_dispatch_leased_at>=datetime('now','-20 minutes') AND status NOT IN ('sent','adopted')) leased_recent,
      (SELECT COUNT(*) FROM distribution_vendor_amplification v
        WHERE v.status='contact_found' AND v.contact_method='public_role_email' AND v.contact_email IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM distribution_vendor_amplification prior
            WHERE prior.status='sent' AND prior.outreach_sent_at>=datetime('now','-30 days')
              AND (prior.tool_slug=v.tool_slug OR lower(COALESCE(prior.contact_email,''))=lower(COALESCE(v.contact_email,'')))
          ))+
      (SELECT COUNT(*) FROM distribution_network_outreach
        WHERE status='contact_found' AND contact_email IS NOT NULL) ready_contacts,
      (SELECT COUNT(*) FROM distribution_vendor_amplification WHERE status='reputation_quarantine')+
      (SELECT COUNT(*) FROM distribution_network_outreach WHERE status='reputation_quarantine') reputation_quarantine`).first().catch(()=>({sent24:0,leased_recent:0,ready_contacts:0,reputation_quarantine:0})),
    env.DB.prepare(`SELECT value,updated_at FROM external_runtime_config WHERE key='make_sender_webhook_url' LIMIT 1`).first().catch(()=>null),
    env.DB.prepare(`SELECT target_ready,min_ready,catalog_domains,network_domains,vendor_domains,ready_email,ready_route,cooldown,researching,unresolved,apollo_eligible,apollo_status,updated_at
      FROM contact_supply_metrics WHERE id='global' LIMIT 1`).first().catch(()=>null),
    ccAssetJson(request,env,'/data/se-ranking-backlink-truth.json',{observedAt:null,metrics:{},referringDomains:[]})
  ]);
  const parse=(v,fallback={})=>{try{return JSON.parse(v||'')}catch{return fallback}};
  const byEngine=new Map(supervisorRows.map(x=>[x.engine,x]));
  const growth=byEngine.get('growth_brain')||{};
  const cfg=parse(growth.directive_json,{});
  const backlink=cfg.backlink_acquisition||{};
  const authorityAttempts24=truthNum(backlink.attempts_24h);
  const authorityQueueNow=truthNum(backlink.authority_queue);
  const internalAuthorityVerifiedDomains=truthNum(backlink.internal_verified_referring_domains??backlink.verified_referring_domains);
  const seRankingObservedAt=seRankingBacklinkTruth?.observedAt||null;
  const seRankingObservedMs=Date.parse(String(seRankingObservedAt||''));
  const seRankingFresh=Number.isFinite(seRankingObservedMs)&&(Date.now()-seRankingObservedMs)<=168*3600000;
  const seRankingReferringDomains=seRankingFresh?truthNum(seRankingBacklinkTruth?.metrics?.referringDomains):0;
  const authorityVerifiedDomains=Math.max(truthNum(backlink.verified_referring_domains),internalAuthorityVerifiedDomains,seRankingReferringDomains);
  const authorityRequired=authorityVerifiedDomains<10||authorityQueueNow>0;
  const authorityThroughputGap=authorityRequired&&authorityAttempts24<AUTHORITY_POLICY_MIN_24H;
  const architecture=cfg.architecture_escalation||{};
  const contract={states:{},executors:{},verified:0,ready:0,inFlight:0,deferred:0,missingExecutors:0,stalled:0};
  for(const row of contractRows){
    const status=String(row.status||'unknown'),count=truthNum(row.n),executor=row.executor||'unassigned';
    contract.states[status]=(contract.states[status]||0)+count;
    contract.executors[executor]=contract.executors[executor]||{};
    contract.executors[executor][status]=count;
  }
  contract.verified=truthNum(contract.states.verified);
  contract.ready=truthNum(contract.states.pending);
  contract.inFlight=truthNum(contract.states.claimed)+truthNum(contract.states.attempted);
  contract.deferred=truthNum(contract.states.deferred);
  contract.missingExecutors=truthNum(contract.states.executor_missing);
  contract.stalled=truthNum(contract.states.stalled);

  const productionRoutes=Object.entries(affiliateRegistry||{}).filter(([,v])=>Boolean(v?.enabled&&v?.url));
  const programmes=Array.isArray(affiliatePipeline?.verified_programs)?affiliatePipeline.verified_programs:[];
  const programmeStates={};
  for(const p of programmes){const k=String(p?.status||'unknown');programmeStates[k]=(programmeStates[k]||0)+1}
  const activePipelineRows=programmes.filter(p=>String(p?.status||'')==='active');
  const activePipeline=activePipelineRows.length;
  const productionSlugs=productionRoutes.map(([slug])=>slug).sort();
  const activePipelineSlugs=activePipelineRows.map(p=>String(p.slug||'')).filter(Boolean).sort();
  const productionSet=new Set(productionSlugs),activePipelineSet=new Set(activePipelineSlugs);
  const productionWithoutActivePipeline=productionSlugs.filter(slug=>!activePipelineSet.has(slug));
  const activePipelineWithoutProduction=activePipelineSlugs.filter(slug=>!productionSet.has(slug));
  const workflowStates={};for(const row of affiliateWorkflow){const k=String(row.status||'unknown');workflowStates[k]=(workflowStates[k]||0)+1}
  const workflowBySlug=Object.fromEntries(affiliateWorkflow.map(row=>[row.tool_slug,{status:row.status,updatedAt:row.updated_at}]));


  const gsc=parse(gscSignals?.payload_json,{});
  const reality=parse(gscReality?.payload_json,{});
  const gh=parse(gscHealth?.payload_json,{});
  const w=reality?.searchPerformance?.window28d||gsc?.siteTotals||{};
  const idx=reality?.indexHealth||{};
  const sitemap=reality?.sitemaps||{};
  const rawDaily28=Array.isArray(reality?.searchPerformance?.daily28)?reality.searchPerformance.daily28:[];
  const lisbonDate=(()=>{try{const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Lisbon',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const map=Object.fromEntries(parts.map(p=>[p.type,p.value]));return map.year+'-'+map.month+'-'+map.day}catch{return new Date().toISOString().slice(0,10)}})();
  const completedDaily=rawDaily28.filter(row=>String(row?.date||'')<lisbonDate);
  let lastEvidenceIndex=completedDaily.length-1;
  while(lastEvidenceIndex>=0){const row=completedDaily[lastEvidenceIndex];if(truthNum(row?.impressions)>0||truthNum(row?.clicks)>0||truthNum(row?.position)>0)break;lastEvidenceIndex--}
  const daily28=lastEvidenceIndex>=0?completedDaily.slice(0,lastEvidenceIndex+1):[];
  const aggregateDays=rows=>{
    const clicks=rows.reduce((a,x)=>a+truthNum(x?.clicks),0),impressions=rows.reduce((a,x)=>a+truthNum(x?.impressions),0);
    const weighted=rows.reduce((a,x)=>a+truthNum(x?.position)*truthNum(x?.impressions),0);
    return {startDate:rows[0]?.date||null,endDate:rows.at(-1)?.date||null,clicks,impressions,ctr:impressions?clicks/impressions*100:0,position:impressions?weighted/impressions:null};
  };
  const recentRows=daily28.slice(-7),previousRows=daily28.slice(-14,-7),recent7=aggregateDays(recentRows),previous7=aggregateDays(previousRows);
  const pct=(cur,prev)=>prev?((cur-prev)/prev*100):(cur?100:0);
  const change7d={
    clicksPct:pct(recent7.clicks,previous7.clicks),
    impressionsPct:pct(recent7.impressions,previous7.impressions),
    positionDelta:recent7.position==null||previous7.position==null?null:recent7.position-previous7.position
  };
  const verifiedThroughDate=daily28.at(-1)?.date||null;
  const strictDaily=Array.isArray(strictDailyRows)?strictDailyRows.map(x=>({date:x.day,humans:truthNum(x.humans)})):[];
  const dayKeys=[];for(let i=29;i>=0;i--){const d=new Date(Date.now()-i*86400000);dayKeys.push(d.toISOString().slice(0,10))}
  const authorityHistory=dayKeys.map(day=>{
    const end=day+'T23:59:59Z',domains=new Set();let backlinks=0,placements=0;
    for(const row of verifiedPlacementHistoryRows||[]){
      const at=String(row.first_verified_at||row.last_checked_at||'');const iso=at.includes('T')?at:at.replace(' ','T')+'Z';
      if(at&&iso<=end)placements++;
    }
    for(const row of verifiedBacklinkRows||[]){
      const at=String(row.first_verified_at||'');const iso=at.includes('T')?at:at.replace(' ','T')+'Z';
      if(!at||iso>end)continue;backlinks++;
      try{const host=new URL(String(row.public_url||'')).hostname.replace(/^www\./,'').toLowerCase();if(host&&host!=='trytoolscout.org'&&!host.endsWith('.trytoolscout.org'))domains.add(host)}catch{}
    }
    return {date:day,placements,backlinks,referringDomains:domains.size};
  });
  if(authorityHistory.length){const last=authorityHistory[authorityHistory.length-1];last.referringDomains=Math.max(truthNum(last.referringDomains),authorityVerifiedDomains);}
  const latestAuthorityPlacementAt=(placementRows||[]).map(x=>x.first_verified_at||x.last_checked_at).filter(Boolean).sort().at(-1)||null;
  const growthActivity=(engineActivityRows||[]).map(x=>({
    at:x.completed_at||x.started_at,
    engine:x.engine,
    mission:x.mission,
    status:x.status,
    trigger:x.trigger_name,
    detail:x.detail||null
  })).filter(x=>x.at).slice(0,14);
  const growthActions=[
    ...(executionActionRows||[]).map(x=>({
      id:x.task_id,
      at:x.updated_at||x.attempted_at||x.claimed_at,
      createdAt:x.claimed_at||x.updated_at,
      engine:x.engine||x.executor||'growth',
      channel:x.action||x.executor||'execution',
      status:x.status,
      opportunityKey:x.opportunity_key||[x.subject_type,x.subject_key].filter(Boolean).join(':'),
      targetUrl:null
    })),
    ...(actionPipelineRows||[]).map(x=>({
      id:x.action_id,
      at:x.updated_at||x.created_at,
      createdAt:x.created_at,
      engine:x.engine,
      channel:x.channel,
      status:x.status,
      opportunityKey:x.opportunity_key,
      targetUrl:x.target_url||null
    }))
  ].filter(x=>x.at).sort((a,b)=>Date.parse(String(b.at).replace(' ','T')+'Z')-Date.parse(String(a.at).replace(' ','T')+'Z')).slice(0,16);
  const recentResults=[
    ...audienceRows.map(x=>({id:x.event_id,at:x.created_at,engine:x.event_type==='content_published'?'content':'audience',type:x.event_type,status:'verified',label:x.event_type==='content_published'?'Content published':'Audience reply published',detail:x.platform||'external publication',url:x.post_uri||null})),
    ...submissionRows.map(x=>({id:x.submission_id,at:x.at,engine:'distribution',type:'external_submission',status:x.status||'attempted',label:'External submission: '+String(x.surface_slug||'surface'),detail:x.error||('Attempt '+truthNum(x.attempts)),url:x.response_url||null})),
    ...placementRows.map(x=>({id:'placement:'+x.surface_slug,at:x.first_verified_at||x.last_checked_at,engine:'authority',type:x.backlink_verified?'backlink_verified':'placement_verified',status:'verified',label:(x.backlink_verified?'Backlink verified: ':'Placement verified: ')+String(x.surface_slug||'surface'),detail:x.backlink_verified?'Verified backlink':'Verified public placement',url:x.public_url||null})),
    ...actionRows.map(x=>({id:x.action_id,at:x.created_at,engine:x.engine||'growth',type:x.channel||'external_action',status:x.status||'observed',label:x.opportunity_key||x.action_id,detail:x.channel||x.engine||'external action',url:x.target_url||null}))
  ].filter(x=>x.at).sort((a,b)=>Date.parse(String(b.at).replace(' ','T')+'Z')-Date.parse(String(a.at).replace(' ','T')+'Z')).slice(0,20);
  const engines=supervisorRows.filter(x=>x.engine!=='growth_brain').map(x=>({
    engine:x.engine,status:x.status,directive:x.directive,lastEvaluatedAt:x.last_evaluated_at
  }));
  const persistedGrowthStatus=growth.status||null,persistedGrowthDirective=growth.directive||null;
  const externalExecutions24h=truthNum(growth.external_executions_24h);
  let currentGrowthStatus='learning',currentGrowthDirective='execute_high_signal_demand_within_resource_budget';
  if(truthNum(architecture.open_incidents)>0){currentGrowthStatus='critical';currentGrowthDirective='repair_architecture_and_continue_bounded_acquisition'}
  else if(contract.missingExecutors>0||contract.stalled>0){currentGrowthStatus='critical';currentGrowthDirective='repair_execution_contract_and_continue_bounded_acquisition'}
  else if(truthNum(growth.attributed_humans_7d)>0){currentGrowthStatus='working';currentGrowthDirective='scale_proven_human_sources_and_existing_search_demand'}
  return {
    ok:true,
    version:'command-center-business-truth-v4-hybrid-execution',
    generatedAt:new Date().toISOString(),
    growth:{
      status:currentGrowthStatus,
      directive:currentGrowthDirective,
      supervisorPersistedStatus:persistedGrowthStatus,
      supervisorPersistedDirective:persistedGrowthDirective,
      lastEvaluatedAt:growth.last_evaluated_at||null,
      strictHumans24h:truthNum(growth.strict_humans_24h),
      strictHumans7d:truthNum(growth.strict_humans_7d),
      attributedHumans7d:truthNum(growth.attributed_humans_7d),
      externalExecutions24h:truthNum(growth.external_executions_24h),
      externalExecutions7d:truthNum(growth.external_executions_7d),
      verifiedOutbound24h:truthNum(cfg.verified_outbound_24h),
      verifiedOutbound7d:truthNum(cfg.verified_outbound_7d),
      monetizedOutbound24h:truthNum(cfg.monetized_outbound_24h),
      monetizedOutbound7d:truthNum(cfg.monetized_outbound_7d),
      corrections:truthNum(growth.correction_count),
      acquisitionPolicy:'outcome_weighted_bounded_always_on',
      acquisitionMin24h:ACQUISITION_SURGE_MIN_24H,
      acquisitionTarget24h:ACQUISITION_SURGE_TARGET_24H,
      acquisitionMax24h:ACQUISITION_SURGE_MAX_24H,
      emailTarget24h:EMAIL_TARGET_24H,
      emailMax24h:EMAIL_MAX_24H,
      emailSent24h:truthNum(emailCapacity?.sent24),
      emailLeasedRecent:truthNum(emailCapacity?.leased_recent),
      emailReadyContacts:contactSupplyMetrics?truthNum(contactSupplyMetrics.ready_email):truthNum(emailCapacity?.ready_contacts),
      emailReadyLaneRows:truthNum(emailCapacity?.ready_contacts),
      emailReputationQuarantine:truthNum(emailCapacity?.reputation_quarantine),
      contactSupplyTarget:truthNum(contactSupplyMetrics?.target_ready)||200,
      contactSupplyMin:truthNum(contactSupplyMetrics?.min_ready)||150,
      contactSupplyReadyEmail:truthNum(contactSupplyMetrics?.ready_email),
      contactSupplyReadyRoute:truthNum(contactSupplyMetrics?.ready_route),
      contactSupplyCooldown:truthNum(contactSupplyMetrics?.cooldown),
      contactSupplyResearching:truthNum(contactSupplyMetrics?.researching),
      contactSupplyUnresolved:truthNum(contactSupplyMetrics?.unresolved),
      contactSupplyApolloEligible:truthNum(contactSupplyMetrics?.apollo_eligible),
      contactSupplyApolloStatus:contactSupplyMetrics?.apollo_status||'plan_blocked_people_api',
      contactSupplyUpdatedAt:contactSupplyMetrics?.updated_at||null,
      emailDeliveryMode:makeSenderConfig?.value?'instant_webhook_plus_3h_fallback':'3h_polling_fallback',
      emailPushConfigured:Boolean(makeSenderConfig?.value),
      emailPushConfiguredAt:makeSenderConfig?.updated_at||null,
      reputationSensitiveActionMax24h:EMAIL_MAX_24H,
      machineSafeExternalActionMax24h:MACHINE_SAFE_EXTERNAL_MAX_24H,
      researchExternalJobMax24h:RESEARCH_EXTERNAL_MAX_24H,
      actionPlane:'cloudflare_authorize_external_execute_cloudflare_verify',
      computePlane:'render_external_overflow',
      emailPlane:'cloudflare_authorize_make_send_cloudflare_confirm',
      contactSupplyPlane:'catalog_plus_distribution_domains_render_public_discovery_provider_fallback',
      authPlane:'cloudflare_vault_render_browser_human_challenge_resume',
      activityIsNotSuccess:true,
      channelAllocationPct:{existingDemandSearch:60,authorityVendorNetwork:25,aiAeoDiscovery:10,growthRnd:5},
      canonicalAcquisitionSource:'ga4',
      strictHumanRole:'action_attribution_quality',
      waitForTrafficThreshold:false
    },
    traffic:{strictDaily},
    authority:{
      required:authorityRequired,
      verifiedBacklinks:truthNum(backlink.verified_backlinks),
      referringDomains:authorityVerifiedDomains,
      verifiedReferringDomains:authorityVerifiedDomains,
      internalVerifiedReferringDomains:internalAuthorityVerifiedDomains,
      seRankingReferringDomains,
      seRankingBacklinks:seRankingFresh?truthNum(seRankingBacklinkTruth?.metrics?.backlinks):null,
      seRankingObservedAt:seRankingFresh?seRankingObservedAt:null,
      referringDomainSource:seRankingFresh?'SE Ranking + internal verified ledger':'internal verified ledger',
      reconciliationGap:Math.max(0,authorityVerifiedDomains-internalAuthorityVerifiedDomains),
      bootstrapFloor:truthNum(backlink.bootstrap_referring_domain_floor)||10,
      attempts24h:authorityAttempts24,
      attempts7d:truthNum(backlink.attempts_7d),
      attemptMin24h:AUTHORITY_POLICY_MIN_24H,
      attemptTarget24h:AUTHORITY_POLICY_TARGET_24H,
      authorityQueue:authorityQueueNow,
      preparedActions:null,
      senderClaimed:null,
      lastVerifiedAt:backlink.last_verified_at||null,
      latestPlacementVerifiedAt:latestAuthorityPlacementAt,
      lastVerifiedAgeHours:backlink.last_verified_age_hours==null?null:Number(backlink.last_verified_age_hours),
      throughputGap:authorityThroughputGap,
      policySource:'current_runtime_policy',
      stagnating:Boolean(backlink.stagnating),
      history30:authorityHistory
    },
    affiliate:{
      productionRoutes:productionRoutes.length,
      pipelineActivePrograms:activePipeline,
      pipelineTrackedPrograms:programmes.length,
      pipelineStates:programmeStates,
      workflowStates,
      productionSlugs,
      activePipelineSlugs,
      productionWithoutActivePipeline,
      activePipelineWithoutProduction,
      workflowBySlug,
      reconciled:productionWithoutActivePipeline.length===0&&activePipelineWithoutProduction.length===0,
      source:'canonical affiliate registry + affiliate pipeline + D1 workflow'
    },
    search:{
      generatedAt:gscSignals?.source_generated_at||gsc?.generatedAt||null,
      runtimeGeneratedAt:gh?.generatedAt||gscHealth?.source_generated_at||null,
      runtimeOk:gh?.ok===true,
      runtimeStatus:gh?.status||null,
      impressions:truthNum(w.impressions||gh?.impressions),
      clicks:truthNum(w.clicks||gh?.clicks),
      observedPages:truthNum(gsc?.searchPerformance?.observedPages||gh?.observedPages),
      indexed:truthMaybeNum(idx.indexed),
      inspected:truthMaybeNum(idx.inspected),
      indexRecoveryCandidates:truthMaybeNum(idx.recoveryCandidates??idx.indexRecoveryCandidates),
      sitemaps:truthNum(sitemap.submittedCount||gh?.sitemaps),
      daily28,
      verifiedThroughDate,
      recent7,
      previous7,
      change7d
    },
    recentResults,
    growthActivity,
    growthActions,
    executionContract:contract,
    architecture:{
      openIncidents:truthNum(architecture.open_incidents),
      approvalRequired:Boolean(architecture.approval_required)
    },
    engines,
    sourceProof:{
      growth:'growth_supervisor_state',
      affiliateRoutes:'/data/affiliate.json enabled+url',
      affiliatePrograms:'/data/affiliate-pipeline.json status=active',
      search:"growth_asset_cache /reports/gsc-signals.json",
      searchRuntime:"growth_asset_cache /runtime/gsc-refresh-health.json",
      execution:'growth_execution_contract'
    }
  };
}
async function commandCenterBusinessTruth(request,env,{fresh=false}={}){
  const now=Date.now();
  if(!fresh&&businessTruthCache.value&&now-businessTruthCache.at<BUSINESS_TRUTH_CACHE_MS)return businessTruthCache.value;
  if(!fresh&&businessTruthCache.promise)return businessTruthCache.promise;
  const work=buildCommandCenterBusinessTruth(request,env).then(value=>{businessTruthCache={at:Date.now(),value,promise:null};return value}).catch(error=>{businessTruthCache.promise=null;throw error});
  businessTruthCache.promise=work;
  return work;
}
export default{
  async fetch(request,env,ctx){
    const u=new URL(request.url);
    if(request.method==='GET'&&u.pathname.startsWith('/tools/')){
      const m=u.pathname.match(/^\/tools\/([a-z0-9][a-z0-9-]*)(?:\.html)?\/?$/i);
      if(m){const runtime=await publicRuntimeToolResponse(env,m[1]).catch(()=>null);if(runtime)return injectToolScoutSocialFooter(runtime);}
    }
    if(request.method==='GET'&&u.pathname==='/api/command-center-business-truth'){
      const fresh=u.searchParams.get('fresh')==='1';
      return Response.json(await commandCenterBusinessTruth(request,env,{fresh}),{headers:{'Cache-Control':'private, no-store, max-age=0','X-ToolScout-Read-Mode':fresh?'fresh':'observability-cache'}});
    }
    if(request.method==='GET'&&u.pathname==='/api/command-center-simplified-health')return Response.json({
      ok:true,
      version:'business-truth-v10-hybrid-execution',
      canonicalView:'command-center-simplified-view',
      cards:['Business State','Traffic Progress','Authority Progress','Google Search Progress','Growth Brain','Needs You','Growth Execution Plane','Recent Results','System Truth'],
      suppressed:['North Star duplicate','Distribution Engine detail card','Affiliate Coverage detail table','ToolScout Footprint','Growth Ledger duplicate','Revenue & Coverage duplicate','Autonomous Growth duplicate','legacy Google Search chart','legacy traffic charts','visitor country charts','product behavior card'],
      canonicalSources:['Growth Supervisor','GA4','ToolScout redirect ledger','Google Search Console','verified backlink ledger','Chairman Queue','Cloudflare control plane','Render overflow compute','Make push sender','Auth Broker'],
      refreshSeconds:60,
      heavyRefreshSeconds:180,
      hiddenTabPolling:false,
      d1ReadConservation:'observability_only_hot_paths_indexed_compute_metrics_o1',
      growthRndFrontier:'net_new_acquisition_v1',
      unavailableIsNeverZero:true,
      generatedAt:new Date().toISOString()
    },{headers:{'Cache-Control':'no-store'}});
    const response=await base.fetch(request,env,ctx);
    if(request.method==='GET'&&(u.pathname==='/api/traffic-integrity-health'||u.pathname==='/analytics/api/stats'||u.pathname==='/api/stats'))return reconcile(response,env);
    if(request.method==='GET'&&COMMAND_CENTER_PATHS.has(u.pathname))return simplifiedPage(response,env);
    if(request.method==='GET')return injectToolScoutSocialFooter(response);
    return response;
  },
  async scheduled(event,env,ctx){
    return typeof base.scheduled==='function'?base.scheduled(event,env,ctx):undefined;
  }
};
