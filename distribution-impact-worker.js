const WINDOW_DAYS=30;
const ACTION_MATURITY_HOURS=48;

function hostOf(value){try{return new URL(String(value||'')).hostname.toLowerCase().replace(/^www\./,'')}catch{return''}}
function variants(slug){const s=String(slug||'').toLowerCase();return [...new Set([s,s.replace(/-/g,'_'),s.replace(/-/g,''),s.replace(/-/g,'.')].filter(Boolean))]}
function sourceParam(value,name){
  const raw=String(value||'');if(!raw)return null;
  try{const u=new URL(raw);const v=u.searchParams.get(name);if(v)return v}catch{}
  try{const q=raw.includes('?')?raw.slice(raw.indexOf('?')+1):raw;const v=new URLSearchParams(q).get(name);if(v)return v}catch{}
  const m=raw.match(new RegExp('(?:^|[?&\\s])'+name+'=([^&\\s]+)','i'));if(!m)return null;
  try{return decodeURIComponent(m[1])}catch{return m[1]}
}
function sourceMatchesSurface(source,referrer,row){
  const s=String(source||'').toLowerCase(),r=String(referrer||'').toLowerCase().replace(/^www\./,'');
  const growth=sourceParam(source,'ts_growth');if(growth===`surface:${row.surface_slug}`)return true;
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
  const row=await env.DB.prepare(`SELECT COUNT(DISTINCT session_id) confirmed_sessions FROM traffic_human_evidence WHERE first_evidence_at>=datetime('now','-${WINDOW_DAYS} days')`).first();
  return Number(row?.confirmed_sessions||0);
}

