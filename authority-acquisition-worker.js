import base from './seo-cloudflare-runtime-worker.js';
import {syncExecutionContracts,claimExecutorTasks,markExecutorAttempt,recordExecutionProof,deferExecutionTask} from './growth-execution-contract.js';
import {executeCloudflareSeoTask} from './seo-execution-runtime.js';
import {issueGrowthContentBrief} from './content-engine-intelligence-worker.js';
import {auditArchitectureEscalations} from './growth-architecture-escalation.js';

const H={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'private, no-store, max-age=0'};
const ROUTES=[
  {
    slug:'a2a-global-registry',
    endpoint:'https://api.a2a-registry.org/public/ingest',
    asset:'https://trytoolscout.org/.well-known/agent-card.json',
    payload:{manifestUrl:'https://trytoolscout.org/.well-known/agent-card.json'}
  },
  {
    slug:'a2a-community-registry',
    endpoint:'https://a2aregistry.org/api/agents/register',
    asset:'https://trytoolscout.org/.well-known/agent-card.json',
    payload:{wellKnownURI:'https://trytoolscout.org/.well-known/agent-card.json'}
  },
  {
    slug:'aipo-st',
    endpoint:'https://aipo.st/api/submit',
    asset:'https://trytoolscout.org/',
    payload:{url:'https://trytoolscout.org/',source:'agent'}
  },
  {
    slug:'botmarket-agent',
    endpoint:'https://botmarket.bot/v1/submit',
    asset:'https://trytoolscout.org/.well-known/agent-card.json',
    payload:{kind:'agent',url:'https://trytoolscout.org/',dry_run:false}
  },
  {
    slug:'botmarket-mcp',
    endpoint:'https://botmarket.bot/v1/submit',
    asset:'https://trytoolscout.org/mcp',
    payload:{kind:'mcp',url:'https://trytoolscout.org/mcp',dry_run:false}
  },
  {
    slug:'mcp-harbor',
    endpoint:'https://ai.mcpharbor.dev/api/v0/servers',
    asset:'https://trytoolscout.org/mcp',
    payload:{
      name:'io.github.pcaiano/toolscout',
      title:'ToolScout Software Recommendation',
      description:'Read-only software recommendation server. Affiliate relationships do not influence ranking.',
      version:'1.0.0',
      transport:'streamable-http',
      remote_url:'https://trytoolscout.org/mcp',
      tools:['recommend_tools'],
      tags:['software','recommendations','discovery'],
      repository_url:'https://github.com/pcaiano/toolscout',
      website_url:'https://trytoolscout.org/'
    }
  }
];

