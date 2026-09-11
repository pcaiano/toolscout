const WINDOW_DAYS=30;

function hostOf(value){try{return new URL(String(value||'')).hostname.toLowerCase().replace(/^www\./,'')}catch{return''}}
function variants(slug){const s=String(slug||'').toLowerCase();return [...new Set([s,s.replace(/-/g,'_'),s.replace(/-/g,''),s.replace(/-/g,'.')].filter(Boolean))]}
function sourceMatchesSurface(source,referrer,row){
  const s=String(source||'').toLowerCase(),r=String(referrer||'').toLowerCase().replace(/^www\./,'');
  for(const v of variants(row.surface_slug))if(s.includes(`utm_source=${v}`)||s.includes(`surface=${v}`)||s.includes(`distribution_surface=${v}`))return true;
  if(s.includes('utm_medium=distribution')||s.includes('distribution_engine')){
    const sourceHost=hostOf(row.action_url)||hostOf(row.live_url);
    for(const v of variants(row.surface_slug))if(s.includes(v))return true;
    if(sourceHost&&s.includes(sourceHost))return true;
  }
  const hosts=[hostOf(row.action_url),hostOf(row.live_url)].filter(Boolean);
  return hosts.some(h=>r===h||r.endsWith(`.${h}`));
}

async function browserConfirmedTotal(env){
  const row=await env.DB.prepare(`SELECT COUNT(DISTINCT pc.session_id) confirmed_sessions FROM funnel_events pc JOIN sessions s ON s.session_id=pc.session_id WHERE s.classification='likely-human' AND pc.event_type='page_confirmed' AND pc.created_at>=datetime('now','-${WINDOW_DAYS} days')`).first();
  return Number(row?.confirmed_sessions||0);
}

export async function distributionSurfaceMetrics(env){
  const [opportunities,entries,outboundEvents,clicks,revenueRows]=await Promise.all([
    env.DB.prepare(`SELECT surface_slug,surface_name,action_url,live_url FROM distribution_opportunities WHERE action_url IS NOT NULL OR live_url IS NOT NULL`).all(),
    env.DB.prepare(`SELECT f.session_id,f.source,f.referrer_host,f.created_at,MIN(pc.created_at) confirmed_at FROM funnel_events f JOIN sessions s ON s.session_id=f.session_id JOIN funnel_events pc ON pc.session_id=f.session_id AND pc.event_type='page_confirmed' AND pc.created_at>=f.created_at WHERE s.classification='likely-human' AND f.event_type='session_started' AND f.created_at>=datetime('now','-${WINDOW_DAYS} days') GROUP BY f.session_id,f.source,f.referrer_host,f.created_at ORDER BY f.created_at`).all(),
    env.DB.prepare(`SELECT f.session_id,f.created_at FROM funnel_events f JOIN sessions s ON s.session_id=f.session_id WHERE s.classification='likely-human' AND f.event_type='outbound_clicked' AND f.created_at>=datetime('now','-${WINDOW_DAYS} days')`).all(),
    env.DB.prepare(`SELECT c.session_id,c.created_at,c.affiliate_active_at_click,c.source FROM click_events c JOIN sessions s ON s.session_id=c.session_id WHERE s.classification='likely-human' AND c.created_at>=datetime('now','-${WINDOW_DAYS} days')`).all(),
    env.DB.prepare(`SELECT session_id,commission,currency,status,created_at FROM revenue_ledger WHERE session_id IS NOT NULL AND status IN ('confirmed','paid') AND created_at>=datetime('now','-${WINDOW_DAYS} days')`).all()
  ]);
  const surfaces=opportunities.results||[],sessionSurface=new Map(),first=new Map();
  for(const e of entries.results||[]){
    const id=String(e.session_id||'');
    if(!id||sessionSurface.has(id)||!e.confirmed_at)continue;
    const row=surfaces.find(o=>sourceMatchesSurface(e.source,e.referrer_host,o));
    if(row){sessionSurface.set(id,row.surface_slug);first.set(id,String(e.created_at||''));}
  }
  const bySurface=new Map();
  const get=slug=>{if(!bySurface.has(slug))bySurface.set(slug,{surface_slug:slug,surface_name:surfaces.find(x=>x.surface_slug===slug)?.surface_name||slug,browser_confirmed_sessions:0,human_sessions:0,outbound_clicks:0,monetized_outbound:0,revenue:0,currencies:new Set()});return bySurface.get(slug)};
  for(const slug of sessionSurface.values()){const row=get(slug);row.browser_confirmed_sessions++;row.human_sessions++;}
  for(const e of outboundEvents.results||[]){const id=String(e.session_id||''),slug=sessionSurface.get(id);if(slug&&String(e.created_at||'')>=String(first.get(id)||''))get(slug).outbound_clicks++;}
  for(const c of clicks.results||[]){const id=String(c.session_id||''),slug=sessionSurface.get(id);if(slug&&String(c.created_at||'')>=String(first.get(id)||'')&&Number(c.affiliate_active_at_click)===1&&String(c.source||'')!=='internal-test')get(slug).monetized_outbound++;}
  for(const r of revenueRows.results||[]){const id=String(r.session_id||''),slug=sessionSurface.get(id);if(!slug||String(r.created_at||'')<String(first.get(id)||''))continue;const row=get(slug);row.revenue+=Number(r.commission||0);row.currencies.add(String(r.currency||'EUR'));}
  return [...bySurface.values()].map(r=>({...r,currency:r.currencies.size===1?[...r.currencies][0]:(r.currencies.size===0?'EUR':null),revenue:r.currencies.size<=1?r.revenue:null,currencies:undefined}));
}

