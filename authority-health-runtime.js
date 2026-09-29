import {authorityHealthSnapshot} from './growth-runtime-closed-loop-worker.js';

const JSON_H={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'private, no-store, max-age=0'};

async function first(env,sql,bindings=[]){
  try{let q=env.DB.prepare(sql);if(bindings.length)q=q.bind(...bindings);return await q.first()}catch{return null}
}
async function all(env,sql,bindings=[]){
  try{let q=env.DB.prepare(sql);if(bindings.length)q=q.bind(...bindings);return (await q.all()).results||[]}catch{return[]}
}
async function claimedSenderTasks(env){
  return all(env,`SELECT task_id,subject_type,subject_key,action,claimed_at,updated_at
    FROM growth_execution_contract
    WHERE executor='make_sender' AND status='claimed'
    ORDER BY claimed_at ASC,priority_score DESC LIMIT 8`);
}
async function taskReady(env,task){
  if(!task)return false;
  if(task.subject_type==='tool'){
    const row=await first(env,`SELECT 1 ok FROM distribution_vendor_amplification v
      WHERE v.tool_slug=? AND v.status='contact_found' AND v.contact_method='public_role_email' AND v.contact_email IS NOT NULL
        AND NOT EXISTS(
          SELECT 1 FROM distribution_vendor_amplification prior
          WHERE prior.status='sent' AND prior.outreach_sent_at>=datetime('now','-30 days')
            AND (prior.tool_slug=v.tool_slug OR lower(COALESCE(prior.contact_email,''))=lower(COALESCE(v.contact_email,'')))
        ) LIMIT 1`,[task.subject_key]);
    return Boolean(row?.ok);
  }
  if(task.subject_type==='surface'){
    const row=await first(env,`SELECT 1 ok FROM distribution_network_outreach
      WHERE surface_slug=? AND status='contact_found' AND contact_email IS NOT NULL LIMIT 1`,[task.subject_key]);
    return Boolean(row?.ok);
  }
  return false;
}
async function senderState(env){
  const tasks=await claimedSenderTasks(env),ready=[];
  for(const task of tasks)if(await taskReady(env,task))ready.push(task);
  return{claimed:tasks.length,dispatchReady:ready.length,readyTasks:ready};
}

export async function handleAuthorityHealthRoute(request,env){
  const url=new URL(request.url);
  if(request.method!=='GET'||url.pathname!=='/api/distribution/authority/closed-loop-health')return null;
  const fresh=url.searchParams.get('fresh')==='1';
  const [state,sender]=await Promise.all([
    authorityHealthSnapshot(env,{fresh}),
    senderState(env)
  ]);
  const status=sender.dispatchReady>0
    ?'waiting_external_confirmation'
    :sender.claimed>0
      ?'handoff_reconciliation_required'
      :state.status;
  return Response.json({
    ...state,
    status,
    senderClaimed:sender.claimed,
    senderDispatchReady:sender.dispatchReady,
    senderReadyTasks:sender.readyTasks.map(x=>({
      task_id:x.task_id,
      subject_type:x.subject_type,
      subject_key:x.subject_key,
      action:x.action,
      claimed_at:x.claimed_at
    })),
    readOnly:true,
    owner:'authority_health_v2'
  },{headers:{...JSON_H,'X-ToolScout-Read-Mode':fresh?'fresh':'observability-cache','X-ToolScout-Route-Contract':'v2'}});
}
