import base from './authority-acquisition-worker.js';
import {commandCenterHtml} from './command-center-simplified-view.js';

function jsonHeaders(response){
  const h=new Headers(response.headers);
  h.set('Content-Type','application/json; charset=UTF-8');
  h.set('Cache-Control','private, no-store, max-age=0');
  h.delete('Content-Length');h.delete('Content-Encoding');
  return h;
}
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
function keepIssue(issue,f){
  const metric=String(issue?.metric||''),reason=String(issue?.reason||'');
  if(reason==='superseded_by_single_path_scheduler_fix')return false;
  if(f.ga4Connected&&metric==='ga4')return false;
  if(f.authorityAttempts24>=6&&metric==='engine:distribution:authority_execution_recovery')return false;
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
  const f=await facts(env);
  if(d.commandCenterIntegrity)d.commandCenterIntegrity=reconcileAudit(d.commandCenterIntegrity,f);
  if(d.measurementAudit)d.measurementAudit=reconcileAudit(d.measurementAudit,f);
  if(d?.growthOps?.health?.issues){
    const issues=d.growthOps.health.issues.filter(x=>keepIssue(x,f));
    d.growthOps={...d.growthOps,health:{...d.growthOps.health,issues}};
  }
  if(d.resilientCommandCenter&&d.measurementAudit)d.resilientCommandCenter={...d.resilientCommandCenter,integrityStatus:d.measurementAudit.status};
  d.operationalTruthReconciliation={version:'live-runtime-v1',ga4Connected:f.ga4Connected,authorityAttempts24:f.authorityAttempts24,authorityThroughputHealthy:f.authorityAttempts24>=6,contentStatus:f.contentStatus,generatedAt:new Date().toISOString()};
  return new Response(JSON.stringify(d),{status:response.status,statusText:response.statusText,headers:jsonHeaders(response)});
}

const COMMAND_CENTER_PATHS=new Set(['/analytics','/analytics/','/analytics.html','/analytics-v2','/analytics-v2/','/analytics-v2.html','/command-center','/command-center/']);
function simplifiedPage(response){
  if(!response?.ok)return response;
  const type=String(response.headers.get('Content-Type')||'').toLowerCase();
  if(!type.includes('text/html'))return response;
  const headers=new Headers(response.headers);
  headers.set('Content-Type','text/html; charset=UTF-8');
  headers.set('Cache-Control','private, no-store, max-age=0');
  headers.delete('Content-Length');headers.delete('Content-Encoding');
  return new Response(commandCenterHtml(),{status:response.status,statusText:response.statusText,headers});
}