export async function distributionImpactSnapshot(env,totalHumanSessions){
  try{
    const [metrics,totalConfirmed]=await Promise.all([distributionSurfaceMetrics(env),browserConfirmedTotal(env)]);
    const rows=metrics.sort((a,b)=>b.browser_confirmed_sessions-a.browser_confirmed_sessions||b.outbound_clicks-a.outbound_clicks);
    const confirmedSessions=rows.reduce((n,x)=>n+x.browser_confirmed_sessions,0),outbound=rows.reduce((n,x)=>n+x.outbound_clicks,0),monetized=rows.reduce((n,x)=>n+x.monetized_outbound,0);
    const currencies=new Set(rows.map(x=>x.currency).filter(Boolean));
    const revenue=currencies.size<=1?rows.reduce((n,x)=>n+Number(x.revenue||0),0):null;
    return {
      status:'observed',windowDays:WINDOW_DAYS,
      browserConfirmedSessions:confirmedSessions,humanSessions:confirmedSessions,outboundClicks:outbound,monetizedOutbound:monetized,
      confirmedRevenue:revenue,currency:currencies.size===1?[...currencies][0]:(currencies.size===0?'EUR':null),
      activeSurfaces:rows.filter(x=>x.browser_confirmed_sessions>0).length,
      humanTrafficShare:totalConfirmed>0?Number((confirmedSessions/totalConfirmed*100).toFixed(1)):0,
      sessionToOutboundCtr:confirmedSessions?Number((outbound/confirmedSessions*100).toFixed(1)):0,
      monetizationCoverage:outbound?Number((monetized/outbound*100).toFixed(1)):0,
      totalBrowserConfirmedSessions:totalConfirmed,
      topSurfaces:rows.slice(0,8),
      attribution:'First-touch browser-confirmed session within 30 days. A session is eligible only after page_confirmed exists for the same session_id. Attribution then requires a Distribution Engine UTM/source marker or a referrer matching a known distribution surface. Outbound and revenue are counted only after that confirmed attributed entry.',
      revenueDefinition:'Confirmed/paid ledger evidence only. Revenue remains null when attributed evidence spans multiple currencies; no revenue is inferred from clicks.',
      legacyLikelyHumanTotal:Number(totalHumanSessions||0)
    };
  }catch(error){return {status:'unavailable',windowDays:WINDOW_DAYS,reason:`Distribution impact aggregation unavailable: ${String(error?.message||error)}`};}
}
