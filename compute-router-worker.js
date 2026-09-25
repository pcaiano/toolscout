import base from './operational-truth-reconciliation-worker.js';

const JSON_H={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'no-store'};
const OVERFLOW_CRON='*/5 * * * *';
const DAILY_JOB_BUDGET=1500;
const BATCH_SIZE=100;
const MAX_ACTIVE_BATCHES=2;
const BATCH_TIMEOUT_MINUTES=20;
let schemaReady=null;

function safe(v,n=4000){return String(v??'').slice(0,n)}
function num(v){const n=Number(v);return Number.isFinite(n)?n:0}
function rows(r){return r?.results||[]}
function isHttp(url){try{const u=new URL(url);return ['http:','https:'].includes(u.protocol)}catch{return false}}
async function sha256(value){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value||'')));return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,'0')).join('')}
async function shortHash(value){return (await sha256(value)).slice(0,20)}
async function ensureSchema(env){
  if(schemaReady)return schemaReady;
  schemaReady=env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS compute_overflow_jobs(
      job_id TEXT PRIMARY KEY,
      job_key TEXT NOT NULL UNIQUE,
      job_type TEXT NOT NULL,
      subject_type TEXT,
      subject_key TEXT,
      priority_score REAL NOT NULL DEFAULT 0,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      batch_id TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      available_at TEXT NOT NULL DEFAULT (datetime('now')),
      leased_at TEXT,
      completed_at TEXT,
      result_json TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_compute_overflow_jobs_status_priority ON compute_overflow_jobs(status,priority_score DESC,available_at)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_compute_overflow_jobs_batch ON compute_overflow_jobs(batch_id,status)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS compute_overflow_batches(
      batch_id TEXT PRIMARY KEY,
      completion_token_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'dispatched',
      job_count INTEGER NOT NULL DEFAULT 0,
      trigger_http_status INTEGER,
      fetched_at TEXT,
      dispatched_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      result_summary_json TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_compute_overflow_batches_status ON compute_overflow_batches(status,dispatched_at)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS compute_overflow_events(
      event_id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      status TEXT,
      job_id TEXT,
      batch_id TEXT,
      detail TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`)
  ]).catch(error=>{schemaReady=null;throw error});
  return schemaReady;
}
async function event(env,eventType,status,detail,{jobId=null,batchId=null}={}){
  await ensureSchema(env);
  try{await env.DB.prepare(`INSERT INTO compute_overflow_events(event_id,event_type,status,job_id,batch_id,detail,created_at) VALUES(?,?,?,?,?,?,datetime('now'))`)
    .bind(`coe_${crypto.randomUUID()}`,eventType,status,jobId,batchId,safe(detail,1800)).run()}catch{}
}
async function health(env){
  await ensureSchema(env);
  const [jobs,batches]=await Promise.all([
    env.DB.prepare(`SELECT
      SUM(CASE WHEN status='queued' THEN 1 ELSE 0 END) queued,
      SUM(CASE WHEN status='leased' THEN 1 ELSE 0 END) leased,
      SUM(CASE WHEN status='completed' AND completed_at>=datetime('now','-24 hours') THEN 1 ELSE 0 END) completed_24h,
      SUM(CASE WHEN status='failed' AND updated_at>=datetime('now','-24 hours') THEN 1 ELSE 0 END) failed_24h,
      SUM(CASE WHEN created_at>=date('now') THEN 1 ELSE 0 END) created_today,
      MAX(completed_at) last_completed_at
      FROM compute_overflow_jobs`).first().catch(()=>null),
    env.DB.prepare(`SELECT
      SUM(CASE WHEN status IN ('dispatched','running') THEN 1 ELSE 0 END) active,
      SUM(CASE WHEN status='completed' AND completed_at>=datetime('now','-24 hours') THEN 1 ELSE 0 END) completed_24h,
      MAX(dispatched_at) last_dispatched_at
      FROM compute_overflow_batches`).first().catch(()=>null)
  ]);
  return {
    status:env.OVERFLOW_COMPUTE_URL?'configured':'awaiting_external_runtime',
    providerUrl:env.OVERFLOW_COMPUTE_URL?(()=>{try{return new URL(env.OVERFLOW_COMPUTE_URL).origin}catch{return null}})():null,
    dailyJobBudget:DAILY_JOB_BUDGET,batchSize:BATCH_SIZE,maxActiveBatches:MAX_ACTIVE_BATCHES,
    queued:num(jobs?.queued),leased:num(jobs?.leased),completed24h:num(jobs?.completed_24h),failed24h:num(jobs?.failed_24h),createdToday:num(jobs?.created_today),
    activeBatches:num(batches?.active),completedBatches24h:num(batches?.completed_24h),lastDispatchedAt:batches?.last_dispatched_at||null,lastCompletedAt:jobs?.last_completed_at||null,
    githubActionsRole:'disabled_until_october'
  };
}
async function enqueueJob(env,{jobKey,jobType,subjectType,subjectKey,priority,payload}){
  const jobId=`coj_${await shortHash(jobKey)}`;
  const w=await env.DB.prepare(`INSERT INTO compute_overflow_jobs(job_id,job_key,job_type,subject_type,subject_key,priority_score,payload_json,status,available_at,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,'queued',datetime('now'),datetime('now'),datetime('now'))
    ON CONFLICT(job_key) DO NOTHING`)
    .bind(jobId,jobKey,jobType,subjectType||null,subjectKey||null,Number(priority||0),JSON.stringify(payload||{}).slice(0,12000)).run();
  return Number(w?.meta?.changes||w?.changes||0);
}
async function enqueueDistributionResearch(env){
  await ensureSchema(env);
  const used=await env.DB.prepare(`SELECT COUNT(*) n FROM compute_overflow_jobs WHERE created_at>=date('now')`).first().catch(()=>({n:0}));
  let remaining=Math.max(0,DAILY_JOB_BUDGET-num(used?.n));
  if(!remaining)return{enqueued:0,remaining:0};
  const limit=Math.min(500,remaining);
  const q=await env.DB.prepare(`SELECT surface_slug,surface_name,surface_type,action_url,distribution_score,status,next_action
    FROM distribution_opportunities
    WHERE human_required=0 AND action_url IS NOT NULL
      AND status IN ('candidate','discovered','research_required')
    ORDER BY distribution_score DESC,updated_at ASC LIMIT ?`).bind(limit).all().catch(()=>({results:[]}));
  let enqueued=0;
  for(const row of rows(q)){
    if(remaining<=0||!isHttp(row.action_url))break;
    const urlHash=await shortHash(row.action_url);
    const payload={url:row.action_url,surfaceSlug:row.surface_slug,surfaceName:row.surface_name,surfaceType:row.surface_type,currentStatus:row.status,score:num(row.distribution_score)};
    enqueued+=await enqueueJob(env,{jobKey:`route:${row.surface_slug}:${urlHash}`,jobType:'distribution_route_research',subjectType:'surface',subjectKey:row.surface_slug,priority:num(row.distribution_score),payload});
    remaining=Math.max(0,remaining-1);
    if(remaining<=0)break;
    if(num(row.distribution_score)>=55){
      enqueued+=await enqueueJob(env,{jobKey:`contact:${row.surface_slug}:${urlHash}`,jobType:'contact_route_research',subjectType:'surface',subjectKey:row.surface_slug,priority:Math.max(0,num(row.distribution_score)-5),payload});
      remaining=Math.max(0,remaining-1);
    }
  }
  return{enqueued,remaining};
}
async function requeueStaleBatches(env){
  await ensureSchema(env);
  const stale=await env.DB.prepare(`SELECT batch_id FROM compute_overflow_batches
    WHERE status IN ('dispatched','running') AND dispatched_at<=datetime('now','-${BATCH_TIMEOUT_MINUTES} minutes') LIMIT 20`).all().catch(()=>({results:[]}));
  let requeued=0;
  for(const row of rows(stale)){
    const w=await env.DB.prepare(`UPDATE compute_overflow_jobs SET status='queued',batch_id=NULL,leased_at=NULL,available_at=datetime('now'),last_error='batch_timeout_requeued',updated_at=datetime('now') WHERE batch_id=? AND status='leased'`).bind(row.batch_id).run();
    requeued+=Number(w?.meta?.changes||w?.changes||0);
    await env.DB.prepare(`UPDATE compute_overflow_batches SET status='timed_out',last_error='completion_timeout',updated_at=datetime('now') WHERE batch_id=?`).bind(row.batch_id).run();
  }
  return requeued;
}
async function createBatch(env){
  await ensureSchema(env);
  const active=await env.DB.prepare(`SELECT COUNT(*) n FROM compute_overflow_batches WHERE status IN ('dispatched','running') AND dispatched_at>datetime('now','-${BATCH_TIMEOUT_MINUTES} minutes')`).first().catch(()=>({n:0}));
  if(num(active?.n)>=MAX_ACTIVE_BATCHES)return null;
  const q=await env.DB.prepare(`SELECT job_id FROM compute_overflow_jobs WHERE status='queued' AND available_at<=datetime('now') ORDER BY priority_score DESC,created_at ASC LIMIT ?`).bind(BATCH_SIZE).all().catch(()=>({results:[]}));
  const ids=rows(q).map(x=>x.job_id).filter(Boolean);
  if(!ids.length)return null;
  const batchId=`cob_${crypto.randomUUID()}`;
  const completionToken=`${crypto.randomUUID()}.${crypto.randomUUID()}`;
  const tokenHash=await sha256(completionToken);
  await env.DB.prepare(`INSERT INTO compute_overflow_batches(batch_id,completion_token_hash,status,job_count,dispatched_at,created_at,updated_at) VALUES(?,?,'dispatched',?,datetime('now'),datetime('now'),datetime('now'))`).bind(batchId,tokenHash,ids.length).run();
  for(const id of ids){
    await env.DB.prepare(`UPDATE compute_overflow_jobs SET status='leased',batch_id=?,leased_at=datetime('now'),attempts=attempts+1,updated_at=datetime('now') WHERE job_id=? AND status='queued'`).bind(batchId,id).run();
  }
  return{batchId,completionToken,count:ids.length};
}
async function triggerBatch(env,batch){
  if(!env.OVERFLOW_COMPUTE_URL||!batch)return{ok:false,reason:'overflow_runtime_not_configured'};
  const endpoint=new URL(`/tick/${encodeURIComponent(batch.batchId)}`,env.OVERFLOW_COMPUTE_URL).toString();
  try{
    const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','User-Agent':'ToolScout-Compute-Router/1.0'},body:JSON.stringify({batchId:batch.batchId,toolscoutBaseUrl:'https://trytoolscout.org'}),signal:AbortSignal.timeout(10000)});
    await env.DB.prepare(`UPDATE compute_overflow_batches SET trigger_http_status=?,last_error=?,updated_at=datetime('now') WHERE batch_id=?`).bind(response.status,response.ok?null:`trigger_http_${response.status}`,batch.batchId).run();
    if(!response.ok)throw new Error(`trigger_http_${response.status}`);
    await event(env,'overflow_batch_dispatched','completed',`Dispatched ${batch.count} research job(s) to external compute.`,{batchId:batch.batchId});
    return{ok:true,httpStatus:response.status};
  }catch(error){
    await env.DB.prepare(`UPDATE compute_overflow_jobs SET status='queued',batch_id=NULL,leased_at=NULL,available_at=datetime('now','+5 minutes'),last_error=?,updated_at=datetime('now') WHERE batch_id=? AND status='leased'`).bind(safe(error?.message||error,300),batch.batchId).run();
    await env.DB.prepare(`UPDATE compute_overflow_batches SET status='trigger_failed',last_error=?,updated_at=datetime('now') WHERE batch_id=?`).bind(safe(error?.message||error,300),batch.batchId).run();
    await event(env,'overflow_batch_dispatch_failed','failed',safe(error?.message||error,500),{batchId:batch.batchId});
    return{ok:false,error:safe(error?.message||error,500)};
  }
}
async function runOverflowTick(env){
  await ensureSchema(env);
  const requeued=await requeueStaleBatches(env);
  if(!env.OVERFLOW_COMPUTE_URL)return{ok:true,status:'awaiting_external_runtime',requeued,health:await health(env)};
  const enqueue=await enqueueDistributionResearch(env);
  const batch=await createBatch(env);
  const dispatch=batch?await triggerBatch(env,batch):{ok:true,skipped:true,reason:'no_batch_available'};
  return{ok:dispatch.ok!==false,status:batch?'dispatched':'idle',enqueue,requeued,batch:batch?{batchId:batch.batchId,count:batch.count}:null,dispatch,health:await health(env)};
}
async function batchPayload(env,batchId){
  await ensureSchema(env);
  const batch=await env.DB.prepare(`SELECT batch_id,status,job_count,completion_token_hash FROM compute_overflow_batches WHERE batch_id=? LIMIT 1`).bind(batchId).first();
  if(!batch||!['dispatched','running'].includes(String(batch.status)))return null;
  const jobs=await env.DB.prepare(`SELECT job_id,job_type,subject_type,subject_key,priority_score,payload_json FROM compute_overflow_jobs WHERE batch_id=? AND status='leased' ORDER BY priority_score DESC,created_at ASC`).bind(batchId).all();
  await env.DB.prepare(`UPDATE compute_overflow_batches SET status='running',fetched_at=COALESCE(fetched_at,datetime('now')),updated_at=datetime('now') WHERE batch_id=?`).bind(batchId).run();
  return{batch,jobs:rows(jobs)};
}
function sameHostRoute(source,target){
  try{
    const a=new URL(source),b=new URL(target);
    const ah=a.hostname.replace(/^www\./,''),bh=b.hostname.replace(/^www\./,'');
    return ['http:','https:'].includes(b.protocol)&&(ah===bh||ah.endsWith('.'+bh)||bh.endsWith('.'+ah));
  }catch{return false}
}
async function applyDistributionResult(env,job,result){
  let payload={};try{payload=JSON.parse(job.payload_json||'{}')}catch{}
  const slug=job.subject_key||payload.surfaceSlug;
  if(!slug)return{applied:false};
  const routes=Array.isArray(result?.routes)?result.routes:[];
  const best=routes.find(r=>r?.url&&sameHostRoute(payload.url,r.url)&&['submission','auth','captcha','contact'].includes(String(r.kind||'')))||null;
  const detail=best
    ?`External overflow research discovered a ${best.kind} route. Canonical Cloudflare validation is queued before any execution.`
    :`External overflow research completed without a verified submission route. Canonical engines may continue alternate-route research.`;
  const actionUrl=best?.url||null;
  const w=await env.DB.prepare(`UPDATE distribution_opportunities SET
      action_url=COALESCE(?,action_url),
      status=CASE WHEN status IN ('candidate','discovered') THEN 'research_required' ELSE status END,
      next_action=?,
      last_checked_at=NULL,
      updated_at=datetime('now')
    WHERE surface_slug=? AND human_required=0 AND status NOT IN ('verified','live','submitted','pending_review','policy_blocked','rejected','skipped','unavailable_free')`)
    .bind(actionUrl,safe(detail,1000),slug).run().catch(()=>null);
  try{await env.DB.prepare(`INSERT INTO distribution_events(event_id,surface_slug,event_type,status,source_url,destination_url,detail,observed_at,created_at)
    VALUES(?,?, 'overflow_compute_research','completed',?,?,?,datetime('now'),datetime('now'))`)
    .bind(`overflow_${crypto.randomUUID()}`,slug,payload.url||null,actionUrl||payload.url||null,safe(JSON.stringify({classification:result?.classification||null,route:best||null,blockers:result?.blockers||[]}),1600)).run()}catch{}
  return{applied:Number(w?.meta?.changes||w?.changes||0)>0,slug,route:best};
}
async function applyContactResult(env,job,result){
  let payload={};try{payload=JSON.parse(job.payload_json||'{}')}catch{}
  const slug=job.subject_key||payload.surfaceSlug;
  if(!slug)return{applied:0};
  const contacts=Array.isArray(result?.contactRoutes)?result.contactRoutes.slice(0,8):[];
  let applied=0;
  for(const route of contacts){
    if(!route?.url||(!sameHostRoute(payload.url,route.url)&&!String(route.url).startsWith('mailto:')))continue;
    const routeId=`overflow_${await shortHash(`${slug}:${route.kind}:${route.url}`)}`;
    const domain=(()=>{try{return new URL(payload.url).hostname.replace(/^www\./,'')}catch{return''}})();
    const w=await env.DB.prepare(`INSERT INTO distribution_contact_routes(route_id,surface_slug,domain,route_type,route_url,source_url,status,first_seen_at,last_seen_at,created_at,updated_at)
      VALUES(?,?,?,?,?,?,'discovered',datetime('now'),datetime('now'),datetime('now'),datetime('now'))
      ON CONFLICT(route_id) DO UPDATE SET last_seen_at=datetime('now'),updated_at=datetime('now')`)
      .bind(routeId,slug,domain,safe(route.kind||'contact',40),safe(route.url,2000),safe(payload.url,2000)).run().catch(()=>null);
    applied+=Number(w?.meta?.changes||w?.changes||0);
  }
  return{applied,slug};
}
async function completeBatch(request,env,ctx,batchId){
  await ensureSchema(env);
  const batch=await env.DB.prepare(`SELECT batch_id,status,completion_token_hash FROM compute_overflow_batches WHERE batch_id=? LIMIT 1`).bind(batchId).first();
  if(!batch)return Response.json({error:'unknown_batch'},{status:404,headers:JSON_H});
  if(batch.status==='completed')return Response.json({ok:true,idempotent:true,batchId},{headers:JSON_H});
  const token=(request.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');
  if(!token||(await sha256(token))!==batch.completion_token_hash)return Response.json({error:'invalid_completion_capability'},{status:403,headers:JSON_H});
  let body={};try{body=await request.json()}catch{return Response.json({error:'invalid_json'},{status:400,headers:JSON_H})}
  const results=Array.isArray(body.results)?body.results.slice(0,BATCH_SIZE):[];
  let completed=0,failed=0,applied=0;
  for(const result of results){
    const jobId=safe(result?.jobId,120);if(!jobId)continue;
    const job=await env.DB.prepare(`SELECT job_id,job_type,subject_key,payload_json FROM compute_overflow_jobs WHERE job_id=? AND batch_id=? AND status='leased' LIMIT 1`).bind(jobId,batchId).first();
    if(!job)continue;
    const ok=result?.ok!==false;
    if(ok){
      if(job.job_type==='distribution_route_research'){const a=await applyDistributionResult(env,job,result);applied+=a.applied?1:0}
      else if(job.job_type==='contact_route_research'){const a=await applyContactResult(env,job,result);applied+=num(a.applied)}
    }
    await env.DB.prepare(`UPDATE compute_overflow_jobs SET status=?,completed_at=datetime('now'),result_json=?,last_error=?,updated_at=datetime('now') WHERE job_id=?`)
      .bind(ok?'completed':'failed',JSON.stringify(result).slice(0,24000),ok?null:safe(result?.error||'external_compute_failed',600),jobId).run();
    if(ok)completed++;else failed++;
  }
  const unresolved=await env.DB.prepare(`SELECT COUNT(*) n FROM compute_overflow_jobs WHERE batch_id=? AND status='leased'`).bind(batchId).first().catch(()=>({n:0}));
  if(num(unresolved?.n)>0){
    await env.DB.prepare(`UPDATE compute_overflow_jobs SET status='queued',batch_id=NULL,leased_at=NULL,available_at=datetime('now','+5 minutes'),last_error='missing_from_batch_result',updated_at=datetime('now') WHERE batch_id=? AND status='leased'`).bind(batchId).run();
  }
  await env.DB.prepare(`UPDATE compute_overflow_batches SET status='completed',completed_at=datetime('now'),result_summary_json=?,updated_at=datetime('now') WHERE batch_id=?`)
    .bind(JSON.stringify({completed,failed,applied,missing:num(unresolved?.n)}),batchId).run();
  await event(env,'overflow_batch_completed',failed?'partial':'completed',`External compute returned ${completed} successful and ${failed} failed research job(s); ${applied} canonical records were advanced.`,{batchId});
  if(ctx&&env.ADMIN_TOKEN&&applied>0){
    const headers={Authorization:`Bearer ${env.ADMIN_TOKEN}`,'Content-Type':'application/json'};
    const refresh=Promise.allSettled([
      base.fetch(new Request('https://trytoolscout.org/api/distribution/autonomous/refresh',{method:'POST',headers}),env,ctx),
      base.fetch(new Request('https://trytoolscout.org/api/distribution/network/refresh',{method:'POST',headers}),env,ctx)
    ]);
    ctx.waitUntil(refresh);
  }
  return Response.json({ok:true,batchId,completed,failed,applied,missing:num(unresolved?.n)},{headers:JSON_H});
}
async function serveBatch(env,batchId){
  const out=await batchPayload(env,batchId);
  if(!out)return Response.json({error:'batch_unavailable'},{status:404,headers:JSON_H});
  const batchRow=await env.DB.prepare(`SELECT completion_token_hash FROM compute_overflow_batches WHERE batch_id=?`).bind(batchId).first();
  // Completion capability is reconstructed only from the dispatch-time copy kept in memory nowhere,
  // so create a fresh single-use capability when the worker first fetches the batch.
  const token=`${crypto.randomUUID()}.${crypto.randomUUID()}`;
  const tokenHash=await sha256(token);
  await env.DB.prepare(`UPDATE compute_overflow_batches SET completion_token_hash=?,updated_at=datetime('now') WHERE batch_id=?`).bind(tokenHash,batchId).run();
  return Response.json({
    batchId,completionToken:token,
    jobs:out.jobs.map(j=>{let payload={};try{payload=JSON.parse(j.payload_json||'{}')}catch{}return{jobId:j.job_id,type:j.job_type,subjectType:j.subject_type,subjectKey:j.subject_key,priority:num(j.priority_score),payload}})
  },{headers:JSON_H});
}
async function augmentRuntime(response,env){
  if(!response?.ok)return response;
  let data;try{data=await response.json()}catch{return response}
  data.computeOverflow=await health(env);
  if(data.primary)data.primary.researchCompute=env.OVERFLOW_COMPUTE_URL?'external_overflow':'cloudflare_only_until_external_runtime_connected';
  if(data.githubActions)data.githubActions={...data.githubActions,role:'disabled_until_october',scheduledPrimary:false};
  return Response.json(data,{status:response.status,headers:JSON_H});
}

export default{
  async fetch(request,env,ctx){
    const u=new URL(request.url);
    if(request.method==='GET'&&u.pathname==='/api/compute/health')return Response.json(await health(env),{headers:JSON_H});
    if(request.method==='POST'&&u.pathname==='/api/compute/router/refresh'){
      const token=(request.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');
      if(!env.ADMIN_TOKEN||token!==env.ADMIN_TOKEN)return Response.json({error:'unauthorized'},{status:401,headers:JSON_H});
      return Response.json(await runOverflowTick(env),{headers:JSON_H});
    }
    const getMatch=u.pathname.match(/^\/api\/compute\/batches\/(cob_[A-Za-z0-9-]+)$/);
    if(request.method==='GET'&&getMatch)return serveBatch(env,getMatch[1]);
    const completeMatch=u.pathname.match(/^\/api\/compute\/batches\/(cob_[A-Za-z0-9-]+)\/complete$/);
    if(request.method==='POST'&&completeMatch)return completeBatch(request,env,ctx,completeMatch[1]);
    if(request.method==='GET'&&u.pathname==='/api/runtime/executors')return augmentRuntime(await base.fetch(request,env,ctx),env);
    return base.fetch(request,env,ctx);
  },
  async scheduled(event,env,ctx){
    const trigger=event?.cron||'scheduled';
    if(trigger===OVERFLOW_CRON){
      const work=runOverflowTick(env).catch(async error=>{await event(env,'overflow_tick_failed','failed',safe(error?.message||error,800));return null});
      if(ctx?.waitUntil)ctx.waitUntil(work);
      return;
    }
    return typeof base.scheduled==='function'?base.scheduled(event,env,ctx):undefined;
  }
};
