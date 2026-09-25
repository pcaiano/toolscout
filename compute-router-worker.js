import base from './operational-truth-reconciliation-worker.js';

const JSON_H={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'no-store'};
const OVERFLOW_CRON='*/5 * * * *';
const DAILY_JOB_BUDGET=1500;
const EXECUTION_DAILY_JOB_BUDGET=300;
const BATCH_SIZE=25;
const MAX_ACTIVE_BATCHES=2;
const BATCH_TIMEOUT_MINUTES=3;
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
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS compute_overflow_metrics(
      id TEXT PRIMARY KEY,
      metric_day TEXT NOT NULL DEFAULT (date('now')),
      queued INTEGER NOT NULL DEFAULT 0,
      leased INTEGER NOT NULL DEFAULT 0,
      completed_today INTEGER NOT NULL DEFAULT 0,
      failed_today INTEGER NOT NULL DEFAULT 0,
      created_today INTEGER NOT NULL DEFAULT 0,
      active_batches INTEGER NOT NULL DEFAULT 0,
      completed_batches_today INTEGER NOT NULL DEFAULT 0,
      last_dispatched_at TEXT,
      last_completed_at TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    env.DB.prepare(`INSERT OR IGNORE INTO compute_overflow_metrics(id,metric_day) VALUES('global',date('now'))`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS compute_overflow_budget(
      kind TEXT PRIMARY KEY,
      metric_day TEXT NOT NULL DEFAULT (date('now')),
      used_today INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    env.DB.prepare(`INSERT OR IGNORE INTO compute_overflow_budget(kind,metric_day,used_today) VALUES('research',date('now'),0)`),
    env.DB.prepare(`INSERT OR IGNORE INTO compute_overflow_budget(kind,metric_day,used_today) VALUES('execution',date('now'),0)`)
  ]).catch(error=>{schemaReady=null;throw error});
  return schemaReady;
}
async function event(env,eventType,status,detail,{jobId=null,batchId=null}={}){
  await ensureSchema(env);
  try{await env.DB.prepare(`INSERT INTO compute_overflow_events(event_id,event_type,status,job_id,batch_id,detail,created_at) VALUES(?,?,?,?,?,?,datetime('now'))`)
    .bind(`coe_${crypto.randomUUID()}`,eventType,status,jobId,batchId,safe(detail,1800)).run()}catch{}
}
async function resetMetricsDay(env){
  await ensureSchema(env);
  await env.DB.prepare(`UPDATE compute_overflow_metrics SET metric_day=date('now'),completed_today=0,failed_today=0,created_today=0,completed_batches_today=0,updated_at=datetime('now') WHERE id='global' AND metric_day<>date('now')`).run().catch(()=>{});
}
async function reconcileMetricAnomaly(env,m){
  const looksImpossible=num(m?.active_batches)===0&&num(m?.leased)>0;
  if(!looksImpossible)return m;
  const [jobs,batches]=await Promise.all([
    env.DB.prepare(`SELECT
      SUM(CASE WHEN status='queued' THEN 1 ELSE 0 END) queued,
      SUM(CASE WHEN status='leased' THEN 1 ELSE 0 END) leased,
      SUM(CASE WHEN status='completed' AND completed_at>=date('now') THEN 1 ELSE 0 END) completed_today,
      SUM(CASE WHEN status='failed' AND updated_at>=date('now') THEN 1 ELSE 0 END) failed_today,
      SUM(CASE WHEN created_at>=date('now') THEN 1 ELSE 0 END) created_today,
      MAX(completed_at) last_completed_at
      FROM compute_overflow_jobs`).first().catch(()=>null),
    env.DB.prepare(`SELECT
      SUM(CASE WHEN status IN ('dispatched','running') THEN 1 ELSE 0 END) active_batches,
      SUM(CASE WHEN status='completed' AND completed_at>=date('now') THEN 1 ELSE 0 END) completed_batches_today,
      MAX(dispatched_at) last_dispatched_at
      FROM compute_overflow_batches`).first().catch(()=>null)
  ]);
  await env.DB.prepare(`UPDATE compute_overflow_metrics SET queued=?,leased=?,completed_today=?,failed_today=?,created_today=?,active_batches=?,completed_batches_today=?,last_dispatched_at=COALESCE(?,last_dispatched_at),last_completed_at=COALESCE(?,last_completed_at),updated_at=datetime('now') WHERE id='global'`)
    .bind(num(jobs?.queued),num(jobs?.leased),num(jobs?.completed_today),num(jobs?.failed_today),num(jobs?.created_today),num(batches?.active_batches),num(batches?.completed_batches_today),batches?.last_dispatched_at||null,jobs?.last_completed_at||null).run().catch(()=>{});
  return env.DB.prepare(`SELECT metric_day,queued,leased,completed_today,failed_today,created_today,active_batches,completed_batches_today,last_dispatched_at,last_completed_at FROM compute_overflow_metrics WHERE id='global' LIMIT 1`).first().catch(()=>m);
}
async function metricRow(env){
  await resetMetricsDay(env);
  const m=await env.DB.prepare(`SELECT metric_day,queued,leased,completed_today,failed_today,created_today,active_batches,completed_batches_today,last_dispatched_at,last_completed_at FROM compute_overflow_metrics WHERE id='global' LIMIT 1`).first().catch(()=>null);
  return reconcileMetricAnomaly(env,m);
}
async function metricDelta(env,{queued=0,leased=0,completed=0,failed=0,created=0,activeBatches=0,completedBatches=0,lastDispatched=false,lastCompleted=false}={}){
  await resetMetricsDay(env);
  await env.DB.prepare(`UPDATE compute_overflow_metrics SET
      queued=MAX(0,queued+?),leased=MAX(0,leased+?),
      completed_today=MAX(0,completed_today+?),failed_today=MAX(0,failed_today+?),created_today=MAX(0,created_today+?),
      active_batches=MAX(0,active_batches+?),completed_batches_today=MAX(0,completed_batches_today+?),
      last_dispatched_at=CASE WHEN ? THEN datetime('now') ELSE last_dispatched_at END,
      last_completed_at=CASE WHEN ? THEN datetime('now') ELSE last_completed_at END,
      updated_at=datetime('now')
    WHERE id='global'`).bind(queued,leased,completed,failed,created,activeBatches,completedBatches,lastDispatched?1:0,lastCompleted?1:0).run().catch(()=>{});
}
async function budgetRemaining(env,kind,limit){
  await ensureSchema(env);
  await env.DB.prepare(`UPDATE compute_overflow_budget SET metric_day=date('now'),used_today=0,updated_at=datetime('now') WHERE kind=? AND metric_day<>date('now')`).bind(kind).run().catch(()=>{});
  const row=await env.DB.prepare(`SELECT used_today FROM compute_overflow_budget WHERE kind=? LIMIT 1`).bind(kind).first().catch(()=>null);
  return Math.max(0,Number(limit||0)-num(row?.used_today));
}
async function budgetConsume(env,kind,count){
  const n=Math.max(0,Number(count||0));if(!n)return;
  await env.DB.prepare(`UPDATE compute_overflow_budget SET used_today=used_today+?,updated_at=datetime('now') WHERE kind=?`).bind(n,kind).run().catch(()=>{});
}
async function health(env){
  const m=await metricRow(env);
  return {
    status:env.OVERFLOW_COMPUTE_URL?'configured':'awaiting_external_runtime',
    providerUrl:env.OVERFLOW_COMPUTE_URL?(()=>{try{return new URL(env.OVERFLOW_COMPUTE_URL).origin}catch{return null}})():null,
    dailyJobBudget:DAILY_JOB_BUDGET,executionDailyJobBudget:EXECUTION_DAILY_JOB_BUDGET,batchSize:BATCH_SIZE,maxActiveBatches:MAX_ACTIVE_BATCHES,
    queued:num(m?.queued),leased:num(m?.leased),completedToday:num(m?.completed_today),failedToday:num(m?.failed_today),createdToday:num(m?.created_today),
    activeBatches:num(m?.active_batches),completedBatchesToday:num(m?.completed_batches_today),lastDispatchedAt:m?.last_dispatched_at||null,lastCompletedAt:m?.last_completed_at||null,
    d1ReadModel:'single_row_metrics_no_job_table_scans',
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
  const m=await metricRow(env);
  let remaining=await budgetRemaining(env,'research',DAILY_JOB_BUDGET);
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
    const routeAdded=await enqueueJob(env,{jobKey:`route:${row.surface_slug}:${urlHash}`,jobType:'distribution_route_research',subjectType:'surface',subjectKey:row.surface_slug,priority:num(row.distribution_score),payload});
    enqueued+=routeAdded;remaining=Math.max(0,remaining-routeAdded);
    if(remaining<=0)break;
    if(num(row.distribution_score)>=55){
      const contactAdded=await enqueueJob(env,{jobKey:`contact:${row.surface_slug}:${urlHash}`,jobType:'contact_route_research',subjectType:'surface',subjectKey:row.surface_slug,priority:Math.max(0,num(row.distribution_score)-5),payload});
      enqueued+=contactAdded;remaining=Math.max(0,remaining-contactAdded);
    }
  }
  if(enqueued>0){await metricDelta(env,{queued:enqueued,created:enqueued});await budgetConsume(env,'research',enqueued);}
  return{enqueued,remaining};
}

