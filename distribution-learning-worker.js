import base from './revenue-worker.js';
import {runDistributionContactScheduled} from './distribution-contact-worker.js';
import {distributionSurfaceMetrics} from './distribution-impact-worker.js';

// Attribution remains centralized in distribution-impact-worker.js and still enforces classification='likely-human' and confirmed revenue_ledger evidence.
const JSON_HEADERS={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type'};
const safe=(v,n=240)=>String(v??'').slice(0,n);
const safeToken=(v,n=120)=>String(v||'').replace(/[^A-Za-z0-9._:-]/g,'').slice(0,n);
const EMBED_EVENTS=new Set(['impression','interaction','click','search','results','unresolved','profile_click','vendor_click','error']);
const EMBED_TYPES=new Set(['finder','compare','pick']);
function hostOf(v){try{return new URL(v).hostname.toLowerCase().replace(/^www\./,'')}catch{return''}}

async function embedEvent(request,env){
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:JSON_HEADERS});
  let b={};try{b=JSON.parse(await request.text())}catch{return Response.json({error:'invalid_json'},{status:400,headers:JSON_HEADERS})}
  const type=safeToken(b.embed_type,30),event=safeToken(b.event,40);
  const originHost=hostOf(request.headers.get('Origin')||''),refererHost=hostOf(request.headers.get('Referer')||'');
  const host=safeToken(originHost||refererHost||b.publisher_host||'',120);
  const publisherId=safeToken(b.publisher_id||host||'embedded',120)||'embedded';
  const asset=safeToken(b.asset_id||type,120)||type;
  const intentSlug=safeToken(b.intent_slug||'',100)||null;
  const resultSlug=safeToken(b.result_slug||'',100)||null;
  const mode=['mini','full'].includes(String(b.mode||''))?String(b.mode):null;
  const resultCount=Number.isFinite(Number(b.result_count))?Math.max(0,Math.min(20,Number(b.result_count))):null;
  if(!EMBED_TYPES.has(type)||!EMBED_EVENTS.has(event)||!host)return Response.json({error:'invalid_embed_event'},{status:400,headers:JSON_HEADERS});

  const id=`${type}:${host}:${asset||'generic'}`.slice(0,420);
  const imp=event==='impression'?1:0;
  const inter=['interaction','search','results','unresolved','error'].includes(event)?1:0;
  const click=['click','profile_click','vendor_click'].includes(event)?1:0;
  await env.DB.prepare(`INSERT INTO distribution_embeds(embed_id,embed_type,publisher_host,asset_id,status,impressions,interactions,clicks,first_seen_at,last_seen_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,datetime('now'),datetime('now'),datetime('now'),datetime('now')) ON CONFLICT(embed_id) DO UPDATE SET impressions=impressions+excluded.impressions,interactions=interactions+excluded.interactions,clicks=clicks+excluded.clicks,last_seen_at=datetime('now'),updated_at=datetime('now')`).bind(id,type,host,asset||null,'observed',imp,inter,click).run();
  await env.DB.prepare(`INSERT INTO distribution_embed_events(event_id,embed_type,event_type,publisher_id,source_host,asset_id,intent_slug,result_slug,result_count,mode,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,datetime('now'))`)
    .bind(`embevt_${crypto.randomUUID()}`,type,event,publisherId,host,asset,intentSlug,resultSlug,resultCount,mode).run();
  return new Response(null,{status:204,headers:JSON_HEADERS});
}

async function legacyLearningSnapshot(env){
  let metrics=[];try{metrics=await distributionSurfaceMetrics(env)}catch{return{ok:false,deprecated:true,reason:'surface_metrics_unavailable'}}
  const evidenceSurfaces=metrics.filter(x=>Number(x.human_sessions||0)>0).length;
  const monetizedSurfaces=metrics.filter(x=>Number(x.monetized_outbound||0)>0).length;
  return {
    ok:true,
    deprecated:true,
    score_mutation:false,
    evidenceSurfaces,
    monetizedSurfaces,
    message:'Legacy learning endpoint is observation-only. Distribution scores are owned exclusively by the economic learning loop.'
  };
}

export async function handleDistributionLearningRoute(request,env,ctx){
  const url=new URL(request.url);
  if(url.pathname==='/api/distribution/embed-event'&&(request.method==='POST'||request.method==='OPTIONS'))return embedEvent(request,env);
  if(url.pathname==='/api/distribution/learning/refresh'&&request.method==='POST'){
    const token=(request.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');
    if(!env.ADMIN_TOKEN||token!==env.ADMIN_TOKEN)return Response.json({error:'unauthorized'},{status:401,headers:JSON_HEADERS});
    return Response.json(await legacyLearningSnapshot(env),{headers:JSON_HEADERS});
  }
  return null;
}

export async function runDistributionLearningScheduled(event,env,ctx){
  return runDistributionContactScheduled(event,env,ctx);
}

export default {
  async fetch(request,env,ctx){
    const owned=await handleDistributionLearningRoute(request,env,ctx);
    if(owned)return owned;
    return base.fetch(request,env,ctx);
  },
  async scheduled(event,env,ctx){
    return runDistributionLearningScheduled(event,env,ctx);
  }
};
