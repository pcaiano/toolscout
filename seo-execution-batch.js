import {runWithLedger} from './engine-run-ledger.js';
import {claimExecutorTasks,recordExecutionProof,deferExecutionTask} from './growth-execution-contract.js';
import {executeCloudflareSeoTask} from './seo-execution-runtime.js';

async function boundedExecution(promise,ms,label='execution'){
  let timer=null;
  try{
    return await Promise.race([
      promise,
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`${label}_timeout_after_${ms}ms`)),ms)})
    ]);
  }finally{
    if(timer)clearTimeout(timer);
  }
}

async function executeBatch(env,limit=8){
  const cap=Math.max(1,Math.min(8,Number(limit)||8));
  await env.DB.prepare(`UPDATE growth_execution_contract
    SET status='deferred',claim_deadline=NULL,attempt_deadline=NULL,verify_deadline=NULL,
        claimed_at=NULL,attempted_at=NULL,last_result='seo_execution_batch_orphan_recovered_v2',updated_at=datetime('now')
    WHERE executor='seo_cloudflare'
      AND status='claimed'
      AND last_result IN ('seo_execution_batch_claimed_v1','seo_execution_batch_claimed_v2')
      AND claimed_at<datetime('now','-90 seconds')`).run().catch(()=>null);
  const claim=await claimExecutorTasks(env,'seo_cloudflare',{
    limit:cap,
    maxInFlight:cap,
    result:'seo_execution_batch_claimed_v2'
  });
  if(!claim.claimed)return {ok:true,claimed:0,verified:0,deferred:0,items:[]};

  const items=[];
  await Promise.all((claim.tasks||[]).map(async task=>{
    try{
      if(task?.source_kind==='supervisor'){
        const proof=await recordExecutionProof(env,{
          taskId:task.task_id,
          executor:'seo_cloudflare',
          status:'verified',
          detail:'seo_supervisor_directive_acknowledged_v1',
          externalId:'seo_geo_aio',
          evidence:{
            proof_kind:'seo_supervisor_execution_lane_healthy',
            directive:task.action||null,
            concrete_opportunity_tasks_remain_task_specific:true
          }
        });
        items.push({task_id:task.task_id,status:'verified',supervisor:true,action:task.action,proof:proof?.ok===true});
        return;
      }

      const out=await boundedExecution(executeCloudflareSeoTask(env,task),12000,'seo_cloudflare_task');
      if(out?.verified&&out?.pathname){
        const proof=await recordExecutionProof(env,{
          taskId:task.task_id,
          executor:'seo_cloudflare',
          status:'verified',
          detail:'cloudflare_seo_task_verified_v2',
          externalId:out.pathname,
          evidence:out
        });
        items.push({
          task_id:task.task_id,
          status:'verified',
          pathname:out.pathname,
          action:task.action,
          indexNow:Boolean(out?.indexNow?.queued),
          proof:proof?.ok===true,
          proofKind:out?.proof_kind||null
        });
      }else{
        await deferExecutionTask(env,task.task_id,'cloudflare_seo_batch_not_verified:'+String(out?.reason||'unknown'));
        items.push({task_id:task.task_id,status:'deferred',reason:out?.reason||'not_verified'});
      }
    }catch(error){
      const message=String(error?.message||error).slice(0,300);
      await deferExecutionTask(env,task.task_id,'cloudflare_seo_batch_error:'+message).catch(()=>null);
      items.push({task_id:task.task_id,status:'deferred',error:message});
    }
  }));

  return {
    ok:true,
    claimed:claim.claimed,
    verified:items.filter(x=>x.status==='verified').length,
    deferred:items.filter(x=>x.status==='deferred').length,
    items
  };
}

export async function runSeoExecutionBatch(env,limit=8,triggerName='seo_execution_batch'){
  return runWithLedger(
    env,
    {
      engine:'seo_geo_aio',
      mission:'execution_batch_v2',
      triggerName:String(triggerName||'seo_execution_batch').slice(0,120),
      singleFlightMinutes:2
    },
    ()=>executeBatch(env,limit)
  );
}
