import base from './ga4-owner-exclusion-worker.js';
import {runWithLedger} from './engine-run-ledger.js';
import {googleAnalyticsOAuthAccess,googleAnalyticsOAuthStatus} from './google-analytics-oauth.js';

const H={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'private, no-store, max-age=0'};
const HOURLY='15 * * * *';
const DAILY='35 3 * * *';

async function internalJson(request,env,ctx,path,{method='POST',body=null,timeoutMs=45000}={}){
  if(!env.ADMIN_TOKEN)return {ok:false,httpStatus:0,error:'admin_token_unavailable'};
  const headers={Authorization:`Bearer ${env.ADMIN_TOKEN}`,'Content-Type':'application/json'};
  const init={method,headers};
  if(body!=null)init.body=JSON.stringify(body);
  try{
    const work=base.fetch(new Request(new URL(path,request.url),init),env,ctx);
    let timer;
    const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`stage_timeout:${path}`)),Math.max(5000,Number(timeoutMs)||45000))});
    const response=await Promise.race([work,timeout]);
    clearTimeout(timer);
    let payload=null;try{payload=await response.json()}catch{}
    return {ok:response.ok,httpStatus:response.status,payload};
  }catch(error){return {ok:false,httpStatus:0,error:String(error?.message||error).slice(0,800)}}
}


const GSC_SCOPE='https://www.googleapis.com/auth/webmasters.readonly';
const GSC_PROPERTY='sc-domain:trytoolscout.org';