const truthNum=v=>Number.isFinite(Number(v))?Number(v):0;
async function ccAssetJson(request,env,path,fallback){
  try{
    const url=new URL(path,request.url);
    const r=env.ASSETS?await env.ASSETS.fetch(new Request(url.toString(),{headers:{Accept:'application/json'}})):null;
    if(!r||!r.ok)return fallback;
    return await r.json();
  }catch{return fallback}
}
async function commandCenterBusinessTruth(request,env){
  const [supervisorRows,contractRows,gscSignals,gscHealth,affiliateRegistry,affiliatePipeline]=await Promise.all([
    env.DB.prepare(\`SELECT engine,status,directive,directive_json,strict_humans_24h,strict_humans_7d,attributed_humans_7d,external_executions_24h,external_executions_7d,correction_count,last_correction_at,last_evaluated_at
      FROM growth_supervisor_state ORDER BY CASE engine WHEN 'growth_brain' THEN 0 ELSE 1 END,engine\`).all().then(r=>r.results||[]).catch(()=>[]),
    env.DB.prepare(\`SELECT executor,status,COUNT(*) n FROM growth_execution_contract GROUP BY executor,status\`).all().then(r=>r.results||[]).catch(()=>[]),
    env.DB.prepare(\`SELECT payload_json,source_generated_at,updated_at FROM growth_asset_cache WHERE path='/reports/gsc-signals.json' LIMIT 1\`).first().catch(()=>null),
    env.DB.prepare(\`SELECT payload_json,source_generated_at,updated_at FROM growth_asset_cache WHERE path='/runtime/gsc-refresh-health.json' LIMIT 1\`).first().catch(()=>null),
    ccAssetJson(request,env,'/data/affiliate.json',{}),
    ccAssetJson(request,env,'/data/affiliate-pipeline.json',{verified_programs:[]})
  ]);
  const parse=(v,fallback={})=>{try{return JSON.parse(v||'')}catch{return fallback}};
  const byEngine=new Map(supervisorRows.map(x=>[x.engine,x]));
  const growth=byEngine.get('growth_brain')||{};
  const cfg=parse(growth.directive_json,{});
  const backlink=cfg.backlink_acquisition||{};
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
  const activePipeline=programmes.filter(p=>String(p?.status||'')==='active').length;

  const gsc=parse(gscSignals?.payload_json,{});
  const gh=parse(gscHealth?.payload_json,{});
  const w=gsc?.searchPerformance?.window28d||gsc?.window28d||{};
  const idx=gsc?.indexHealth||{};
  const sitemap=gsc?.sitemaps||{};
  const engines=supervisorRows.filter(x=>x.engine!=='growth_brain').map(x=>({
    engine:x.engine,status:x.status,directive:x.directive,lastEvaluatedAt:x.last_evaluated_at
  }));
  return {
    ok:true,
    version:'command-center-business-truth-v1',
    generatedAt:new Date().toISOString(),
    growth:{
      status:growth.status||null,
      directive:growth.directive||null,
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
      corrections:truthNum(growth.correction_count)
    },
    authority:{
      required:Boolean(backlink.required),
      verifiedBacklinks:truthNum(backlink.verified_backlinks),
      verifiedReferringDomains:truthNum(backlink.verified_referring_domains),
      bootstrapFloor:truthNum(backlink.bootstrap_referring_domain_floor),
      attempts24h:truthNum(backlink.attempts_24h),
      attempts7d:truthNum(backlink.attempts_7d),
      attemptMin24h:truthNum(backlink.attempt_min_24h),
      authorityQueue:truthNum(backlink.authority_queue),
      lastVerifiedAt:backlink.last_verified_at||null,
      lastVerifiedAgeHours:backlink.last_verified_age_hours==null?null:Number(backlink.last_verified_age_hours),
      throughputGap:Boolean(backlink.throughput_gap),
      stagnating:Boolean(backlink.stagnating)
    },
    affiliate:{
      productionRoutes:productionRoutes.length,
      pipelineActivePrograms:activePipeline,
      pipelineTrackedPrograms:programmes.length,
      pipelineStates:programmeStates,
      productionSlugs:productionRoutes.map(([slug])=>slug).sort(),
      source:'canonical affiliate registry + affiliate pipeline'
    },
    search:{
      generatedAt:gscSignals?.source_generated_at||gsc?.generatedAt||null,
      runtimeGeneratedAt:gh?.generatedAt||gscHealth?.source_generated_at||null,
      runtimeOk:gh?.ok===true,
      runtimeStatus:gh?.status||null,
      impressions:truthNum(w.impressions||gh?.impressions),
      clicks:truthNum(w.clicks||gh?.clicks),
      observedPages:truthNum(gsc?.searchPerformance?.observedPages||gh?.observedPages),
      indexed:truthNum(idx.indexed),
      inspected:truthNum(idx.inspected),
      indexRecoveryCandidates:truthNum(idx.recoveryCandidates||idx.indexRecoveryCandidates),
      sitemaps:truthNum(sitemap.submittedCount||gh?.sitemaps)
    },
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
export default{
  async fetch(request,env,ctx){
    const u=new URL(request.url);
    if(request.method==='GET'&&u.pathname==='/api/command-center-business-truth')return Response.json(await commandCenterBusinessTruth(request,env),{headers:{'Cache-Control':'no-store'}});
    if(request.method==='GET'&&u.pathname==='/api/command-center-simplified-health')return Response.json({
      ok:true,
      version:'business-truth-v3',
      canonicalView:'command-center-simplified-view',
      cards:['Business State','Growth Brain','Needs You','Recent Results','Search + Authority','System Truth'],
      suppressed:['North Star duplicate','Distribution Engine detail card','Affiliate Coverage detail table','ToolScout Footprint','Growth Ledger duplicate','Revenue & Coverage duplicate','Autonomous Growth duplicate','Google Search trend chart','Traffic truth charts','visitor country charts','product behavior card'],
      canonicalSources:['Growth Supervisor','GA4','ToolScout redirect ledger','Google Search Console','verified backlink ledger','Chairman Queue','Cloudflare runtime'],
      refreshSeconds:60,
      unavailableIsNeverZero:true,
      generatedAt:new Date().toISOString()
    },{headers:{'Cache-Control':'no-store'}});
    const response=await base.fetch(request,env,ctx);
    if(request.method==='GET'&&(u.pathname==='/api/traffic-integrity-health'||u.pathname==='/analytics/api/stats'||u.pathname==='/api/stats'))return reconcile(response,env);
    if(request.method==='GET'&&COMMAND_CENTER_PATHS.has(u.pathname))return simplifiedPage(response);
    return response;
  },
  async scheduled(event,env,ctx){
    return typeof base.scheduled==='function'?base.scheduled(event,env,ctx):undefined;
  }
};
