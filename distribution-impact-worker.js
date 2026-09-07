import base from './affiliate-workflow-worker.js';

const H={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'private, no-store'};
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

async function impactSnapshot(env,totalHumanSessions){
  try{
    const [opportunities,entries,outboundEvents,clicks,revenueRows]=await Promise.all([
      env.DB.prepare(`SELECT surface_slug,surface_name,action_url,live_url FROM distribution_opportunities WHERE action_url IS NOT NULL OR live_url IS NOT NULL`).all(),
      env.DB.prepare(`SELECT f.session_id,f.source,f.referrer_host,f.created_at FROM funnel_events f JOIN sessions s ON s.session_id=f.session_id WHERE s.classification='likely-human' AND f.event_type='session_started' AND f.created_at>=datetime('now','-${WINDOW_DAYS} days') ORDER BY f.created_at`).all(),
      env.DB.prepare(`SELECT f.session_id,f.created_at FROM funnel_events f JOIN sessions s ON s.session_id=f.session_id WHERE s.classification='likely-human' AND f.event_type='outbound_clicked' AND f.created_at>=datetime('now','-${WINDOW_DAYS} days')`).all(),
      env.DB.prepare(`SELECT c.session_id,c.created_at,c.affiliate_active_at_click,c.source FROM click_events c JOIN sessions s ON s.session_id=c.session_id WHERE s.classification='likely-human' AND c.created_at>=datetime('now','-${WINDOW_DAYS} days')`).all(),
      env.DB.prepare(`SELECT session_id,commission,currency,status,created_at FROM revenue_ledger WHERE session_id IS NOT NULL AND status IN ('confirmed','paid') AND created_at>=datetime('now','-${WINDOW_DAYS} days')`).all()
    ]);
    const surfaces=opportunities.results||[],sessionSurface=new Map(),first=new Map();
    for(const e of entries.results||[]){
      const id=String(e.session_id||'');if(!id||sessionSurface.has(id))continue;
      const row=surfaces.find(o=>sourceMatchesSurface(e.source,e.referrer_host,o));
      if(row){sessionSurface.set(id,row.surface_slug);first.set(id,String(e.created_at||''));}
    }
    const bySurface=new Map();
    const get=slug=>{if(!bySurface.has(slug))bySurface.set(slug,{surface_slug:slug,surface_name:surfaces.find(x=>x.surface_slug===slug)?.surface_name||slug,human_sessions:0,outbound_clicks:0,monetized_outbound:0,revenue:0});return bySurface.get(slug)};
    for(const slug of sessionSurface.values())get(slug).human_sessions++;
    for(const e of outboundEvents.results||[]){const id=String(e.session_id||''),slug=sessionSurface.get(id);if(slug&&String(e.created_at||'')>=String(first.get(id)||''))get(slug).outbound_clicks++;}
    for(const c of clicks.results||[]){const id=String(c.session_id||''),slug=sessionSurface.get(id);if(slug&&String(c.created_at||'')>=String(first.get(id)||'')&&Number(c.affiliate_active_at_click)===1&&String(c.source||'')!=='internal-test')get(slug).monetized_outbound++;}
    const currencies=new Set();
    for(const r of revenueRows.results||[]){const id=String(r.session_id||''),slug=sessionSurface.get(id);if(!slug||String(r.created_at||'')<String(first.get(id)||''))continue;currencies.add(String(r.currency||'EUR'));get(slug).revenue+=Number(r.commission||0);}
    const rows=[...bySurface.values()].sort((a,b)=>b.human_sessions-a.human_sessions||b.outbound_clicks-a.outbound_clicks);
    const humanSessions=rows.reduce((n,x)=>n+x.human_sessions,0),outbound=rows.reduce((n,x)=>n+x.outbound_clicks,0),monetized=rows.reduce((n,x)=>n+x.monetized_outbound,0);
    const revenue=currencies.size<=1?rows.reduce((n,x)=>n+x.revenue,0):null;
    return {
      status:'observed',windowDays:WINDOW_DAYS,
      humanSessions,outboundClicks:outbound,monetizedOutbound:monetized,
      confirmedRevenue:revenue,currency:currencies.size===1?[...currencies][0]:(currencies.size===0?'EUR':null),
      activeSurfaces:rows.filter(x=>x.human_sessions>0).length,
      humanTrafficShare:Number(totalHumanSessions)>0?Number((humanSessions/Number(totalHumanSessions)*100).toFixed(1)):0,
      sessionToOutboundCtr:humanSessions?Number((outbound/humanSessions*100).toFixed(1)):0,
      monetizationCoverage:outbound?Number((monetized/outbound*100).toFixed(1)):0,
      topSurfaces:rows.slice(0,8),
      attribution:'First-touch likely-human session within 30 days. Attribution requires a Distribution Engine UTM/source marker or a referrer matching a known distribution surface. Outbound and revenue are counted only after that attributed session entry and remain linked by session_id.',
      revenueDefinition:'Confirmed/paid ledger evidence only. Revenue remains null when attributed evidence spans multiple currencies; no revenue is inferred from clicks.'
    };
  }catch(error){return {status:'unavailable',windowDays:WINDOW_DAYS,reason:`Distribution impact aggregation unavailable: ${String(error?.message||error)}`};}
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname==='/api/stats'&&request.method==='GET'){
      const response=await base.fetch(request,env,ctx);if(!response.ok)return response;
      const stats=await response.json();
      const impact=await impactSnapshot(env,Number(stats?.audience?.likelyHumanSessions??stats?.funnel?.sessions??0));
      return Response.json({...stats,distributionImpact:impact},{headers:H});
    }
    return base.fetch(request,env,ctx);
  },
  async scheduled(event,env,ctx){if(typeof base.scheduled==='function')return base.scheduled(event,env,ctx);}
};
