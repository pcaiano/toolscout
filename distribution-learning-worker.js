import base from './distribution-sender-worker.js';

const JSON_HEADERS={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type'};
const safe=(v,n=240)=>String(v??'').slice(0,n);
const clamp=n=>Math.max(0,Math.min(100,Number(n)||0));

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

async function learn(env){
  const r=await env.DB.prepare(`SELECT surface_slug,distribution_score FROM distribution_opportunities`).all();
  let learned=0;
  for(const row of r.results||[]){
    const e=await env.DB.prepare(`SELECT COALESCE(SUM(human_sessions),0) humans,COALESCE(SUM(outbound_clicks),0) outbound,COALESCE(SUM(revenue),0) revenue FROM distribution_events WHERE surface_slug=? AND created_at>=datetime('now','-30 days')`).bind(row.surface_slug).first();
    const humans=Number(e?.humans||0),outbound=Number(e?.outbound||0),revenue=Number(e?.revenue||0);
    const ctr=humans?outbound/humans:0;
    const rpm=humans?revenue/humans*1000:0;
    const evidence=Math.min(1,humans/50);
    const performance=clamp((Math.min(100,humans*2)*0.30)+(Math.min(100,ctr*300)*0.35)+(Math.min(100,rpm*2)*0.35));
    const learnedScore=Number((Number(row.distribution_score||0)*(1-evidence*0.35)+performance*(evidence*0.35)).toFixed(1));
    await env.DB.prepare(`UPDATE distribution_opportunities SET observed_human_sessions=?,observed_outbound_clicks=?,observed_revenue=?,performance_score=?,distribution_score=?,learned_at=datetime('now'),updated_at=datetime('now') WHERE surface_slug=?`).bind(humans,outbound,revenue,performance,learnedScore,row.surface_slug).run();learned++;
  }
  await env.DB.prepare(`INSERT INTO distribution_events(event_id,event_type,status,asset_type,detail,observed_at,created_at) VALUES(?,?,?,?,?,datetime('now'),datetime('now'))`).bind(`learn_${crypto.randomUUID()}`,'distribution_learning_refresh','completed','distribution_engine',`Learning loop refreshed ${learned} surfaces from 30-day observed performance.`).run();
  return {ok:true,learned};
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname==='/api/distribution/embed-event'&&(request.method==='POST'||request.method==='OPTIONS'))return embedEvent(request,env);
    if(url.pathname==='/api/distribution/learning/refresh'&&request.method==='POST'){
      const token=(request.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');if(!env.ADMIN_TOKEN||token!==env.ADMIN_TOKEN)return Response.json({error:'unauthorized'},{status:401,headers:JSON_HEADERS});
      return Response.json(await learn(env),{headers:JSON_HEADERS});
    }
    return base.fetch(request,env,ctx);
  },
  async scheduled(event,env,ctx){if(base.scheduled)await base.scheduled(event,env,ctx);ctx.waitUntil(learn(env).catch(()=>{}));}
};
