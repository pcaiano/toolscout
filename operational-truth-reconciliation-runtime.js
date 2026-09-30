// ToolScout 2.0 compatibility reconciliation for mature observability payloads.
// This module is deliberately not a fetch-wrapper and has no legacy base import.

function jsonHeaders(response){
  const h=new Headers(response.headers);
  h.set('Content-Type','application/json; charset=UTF-8');
  h.set('Cache-Control','private, no-store, max-age=0');
  h.delete('Content-Length');h.delete('Content-Encoding');
  return h;
}
const FACTS_CACHE_MS=60000;
const AUTHORITY_POLICY_MIN_24H=4;

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

export {reconcile as reconcileOperationalTruth};
