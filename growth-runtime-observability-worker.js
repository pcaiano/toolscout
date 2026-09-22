import base from './growth-runtime-closed-loop-worker.js';

const JSON_H={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'private, no-store, max-age=0'};
const SENDER_TIMEOUT_MINUTES=300;

async function first(env,sql){try{return await env.DB.prepare(sql).first()}catch{return null}}
async function all(env,sql){try{return (await env.DB.prepare(sql).all()).results||[]}catch{return[]}}
function n(v){const x=Number(v);return Number.isFinite(x)?x:0}
function parseTime(v){if(!v)return 0;const s=String(v);const t=Date.parse(s.includes('T')?s:s.replace(' ','T')+'Z');return Number.isFinite(t)?t:0}
function ageMinutes(v){const t=parseTime(v);return t?Math.max(0,Math.round((Date.now()-t)/60000)):null}
function headers(response,type='application/json; charset=UTF-8'){const h=new Headers(response.headers);h.set('Content-Type',type);h.set('Cache-Control','private, no-store, max-age=0');h.delete('Content-Length');h.delete('Content-Encoding');return h}
async function senderState(env){
  const row=await first(env,`SELECT COUNT(*) claimed,MIN(claimed_at) oldest_claimed_at,MAX(claimed_at) newest_claimed_at FROM growth_execution_contract WHERE executor='make_sender' AND status='claimed'`);
  const claimed=n(row?.claimed),oldest=row?.oldest_claimed_at||null,age=ageMinutes(oldest||row?.newest_claimed_at||null);
  return {claimed,oldestClaimedAt:oldest,newestClaimedAt:row?.newest_claimed_at||null,ageMinutes:age,fresh:claimed>0&&age!==null&&age<=SENDER_TIMEOUT_MINUTES,timeoutMinutes:SENDER_TIMEOUT_MINUTES};
}
async function publicExists(request,env,ctx,path){
  try{const r=await env.ASSETS.fetch(new Request(new URL(path,request.url)));if(r.ok)return true}catch{}
  try{const r=await base.fetch(new Request(new URL(path,request.url)),env,ctx);return r.ok}catch{return false}
}
async function catalogRuntime(env){
  const row=await first(env,`SELECT status,detail,evidence_json,started_at,completed_at FROM engine_runs WHERE engine='catalog' AND mission='runtime_quality' ORDER BY started_at DESC LIMIT 1`);
  if(!row)return null;
  let evidence=null;try{evidence=row.evidence_json?JSON.parse(row.evidence_json):null}catch{evidence=row.evidence_json||null}
  return {status:row.status||null,detail:row.detail||null,startedAt:row.started_at||null,completedAt:row.completed_at||null,evidence};
}
async function correctDiscovery(request,env,ctx,response){
  if(!response.ok||!String(response.headers.get('content-type')||'').includes('application/json'))return response;
  let d;try{d=await response.json()}catch{return response}
  const [routes,agentCard,llms,openapi,apis,catalog]=await Promise.all([
    first(env,`SELECT COUNT(DISTINCT domain) sources,MAX(updated_at) last_route_at FROM distribution_contact_routes WHERE COALESCE(domain,'')<>''`),
    publicExists(request,env,ctx,'/.well-known/agent-card.json'),publicExists(request,env,ctx,'/llms.txt'),publicExists(request,env,ctx,'/openapi.json'),publicExists(request,env,ctx,'/apis.json'),catalogRuntime(env)
  ]);
  const agentAssets={agentCard,llms,openapi,apis},assetCount=Object.values(agentAssets).filter(Boolean).length,agentReady=agentCard&&llms&&(openapi||apis);
  d.machine={...(d.machine||{}),agentReady,agentAssetCount:assetCount,agentAssets};
  d.discovery={...(d.discovery||{}),sources:n(routes?.sources),lastRouteAt:routes?.last_route_at||null};
  if(d.footprint){d.footprint.machine={...(d.footprint.machine||{}),agent_ready:agentReady,agent_assets:assetCount};d.footprint.distribution={...(d.footprint.distribution||{}),discovery_sources:n(routes?.sources)}}
  d.catalogRuntimeQuality=catalog;
  return new Response(JSON.stringify(d),{status:response.status,statusText:response.statusText,headers:headers(response)});
}
function issueIsFalseAsyncAuthority(issue){
  const text=[issue?.engine,issue?.title,issue?.detail,issue?.code].filter(Boolean).join(' ').toLowerCase();
  return text.includes('authority_execution_recovery')&&(text.includes('authority_queue_without_external_throughput')||text.includes('returned ok=false'));
}
async function correctStats(response,env){
  if(!response.ok||!String(response.headers.get('content-type')||'').includes('application/json'))return response;
  let d;try{d=await response.json()}catch{return response}
  const sender=await senderState(env);
  const g=d.growthOps||(d.growthOps={});
  if(sender.fresh){
    if(g.health&&Array.isArray(g.health.issues))g.health.issues=g.health.issues.filter(x=>!issueIsFalseAsyncAuthority(x));
    const a=g.autonomousGrowth||(g.autonomousGrowth={});
    a.authority_execution_status='waiting_external_confirmation';
    a.authority_external_handoff={status:'pending_external_confirmation',claimed:sender.claimed,oldestClaimedAt:sender.oldestClaimedAt,ageMinutes:sender.ageMinutes,timeoutMinutes:sender.timeoutMinutes,attemptsRemainEvidenceOnly:true};
    if(a.authority_execution)a.authority_execution={...a.authority_execution,status:'waiting_external_confirmation',detail:`${sender.claimed} authority sender task(s) are claimed and awaiting external callback. Oldest handoff age ${sender.ageMinutes} min; hard timeout ${sender.timeoutMinutes} min. Zero external attempts remain zero until callback proof.`};
  }
  g.catalogRuntimeQuality=await catalogRuntime(env);
  return new Response(JSON.stringify(d),{status:response.status,statusText:response.statusText,headers:headers(response)});
}
async function correctAutonomousHealth(response,env){
  if(!response.ok||!String(response.headers.get('content-type')||'').includes('application/json'))return response;
  let d;try{d=await response.json()}catch{return response}
  const sender=await senderState(env);
  if(sender.fresh){
    d.authorityExecution={...(d.authorityExecution||{}),status:'waiting_external_confirmation',pendingExternalConfirmation:true,senderClaimed:sender.claimed,senderClaimAgeMinutes:sender.ageMinutes,senderHandoffTimeoutMinutes:sender.timeoutMinutes,detail:`Authority handoff is valid and awaiting external callback. ${sender.claimed} task(s) claimed; oldest age ${sender.ageMinutes} min. Attempts are not incremented before callback proof.`};
    d.authority_execution_status='waiting_external_confirmation';
    if(d.overallHealth)d.overallHealth={...d.overallHealth,authorityStatus:'waiting_external_confirmation'};
  }
  return new Response(JSON.stringify(d),{status:response.status,statusText:response.statusText,headers:headers(response)});
}

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url),response=await base.fetch(request,env,ctx);
    if(request.method==='GET'&&url.pathname==='/api/distribution/discovery-health')return correctDiscovery(request,env,ctx,response);
    if(request.method==='GET'&&(url.pathname==='/analytics/api/stats'||url.pathname==='/api/stats'))return correctStats(response,env);
    if(request.method==='GET'&&url.pathname==='/api/autonomous-growth-health')return correctAutonomousHealth(response,env);
    return response;
  },
  async scheduled(event,env,ctx){return typeof base.scheduled==='function'?base.scheduled(event,env,ctx):undefined}
};