import base from './growth-runtime-observability-worker.js';

const JSON_H={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'private, no-store, max-age=0'};
const MAX_DRAIN_PASSES=4;

async function first(env,sql,bindings=[]){try{let q=env.DB.prepare(sql);if(bindings.length)q=q.bind(...bindings);return await q.first()}catch{return null}}
async function all(env,sql,bindings=[]){try{let q=env.DB.prepare(sql);if(bindings.length)q=q.bind(...bindings);return (await q.all()).results||[]}catch{return[]}}
async function claimedSenderTasks(env){return all(env,`SELECT task_id,subject_type,subject_key,action,claimed_at,updated_at FROM growth_execution_contract WHERE executor='make_sender' AND status='claimed' ORDER BY claimed_at ASC,priority_score DESC LIMIT 6`)}
async function taskReady(env,task){
  if(!task)return false;
  if(task.subject_type==='tool'){
    const row=await first(env,`SELECT 1 ok FROM distribution_vendor_amplification v
      WHERE v.tool_slug=? AND v.status='contact_found' AND v.contact_method='public_role_email' AND v.contact_email IS NOT NULL
        AND NOT EXISTS(SELECT 1 FROM distribution_vendor_amplification prior WHERE prior.status='sent' AND prior.outreach_sent_at>=datetime('now','-30 days') AND (prior.tool_slug=v.tool_slug OR lower(COALESCE(prior.contact_email,''))=lower(COALESCE(v.contact_email,'')))) LIMIT 1`,[task.subject_key]);
    return Boolean(row?.ok);
  }
  if(task.subject_type==='surface'){
    const row=await first(env,`SELECT 1 ok FROM distribution_network_outreach WHERE surface_slug=? AND status='contact_found' AND contact_email IS NOT NULL LIMIT 1`,[task.subject_key]);
    return Boolean(row?.ok);
  }
  return false;
}
async function senderState(env){
  const tasks=await claimedSenderTasks(env),ready=[];
  for(const task of tasks)if(await taskReady(env,task))ready.push(task);
  return {claimed:tasks.length,dispatchReady:ready.length,tasks,readyTasks:ready};
}
async function record(env,type,status,detail){try{await env.DB.prepare(`INSERT INTO distribution_events(event_id,event_type,status,asset_type,detail,observed_at,created_at) VALUES(?,?,?,?,?,datetime('now'),datetime('now'))`).bind(`authority_drain_${crypto.randomUUID()}`,type,status,'backlink_acquisition',String(detail||'').slice(0,1800)).run()}catch{}}
async function internalJson(request,env,ctx,path,{method='POST'}={}){
  if(!env.ADMIN_TOKEN)return {ok:false,status:0,payload:null,error:'admin_token_unavailable'};
  try{const r=await base.fetch(new Request(new URL(path,request.url),{method,headers:{Authorization:`Bearer ${env.ADMIN_TOKEN}`,'Content-Type':'application/json'}}),env,ctx);let payload=null;try{payload=await r.json()}catch{}return {ok:r.ok,status:r.status,payload}}catch(error){return {ok:false,status:0,payload:null,error:String(error?.message||error).slice(0,400)}}
}
async function drainSender(request,env,ctx){
  const passes=[];
  for(let i=0;i<MAX_DRAIN_PASSES;i++){
    let state=await senderState(env);
    if(state.dispatchReady>0){
      const handoff=await internalJson(request,env,ctx,'/api/distribution/vendor-amplification/public-candidates?limit=1',{method:'GET'});
      const items=Array.isArray(handoff?.payload?.items)?handoff.payload.items:[];
      passes.push({pass:i+1,phase:'handoff_ready',claimed:state.claimed,dispatchReady:state.dispatchReady,handoffStatus:handoff.status,candidates:items.length});
      if(items.length){await record(env,'authority_sender_handoff_ready','ready',`Post-schedule sender drain exposed ${items.length} executable authority candidate(s) after ${i+1} pass(es).`);return {ok:true,status:'pending_external_confirmation',passes,candidates:items.map(x=>({kind:x.kind||null,task_id:x.task_id||null,task_action:x.task_action||null,tool_slug:x.tool_slug||null,vendor_domain:x.vendor_domain||null}))}}
    }else if(state.claimed>0){
      const handoff=await internalJson(request,env,ctx,'/api/distribution/vendor-amplification/public-candidates?limit=1',{method:'GET'});
      passes.push({pass:i+1,phase:'claimed_not_executable',claimed:state.claimed,dispatchReady:0,handoffStatus:handoff.status,reason:handoff?.payload?.reason||null});
      // The sender endpoint defers a claimed task that has no matching ready candidate.
    }
    const dispatch=await internalJson(request,env,ctx,'/api/growth/execution/dispatch');
    state=await senderState(env);
    passes.push({pass:i+1,phase:'redispatch',dispatchStatus:dispatch.status,claimedAfter:state.claimed,dispatchReadyAfter:state.dispatchReady});
    if(state.claimed===0&&state.dispatchReady===0&&i>=1)break;
  }
  const after=await senderState(env);
  if(after.dispatchReady>0){await record(env,'authority_sender_handoff_pending','pending',`${after.dispatchReady} executable sender candidate(s) remain ready for external consumption.`);return {ok:true,status:'pending_external_confirmation',passes,after}}
  await record(env,'authority_sender_drain_no_candidate','warning',`Post-schedule authority drain ended with ${after.claimed} claimed sender task(s) and ${after.dispatchReady} executable candidates after ${MAX_DRAIN_PASSES} bounded passes.`);
  return {ok:true,status:after.claimed?'claimed_without_executable_candidate':'no_executable_sender_candidate',passes,after};
}
async function correctAuthorityHealth(response,env){
  if(!response.ok||!String(response.headers.get('content-type')||'').includes('application/json'))return response;
  let d;try{d=await response.json()}catch{return response}
  const s=await senderState(env);d.senderDispatchReady=s.dispatchReady;d.senderClaimed=s.claimed;d.senderReadyTasks=s.readyTasks.map(x=>({task_id:x.task_id,subject_type:x.subject_type,subject_key:x.subject_key,action:x.action,claimed_at:x.claimed_at}));
  const floorMet=Number(d.attempts24||0)>=Number(d.attemptMin24h||6);
  if(floorMet)d.status='healthy';else if(s.dispatchReady>0)d.status='waiting_external_confirmation';else if(s.claimed>0)d.status='handoff_reconciliation_required';else if(Number(d.queue||0)>0)d.status='execution_required';
  return new Response(JSON.stringify(d),{status:response.status,statusText:response.statusText,headers:JSON_H});
}
async function correctAutonomous(response,env){
  if(!response.ok||!String(response.headers.get('content-type')||'').includes('application/json'))return response;
  let d;try{d=await response.json()}catch{return response}
  const s=await senderState(env);
  const attempts=Number(d?.authorityExecution?.attempts24??d?.attempts24??0),floor=Number(d?.authorityExecution?.attemptMin24h??d?.attemptMin24h??6);
  const status=attempts>=floor?'healthy':s.dispatchReady>0?'waiting_external_confirmation':s.claimed>0?'handoff_reconciliation_required':d?.authorityExecution?.status;
  if(status){d.authority_execution_status=status;d.authorityExecution={...(d.authorityExecution||{}),status,senderClaimed:s.claimed,senderDispatchReady:s.dispatchReady,detail:s.dispatchReady>0?`${s.dispatchReady} executable authority handoff(s) are ready for the external sender. External attempts remain evidence-only until callback.`:s.claimed>0?`${s.claimed} sender task(s) are claimed but currently have no executable candidate. The post-schedule drain will defer and rotate these claims.`:d?.authorityExecution?.detail};if(d.overallHealth)d.overallHealth={...d.overallHealth,authorityStatus:status}}
  return new Response(JSON.stringify(d),{status:response.status,statusText:response.statusText,headers:JSON_H});
}
async function correctStats(response,env){
  if(!response.ok||!String(response.headers.get('content-type')||'').includes('application/json'))return response;
  let d;try{d=await response.json()}catch{return response}
  const s=await senderState(env),g=d.growthOps||(d.growthOps={}),a=g.autonomousGrowth||(g.autonomousGrowth={});
  a.authority_sender_state={claimed:s.claimed,dispatch_ready:s.dispatchReady,ready_tasks:s.readyTasks.map(x=>({task_id:x.task_id,subject_key:x.subject_key,action:x.action,claimed_at:x.claimed_at}))};
  const attempts=Number(g?.authorityClosedLoop?.attempts24??a?.authority_attempts_24h??0),floor=Number(g?.authorityClosedLoop?.attemptMin24h??6);
  if(attempts>=floor)a.authority_execution_status='healthy';else if(s.dispatchReady>0)a.authority_execution_status='waiting_external_confirmation';else if(s.claimed>0)a.authority_execution_status='handoff_reconciliation_required';
  return new Response(JSON.stringify(d),{status:response.status,statusText:response.statusText,headers:JSON_H});
}

export default{
  async fetch(request,env,ctx){const url=new URL(request.url),response=await base.fetch(request,env,ctx);if(request.method==='GET'&&url.pathname==='/api/distribution/authority/closed-loop-health')return correctAuthorityHealth(response,env);if(request.method==='GET'&&url.pathname==='/api/autonomous-growth-health')return correctAutonomous(response,env);if(request.method==='GET'&&(url.pathname==='/analytics/api/stats'||url.pathname==='/api/stats'))return correctStats(response,env);return response},
  async scheduled(event,env,ctx){
    const out=typeof base.scheduled==='function'?await base.scheduled(event,env,ctx):undefined;
    if((event?.cron||'scheduled')==='15 * * * *'){
      const req=new Request('https://trytoolscout.org/api/distribution/authority/post-schedule-drain');
      try{await drainSender(req,env,ctx)}catch(error){await record(env,'authority_sender_drain_error','failed',String(error?.message||error).slice(0,1000))}
    }
    return out;
  }
};