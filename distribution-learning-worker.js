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

function sourceMatchesSurface(source,referrer,surface){
  const s=String(source||'').toLowerCase(),r=String(referrer||'').toLowerCase(),slug=String(surface||'').toLowerCase();
  if(!slug)return false;
  const variants=new Set([slug,slug.replace(/-/g,'_'),slug.replace(/-/g,''),slug.replace(/-/g,'.')]);
  for(const v of variants)if(v&&(s.includes(`utm_source=${v}`)||s.includes(`surface=${v}`)||s.includes(`distribution_surface=${v}`)||r===v||r.endsWith(`.${v}`)))return true;
  return false;
}

async function attributedMetrics(env,surface){
  const events=await env.DB.prepare(`SELECT f.session_id,f.event_type,f.source,f.referrer_host,f.created_at FROM funnel_events f JOIN sessions s ON s.session_id=f.session_id WHERE s.classification='likely-human' AND f.created_at>=datetime('now','-30 days') AND (lower(COALESCE(f.source,'')) LIKE '%utm_medium=distribution%' OR lower(COALESCE(f.source,'')) LIKE '%distribution_engine%' OR lower(COALESCE(f.source,'')) LIKE '%distribution_surface=%')`).all();
  const matched=(events.results||[]).filter(x=>sourceMatchesSurface(x.source,x.referrer_host,surface));
  const sessionIds=[...new Set(matched.map(x=>String(x.session_id)).filter(Boolean))];
  if(!sessionIds.length)return {humans:0,outbound:0,revenue:0};
  const first=new Map();for(const x of matched){const id=String(x.session_id),t=String(x.created_at||'');if(!first.has(id)||t<first.get(id))first.set(id,t)}
  let outbound=0,revenue=0;
  for(const id of sessionIds){
    const since=first.get(id);
    const o=await env.DB.prepare(`SELECT COUNT(*) n FROM funnel_events WHERE session_id=? AND event_type='outbound_clicked' AND created_at>=?`).bind(id,since).first();outbound+=Number(o?.n||0);
    const rev=await env.DB.prepare(`SELECT COALESCE(SUM(commission),0) revenue FROM revenue_ledger WHERE session_id=? AND status IN ('confirmed','paid') AND created_at>=?`).bind(id,since).first();revenue+=Number(rev?.revenue||0);
  }
  return {humans:sessionIds.length,outbound,revenue};
}

async function learn(env){
  const r=await env.DB.prepare(`SELECT surface_slug,distribution_score FROM distribution_opportunities`).all();
  let learned=0,evidenceSurfaces=0;
  for(const row of r.results||[]){
    const [recorded,attributed]=await Promise.all([
      env.DB.prepare(`SELECT COALESCE(SUM(human_sessions),0) humans,COALESCE(SUM(outbound_clicks),0) outbound,COALESCE(SUM(revenue),0) revenue FROM distribution_events WHERE surface_slug=? AND created_at>=datetime('now','-30 days')`).bind(row.surface_slug).first(),
      attributedMetrics(env,row.surface_slug)
    ]);
    const humans=Math.max(Number(recorded?.humans||0),Number(attributed.humans||0));
    const outbound=Math.max(Number(recorded?.outbound||0),Number(attributed.outbound||0));
    const revenue=Math.max(Number(recorded?.revenue||0),Number(attributed.revenue||0));
    const ctr=humans?outbound/humans:0;
    const rpm=humans?revenue/humans*1000:0;
    const evidence=Math.min(1,humans/50);
    const performance=clamp((Math.min(100,humans*2)*0.30)+(Math.min(100,ctr*300)*0.35)+(Math.min(100,rpm*2)*0.35));
    const learnedScore=Number((Number(row.distribution_score||0)*(1-evidence*0.35)+performance*(evidence*0.35)).toFixed(1));
    await env.DB.prepare(`UPDATE distribution_opportunities SET observed_human_sessions=?,observed_outbound_clicks=?,observed_revenue=?,performance_score=?,distribution_score=?,learned_at=datetime('now'),updated_at=datetime('now') WHERE surface_slug=?`).bind(humans,outbound,revenue,performance,learnedScore,row.surface_slug).run();learned++;if(humans>0)evidenceSurfaces++;
  }
  await env.DB.prepare(`INSERT INTO distribution_events(event_id,event_type,status,asset_type,detail,observed_at,created_at) VALUES(?,?,?,?,?,datetime('now'),datetime('now'))`).bind(`learn_${crypto.randomUUID()}`,'distribution_learning_refresh','completed','distribution_engine',`Learning loop refreshed ${learned} surfaces; ${evidenceSurfaces} had attributed likely-human evidence in the 30-day window.`).run();
  return {ok:true,learned,evidenceSurfaces};
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
