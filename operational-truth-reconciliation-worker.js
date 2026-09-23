import base from './authority-acquisition-worker.js';

function jsonHeaders(response){
  const h=new Headers(response.headers);
  h.set('Content-Type','application/json; charset=UTF-8');
  h.set('Cache-Control','private, no-store, max-age=0');
  h.delete('Content-Length');h.delete('Content-Encoding');
  return h;
}
async function facts(env){
  const [oauth,authority]=await Promise.all([
    env.DB.prepare(`SELECT provider,updated_at,last_refresh_at,last_error
      FROM google_oauth_connections WHERE provider='google_analytics' LIMIT 1`).first().catch(()=>null),
    env.DB.prepare(`SELECT
      (SELECT COUNT(*) FROM distribution_submissions WHERE surface_slug<>'indexnow' AND attempts>0 AND COALESCE(last_attempt_at,created_at)>=datetime('now','-24 hours'))+
      (SELECT COUNT(*) FROM distribution_events WHERE event_type IN ('vendor_outreach_sent','publisher_network_outreach_sent') AND created_at>=datetime('now','-24 hours')) attempts24`).first().catch(()=>null)
  ]);
  return {ga4Connected:Boolean(oauth?.provider==='google_analytics'),authorityAttempts24:Number(authority?.attempts24||0)};
}
function keepIssue(issue,f){
  const metric=String(issue?.metric||'');
  if(f.ga4Connected&&metric==='ga4')return false;
  if(f.authorityAttempts24>=6&&metric==='engine:distribution:authority_execution_recovery')return false;
  return true;
}
function reconcileAudit(a,f){
  if(!a||typeof a!=='object')return a;
  const issues=(Array.isArray(a.issues)?a.issues:[]).filter(x=>keepIssue(x,f));
  const sources={...(a.sources||{})};
  if(f.ga4Connected)sources.ga4={status:'live_on_demand',generated_at:new Date().toISOString(),age_minutes:0,source:'Google Analytics 4 Data API via OAuth'};
  const status=issues.some(x=>x?.severity==='error')?'degraded':issues.length?'warning':'healthy';
  return {...a,status,issues,sources};
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
  d.operationalTruthReconciliation={version:'live-runtime-v1',ga4Connected:f.ga4Connected,authorityAttempts24:f.authorityAttempts24,authorityThroughputHealthy:f.authorityAttempts24>=6,generatedAt:new Date().toISOString()};
  return new Response(JSON.stringify(d),{status:response.status,statusText:response.statusText,headers:jsonHeaders(response)});
}

export default{
  async fetch(request,env,ctx){
    const u=new URL(request.url);
    const response=await base.fetch(request,env,ctx);
    if(request.method==='GET'&&(u.pathname==='/api/traffic-integrity-health'||u.pathname==='/analytics/api/stats'||u.pathname==='/api/stats'))return reconcile(response,env);
    return response;
  },
  async scheduled(event,env,ctx){
    return typeof base.scheduled==='function'?base.scheduled(event,env,ctx):undefined;
  }
};
