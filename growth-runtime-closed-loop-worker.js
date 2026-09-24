import base from './growth-runtime-integrity-worker.js';
import {runWithLedger,missionCycleHeaders,copyMissionCycleHeaders} from './engine-run-ledger.js';

const JSON_H={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'private, no-store, max-age=0'};
const AUTHORITY_ATTEMPT_MIN_24H=15;
const AUTHORITY_ATTEMPT_TARGET_24H=25;
const SENDER_HANDOFF_WARN_MINUTES=120;
const SENDER_HANDOFF_TIMEOUT_MINUTES=300;
const AUTHORITY_HEALTH_CACHE_MS=90000;
let authorityHealthCache={at:0,value:null,promise:null};

async function first(env,sql){try{return await env.DB.prepare(sql).first()}catch{return null}}
async function all(env,sql){try{return (await env.DB.prepare(sql).all()).results||[]}catch{return[]}}
function num(v){const n=Number(v);return Number.isFinite(n)?n:0}
function sqlTimeMs(v){if(!v)return 0;const s=String(v);const t=Date.parse(s.includes('T')?s:s.replace(' ','T')+'Z');return Number.isFinite(t)?t:0}
function ageMinutes(v){const t=sqlTimeMs(v);return t?Math.max(0,Math.round((Date.now()-t)/60000)):null}
async function recordEvent(env,eventType,status,detail){
  try{
    await env.DB.prepare(`INSERT INTO distribution_events(event_id,event_type,status,asset_type,detail,observed_at,created_at) VALUES(?,?,?,?,?,datetime('now'),datetime('now'))`)
      .bind(`authority_closed_loop_${crypto.randomUUID()}`,eventType,status,'backlink_acquisition',String(detail||'').slice(0,1800)).run();
  }catch{}
}
async function authoritySnapshot(env){
  const [row,recentEvents,recentTasks]=await Promise.all([
    first(env,`SELECT
      (SELECT COUNT(*) FROM distribution_submissions WHERE surface_slug<>'indexnow' AND attempts>0 AND COALESCE(last_attempt_at,created_at)>=datetime('now','-24 hours'))+
      (SELECT COUNT(*) FROM distribution_events WHERE event_type IN ('vendor_outreach_sent','publisher_network_outreach_sent') AND created_at>=datetime('now','-24 hours')) attempts24,
      (SELECT COUNT(*) FROM growth_execution_contract WHERE action IN ('backlink_reference_outreach','verify_backlink_acquisition','publisher_contact_discovery','execute_alternate_routes','publisher_outreach','autonomous_route_qualification') AND status IN ('pending','claimed','attempted','deferred','stalled')) queue,
      (SELECT COUNT(*) FROM growth_action_events WHERE status='prepared' AND engine IN ('distribution_route','distribution_network','vendor_amplification')) prepared,
      (SELECT COUNT(*) FROM growth_execution_contract WHERE executor='make_sender' AND status='claimed') sender_claimed,
      (SELECT MAX(claimed_at) FROM growth_execution_contract WHERE executor='make_sender' AND status='claimed') sender_newest_claimed_at,
      (SELECT MIN(claimed_at) FROM growth_execution_contract WHERE executor='make_sender' AND status='claimed') sender_oldest_claimed_at`),
    all(env,`SELECT event_type,status,detail,created_at FROM distribution_events
      WHERE event_type IN ('vendor_outreach_sent','publisher_network_outreach_sent','vendor_outreach_failed','publisher_network_outreach_failed','authority_closed_loop_external_attempt','authority_closed_loop_handoff_ready','authority_external_handoff_pending','authority_external_handoff_timeout','authority_queue_without_external_handoff')
      ORDER BY created_at DESC LIMIT 8`),
    all(env,`SELECT task_id,subject_type,subject_key,action,status,claimed_at,attempted_at,updated_at
      FROM growth_execution_contract WHERE executor='make_sender' AND status IN ('claimed','attempted','verified','blocked')
      ORDER BY COALESCE(claimed_at,updated_at) DESC LIMIT 5`)
  ]);
  const senderNewestClaimedAt=row?.sender_newest_claimed_at||null;
  const senderOldestClaimedAt=row?.sender_oldest_claimed_at||null;
  const senderClaimAgeMinutes=ageMinutes(senderOldestClaimedAt||senderNewestClaimedAt);
  const senderClaimed=num(row?.sender_claimed);
  const senderFreshClaim=senderClaimed>0&&senderClaimAgeMinutes!==null&&senderClaimAgeMinutes<=SENDER_HANDOFF_TIMEOUT_MINUTES;
  const senderWarning=senderFreshClaim&&senderClaimAgeMinutes>SENDER_HANDOFF_WARN_MINUTES;
  return {
    attempts24:num(row?.attempts24),queue:num(row?.queue),prepared:num(row?.prepared),senderClaimed,
    senderNewestClaimedAt,senderOldestClaimedAt,senderClaimAgeMinutes,senderFreshClaim,senderWarning,
    senderHandoffTimeoutMinutes:SENDER_HANDOFF_TIMEOUT_MINUTES,recentEvents,recentTasks
  };
}
function authorityStatus(state){
  if(state.senderFreshClaim)return'waiting_external_confirmation';
  if(state.senderClaimed>0)return'external_handoff_timeout';
  if(state.queue<=0)return'queue_drained';
  if(state.attempts24>=AUTHORITY_ATTEMPT_MIN_24H)return'executing_backlog';
  return'execution_required';
}
async function authorityHealthSnapshot(env,{fresh=false}={}){
  const now=Date.now();
  if(!fresh&&authorityHealthCache.value&&now-authorityHealthCache.at<AUTHORITY_HEALTH_CACHE_MS)return authorityHealthCache.value;
  if(!fresh&&authorityHealthCache.promise)return authorityHealthCache.promise;
  const work=(async()=>{
    const state=await authoritySnapshot(env);
    await normalizeFalseAsyncFailure(env,state);
    const value={status:authorityStatus(state),...state,attemptMin24h:AUTHORITY_ATTEMPT_MIN_24H,attemptTarget24h:AUTHORITY_ATTEMPT_TARGET_24H,attemptFloorIsMinimumNotCap:true,drainBacklogBeforeSlowdown:true,preparedDoesNotCountAsExecution:true,externalCallbackRequiredForEmailAttempt:true};
    authorityHealthCache={at:Date.now(),value,promise:null};
    return value;
  })().catch(error=>{authorityHealthCache.promise=null;throw error});
  authorityHealthCache.promise=work;
  return work;
}
async function normalizeFalseAsyncFailure(env,state){
  if(!state.senderFreshClaim)return 0;
  try{
    const evidence=JSON.stringify({reason:'pending_external_confirmation',sender_claimed:state.senderClaimed,oldest_claim_age_minutes:state.senderClaimAgeMinutes,attempts24:state.attempts24,attempt_floor_24h:AUTHORITY_ATTEMPT_MIN_24H});
    const r=await env.DB.prepare(`UPDATE engine_runs
      SET status='completed',completed_at=COALESCE(completed_at,datetime('now')),detail='pending_external_confirmation',evidence_json=?,updated_at=datetime('now')
      WHERE engine='distribution' AND mission='authority_execution_recovery' AND status='failed'
        AND started_at>=datetime('now','-6 hours')
        AND (COALESCE(detail,'') LIKE '%authority_queue_without_external_throughput%' OR COALESCE(evidence_json,'') LIKE '%authority_queue_without_external_throughput%' OR COALESCE(detail,'') LIKE '%returned ok=false%')`).bind(evidence).run();
    return Number(r?.meta?.changes||r?.changes||0);
  }catch{return 0}
}
function authorized(request,env){
  const token=(request.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');
  return Boolean(env.ADMIN_TOKEN&&token===env.ADMIN_TOKEN);
}
async function internalJson(baseRequest,env,ctx,path,{method='POST',body=null}={}){
  if(!env.ADMIN_TOKEN)return {ok:false,httpStatus:0,error:'admin_token_unavailable'};
  const headers=new Headers({Authorization:`Bearer ${env.ADMIN_TOKEN}`,'Content-Type':'application/json'});copyMissionCycleHeaders(baseRequest,headers);
  const init={method,headers};
  if(body!=null)init.body=JSON.stringify(body);
  try{
    const response=await base.fetch(new Request(new URL(path,baseRequest.url),init),env,ctx);
    let payload=null;try{payload=await response.json()}catch{}
    return {ok:response.ok,httpStatus:response.status,payload};
  }catch(error){return {ok:false,httpStatus:0,error:String(error?.message||error).slice(0,500)}}
}
async function assetExists(request,env,path){
  try{const r=await env.ASSETS.fetch(new Request(new URL(path,request.url)));return r.ok}catch{return false}
}
async function discoverySnapshot(request,env){
  const [opportunityStates,submissionStates,routeStates,placements,events,agentCard,llms,openapi,apis]=await Promise.all([
    all(env,`SELECT status,human_required,surface_type,COUNT(*) n FROM distribution_opportunities GROUP BY status,human_required,surface_type`),
    all(env,`SELECT status,COUNT(*) n,MAX(COALESCE(last_attempt_at,created_at)) last_at FROM distribution_submissions GROUP BY status`),
    all(env,`SELECT execution_mode,status,COUNT(*) n FROM distribution_contact_route_actions GROUP BY execution_mode,status`),
    first(env,`SELECT COUNT(*) verified FROM distribution_placements WHERE placement_verified=1 AND surface_slug NOT IN ('rss','toolscout-ard','toolscout-machine-discovery')`),
    first(env,`SELECT MAX(created_at) last_scan_at,COUNT(DISTINCT COALESCE(surface_slug,destination_url)) sources FROM distribution_events WHERE event_type IN ('distribution_network_cycle','autonomous_distribution_qualification','distribution_discovery_refresh') AND created_at>=datetime('now','-7 days')`),
    assetExists(request,env,'/.well-known/agent-card.json'),assetExists(request,env,'/llms.txt'),assetExists(request,env,'/openapi.json'),assetExists(request,env,'/apis.json')
  ]);
  const opTotal=opportunityStates.reduce((s,x)=>s+num(x.n),0);
  const directoryLike=opportunityStates.filter(x=>/directory|listing|catalog/i.test(String(x.surface_type||''))).reduce((s,x)=>s+num(x.n),0);
  const noHuman=opportunityStates.filter(x=>num(x.human_required)===0&&!['policy_blocked','rejected','skipped','unavailable_free'].includes(String(x.status||''))).reduce((s,x)=>s+num(x.n),0);
  const submissionPending=submissionStates.filter(x=>['queued','ready_to_submit','submitted','pending_review','retry_due','auth_required'].includes(String(x.status||''))).reduce((s,x)=>s+num(x.n),0);
  const submissionAttempted=submissionStates.filter(x=>['submitted','pending_review','live','verified'].includes(String(x.status||''))).reduce((s,x)=>s+num(x.n),0);
  const autoRows=routeStates.filter(x=>x.execution_mode==='autonomous_qualification');
  const autoEligible=autoRows.filter(x=>!['policy_blocked','exhausted','human_action_required','auth_required'].includes(String(x.status||''))).reduce((s,x)=>s+num(x.n),0);
  const autoVerified=autoRows.filter(x=>['verified_placement','verified_human_impact'].includes(String(x.status||''))).reduce((s,x)=>s+num(x.n),0);
  const autoAdaptersReady=autoRows.filter(x=>['qualified_auto','executed_waiting_verification','verified_placement','verified_human_impact'].includes(String(x.status||''))).reduce((s,x)=>s+num(x.n),0);
  const agentAssets={agentCard,llms,openapi,apis};
  const agentAssetCount=Object.values(agentAssets).filter(Boolean).length;
  const agentReady=agentCard&&llms&&(openapi||apis);
  const verifiedExternalPlacements=num(placements?.verified);
  return {
    generatedAt:new Date().toISOString(),source:'runtime_d1_and_public_assets',
    machine:{verified:autoVerified,eligible:autoEligible,agentReady,agentAssetCount,agentAssets},
    discovery:{surfaces:opTotal,directoryLike,noHumanCandidates:noHuman,lastScanAt:events?.last_scan_at||null,sources:num(events?.sources)},
    pipeline:{submittedPending:submissionPending,attemptedOrBeyond:submissionAttempted,autoAdaptersReady,automaticVerified:autoVerified,verifiedExternalPlacements},
    footprint:{distribution:{live_verified:verifiedExternalPlacements,submitted_pending:submissionPending,discovered_surfaces:opTotal,no_human_candidates:noHuman,automatic_pipeline_verified:autoVerified,auto_adapters_verified:autoAdaptersReady,discovery_sources:num(events?.sources),last_scan_at:events?.last_scan_at||null},machine:{verified:autoVerified,eligible:autoEligible,agent_ready:agentReady,agent_assets:agentAssetCount}},
    semantics:{machineVerified:'Verified autonomous route placement or strict-human impact only.',machineEligible:'Autonomous qualification routes not blocked by policy, authentication or human-only gates.',submittedPending:'Current D1 submission states, not legacy endpoint fallbacks.',agentReady:'Public agent card plus llms.txt plus OpenAPI or APIs catalog are reachable.'}
  };
}
async function closeAuthorityExecutionLoop(request,env,ctx){
  const before=await authoritySnapshot(env);
  if(before.queue<=0){
    return {ok:true,skipped:true,reason:'authority_queue_drained',status:authorityStatus(before),before,after:before,pipelineClosed:true,throughputFloorMet:before.attempts24>=AUTHORITY_ATTEMPT_MIN_24H};
  }
  // Authority acquisition is Cloudflare-first. A pending external sender handoff must
  // never block no-auth/API/MCP submission routes. Machine routes are always attempted first.
  // before falling back to email/outreach handoffs that depend on an external sender.
  const submissionPackage=await internalJson(request,env,ctx,'/api/distribution/submissions/package');
  const submissionExecute=await internalJson(request,env,ctx,'/api/distribution/submissions/execute');
  const submissionVerify=await internalJson(request,env,ctx,'/api/distribution/submissions/verify');
  const autonomous=await internalJson(request,env,ctx,'/api/distribution/autonomous/refresh');

  const afterMachine=await authoritySnapshot(env);
  const machineAttemptObserved=afterMachine.attempts24>before.attempts24;
  if(machineAttemptObserved){
    await recordEvent(env,'authority_closed_loop_external_attempt','completed',`Cloudflare-native authority execution increased real external attempts from ${before.attempts24} to ${afterMachine.attempts24}. The loop will continue into network, coordination and sender lanes while backlog remains.`);
  }

  // A live sender handoff is evidence of pending external work, not a reason to stop
  // replenishing and dispatching other independent authority routes.
  if(before.senderFreshClaim){
    await normalizeFalseAsyncFailure(env,before);
    await recordEvent(env,'authority_external_handoff_pending','pending',`Authority sender has ${before.senderClaimed} claimed task(s) awaiting callback. The authority loop continues replenishment and bounded parallel dispatch while backlog remains.`);
  }else if(before.senderClaimed>0){
    await recordEvent(env,'authority_external_handoff_timeout','failed',`Authority sender has ${before.senderClaimed} stale claimed task(s), oldest age ${before.senderClaimAgeMinutes} min. Reconciliation and redispatch continue instead of terminating the authority cycle.`);
  }

  const network=await internalJson(request,env,ctx,'/api/distribution/network/refresh');
  const coordination=await internalJson(request,env,ctx,'/api/growth/opportunities/refresh');
  const execution=await internalJson(request,env,ctx,'/api/growth/execution/dispatch');
  const senderHandoff=await internalJson(request,env,ctx,'/api/distribution/vendor-amplification/public-candidates?limit=8',{method:'GET'});

  const after=await authoritySnapshot(env);
  const externalAttemptObserved=after.attempts24>before.attempts24;
  const handoffItems=Array.isArray(senderHandoff?.payload?.items)?senderHandoff.payload.items:[];
  const handoffReady=handoffItems.length>0||after.senderFreshClaim;
  const stages={
    submissionPackage:submissionPackage.ok,submissionExecute:submissionExecute.ok,submissionVerify:submissionVerify.ok,
    autonomous:autonomous.ok,network:network.ok,coordination:coordination.ok,execution:execution.ok,senderHandoff:senderHandoff.ok
  };
  const coreStagesOk=stages.submissionPackage&&stages.submissionExecute&&stages.submissionVerify&&stages.autonomous&&stages.network&&stages.coordination&&stages.execution&&stages.senderHandoff;

  if(externalAttemptObserved){
    await recordEvent(env,'authority_closed_loop_external_attempt','completed',`Closed-loop authority recovery increased real external attempts from ${before.attempts24} to ${after.attempts24}.`);
  }else if(handoffReady){
    await normalizeFalseAsyncFailure(env,after);
    await recordEvent(env,'authority_external_handoff_pending','pending',`Authority pipeline reached the external sender. ${after.senderClaimed} task(s) claimed; oldest claim age ${after.senderClaimAgeMinutes??0} min. No external attempt is counted until callback confirmation.`);
  }else{
    const failed=Object.entries(stages).filter(([,ok])=>!ok).map(([name])=>name).join(',')||'external_sender_no_candidate';
    await recordEvent(env,'authority_queue_without_external_handoff','failed',`Authority pipeline produced no verified external attempt and no sender handoff. Failed or empty stage: ${failed}. Queue ${after.queue}; prepared ${after.prepared}; sender claimed ${after.senderClaimed}.`);
  }

  return {
    ok:coreStagesOk&&(externalAttemptObserved||handoffReady),
    status:externalAttemptObserved?'external_attempt_confirmed':handoffReady?'pending_external_confirmation':'failed',
    reason:(!externalAttemptObserved&&!handoffReady)?'authority_queue_without_external_handoff':null,
    pendingExternalConfirmation:!externalAttemptObserved&&handoffReady,
    pipelineClosed:coreStagesOk,externalAttemptObserved,handoffReady,handoffCandidateCount:handoffItems.length,stages,before,after,
    submissionPackage:submissionPackage.payload||submissionPackage.error||null,submissionExecute:submissionExecute.payload||submissionExecute.error||null,submissionVerify:submissionVerify.payload||submissionVerify.error||null,
    network:network.payload||network.error||null,autonomous:autonomous.payload||autonomous.error||null,coordination:coordination.payload||coordination.error||null,execution:execution.payload||execution.error||null,
    senderHandoff:{ok:senderHandoff.ok,httpStatus:senderHandoff.httpStatus,status:senderHandoff?.payload?.status||null,reason:senderHandoff?.payload?.reason||null,items:handoffItems.map(x=>({kind:x.kind||null,task_id:x.task_id||null,task_action:x.task_action||null,tool_slug:x.tool_slug||null,asset_url:x.asset_url||null,vendor_domain:x.vendor_domain||null}))},
    executor:'cloudflare'
  };
}
function analyticsPath(path){return path==='/analytics'||path==='/analytics/'||path==='/analytics.html'||path==='/analytics-v2'||path==='/analytics-v2/'||path==='/analytics-v2.html'}
function responseHeaders(response,type){const h=new Headers(response.headers);h.set('Content-Type',type);h.set('Cache-Control','private, no-store, max-age=0');h.delete('Content-Length');h.delete('Content-Encoding');return h}
async function augmentStats(request,response,env){
  if(!response?.ok||(response.headers.get('Content-Type')||'').toLowerCase().indexOf('application/json')<0)return response;
  let data;try{data=await response.json()}catch{return response}
  const [authority,discovery]=await Promise.all([authorityHealthSnapshot(env),discoverySnapshot(request,env)]);
  data.growthOps=data.growthOps||{};
  data.growthOps.machineDiscovery=discovery;
  data.growthOps.footprint=data.growthOps.footprint||{};
  data.growthOps.footprint.distribution={...(data.growthOps.footprint.distribution||{}),...discovery.footprint.distribution};
  data.growthOps.footprint.machine=discovery.footprint.machine;
  data.growthOps.authorityClosedLoop={...authority,status:authorityStatus(authority),attemptMin24h:AUTHORITY_ATTEMPT_MIN_24H,attemptTarget24h:AUTHORITY_ATTEMPT_TARGET_24H};
  return new Response(JSON.stringify(data),{status:response.status,statusText:response.statusText,headers:responseHeaders(response,'application/json; charset=UTF-8')});
}
const UI_PATCH=`<style id="toolscout-closed-loop-v2-style">#tsAuthorityConcreteActions{border-top:1px solid var(--line);margin-top:8px;padding-top:8px;font-size:9px;color:var(--muted);line-height:1.45}#tsAuthorityConcreteActions b{color:var(--text);font-size:10px}.tsPendingExternal{color:#8a6b24}</style><script id="toolscout-closed-loop-v2-ui">(function(){if(window.__toolscoutClosedLoopV2)return;window.__toolscoutClosedLoopV2=true;function n(v){var x=Number(v);return Number.isFinite(x)?x:0}function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}function setMetric(label,value,meta){document.querySelectorAll('.metric').forEach(function(m){var s=m.querySelector('small');if(!s||s.textContent.trim()!==label)return;var b=m.querySelector('b'),sp=m.querySelector('span');if(b)b.textContent=value;if(sp&&meta!=null)sp.textContent=meta})}function setRow(label,value,meta){document.querySelectorAll('.row').forEach(function(r){var name=r.querySelector('.rowName');if(!name||name.textContent.trim()!==label)return;var val=r.querySelector('.rowValue'),desc=r.querySelector('.rowMeta');if(val&&value!=null)val.textContent=value;if(desc&&meta!=null)desc.textContent=meta})}function authorityActions(a){var rows=Array.isArray(a.recentTasks)?a.recentTasks:[],events=Array.isArray(a.recentEvents)?a.recentEvents:[];var host=null;document.querySelectorAll('.row').forEach(function(r){var x=r.querySelector('.rowName');if(x&&x.textContent.trim()==='Authority loop')host=r});if(!host)return;var old=document.getElementById('tsAuthorityConcreteActions');if(old)old.remove();var parts=[];rows.slice(0,2).forEach(function(x){parts.push('<div><b>'+esc(String(x.action||'authority task').replaceAll('_',' '))+'</b> · '+esc(x.status||'')+' · '+esc(x.subject_key||'')+(x.claimed_at?' · claimed '+esc(x.claimed_at):'')+'</div>')});events.slice(0,2).forEach(function(x){parts.push('<div><b>'+esc(String(x.event_type||'authority event').replaceAll('_',' '))+'</b> · '+esc(x.status||'')+(x.created_at?' · '+esc(x.created_at):'')+'</div>')});if(parts.length)host.insertAdjacentHTML('afterend','<div id="tsAuthorityConcreteActions"><b>Latest authority actions</b>'+parts.join('')+'</div>')}async function load(){try{var rs=await Promise.all([fetch('/api/distribution/discovery-health',{cache:'no-store'}),fetch('/api/distribution/authority/closed-loop-health',{cache:'no-store'})]);if(!rs[0].ok||!rs[1].ok)return;var d=await rs[0].json(),a=await rs[1].json();setMetric('AI surfaces verified',n(d.machine&&d.machine.verified),n(d.machine&&d.machine.eligible)+' machine eligible');setMetric('Submitted / pending',n(d.pipeline&&d.pipeline.submittedPending),'Current D1 pipeline');setMetric('Directories found',n(d.discovery&&d.discovery.directoryLike),n(d.discovery&&d.discovery.noHumanCandidates)+' no-human candidates');setMetric('Automatic directory pipeline',n(d.pipeline&&d.pipeline.automaticVerified),n(d.pipeline&&d.pipeline.autoAdaptersReady)+' adapters ready');setMetric('Auto adapters verified',n(d.pipeline&&d.pipeline.autoAdaptersReady),'Autonomous route adapters');setRow('Discovery sources',String(n(d.discovery&&d.discovery.sources)),d.discovery&&d.discovery.lastScanAt?'Last scan '+d.discovery.lastScanAt:'No recent scan event');setRow('AgentReady',d.machine&&d.machine.agentReady?'recorded':'not recorded',n(d.machine&&d.machine.agentAssetCount)+'/4 public machine assets reachable');var st=String(a.status||'');if(st==='waiting_external_confirmation')setRow('Authority loop','pending external confirmation',n(a.senderClaimed)+' sender task(s) claimed · '+n(a.senderClaimAgeMinutes)+' min old · attempts remain '+n(a.attempts24)+'/'+n(a.attemptMin24h));authorityActions(a)}catch(e){}}function boot(){load();setTimeout(load,1500);setInterval(load,30000)}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot()})();</script>`;
async function injectUi(response){if(!response?.ok||(response.headers.get('Content-Type')||'').toLowerCase().includes('text/html')===false)return response;let html=await response.text();if(!html.includes('id="toolscout-closed-loop-v2-ui"'))html=html.includes('</body>')?html.replace('</body>',UI_PATCH+'</body>'):html+UI_PATCH;return new Response(html,{status:response.status,statusText:response.statusText,headers:responseHeaders(response,'text/html; charset=UTF-8')})}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname==='/api/distribution/authority/closed-loop-health'&&request.method==='GET'){
      const fresh=url.searchParams.get('fresh')==='1';
      const state=await authorityHealthSnapshot(env,{fresh});
      return Response.json(state,{headers:{...JSON_H,'X-ToolScout-Read-Mode':fresh?'fresh':'observability-cache'}});
    }
    if(url.pathname==='/api/distribution/discovery-health'&&request.method==='GET')return Response.json(await discoverySnapshot(request,env),{headers:JSON_H});
    if(url.pathname==='/api/distribution/authority/close-loop'&&request.method==='POST'){
      if(!authorized(request,env))return Response.json({error:'unauthorized'},{status:401,headers:JSON_H});
      const result=await runWithLedger(env,{engine:'distribution',mission:'authority_execution_recovery',triggerName:'manual_closed_loop',singleFlightMinutes:75},()=>closeAuthorityExecutionLoop(request,env,ctx));
      return Response.json(result,{status:result?.status==='failed'?503:200,headers:JSON_H});
    }
    const response=await base.fetch(request,env,ctx);
    if(request.method==='GET'&&url.pathname==='/analytics/api/stats')return augmentStats(request,response,env);
    if(request.method==='GET'&&analyticsPath(url.pathname))return injectUi(response);
    return response;
  },
  async scheduled(event,env,ctx){
    const trigger=event?.cron||'scheduled';
    if(trigger==='15 * * * *'){
      const request=new Request('https://trytoolscout.org/api/distribution/authority/close-loop',{headers:missionCycleHeaders(event,'authority_closed_loop_scheduler')});
      try{await runWithLedger(env,{engine:'distribution',mission:'authority_execution_recovery',triggerName:'hourly_closed_loop',singleFlightMinutes:75},()=>closeAuthorityExecutionLoop(request,env,ctx));}
      catch(error){await recordEvent(env,'authority_closed_loop_runtime_error','failed',String(error?.message||error).slice(0,1200));}
    }
    return typeof base.scheduled==='function'?base.scheduled(event,env,ctx):undefined;
  }
};