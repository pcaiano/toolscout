import base from './ga4-owner-exclusion-worker.js';
import {runWithLedger} from './engine-run-ledger.js';

const H={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'private, no-store, max-age=0'};
const HOURLY='15 * * * *';
const DAILY='35 3 * * *';

async function internalJson(request,env,ctx,path,{method='POST',body=null}={}){
  if(!env.ADMIN_TOKEN)return {ok:false,httpStatus:0,error:'admin_token_unavailable'};
  const headers={Authorization:`Bearer ${env.ADMIN_TOKEN}`,'Content-Type':'application/json'};
  const init={method,headers};
  if(body!=null)init.body=JSON.stringify(body);
  try{
    const response=await base.fetch(new Request(new URL(path,request.url),init),env,ctx);
    let payload=null;try{payload=await response.json()}catch{}
    return {ok:response.ok,httpStatus:response.status,payload};
  }catch(error){return {ok:false,httpStatus:0,error:String(error?.message||error).slice(0,800)}}
}

async function recordRuntime(env,mission,status,evidence){
  try{
    await env.DB.prepare(`INSERT INTO engine_runs(run_id,engine,mission,trigger_name,status,started_at,completed_at,detail,evidence_json,updated_at)
      VALUES(?,?,?,?,?,datetime('now'),datetime('now'),?,?,datetime('now'))`)
      .bind(`cloudflare_primary_${crypto.randomUUID()}`,'runtime',mission,'cloudflare_cron',status,status==='completed'?'Cloudflare primary runtime cycle completed':'Cloudflare primary runtime cycle reported failures',JSON.stringify(evidence||{}).slice(0,120000)).run();
  }catch{}
}

function compactStage(result){
  return {ok:Boolean(result?.ok),httpStatus:Number(result?.httpStatus||0),error:result?.error||null,status:result?.payload?.status||null,reason:result?.payload?.reason||null};
}

async function runPrimaryCycle(env,ctx,trigger){
  const req=new Request('https://trytoolscout.org/api/runtime/cloudflare-primary-cycle');
  const stages={};
  // Supervisor first: every downstream engine sees fresh priorities.
  stages.supervisorAudit=await internalJson(req,env,ctx,'/api/growth/supervisor/audit');
  stages.opportunities=await internalJson(req,env,ctx,'/api/growth/opportunities/refresh');

  // Distribution and authority are Cloudflare-native. Submission is attempted before
  // external sender handoff, so a claimed Make/email task can never stall machine routes.
  stages.network=await internalJson(req,env,ctx,'/api/distribution/network/refresh');
  stages.submissionPackage=await internalJson(req,env,ctx,'/api/distribution/submissions/package');
  stages.submissionExecute=await internalJson(req,env,ctx,'/api/distribution/submissions/execute');
  stages.submissionVerify=await internalJson(req,env,ctx,'/api/distribution/submissions/verify');
  stages.autonomous=await internalJson(req,env,ctx,'/api/distribution/autonomous/refresh');
  stages.authority=await internalJson(req,env,ctx,'/api/distribution/authority/close-loop');
  stages.executionDispatch=await internalJson(req,env,ctx,'/api/growth/execution/dispatch');

  // Re-audit after execution so the public supervisor and Command Center report the
  // post-action state rather than the pre-action intent.
  stages.supervisorPost=await internalJson(req,env,ctx,'/api/growth/supervisor/audit');

  const summary=Object.fromEntries(Object.entries(stages).map(([k,v])=>[k,compactStage(v)]));
  const failed=Object.entries(summary).filter(([,v])=>!v.ok).map(([k])=>k);
  await recordRuntime(env,'primary_growth_cycle',failed.length?'failed':'completed',{trigger,executor:'cloudflare',failed,stages:summary});
  return {ok:failed.length===0,executor:'cloudflare',trigger,failed,stages:summary};
}

async function runtimeMatrix(env){
  let recent=[];
  try{
    recent=(await env.DB.prepare(`SELECT engine,mission,status,trigger_name,started_at,completed_at,detail
      FROM engine_runs ORDER BY started_at DESC LIMIT 30`).all()).results||[];
  }catch{}
  return {
    status:'active',
    architecture:'cloudflare-primary-v1',
    generatedAt:new Date().toISOString(),
    primary:{
      scheduler:'cloudflare_cron',
      runtime:'cloudflare_workers',
      state:'cloudflare_d1',
      distribution:'cloudflare',
      authority:'cloudflare',
      growthSupervisor:'cloudflare',
      commandCenter:'cloudflare',
      acquisitionTruth:'ga4_direct',
      outboundTruth:'toolscout_worker_redirect_ledger'
    },
    seo:{
      controlPlane:'cloudflare',
      demandAndPriority:'cloudflare',
      staticMutation:'repository_content_path',
      githubActionsRole:'fallback_only',
      gscServiceAccountConfigured:Boolean(env.GSC_SERVICE_ACCOUNT_JSON),
      repositoryWriteCredentialConfigured:Boolean(env.GITHUB_CONTENT_TOKEN||env.GITHUB_TOKEN),
      note:'SEO scheduling and prioritization are Cloudflare-owned. Static repository mutations require a repository write credential in the Worker until SEO pages are fully runtime-rendered.'
    },
    githubActions:{role:'fallback_only',scheduledPrimary:false,conservationStubsExpected:true},
    recentRuns:recent
  };
}

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(request.method==='GET'&&url.pathname==='/api/runtime/executors'){
      return Response.json(await runtimeMatrix(env),{headers:H});
    }
    if(request.method==='POST'&&url.pathname==='/api/runtime/cloudflare-primary-cycle'){
      const token=(request.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');
      if(!env.ADMIN_TOKEN||token!==env.ADMIN_TOKEN)return Response.json({error:'unauthorized'},{status:401,headers:H});
      const result=await runWithLedger(env,{engine:'runtime',mission:'primary_growth_cycle',triggerName:'manual_cloudflare_primary',singleFlightMinutes:50},()=>runPrimaryCycle(env,ctx,'manual'));
      return Response.json(result,{status:result?.ok===false?503:200,headers:H});
    }
    return base.fetch(request,env,ctx);
  },
  async scheduled(event,env,ctx){
    const trigger=event?.cron||'scheduled';
    // Preserve all existing Cloudflare-native scheduled handlers in the worker chain.
    const inherited=typeof base.scheduled==='function'?base.scheduled(event,env,ctx):undefined;
    if(trigger===HOURLY||trigger===DAILY){
      const task=runWithLedger(env,{engine:'runtime',mission:'primary_growth_cycle',triggerName:trigger,singleFlightMinutes:50},()=>runPrimaryCycle(env,ctx,trigger)).catch(async error=>{
        await recordRuntime(env,'primary_growth_cycle','failed',{trigger,executor:'cloudflare',error:String(error?.message||error).slice(0,1200)});
      });
      if(ctx?.waitUntil)ctx.waitUntil(task);else await task;
    }
    return inherited;
  }
};
