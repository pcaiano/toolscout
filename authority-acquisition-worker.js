import base from './seo-cloudflare-runtime-worker.js';

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
      signal:AbortSignal.timeout(30000)
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
  const results=[];
  for(const route of ROUTES)results.push(await attemptRoute(env,route,{force}));
  const attempted=results.filter(x=>x.attempted).length;
  const accepted=results.filter(x=>x.accepted).length;
  return {ok:attempted>0,executor:'cloudflare',attempted,accepted,routes:results,generatedAt:new Date().toISOString()};
}
async function health(env){
  const items=[];
  for(const route of ROUTES){
    const row=await existing(env,route);
    items.push({slug:route.slug,endpoint:route.endpoint,asset:route.asset,status:row?.status||'not_attempted',attempts:Number(row?.attempts||0),lastAttemptAt:row?.last_attempt_at||null,submittedAt:row?.submitted_at||null,responseUrl:row?.response_url||null,error:row?.error||null});
  }
  return {status:'active',executor:'cloudflare',routeCount:ROUTES.length,items};
}
function authorized(request,env){
  const token=(request.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');
  return Boolean(env.ADMIN_TOKEN&&token===env.ADMIN_TOKEN);
}

export default{
  async fetch(request,env,ctx){
    const u=new URL(request.url);
    if(request.method==='GET'&&u.pathname==='/api/distribution/authority/vetted-health')return Response.json(await health(env),{headers:H});
    if(request.method==='POST'&&u.pathname==='/api/distribution/authority/vetted-run'){
      if(!authorized(request,env))return Response.json({error:'unauthorized'},{status:401,headers:H});
      return Response.json(await runVetted(env,{force:u.searchParams.get('force')==='1'}),{headers:H});
    }
    return base.fetch(request,env,ctx);
  },
  async scheduled(event,env,ctx){
    const trigger=event?.cron||'scheduled';
    if(typeof base.scheduled==='function')await base.scheduled(event,env,ctx);
    if(trigger==='15 * * * *'||trigger==='* * * * *'){
      const task=runVetted(env).catch(()=>null);
      if(ctx?.waitUntil)ctx.waitUntil(task);else await task;
    }
  }
};
