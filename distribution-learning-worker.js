import base from './distribution-sender-worker.js';
import {distributionSurfaceMetrics} from './distribution-impact-worker.js';

const JSON_HEADERS={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type'};
const safe=(v,n=240)=>String(v??'').slice(0,n);

async function embedEvent(request,env){
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:JSON_HEADERS});
  let b={};try{b=await request.json()}catch{return Response.json({error:'invalid_json'},{status:400,headers:JSON_HEADERS})}
  const type=safe(b.embed_type,30),event=safe(b.event,30),host=safe(b.publisher_host,180).toLowerCase(),asset=safe(b.asset_id,160);
  if(!['pick','finder','compare'].includes(type)||!['impression','interaction','click'].includes(event)||!host)return Response.json({error:'invalid_embed_event'},{status:400,headers:JSON_HEADERS});
  const id=`${type}:${host}:${asset||'generic'}`.slice(0,420);
  const imp=event==='impression'?1:0,inter=event==='interaction'?1:0,click=event==='click'?1:0;
  await env.DB.prepare(`INSERT INTO distribution_embeds(embed_id,embed_type,publisher_host,asset_id,status,impressions,interactions,clicks,first_seen_at,last_seen_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,datetime('now'),datetime('now'),datetime('now'),datetime('now')) ON CONFLICT(embed_id) DO UPDATE SET impressions=impressions+excluded.impressions,interactions=interactions+excluded.interactions,clicks=clicks+excluded.clicks,last_seen_at=datetime('now'),updated_at=datetime('now')`).bind(id,type,host,asset||null,'observed',imp,inter,click).run();
  return Response.json({ok:true},{headers:JSON_HEADERS});
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

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname==='/api/distribution/embed-event'&&(request.method==='POST'||request.method==='OPTIONS'))return embedEvent(request,env);
    if(url.pathname==='/api/distribution/learning/refresh'&&request.method==='POST'){
      const token=(request.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');
      if(!env.ADMIN_TOKEN||token!==env.ADMIN_TOKEN)return Response.json({error:'unauthorized'},{status:401,headers:JSON_HEADERS});
      return Response.json(await legacyLearningSnapshot(env),{headers:JSON_HEADERS});
    }
    return base.fetch(request,env,ctx);
  },
  async scheduled(event,env,ctx){if(base.scheduled)await base.scheduled(event,env,ctx);}
};