function isoDate(d){return d.toISOString().slice(0,10)}
function addDays(text,days){const d=new Date(text+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return isoDate(d)}
function deltaPct(a,b){a=Number(a||0);b=Number(b||0);return b?Number(((a-b)/b*100).toFixed(2)):(a?null:0)}
async function googleGscJson(url,token,init={}){
  const headers=new Headers(init.headers||{});headers.set('Authorization',`Bearer ${token}`);
  if(init.body)headers.set('Content-Type','application/json');
  const r=await fetch(url,{...init,headers});const body=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(`gsc_api_${r.status}:${body?.error?.message||'request_failed'}`);
  return body;
}
async function gscQuery(token,startDate,endDate,dimensions=[]){
  const url=`https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(GSC_PROPERTY)}/searchAnalytics/query`;
  return googleGscJson(url,token,{method:'POST',body:JSON.stringify({startDate,endDate,dimensions,type:'web',dataState:'all',rowLimit:25000})});
}
function aggregateRows(rows=[]){
  let clicks=0,impressions=0,posN=0;
  for(const r of rows){const i=Number(r.impressions||0),c=Number(r.clicks||0);clicks+=c;impressions+=i;posN+=Number(r.position||0)*i}
  return {clicks,impressions,ctr:impressions?Number((clicks/impressions*100).toFixed(4)):0,position:impressions?Number((posN/impressions).toFixed(4)):0};
}
async function ensureGscCache(env){
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS growth_asset_cache(
    path TEXT PRIMARY KEY,payload_json TEXT NOT NULL,source_generated_at TEXT,
    cached_at TEXT NOT NULL DEFAULT (datetime('now')),updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`).run();
}
async function cacheAsset(env,path,payload){
  await ensureGscCache(env);
  const generatedAt=payload?.generatedAt||new Date().toISOString();
  await env.DB.prepare(`INSERT INTO growth_asset_cache(path,payload_json,source_generated_at,cached_at,updated_at)
    VALUES(?,?,?,datetime('now'),datetime('now'))
    ON CONFLICT(path) DO UPDATE SET payload_json=excluded.payload_json,source_generated_at=excluded.source_generated_at,cached_at=datetime('now'),updated_at=datetime('now')`)
    .bind(path,JSON.stringify(payload),generatedAt).run();
}
async function cacheGscRuntimeHealth(env,payload){
  const data={generatedAt:new Date().toISOString(),executor:'cloudflare',...payload};
  try{await cacheAsset(env,'/runtime/gsc-refresh-health.json',data)}catch{}
  return data;
}
export async function runtimeGscRefresh(env,request){
  const oauth=await googleAnalyticsOAuthStatus(env,request);
  if(!oauth.connected){
    const out={ok:false,status:'reauthorization_required',reason:'google_oauth_not_connected',oauth};
    await cacheGscRuntimeHealth(env,{ok:false,status:out.status,reason:out.reason,oauthLastRefreshAt:oauth.lastRefreshAt||null,oauthLastError:oauth.lastError||null});
    return out;
  }
  let access;
  try{access=await googleAnalyticsOAuthAccess(env,request)}catch(error){
    const reason=String(error?.message||error);
    await cacheGscRuntimeHealth(env,{ok:false,status:'reauthorization_required',reason,oauthLastRefreshAt:oauth.lastRefreshAt||null,oauthLastError:reason});
    return {ok:false,status:'reauthorization_required',reason,oauth};
  }
  if(!access?.token){
    await cacheGscRuntimeHealth(env,{ok:false,status:'reauthorization_required',reason:'google_oauth_access_unavailable',oauthLastRefreshAt:oauth.lastRefreshAt||null,oauthLastError:oauth.lastError||null});
    return {ok:false,status:'reauthorization_required',reason:'google_oauth_access_unavailable',oauth};
  }
  const endDate=isoDate(new Date()),startDate=addDays(endDate,-27),recentStart=addDays(endDate,-6),previousEnd=addDays(recentStart,-1),previousStart=addDays(previousEnd,-6);
  try{
    const [pagesJson,recentJson,previousJson,sitemapsJson]=await Promise.all([
      gscQuery(access.token,startDate,endDate,['page']),
      gscQuery(access.token,recentStart,endDate,['date']),
      gscQuery(access.token,previousStart,previousEnd,['date']),
      googleGscJson(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(GSC_PROPERTY)}/sitemaps`,access.token)
    ]);
    const pages=(pagesJson.rows||[]).map(r=>({page:String(r.keys?.[0]||''),clicks:Number(r.clicks||0),impressions:Number(r.impressions||0),ctr:Number((Number(r.ctr||0)*100).toFixed(4)),position:Number(Number(r.position||0).toFixed(4))})).filter(x=>x.page.includes('trytoolscout.org')).sort((a,b)=>b.impressions-a.impressions);
    const siteTotals=aggregateRows(pagesJson.rows||[]),recent7={startDate:recentStart,endDate,...aggregateRows(recentJson.rows||[])},previous7={startDate:previousStart,endDate:previousEnd,...aggregateRows(previousJson.rows||[])};
    let prior={};try{const r=await env.ASSETS.fetch(new Request('https://trytoolscout.org/data/gsc-search-reality.json'));if(r.ok)prior=await r.json()}catch{}
    const generatedAt=new Date().toISOString();
    const signals={generatedAt,source:'Google Search Console API via Cloudflare OAuth',property:GSC_PROPERTY,dataState:'all',includesFreshData:true,startDate,endDate,siteTotals,pageCount:pages.length,pages};
    const reality={
      ...prior,generatedAt,source:'Google Search Console API via Cloudflare OAuth',property:GSC_PROPERTY,
      authorizationScope:GSC_SCOPE,
      searchPerformance:{...(prior.searchPerformance||{}),window28d:{startDate,endDate,...siteTotals},recent7,previous7,change7d:{clicksPct:deltaPct(recent7.clicks,previous7.clicks),impressionsPct:deltaPct(recent7.impressions,previous7.impressions),positionDelta:Number((recent7.position-previous7.position).toFixed(4))},observedPages:pages.length},
      sitemaps:{...(prior.sitemaps||{}),apiOk:true,submittedCount:(sitemapsJson.sitemap||[]).length,items:(sitemapsJson.sitemap||[]).map(x=>({path:x.path||null,lastSubmitted:x.lastSubmitted||null,lastDownloaded:x.lastDownloaded||null,isPending:Boolean(x.isPending),warnings:Number(x.warnings||0),errors:Number(x.errors||0)}))},
      runtime:{executor:'cloudflare',freshSearchPerformance:true,indexInspectionPreservedFromPriorSnapshot:true}
    };
    await Promise.all([cacheAsset(env,'/reports/gsc-signals.json',signals),cacheAsset(env,'/data/gsc-search-reality.json',reality)]);
    await cacheGscRuntimeHealth(env,{ok:true,status:'refreshed',sourceGeneratedAt:generatedAt,observedPages:pages.length,impressions:siteTotals.impressions,clicks:siteTotals.clicks,sitemaps:reality.sitemaps.submittedCount});
    return {ok:true,status:'refreshed',executor:'cloudflare',generatedAt,siteTotals,recent7,observedPages:pages.length,sitemaps:reality.sitemaps.submittedCount};
  }catch(error){
    const msg=String(error?.message||error);
    const status=/403|insufficient|scope|permission/i.test(msg)?'reauthorization_required':'failed';
    await cacheGscRuntimeHealth(env,{ok:false,status,reason:msg,oauthLastRefreshAt:(await googleAnalyticsOAuthStatus(env,request).catch(()=>({}))).lastRefreshAt||null});
    return {ok:false,status,reason:msg,executor:'cloudflare',oauth};
  }
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
  // Refresh first-party Search Console evidence in Cloudflare before prioritization.
  stages.gsc=await runtimeGscRefresh(env,req);
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

  const summary=Object.fromEntries(Object.entries(stages).map(([k,v])=>[k,k==='gsc'?{ok:Boolean(v?.ok),httpStatus:v?.ok?200:0,status:v?.status||null,reason:v?.reason||null}:compactStage(v)]));
  const failed=Object.entries(summary).filter(([,v])=>!v.ok).map(([k])=>k);
  return {ok:failed.length===0,executor:'cloudflare',trigger,failed,stages:summary};
}