function encodedAdapterBody(contentType,payload){
  const type=String(contentType||'application/json').toLowerCase();
  if(type==='application/x-www-form-urlencoded')return new URLSearchParams(Object.entries(payload||{}).map(([k,v])=>[k,Array.isArray(v)?v.join(','):String(v??'')])).toString();
  return JSON.stringify(payload||{});
}
async function enqueueAuthorizedExecution(env){
  await ensureSchema(env);
  let remaining=await budgetRemaining(env,'execution',EXECUTION_DAILY_JOB_BUDGET);
  if(!remaining)return{enqueued:0,submissionJobs:0,verificationJobs:0,remaining:0};
  let enqueued=0,submissionJobs=0,verificationJobs=0;

  const submitLimit=Math.min(120,remaining);
  const candidates=await env.DB.prepare(`SELECT a.surface_slug,a.endpoint,a.method,a.content_type,a.payload_template_json,a.verification_endpoint,a.public_url,
      o.distribution_score,COALESCE(l.operating_decision,'explore') operating_decision
    FROM distribution_auto_adapters a
    JOIN distribution_opportunities o ON o.surface_slug=a.surface_slug
    LEFT JOIN distribution_economic_learning l ON l.surface_slug=a.surface_slug
    LEFT JOIN distribution_surface_costs c ON c.surface_slug=a.surface_slug
    WHERE a.policy_state='verified' AND a.confidence>=95 AND o.status='ready_to_submit'
      AND COALESCE(c.cost_amount,0)=0
      AND COALESCE(l.operating_decision,'explore') IN ('explore','measure','scale')
    ORDER BY CASE COALESCE(l.operating_decision,'explore') WHEN 'scale' THEN 0 WHEN 'measure' THEN 1 ELSE 2 END,o.distribution_score DESC
    LIMIT ?`).bind(submitLimit).all().catch(()=>({results:[]}));

  for(const a of rows(candidates)){
    if(remaining<=0||!isHttp(a.endpoint))break;
    const method=String(a.method||'POST').toUpperCase();
    if(!['POST','PUT','PATCH'].includes(method))continue;
    let payload={};try{payload=JSON.parse(a.payload_template_json||'{}')}catch{continue}
    const contentType=String(a.content_type||'application/json').toLowerCase();
    if(!['application/json','application/x-www-form-urlencoded'].includes(contentType))continue;
    const prior=await env.DB.prepare(`SELECT submission_id,status,attempts FROM distribution_submissions WHERE surface_slug=? AND asset_url='https://trytoolscout.org/' AND submission_type='auto_discovered_json' LIMIT 1`).bind(a.surface_slug).first().catch(()=>null);
    if(prior&&['submitted','pending_review','verified'].includes(String(prior.status||'')))continue;
    if(prior&&num(prior.attempts)>=3)continue;
    const submissionId=prior?.submission_id||`sub_${crypto.randomUUID()}`;
    if(!prior){
      await env.DB.prepare(`INSERT INTO distribution_submissions(submission_id,surface_slug,asset_url,submission_type,status,payload_json,action_url,human_required,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`)
        .bind(submissionId,a.surface_slug,'https://trytoolscout.org/','auto_discovered_json','queued_external',a.payload_template_json,a.endpoint,0).run().catch(()=>{});
    }else{
      await env.DB.prepare(`UPDATE distribution_submissions SET status='queued_external',action_url=?,payload_json=?,error=NULL,updated_at=datetime('now') WHERE submission_id=? AND status NOT IN ('submitted','verified')`)
        .bind(a.endpoint,a.payload_template_json,submissionId).run().catch(()=>{});
    }
    const keyHash=await shortHash(`${a.endpoint}|${method}|${contentType}|${a.payload_template_json}`);
    const added=await enqueueJob(env,{
      jobKey:`execute:${a.surface_slug}:${submissionId}:${keyHash}`,
      jobType:'authorized_http_action',
      subjectType:'surface',subjectKey:a.surface_slug,
      priority:1200+num(a.distribution_score),
      payload:{
        surfaceSlug:a.surface_slug,submissionId,endpoint:a.endpoint,method,contentType,
        body:encodedAdapterBody(contentType,payload),
        verificationEndpoint:a.verification_endpoint||null,publicUrl:a.public_url||null,
        authorizationClass:'verified_free_auto_adapter_v1'
      }
    });
    if(added){enqueued+=added;submissionJobs+=added;remaining-=added;}
  }

  if(remaining>0){
    const verifyLimit=Math.min(120,remaining);
    const pending=await env.DB.prepare(`SELECT ds.submission_id,ds.surface_slug,ds.response_url,ds.action_url,a.verification_endpoint,a.public_url,o.distribution_score
      FROM distribution_submissions ds
      JOIN distribution_auto_adapters a ON a.surface_slug=ds.surface_slug
      LEFT JOIN distribution_opportunities o ON o.surface_slug=ds.surface_slug
      WHERE ds.submission_type='auto_discovered_json' AND ds.status='submitted'
        AND COALESCE(o.status,'') NOT IN ('verified','live')
      ORDER BY ds.submitted_at ASC LIMIT ?`).bind(verifyLimit).all().catch(()=>({results:[]}));
    for(const row of rows(pending)){
      if(remaining<=0)break;
      const target=[row.response_url,row.verification_endpoint,row.public_url].find(isHttp);
      if(!target)continue;
      const keyHash=await shortHash(target);
      const added=await enqueueJob(env,{
        jobKey:`verify:${row.surface_slug}:${row.submission_id}:${keyHash}`,
        jobType:'authorized_verification',
        subjectType:'surface',subjectKey:row.surface_slug,
        priority:1100+num(row.distribution_score),
        payload:{surfaceSlug:row.surface_slug,submissionId:row.submission_id,targetUrl:target,actionUrl:row.action_url||null,authorizationClass:'verified_publication_check_v1'}
      });
      if(added){enqueued+=added;verificationJobs+=added;remaining-=added;}
    }
  }

  if(enqueued>0){await metricDelta(env,{queued:enqueued,created:enqueued});await budgetConsume(env,'execution',enqueued);}
  return{enqueued,submissionJobs,verificationJobs,remaining};
}
async function requeueStaleBatches(env){
  await ensureSchema(env);
  const stale=await env.DB.prepare(`SELECT batch_id,job_count FROM compute_overflow_batches
    WHERE status IN ('dispatched','running') AND dispatched_at<=datetime('now','-${BATCH_TIMEOUT_MINUTES} minutes') LIMIT 20`).all().catch(()=>({results:[]}));
  let requeued=0;
  for(const row of rows(stale)){
    const w=await env.DB.prepare(`UPDATE compute_overflow_jobs SET status='queued',batch_id=NULL,leased_at=NULL,available_at=datetime('now'),last_error='batch_timeout_requeued',updated_at=datetime('now') WHERE batch_id=? AND status='leased'`).bind(row.batch_id).run();
    const changed=Number(w?.meta?.changes||w?.changes||0);requeued+=changed;
    await env.DB.prepare(`UPDATE compute_overflow_batches SET status='timed_out',last_error='completion_timeout',updated_at=datetime('now') WHERE batch_id=?`).bind(row.batch_id).run();
    if(changed>0)await metricDelta(env,{queued:changed,leased:-changed,activeBatches:-1});
  }
  return requeued;
}
async function createBatch(env){
  await ensureSchema(env);
  const m=await metricRow(env);
  if(num(m?.active_batches)>=MAX_ACTIVE_BATCHES)return null;
  const q=await env.DB.prepare(`SELECT job_id FROM compute_overflow_jobs WHERE status='queued' AND available_at<=datetime('now') ORDER BY priority_score DESC,created_at ASC LIMIT ?`).bind(BATCH_SIZE).all().catch(()=>({results:[]}));
  const ids=rows(q).map(x=>x.job_id).filter(Boolean);
  if(!ids.length)return null;
  const batchId=`cob_${crypto.randomUUID()}`;
  const completionToken=`${crypto.randomUUID()}.${crypto.randomUUID()}`;
  const tokenHash=await sha256(completionToken);
  await env.DB.prepare(`INSERT INTO compute_overflow_batches(batch_id,completion_token_hash,status,job_count,dispatched_at,created_at,updated_at) VALUES(?,?,'dispatched',?,datetime('now'),datetime('now'),datetime('now'))`).bind(batchId,tokenHash,ids.length).run();
  let leased=0;
  for(const id of ids){
    const w=await env.DB.prepare(`UPDATE compute_overflow_jobs SET status='leased',batch_id=?,leased_at=datetime('now'),attempts=attempts+1,updated_at=datetime('now') WHERE job_id=? AND status='queued'`).bind(batchId,id).run();
    leased+=Number(w?.meta?.changes||w?.changes||0);
  }
  if(leased>0)await metricDelta(env,{queued:-leased,leased,activeBatches:1,lastDispatched:true});
  return{batchId,completionToken,count:leased};
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
    const w=await env.DB.prepare(`UPDATE compute_overflow_jobs SET status='queued',batch_id=NULL,leased_at=NULL,available_at=datetime('now','+5 minutes'),last_error=?,updated_at=datetime('now') WHERE batch_id=? AND status='leased'`).bind(safe(error?.message||error,300),batch.batchId).run();
    const restored=Number(w?.meta?.changes||w?.changes||0);
    await env.DB.prepare(`UPDATE compute_overflow_batches SET status='trigger_failed',last_error=?,updated_at=datetime('now') WHERE batch_id=?`).bind(safe(error?.message||error,300),batch.batchId).run();
    if(restored>0)await metricDelta(env,{queued:restored,leased:-restored,activeBatches:-1});
    await event(env,'overflow_batch_dispatch_failed','failed',safe(error?.message||error,500),{batchId:batch.batchId});
    return{ok:false,error:safe(error?.message||error,500)};
  }
}
async function runOverflowTick(env){
  if(!env.OVERFLOW_COMPUTE_URL)return{ok:true,status:'awaiting_external_runtime'};
  await ensureSchema(env);
  const requeued=await requeueStaleBatches(env);
  const execution=await enqueueAuthorizedExecution(env);
  const research=await enqueueDistributionResearch(env);
  const batch=await createBatch(env);
  const dispatch=batch&&batch.count>0?await triggerBatch(env,batch):{ok:true,skipped:true,reason:'no_batch_available'};
  return{ok:dispatch.ok!==false,status:batch&&batch.count>0?'dispatched':'idle',execution,research,requeued,batch:batch&&batch.count>0?{batchId:batch.batchId,count:batch.count}:null,dispatch};
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
  const best=routes.find(r=>r?.url&&sameHostRoute(payload.url,r.url)&&['submission','auth','captcha'].includes(String(r.kind||'')))||null;
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

function safeSameHostEvidence(endpoint,value){
  if(!value)return null;
  try{
    const u=new URL(String(value));if(u.protocol!=='https:'||!sameHostRoute(endpoint,u.href))return null;return u.href;
  }catch{return null}
}
async function currentAdapterAuthorization(env,slug,payload){
  const row=await env.DB.prepare(`SELECT a.endpoint,a.method,a.content_type,a.policy_state,a.confidence,
      COALESCE(c.cost_amount,0) cost_amount,o.status opportunity_status
    FROM distribution_auto_adapters a
    JOIN distribution_opportunities o ON o.surface_slug=a.surface_slug
    LEFT JOIN distribution_surface_costs c ON c.surface_slug=a.surface_slug
    WHERE a.surface_slug=? LIMIT 1`).bind(slug).first().catch(()=>null);
  if(!row)return{ok:false,reason:'adapter_missing'};
  if(row.policy_state!=='verified'||num(row.confidence)<95)return{ok:false,reason:'adapter_no_longer_verified'};
  if(num(row.cost_amount)>0)return{ok:false,reason:'paid_route_not_authorized'};
  if(String(row.endpoint||'')!==String(payload.endpoint||''))return{ok:false,reason:'endpoint_changed'};
  if(String(row.method||'POST').toUpperCase()!==String(payload.method||'POST').toUpperCase())return{ok:false,reason:'method_changed'};
  if(String(row.content_type||'application/json').toLowerCase()!==String(payload.contentType||'application/json').toLowerCase())return{ok:false,reason:'content_type_changed'};
  return{ok:true,row};
}
async function applyAuthorizedActionResult(env,job,result){
  let payload={};try{payload=JSON.parse(job.payload_json||'{}')}catch{}
  const slug=job.subject_key||payload.surfaceSlug,submissionId=payload.submissionId;
  if(!slug||!submissionId)return{applied:false,reason:'missing_action_identity'};
  const auth=await currentAdapterAuthorization(env,slug,payload);
  if(!auth.ok){
    await env.DB.prepare(`UPDATE distribution_submissions SET status='failed',attempts=attempts+1,last_attempt_at=datetime('now'),error=?,updated_at=datetime('now') WHERE submission_id=?`).bind(`authorization_recheck:${auth.reason}`,submissionId).run().catch(()=>{});
    return{applied:false,reason:auth.reason};
  }
  const httpStatus=num(result?.httpStatus);
  const accepted=result?.ok===true&&httpStatus>=200&&httpStatus<300;
  if(accepted){
    const evidence=safeSameHostEvidence(payload.endpoint,result?.evidenceUrl)||safeSameHostEvidence(payload.endpoint,result?.finalUrl)||payload.verificationEndpoint||payload.publicUrl||payload.endpoint;
    await env.DB.prepare(`UPDATE distribution_submissions SET status='submitted',attempts=attempts+1,last_attempt_at=datetime('now'),submitted_at=COALESCE(submitted_at,datetime('now')),response_url=?,error=NULL,updated_at=datetime('now') WHERE submission_id=?`).bind(evidence,submissionId).run();
    await env.DB.prepare(`UPDATE distribution_opportunities SET status='submitted',next_action='External execution plane completed an authorized machine-safe submission. Verification remains canonical before placement is counted.',updated_at=datetime('now') WHERE surface_slug=? AND status NOT IN ('verified','live')`).bind(slug).run();
    await env.DB.prepare(`INSERT INTO distribution_events(event_id,surface_slug,event_type,status,source_url,destination_url,detail,observed_at,created_at)
      VALUES(?,?, 'external_authorized_submission','completed',?,?,?,datetime('now'),datetime('now'))`)
      .bind(`extsub_${crypto.randomUUID()}`,slug,payload.endpoint,evidence,`Render executed a Cloudflare-authorized verified free adapter. HTTP ${httpStatus}. Cloudflare retained decision and verification authority.`).run().catch(()=>{});
    return{applied:true,accepted:true,evidence};
  }
  await env.DB.prepare(`UPDATE distribution_submissions SET status='failed',attempts=attempts+1,last_attempt_at=datetime('now'),error=?,updated_at=datetime('now') WHERE submission_id=?`)
    .bind(`external_http_${httpStatus||0}:${safe(result?.error||'submission_failed',300)}`,submissionId).run().catch(()=>{});
  await env.DB.prepare(`INSERT INTO distribution_events(event_id,surface_slug,event_type,status,source_url,detail,observed_at,created_at)
    VALUES(?,?, 'external_authorized_submission','failed',?,?,datetime('now'),datetime('now'))`)
    .bind(`extsubfail_${crypto.randomUUID()}`,slug,payload.endpoint,`Authorized external submission failed. HTTP ${httpStatus||0}: ${safe(result?.error||'unknown',300)}`).run().catch(()=>{});
  return{applied:true,accepted:false};
}
async function applyAuthorizedVerificationResult(env,job,result){
  let payload={};try{payload=JSON.parse(job.payload_json||'{}')}catch{}
  const slug=job.subject_key||payload.surfaceSlug,submissionId=payload.submissionId,target=payload.targetUrl;
  if(!slug||!submissionId||!isHttp(target))return{applied:false,reason:'missing_verification_identity'};
  const row=await env.DB.prepare(`SELECT ds.status,ds.response_url,ds.action_url,a.verification_endpoint,a.public_url
    FROM distribution_submissions ds JOIN distribution_auto_adapters a ON a.surface_slug=ds.surface_slug
    WHERE ds.submission_id=? AND ds.surface_slug=? LIMIT 1`).bind(submissionId,slug).first().catch(()=>null);
  if(!row)return{applied:false,reason:'submission_missing'};
  const allowed=[row.response_url,row.verification_endpoint,row.public_url].filter(Boolean);
  if(!allowed.some(x=>String(x)===String(target)))return{applied:false,reason:'verification_target_changed'};
  const httpStatus=num(result?.httpStatus);
  if(result?.ok===true&&httpStatus>=200&&httpStatus<300){
    const publicUrl=safeSameHostEvidence(target,result?.finalUrl)||target;
    await env.DB.prepare(`UPDATE distribution_submissions SET response_url=?,error=NULL,updated_at=datetime('now') WHERE submission_id=?`).bind(publicUrl,submissionId).run();
    await env.DB.prepare(`UPDATE distribution_auto_adapters SET public_url=COALESCE(public_url,?),verification_endpoint=COALESCE(verification_endpoint,?),updated_at=datetime('now') WHERE surface_slug=?`).bind(publicUrl,target,slug).run();
    await env.DB.prepare(`UPDATE distribution_opportunities SET status='verified',live_url=COALESCE(live_url,?),last_checked_at=datetime('now'),next_action='External verification confirmed publication. Continue attribution and performance measurement.',updated_at=datetime('now') WHERE surface_slug=?`).bind(publicUrl,slug).run();
    await env.DB.prepare(`INSERT INTO distribution_events(event_id,surface_slug,event_type,status,destination_url,detail,observed_at,created_at)
      VALUES(?,?, 'external_publication_verification','verified',?,?,datetime('now'),datetime('now'))`)
      .bind(`extverify_${crypto.randomUUID()}`,slug,publicUrl,`Render performed the network check; Cloudflare validated the authorized verification target and recorded the public placement. HTTP ${httpStatus}.`).run().catch(()=>{});
    return{applied:true,verified:true,publicUrl};
  }
  await env.DB.prepare(`UPDATE distribution_opportunities SET last_checked_at=datetime('now'),updated_at=datetime('now') WHERE surface_slug=?`).bind(slug).run().catch(()=>{});
  return{applied:true,verified:false,httpStatus};
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
    if(job.job_type==='authorized_http_action'){const a=await applyAuthorizedActionResult(env,job,result);applied+=a.applied?1:0}
    else if(job.job_type==='authorized_verification'){const a=await applyAuthorizedVerificationResult(env,job,result);applied+=a.applied?1:0}
    else if(ok){
      if(job.job_type==='distribution_route_research'){const a=await applyDistributionResult(env,job,result);applied+=a.applied?1:0}
      else if(job.job_type==='contact_route_research'){const a=await applyContactResult(env,job,result);applied+=num(a.applied)}
    }
    await env.DB.prepare(`UPDATE compute_overflow_jobs SET status=?,completed_at=datetime('now'),result_json=?,last_error=?,updated_at=datetime('now') WHERE job_id=?`)
      .bind(ok?'completed':'failed',JSON.stringify(result).slice(0,24000),ok?null:safe(result?.error||'external_compute_failed',600),jobId).run();
    if(ok){completed++;await metricDelta(env,{leased:-1,completed:1,lastCompleted:true});}
    else{failed++;await metricDelta(env,{leased:-1,failed:1,lastCompleted:true});}
  }
  const unresolved=await env.DB.prepare(`SELECT COUNT(*) n FROM compute_overflow_jobs WHERE batch_id=? AND status='leased'`).bind(batchId).first().catch(()=>({n:0}));
  if(num(unresolved?.n)>0){
    await env.DB.prepare(`UPDATE compute_overflow_jobs SET status='queued',batch_id=NULL,leased_at=NULL,available_at=datetime('now','+5 minutes'),last_error='missing_from_batch_result',updated_at=datetime('now') WHERE batch_id=? AND status='leased'`).bind(batchId).run();
  }
  await env.DB.prepare(`UPDATE compute_overflow_batches SET status='completed',completed_at=datetime('now'),result_summary_json=?,updated_at=datetime('now') WHERE batch_id=?`)
    .bind(JSON.stringify({completed,failed,applied,missing:num(unresolved?.n)}),batchId).run();
  const missing=num(unresolved?.n);
  await metricDelta(env,{leased:-missing,queued:missing,activeBatches:-1,completedBatches:1,lastCompleted:true});
  await event(env,'overflow_batch_completed',failed?'partial':'completed',`External compute returned ${completed} successful and ${failed} failed job(s); ${applied} canonical records were advanced across research and authorized execution.`,{batchId});
  if(ctx&&env.ADMIN_TOKEN&&applied>0){
    const headers={Authorization:`Bearer ${env.ADMIN_TOKEN}`,'Content-Type':'application/json'};
    const refresh=Promise.allSettled([
      base.fetch(new Request('https://trytoolscout.org/api/distribution/autonomous/refresh',{method:'POST',headers}),env,ctx),
      base.fetch(new Request('https://trytoolscout.org/api/distribution/network/refresh',{method:'POST',headers}),env,ctx)
    ]);
    ctx.waitUntil(refresh);
  }
  return Response.json({ok:true,batchId,completed,failed,applied,missing},{headers:JSON_H});
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