async function existing(env,route){
  try{
    return await env.DB.prepare(`SELECT submission_id,status,attempts,last_attempt_at,submitted_at,response_url,error
      FROM distribution_submissions
      WHERE surface_slug=? AND asset_url=?
      ORDER BY created_at DESC LIMIT 1`).bind(route.slug,route.asset).first();
  }catch{return null}
}
function recent(value,hours=168){
  if(!value)return false;
  const t=Date.parse(String(value).includes('T')?String(value):String(value).replace(' ','T')+'Z');
  return Number.isFinite(t)&&Date.now()-t<hours*3600000;
}
async function ensureRow(env,route,row){
  if(row)return row;
  const id='sub_'+crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO distribution_submissions
    (submission_id,surface_slug,asset_url,submission_type,status,payload_json,action_url,human_required,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`)
    .bind(id,route.slug,route.asset,'http_json','ready',JSON.stringify(route.payload),route.endpoint,0).run();
  return {submission_id:id,status:'ready',attempts:0};
}
async function recordEvent(env,eventType,status,route,detail){
  try{
    await env.DB.prepare(`INSERT INTO distribution_events
      (event_id,event_type,status,asset_type,surface_slug,destination_url,detail,observed_at,created_at)
      VALUES(?,?,?,?,?,?,?,datetime('now'),datetime('now'))`)
      .bind('auth_vetted_'+crypto.randomUUID(),eventType,status,'backlink_acquisition',route.slug,route.endpoint,String(detail||'').slice(0,1600)).run();
  }catch{
    try{
      await env.DB.prepare(`INSERT INTO distribution_events
        (event_id,event_type,status,asset_type,detail,observed_at,created_at)
        VALUES(?,?,?,?,?,datetime('now'),datetime('now'))`)
        .bind('auth_vetted_'+crypto.randomUUID(),eventType,status,'backlink_acquisition',String(detail||'').slice(0,1600)).run();
    }catch{}
  }
}
async function attemptRoute(env,route,{force=false}={}){
  let row=await existing(env,route);
  if(!force&&row&&recent(row.last_attempt_at||row.submitted_at,168)){
    return {slug:route.slug,attempted:false,reason:'cooldown',status:row.status,attempts:Number(row.attempts||0)};
  }
  row=await ensureRow(env,route,row);
  try{
    const res=await fetch(route.endpoint,{
      method:'POST',
      headers:{'Content-Type':'application/json','Accept':'application/json','User-Agent':'ToolScout Authority Acquisition/1.0'},
      body:JSON.stringify(route.payload),
      signal:AbortSignal.timeout(12000)
    });
    const text=(await res.text()).slice(0,1200);
    const accepted=res.ok||res.status===409;
    const next=accepted?(res.status===202?'pending_review':'submitted'):(res.status===429?'failed':'failed');
    const err=accepted?null:`${res.status>=500||res.status===429?'retryable':'terminal'}:HTTP ${res.status} ${text}`.slice(0,900);
    await env.DB.prepare(`UPDATE distribution_submissions
      SET status=?,attempts=attempts+1,last_attempt_at=datetime('now'),
          submitted_at=CASE WHEN ?=1 THEN COALESCE(submitted_at,datetime('now')) ELSE submitted_at END,
          response_url=?,error=?,updated_at=datetime('now')
      WHERE submission_id=?`)
      .bind(next,accepted?1:0,res.url||route.endpoint,err,row.submission_id).run();
    await recordEvent(env,accepted?'authority_vetted_route_submitted':'authority_vetted_route_failed',accepted?'completed':'failed',route,`${route.slug} HTTP ${res.status}. ${text}`);
    return {slug:route.slug,attempted:true,accepted,httpStatus:res.status,status:next,response:(res.url||route.endpoint),detail:text};
  }catch(error){
    const msg=String(error?.message||error).slice(0,800);
    await env.DB.prepare(`UPDATE distribution_submissions
      SET status='failed',attempts=attempts+1,last_attempt_at=datetime('now'),error=?,updated_at=datetime('now')
      WHERE submission_id=?`).bind('retryable:'+msg,row.submission_id).run();
    await recordEvent(env,'authority_vetted_route_failed','failed',route,msg);
    return {slug:route.slug,attempted:true,accepted:false,httpStatus:0,status:'failed',detail:msg};
  }
}
async function runVetted(env,{force=false}={}){
  const results=await Promise.all(ROUTES.map(route=>attemptRoute(env,route,{force}).catch(error=>({
    slug:route.slug,attempted:false,accepted:false,httpStatus:0,status:'internal_error',detail:String(error?.message||error).slice(0,800)
  }))));
  const attempted=results.filter(x=>x.attempted).length;
  const accepted=results.filter(x=>x.accepted).length;
  return {ok:attempted>0,executor:'cloudflare',attempted,accepted,routes:results,generatedAt:new Date().toISOString()};
}

async function upsertVerifiedPlacement(env,slug,publicUrl){
  try{
    await env.DB.prepare(`INSERT INTO distribution_placements(surface_slug,public_url,placement_verified,backlink_verified,first_verified_at,last_checked_at,created_at,updated_at)
      VALUES(?,?,1,0,datetime('now'),datetime('now'),datetime('now'),datetime('now'))
      ON CONFLICT(surface_slug) DO UPDATE SET public_url=excluded.public_url,placement_verified=1,
        first_verified_at=COALESCE(distribution_placements.first_verified_at,datetime('now')),
        last_checked_at=datetime('now'),updated_at=datetime('now')`).bind(slug,publicUrl).run();
    await env.DB.prepare(`UPDATE distribution_submissions SET status='verified',response_url=?,error=NULL,updated_at=datetime('now')
      WHERE surface_slug=?`).bind(publicUrl,slug).run();
    return true;
  }catch{return false}
}
async function reconcilePublicPlacements(env){
  const out={checked:0,verified:0,items:[]};
  const checks=[
    {
      slug:'a2a-community-registry',
      publicUrl:'https://a2aregistry.org/api/agents?search=ToolScout',
      match:async()=>{const r=await fetch('https://a2aregistry.org/api/agents?search=ToolScout',{headers:{Accept:'application/json'},signal:AbortSignal.timeout(8000)});if(!r.ok)return false;const d=await r.json();return Array.isArray(d?.agents)&&d.agents.some(x=>String(x?.wellKnownURI||'')==='https://trytoolscout.org/.well-known/agent-card.json'&&x?.hidden!==true)}
    },
    {
      slug:'mcp-harbor',
      publicUrl:'https://ai.mcpharbor.dev/api/v0/servers/io.github.pcaiano%2Ftoolscout',
      match:async()=>{const r=await fetch('https://ai.mcpharbor.dev/api/v0/servers/io.github.pcaiano%2Ftoolscout',{headers:{Accept:'application/json'},signal:AbortSignal.timeout(8000)});if(!r.ok)return false;const d=await r.json();return String(d?.server?.name||'')==='io.github.pcaiano/toolscout'}
    },
    {
      slug:'botmarket-mcp',
      publicUrl:'https://botmarket.bot/v1/search?q=toolscout',
      match:async()=>{const r=await fetch('https://botmarket.bot/v1/search?q=toolscout',{headers:{Accept:'application/json'},signal:AbortSignal.timeout(8000)});if(!r.ok)return false;const d=await r.json();return Array.isArray(d?.mcps)&&d.mcps.some(x=>String(x?.canonical_key||'').toLowerCase()==='pcaiano/toolscout'||String(x?.url||'').includes('trytoolscout.org'))}
    }
  ];
  for(const check of checks){
    out.checked++;
    let ok=false;try{ok=await check.match()}catch{}
    if(ok){
      const saved=await upsertVerifiedPlacement(env,check.slug,check.publicUrl);
      if(saved)out.verified++;
    }
    out.items.push({slug:check.slug,verified:ok,publicUrl:check.publicUrl});
  }
  return out;
}

async function health(env){
  const reconciliation=await reconcilePublicPlacements(env);
  const items=[];
  for(const route of ROUTES){
    const row=await existing(env,route);
    items.push({slug:route.slug,endpoint:route.endpoint,asset:route.asset,status:row?.status||'not_attempted',attempts:Number(row?.attempts||0),lastAttemptAt:row?.last_attempt_at||null,submittedAt:row?.submitted_at||null,responseUrl:row?.response_url||null,error:row?.error||null});
  }
  return {status:'active',executor:'cloudflare',routeCount:ROUTES.length,reconciliation,items};
}
async function migrationBootstrap(env){
  const out={synced:null,content:null,seo:null,architecture:null};
  out.synced=await syncExecutionContracts(env);

  const contentClaim=await claimExecutorTasks(env,'content_issue',{limit:1,maxInFlight:1,result:'content_recovery_bootstrap_waiting_for_publication'});
  if(contentClaim.claimed){
    const task=contentClaim.tasks?.[0]||null;
    try{
      const brief=await issueGrowthContentBrief(env,task);
      if(brief?.issued&&brief?.execution_task_id===task?.task_id){
        await markExecutorAttempt(env,'content_issue','content_brief_issued_waiting_for_publication',{taskIds:contentClaim.taskIds});
        out.content={claimed:1,task_id:task?.task_id||null,brief_id:brief?.brief_id||null,status:'attempted_waiting_publication'};
      }else{
        await deferExecutionTask(env,task?.task_id,'content_bootstrap_no_task_specific_brief');
        out.content={claimed:1,task_id:task?.task_id||null,status:'deferred',reason:'no_task_specific_brief'};
      }
    }catch(error){
      await deferExecutionTask(env,task?.task_id,'content_bootstrap_error:'+String(error?.message||error).slice(0,300)).catch(()=>null);
      out.content={claimed:1,task_id:task?.task_id||null,status:'error',error:String(error?.message||error).slice(0,500)};
    }
  }else out.content={claimed:0,status:'no_ready_task'};

  const seoClaim=await claimExecutorTasks(env,'seo_cloudflare',{limit:1,maxInFlight:1,result:'seo_cloudflare_recovery_bootstrap'});
  if(seoClaim.claimed){
    const task=seoClaim.tasks?.[0]||null;
    try{
      const result=await executeCloudflareSeoTask(env,task);
      if(result?.verified){
        const proof=await recordExecutionProof(env,{taskId:task.task_id,executor:'seo_cloudflare',status:'verified',detail:'cloudflare_seo_bootstrap_verified',externalId:result.pathname,evidence:result});
        out.seo={claimed:1,task_id:task.task_id,status:'verified',result,proof};
      }else{
        await deferExecutionTask(env,task?.task_id,'seo_bootstrap_not_verified:'+String(result?.reason||'unknown'));
        out.seo={claimed:1,task_id:task?.task_id||null,status:'deferred',result};
      }
    }catch(error){
      await deferExecutionTask(env,task?.task_id,'seo_bootstrap_error:'+String(error?.message||error).slice(0,300)).catch(()=>null);
      out.seo={claimed:1,task_id:task?.task_id||null,status:'error',error:String(error?.message||error).slice(0,500)};
    }
  }else out.seo={claimed:0,status:'no_ready_task'};

  out.architecture=await auditArchitectureEscalations(env).catch(error=>({ok:false,error:String(error?.message||error).slice(0,500)}));
  return {ok:true,mode:'temporary_migration_bootstrap',...out};
}
function authorized(request,env){
  const token=(request.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');
  return Boolean(env.ADMIN_TOKEN&&token===env.ADMIN_TOKEN);
}

export default{
  async fetch(request,env,ctx){
    const u=new URL(request.url);
    if(request.method==='GET'&&u.pathname==='/api/distribution/authority/vetted-health')return Response.json(await health(env),{headers:H});
    if(request.method==='GET'&&u.pathname==='/api/runtime/migration-bootstrap-20260923')return Response.json(await migrationBootstrap(env),{headers:H});
    if(request.method==='POST'&&u.pathname==='/api/distribution/authority/vetted-run'){
      if(!authorized(request,env))return Response.json({error:'unauthorized'},{status:401,headers:H});
      return Response.json(await runVetted(env,{force:u.searchParams.get('force')==='1'}),{headers:H});
    }
    return base.fetch(request,env,ctx);
  },
  async scheduled(event,env,ctx){
    const trigger=event?.cron||'scheduled';
    // Authority routes run before the inherited growth cycle so the supervisor
    // evaluates the post-execution state in the same cron, not one hour later.
    if(trigger==='15 * * * *'){
      await Promise.all([runVetted(env).catch(()=>null),reconcilePublicPlacements(env).catch(()=>null)]);
    }
    if(typeof base.scheduled==='function')return base.scheduled(event,env,ctx);
  }
};
