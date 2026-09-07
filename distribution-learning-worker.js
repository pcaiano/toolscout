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

function hostOf(value){try{return new URL(String(value||'')).hostname.toLowerCase().replace(/^www\./,'')}catch{return''}}
function variants(slug){const s=String(slug||'').toLowerCase();return [...new Set([s,s.replace(/-/g,'_'),s.replace(/-/g,''),s.replace(/-/g,'.')].filter(Boolean))]}
function sourceMatchesSurface(source,referrer,row){
  const s=String(source||'').toLowerCase(),r=String(referrer||'').toLowerCase().replace(/^www\./,'');
  for(const v of variants(row.surface_slug))if(s.includes(`utm_source=${v}`)||s.includes(`surface=${v}`)||s.includes(`distribution_surface=${v}`))return true;
  const hosts=[hostOf(row.action_url),hostOf(row.live_url)].filter(Boolean);
  return hosts.some(h=>r===h||r.endsWith(`.${h}`));
}

async function attributionSnapshot(env,opportunities){
  const [entries,outboundEvents,clicks,revenueRows]=await Promise.all([
    env.DB.prepare(`SELECT f.session_id,f.source,f.referrer_host,f.created_at FROM funnel_events f JOIN sessions s ON s.session_id=f.session_id WHERE s.classification='likely-human' AND f.created_at>=datetime('now','-30 days') AND (lower(COALESCE(f.source,'')) LIKE '%utm_medium=distribution%' OR lower(COALESCE(f.source,'')) LIKE '%distribution_engine%' OR lower(COALESCE(f.source,'')) LIKE '%distribution_surface=%') ORDER BY f.created_at`).all(),
    env.DB.prepare(`SELECT f.session_id,f.created_at FROM funnel_events f JOIN sessions s ON s.session_id=f.session_id WHERE s.classification='likely-human' AND f.event_type='outbound_clicked' AND f.created_at>=datetime('now','-30 days')`).all(),
    env.DB.prepare(`SELECT c.session_id,c.created_at,c.affiliate_active_at_click,c.source FROM click_events c JOIN sessions s ON s.session_id=c.session_id WHERE s.classification='likely-human' AND c.created_at>=datetime('now','-30 days')`).all(),
    env.DB.prepare(`SELECT session_id,commission,created_at FROM revenue_ledger WHERE session_id IS NOT NULL AND status IN ('confirmed','paid') AND created_at>=datetime('now','-30 days')`).all()
  ]);
  const sessionSurface=new Map(),first=new Map();
  for(const e of entries.results||[]){const id=String(e.session_id||'');if(!id||sessionSurface.has(id))continue;const row=opportunities.find(o=>sourceMatchesSurface(e.source,e.referrer_host,o));if(row){sessionSurface.set(id,row.surface_slug);first.set(id,String(e.created_at||''));}}
  const metrics=new Map();
  const get=slug=>{if(!metrics.has(slug))metrics.set(slug,{humans:0,outbound:0,monetized:0,revenue:0});return metrics.get(slug)};
  for(const slug of sessionSurface.values())get(slug).humans++;
  for(const e of outboundEvents.results||[]){const id=String(e.session_id||''),slug=sessionSurface.get(id);if(slug&&String(e.created_at||'')>=String(first.get(id)||''))get(slug).outbound++;}
  for(const c of clicks.results||[]){const id=String(c.session_id||''),slug=sessionSurface.get(id);if(slug&&String(c.created_at||'')>=String(first.get(id)||'')&&Number(c.affiliate_active_at_click)===1&&String(c.source||'')!=='internal-test')get(slug).monetized++;}
  for(const r of revenueRows.results||[]){const id=String(r.session_id||''),slug=sessionSurface.get(id);if(slug&&String(r.created_at||'')>=String(first.get(id)||''))get(slug).revenue+=Number(r.commission||0);}
  return metrics;
}

async function learn(env){
  const r=await env.DB.prepare(`SELECT surface_slug,action_url,live_url,distribution_score FROM distribution_opportunities`).all();
  const rows=r.results||[],attribution=await attributionSnapshot(env,rows);
  const recorded=await env.DB.prepare(`SELECT surface_slug,COALESCE(SUM(human_sessions),0) humans,COALESCE(SUM(outbound_clicks),0) outbound,COALESCE(SUM(monetized_outbound),0) monetized,COALESCE(SUM(revenue),0) revenue FROM distribution_events WHERE created_at>=datetime('now','-30 days') GROUP BY surface_slug`).all();
  const recordedMap=new Map((recorded.results||[]).map(x=>[x.surface_slug,x]));
  let learned=0,evidenceSurfaces=0,monetizedSurfaces=0;
  for(const row of rows){
    const rec=recordedMap.get(row.surface_slug)||{},att=attribution.get(row.surface_slug)||{};
    const humans=Math.max(Number(rec.humans||0),Number(att.humans||0));
    const outbound=Math.max(Number(rec.outbound||0),Number(att.outbound||0));
    const monetized=Math.max(Number(rec.monetized||0),Number(att.monetized||0));
    const revenue=Math.max(Number(rec.revenue||0),Number(att.revenue||0));
    const ctr=humans?outbound/humans:0,monetizedRate=outbound?monetized/outbound:0,rpm=humans?revenue/humans*1000:0;
    const evidence=Math.min(1,humans/50);
    const performance=clamp((Math.min(100,humans*2)*0.25)+(Math.min(100,ctr*300)*0.25)+(Math.min(100,monetizedRate*125)*0.25)+(Math.min(100,rpm*2)*0.25));
    const learnedScore=Number((Number(row.distribution_score||0)*(1-evidence*0.35)+performance*(evidence*0.35)).toFixed(1));
    await env.DB.prepare(`UPDATE distribution_opportunities SET observed_human_sessions=?,observed_outbound_clicks=?,observed_revenue=?,performance_score=?,distribution_score=?,learned_at=datetime('now'),updated_at=datetime('now') WHERE surface_slug=?`).bind(humans,outbound,revenue,performance,learnedScore,row.surface_slug).run();learned++;if(humans>0)evidenceSurfaces++;if(monetized>0)monetizedSurfaces++;
  }
  await env.DB.prepare(`INSERT INTO distribution_events(event_id,event_type,status,asset_type,detail,observed_at,created_at) VALUES(?,?,?,?,?,datetime('now'),datetime('now'))`).bind(`learn_${crypto.randomUUID()}`,'distribution_learning_refresh','completed','distribution_engine',`Learning loop refreshed ${learned} surfaces; ${evidenceSurfaces} had attributed likely-human evidence and ${monetizedSurfaces} had monetized outbound evidence in the 30-day window.`).run();
  return {ok:true,learned,evidenceSurfaces,monetizedSurfaces};
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