async function runtimeMatrix(env,request=null){
  let recent=[],gscRuntimeHealth=null,gscSignalsGeneratedAt=null;
  try{
    recent=(await env.DB.prepare(`SELECT engine,mission,status,trigger_name,started_at,completed_at,detail
      FROM engine_runs ORDER BY started_at DESC LIMIT 30`).all()).results||[];
    const [healthRow,signalsRow]=await Promise.all([
      env.DB.prepare("SELECT payload_json,source_generated_at,updated_at FROM growth_asset_cache WHERE path='/runtime/gsc-refresh-health.json' LIMIT 1").first().catch(()=>null),
      env.DB.prepare("SELECT source_generated_at,updated_at FROM growth_asset_cache WHERE path='/reports/gsc-signals.json' LIMIT 1").first().catch(()=>null)
    ]);
    if(healthRow?.payload_json){try{gscRuntimeHealth=JSON.parse(healthRow.payload_json)}catch{}}
    gscSignalsGeneratedAt=signalsRow?.source_generated_at||null;
  }catch{}
  const googleOAuth=await googleAnalyticsOAuthStatus(env,request);
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
      mutationLayer:'cloudflare_runtime_html',
      state:'cloudflare_d1',
      indexNotification:'cloudflare_indexnow',
      githubActionsRole:'fallback_only',
      gscAuth:'google_oauth',
      googleOAuthConfigured:Boolean(env.GOOGLE_OAUTH_CLIENT_ID&&env.GOOGLE_OAUTH_CLIENT_SECRET),
      googleOAuthConnected:Boolean(googleOAuth.connected),
      analyticsScopeGranted:Boolean(googleOAuth.analyticsScopeGranted),
      searchConsoleScopeGranted:Boolean(googleOAuth.searchConsoleScopeGranted),
      oauthStorage:googleOAuth.storage||null,
      repositoryWriteCredentialConfigured:Boolean(env.GITHUB_CONTENT_TOKEN||env.GITHUB_TOKEN),
      repositoryWriteRole:'fallback_manual_recovery_only',
      gscSignalsGeneratedAt,
      gscRuntimeHealth,
      oauthLastRefreshAt:googleOAuth.lastRefreshAt||null,
      oauthLastError:googleOAuth.lastError||null,
      note:'SEO scheduling, GSC evidence, prioritization and safe technical/page-depth corrections run in Cloudflare. GitHub repository writes and GitHub Actions are fallback/manual recovery paths, not normal scheduling.'
    },
    githubActions:{role:'fallback_only',scheduledPrimary:false,conservationStubsExpected:true},
    recentRuns:recent
  };
}

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(request.method==='GET'&&url.pathname==='/api/runtime/executors'){
      return Response.json(await runtimeMatrix(env,request),{headers:H});
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
    if(trigger===HOURLY||trigger===DAILY){
      // Search evidence is refreshed outside the primary-cycle lease so a slow
      // downstream engine can never make GSC evidence stale.
      const req=new Request('https://trytoolscout.org/api/runtime/cloudflare-primary-cycle');
      const gsc=await runtimeGscRefresh(env,req);

      // The primary runtime is a coordinator. Component engines own their own
      // ledgers and single-flight locks, so dispatch the inherited chain once
      // without holding the outer runtime ledger open until every child settles.
      const primary=await runWithLedger(env,{engine:'runtime',mission:'primary_growth_cycle',triggerName:trigger,singleFlightMinutes:50},async()=>{
        if(typeof base.scheduled==='function'){
          const inherited=Promise.resolve(base.scheduled(event,env,ctx)).catch(()=>null);
          if(ctx?.waitUntil)ctx.waitUntil(inherited);
        }
        return {
          ok:true,
          executor:'cloudflare',
          trigger,
          dispatch:'inherited_engine_chain',
          gsc:{ok:Boolean(gsc?.ok),status:gsc?.status||null,reason:gsc?.reason||null},
          proofModel:'component_engine_ledgers_are_canonical'
        };
      });
      return {...(primary||{}),gsc:{ok:Boolean(gsc?.ok),status:gsc?.status||null,reason:gsc?.reason||null}};
    }
    return typeof base.scheduled==='function'?base.scheduled(event,env,ctx):undefined;
  }
};