export async function distributionSurfaceMetrics(env){
  const [opportunities,entries,outboundEvents,clicks,revenueRows]=await Promise.all([
    env.DB.prepare(`SELECT surface_slug,surface_name,action_url,live_url FROM distribution_opportunities WHERE action_url IS NOT NULL OR live_url IS NOT NULL`).all(),
    env.DB.prepare(`SELECT f.session_id,f.source,f.referrer_host,f.created_at,h.first_evidence_at confirmed_at FROM funnel_events f JOIN traffic_human_evidence h ON h.session_id=f.session_id AND h.first_evidence_at>=f.created_at WHERE f.event_type='session_started' AND f.created_at>=datetime('now','-${WINDOW_DAYS} days') ORDER BY f.created_at`).all(),
    env.DB.prepare(`SELECT session_id,created_at FROM verified_outbound_events WHERE created_at>=datetime('now','-${WINDOW_DAYS} days')`).all(),
    env.DB.prepare(`SELECT session_id,created_at,affiliate_active_at_click,source FROM verified_outbound_events WHERE created_at>=datetime('now','-${WINDOW_DAYS} days')`).all(),
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

export async function growthActionMetrics(env){
  try{
    const [actions,entries,outboundEvents,clicks]=await Promise.all([
      env.DB.prepare(`SELECT action_id,opportunity_key,engine,channel,target_url,status,created_at FROM growth_action_events WHERE created_at>=datetime('now','-${WINDOW_DAYS} days') AND status IN ('issued','sent','verified','completed')`).all(),
      env.DB.prepare(`SELECT f.session_id,f.source,f.created_at,h.first_evidence_at confirmed_at FROM funnel_events f JOIN traffic_human_evidence h ON h.session_id=f.session_id AND h.first_evidence_at>=f.created_at WHERE f.event_type='session_started' AND f.created_at>=datetime('now','-${WINDOW_DAYS} days') ORDER BY f.created_at`).all(),
      env.DB.prepare(`SELECT session_id,created_at FROM verified_outbound_events WHERE created_at>=datetime('now','-${WINDOW_DAYS} days')`).all(),
      env.DB.prepare(`SELECT session_id,created_at,affiliate_active_at_click,source FROM verified_outbound_events WHERE created_at>=datetime('now','-${WINDOW_DAYS} days')`).all()
    ]);
    const actionMap=new Map((actions.results||[]).map(x=>[x.action_id,x])),sessionAction=new Map(),first=new Map(),byAction=new Map();
    const maturityCutoff=Date.now()-ACTION_MATURITY_HOURS*3600000;
    const actionTime=value=>{const raw=String(value||'');const t=Date.parse(raw.includes('T')?raw:raw.replace(' ','T')+'Z');return Number.isFinite(t)?t:Infinity};
    const get=id=>{if(!byAction.has(id)){const a=actionMap.get(id)||{};byAction.set(id,{action_id:id,opportunity_key:a.opportunity_key||null,engine:a.engine||null,channel:a.channel||null,target_url:a.target_url||null,status:a.status||null,created_at:a.created_at||null,browser_confirmed_sessions:0,outbound_clicks:0,monetized_outbound:0});}return byAction.get(id)};
    for(const e of entries.results||[]){
      const id=String(e.session_id||'');if(!id||sessionAction.has(id)||!e.confirmed_at)continue;
      const actionId=sourceParam(e.source,'ts_action');if(!actionId||!actionMap.has(actionId))continue;
      sessionAction.set(id,actionId);first.set(id,String(e.created_at||''));get(actionId).browser_confirmed_sessions++;
    }
    for(const e of outboundEvents.results||[]){const id=String(e.session_id||''),a=sessionAction.get(id);if(a&&String(e.created_at||'')>=String(first.get(id)||''))get(a).outbound_clicks++}
    for(const e of clicks.results||[]){const id=String(e.session_id||''),a=sessionAction.get(id);if(a&&String(e.created_at||'')>=String(first.get(id)||'')&&Number(e.affiliate_active_at_click)===1&&String(e.source||'')!=='internal-test')get(a).monetized_outbound++}
    const rows=[...byAction.values()].sort((a,b)=>b.browser_confirmed_sessions-a.browser_confirmed_sessions||b.outbound_clicks-a.outbound_clicks);
    const matured=(actions.results||[]).filter(a=>actionTime(a.created_at)<=maturityCutoff);
    const maturedIds=new Set(matured.map(a=>a.action_id));
    const maturedRows=rows.filter(x=>maturedIds.has(x.action_id));
    return {status:'observed',windowDays:WINDOW_DAYS,actionMaturityHours:ACTION_MATURITY_HOURS,preparedActions:(actions.results||[]).length,attributedActions:rows.filter(x=>x.browser_confirmed_sessions>0).length,browserConfirmedSessions:rows.reduce((s,x)=>s+x.browser_confirmed_sessions,0),outboundClicks:rows.reduce((s,x)=>s+x.outbound_clicks,0),monetizedOutbound:rows.reduce((s,x)=>s+x.monetized_outbound,0),maturedActions:matured.length,maturedAttributedActions:maturedRows.filter(x=>x.browser_confirmed_sessions>0).length,maturedBrowserConfirmedSessions:maturedRows.reduce((s,x)=>s+x.browser_confirmed_sessions,0),maturedOutboundClicks:maturedRows.reduce((s,x)=>s+x.outbound_clicks,0),topActions:rows.slice(0,10),attribution:'Exact ts_action first-touch marker on a strict verified human session. Browser validation alone is excluded and no traffic is inferred when the marker is absent.'};
  }catch(error){return {status:'unavailable',windowDays:WINDOW_DAYS,reason:String(error?.message||error)}}
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
      attribution:'First-touch strict verified human session within 30 days. A session is eligible only after positive evidence exists in traffic_human_evidence. Attribution then requires a Distribution Engine UTM/source marker or a referrer matching a known distribution surface. Outbound and revenue are counted only after that confirmed attributed entry.',
      revenueDefinition:'Confirmed/paid ledger evidence only. Revenue remains null when attributed evidence spans multiple currencies; no revenue is inferred from clicks.',
      legacyLikelyHumanTotal:Number(totalHumanSessions||0)
    };
  }catch(error){return {status:'unavailable',windowDays:WINDOW_DAYS,reason:`Distribution impact aggregation unavailable: ${String(error?.message||error)}`};}
}
