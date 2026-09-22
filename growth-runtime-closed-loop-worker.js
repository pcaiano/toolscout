import base from './growth-runtime-integrity-worker.js';
import {runWithLedger} from './engine-run-ledger.js';

const JSON_H={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'private, no-store, max-age=0'};
const AUTHORITY_ATTEMPT_MIN_24H=6;

async function first(env,sql){try{return await env.DB.prepare(sql).first()}catch{return null}}
async function recordEvent(env,eventType,status,detail){
  try{
    await env.DB.prepare(`INSERT INTO distribution_events(event_id,event_type,status,asset_type,detail,observed_at,created_at) VALUES(?,?,?,?,?,datetime('now'),datetime('now'))`)
      .bind(`authority_closed_loop_${crypto.randomUUID()}`,eventType,status,'backlink_acquisition',String(detail||'').slice(0,1800)).run();
  }catch{}
}
async function authoritySnapshot(env){
  const row=await first(env,`SELECT
    (SELECT COUNT(*) FROM distribution_submissions WHERE surface_slug<>'indexnow' AND attempts>0 AND COALESCE(last_attempt_at,created_at)>=datetime('now','-24 hours'))+
    (SELECT COUNT(*) FROM distribution_events WHERE event_type IN ('vendor_outreach_sent','publisher_network_outreach_sent') AND created_at>=datetime('now','-24 hours')) attempts24,
    (SELECT COUNT(*) FROM growth_execution_contract WHERE action IN ('backlink_reference_outreach','verify_backlink_acquisition','publisher_contact_discovery','execute_alternate_routes','publisher_outreach','autonomous_route_qualification') AND status IN ('pending','claimed','attempted','deferred','stalled')) queue,
    (SELECT COUNT(*) FROM growth_action_events WHERE status='prepared' AND engine IN ('distribution_route','distribution_network','vendor_amplification')) prepared,
    (SELECT COUNT(*) FROM growth_execution_contract WHERE executor='make_sender' AND status='claimed') sender_claimed`);
  return {attempts24:Number(row?.attempts24||0),queue:Number(row?.queue||0),prepared:Number(row?.prepared||0),senderClaimed:Number(row?.sender_claimed||0)};
}
function authorized(request,env){
  const token=(request.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');
  return Boolean(env.ADMIN_TOKEN&&token===env.ADMIN_TOKEN);
}
async function internalJson(baseRequest,env,ctx,path,{method='POST',body=null}={}){
  if(!env.ADMIN_TOKEN)return {ok:false,httpStatus:0,error:'admin_token_unavailable'};
  const headers={Authorization:`Bearer ${env.ADMIN_TOKEN}`,'Content-Type':'application/json'};
  const init={method,headers};
  if(body!=null)init.body=JSON.stringify(body);
  try{
    const response=await base.fetch(new Request(new URL(path,baseRequest.url),init),env,ctx);
    let payload=null;try{payload=await response.json()}catch{}
    return {ok:response.ok,httpStatus:response.status,payload};
  }catch(error){return {ok:false,httpStatus:0,error:String(error?.message||error).slice(0,500)}}
}
async function closeAuthorityExecutionLoop(request,env,ctx){
  const before=await authoritySnapshot(env);
  if(before.queue<=0||before.attempts24>=AUTHORITY_ATTEMPT_MIN_24H){
    return {ok:true,skipped:true,reason:before.queue<=0?'no_authority_queue':'throughput_floor_met',before,after:before,pipelineClosed:true};
  }

  // This ordering is deliberate. The previous hourly path could dispatch before discovery
  // finished because authority recovery ran in waitUntil while downstream schedulers continued.
  const network=await internalJson(request,env,ctx,'/api/distribution/network/refresh');
  const autonomous=await internalJson(request,env,ctx,'/api/distribution/autonomous/refresh');
  const coordination=await internalJson(request,env,ctx,'/api/growth/opportunities/refresh');
  const execution=await internalJson(request,env,ctx,'/api/growth/execution/dispatch');
  const senderHandoff=await internalJson(request,env,ctx,'/api/distribution/vendor-amplification/public-candidates?limit=1',{method:'GET'});

  const after=await authoritySnapshot(env);
  const externalAttemptObserved=after.attempts24>before.attempts24;
  const handoffItems=Array.isArray(senderHandoff?.payload?.items)?senderHandoff.payload.items:[];
  const handoffReady=handoffItems.length>0;
  const stages={network:network.ok,autonomous:autonomous.ok,coordination:coordination.ok,execution:execution.ok,senderHandoff:senderHandoff.ok};
  const coreStagesOk=stages.network&&stages.autonomous&&stages.coordination&&stages.execution&&stages.senderHandoff;

  if(externalAttemptObserved){
    await recordEvent(env,'authority_closed_loop_external_attempt','completed',`Closed-loop authority recovery increased real external attempts from ${before.attempts24} to ${after.attempts24}. Discovery, qualification, coordination, execution dispatch and sender handoff ran sequentially.`);
  }else if(handoffReady){
    await recordEvent(env,'authority_closed_loop_handoff_ready','ready',`Authority pipeline reached the external sender with ${handoffItems.length} exact task candidate(s). No external attempt is counted until the sender callback confirms sent or failed. Attempts24 remains ${after.attempts24}.`);
  }else{
    const failed=Object.entries(stages).filter(([,ok])=>!ok).map(([name])=>name).join(',')||'external_sender_no_candidate';
    await recordEvent(env,'authority_closed_loop_no_output','failed',`Authority pipeline produced no verified external attempt and no sender candidate. Failed or empty stage: ${failed}. Queue ${after.queue}; prepared ${after.prepared}; sender claimed ${after.senderClaimed}.`);
  }

  return {
    ok:coreStagesOk&&(externalAttemptObserved||handoffReady),
    pipelineClosed:coreStagesOk,
    externalAttemptObserved,
    handoffReady,
    handoffCandidateCount:handoffItems.length,
    stages,
    before,
    after,
    network:network.payload||network.error||null,
    autonomous:autonomous.payload||autonomous.error||null,
    coordination:coordination.payload||coordination.error||null,
    execution:execution.payload||execution.error||null,
    senderHandoff:{ok:senderHandoff.ok,httpStatus:senderHandoff.httpStatus,status:senderHandoff?.payload?.status||null,reason:senderHandoff?.payload?.reason||null,items:handoffItems.map(x=>({kind:x.kind||null,task_id:x.task_id||null,task_action:x.task_action||null,tool_slug:x.tool_slug||null,asset_url:x.asset_url||null,vendor_domain:x.vendor_domain||null}))}
  };
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname==='/api/distribution/authority/closed-loop-health'&&request.method==='GET'){
      const state=await authoritySnapshot(env);
      return Response.json({status:state.attempts24>=AUTHORITY_ATTEMPT_MIN_24H?'healthy':state.queue>0?'execution_required':'idle',...state,attemptMin24h:AUTHORITY_ATTEMPT_MIN_24H,preparedDoesNotCountAsExecution:true,externalCallbackRequiredForEmailAttempt:true},{headers:JSON_H});
    }
    if(url.pathname==='/api/distribution/authority/close-loop'&&request.method==='POST'){
      if(!authorized(request,env))return Response.json({error:'unauthorized'},{status:401,headers:JSON_H});
      const result=await runWithLedger(env,{engine:'distribution',mission:'authority_execution_recovery',triggerName:'manual_closed_loop',singleFlightMinutes:75},()=>closeAuthorityExecutionLoop(request,env,ctx));
      return Response.json(result,{status:result?.status==='failed'?503:200,headers:JSON_H});
    }
    return base.fetch(request,env,ctx);
  },
  async scheduled(event,env,ctx){
    const trigger=event?.cron||'scheduled';
    if(trigger==='15 * * * *'){
      const request=new Request('https://trytoolscout.org/api/distribution/authority/close-loop');
      try{
        // Await the full critical path. Do not use waitUntil here: ordering is the integrity contract.
        await runWithLedger(env,{engine:'distribution',mission:'authority_execution_recovery',triggerName:'hourly_closed_loop',singleFlightMinutes:75},()=>closeAuthorityExecutionLoop(request,env,ctx));
      }catch(error){
        await recordEvent(env,'authority_closed_loop_runtime_error','failed',String(error?.message||error).slice(0,1200));
      }
    }
    return typeof base.scheduled==='function'?base.scheduled(event,env,ctx):undefined;
  }
};
