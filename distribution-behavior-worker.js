import { behaviorQuality } from './behavior-intelligence.js';

const WINDOW_DAYS=30;
function n(value){const x=Number(value);return Number.isFinite(x)?x:0}
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
async function safeAll(env,sql){try{return await env.DB.prepare(sql).all()}catch{return {results:[]}}}

export async function distributionBehaviorSignals(env){
  const eventTypes="'recommendation_started','recommendation_completed','recommendation_result_viewed','tool_viewed','outbound_clicked'";
  const [opportunities,entries,events]=await Promise.all([
    safeAll(env,`SELECT surface_slug,surface_name,action_url,live_url FROM distribution_opportunities WHERE action_url IS NOT NULL OR live_url IS NOT NULL`),
    safeAll(env,`SELECT f.session_id,f.source,f.referrer_host,f.created_at,MIN(pc.created_at) confirmed_at FROM funnel_events f JOIN sessions s ON s.session_id=f.session_id JOIN funnel_events pc ON pc.session_id=f.session_id AND pc.event_type='page_confirmed' AND pc.created_at>=f.created_at WHERE s.classification='likely-human' AND f.event_type='session_started' AND f.created_at>=datetime('now','-${WINDOW_DAYS} days') GROUP BY f.session_id,f.source,f.referrer_host,f.created_at ORDER BY f.created_at`),
    safeAll(env,`SELECT f.session_id,f.event_type,f.created_at FROM funnel_events f JOIN sessions s ON s.session_id=f.session_id WHERE s.classification='likely-human' AND f.event_type IN (${eventTypes}) AND f.created_at>=datetime('now','-${WINDOW_DAYS} days')`)
  ]);
  const surfaces=opportunities.results||[],sessionSurface=new Map(),first=new Map();
  for(const entry of entries.results||[]){const id=String(entry.session_id||'');if(!id||sessionSurface.has(id)||!entry.confirmed_at)continue;const surface=surfaces.find(row=>sourceMatchesSurface(entry.source,entry.referrer_host,row));if(surface){sessionSurface.set(id,surface.surface_slug);first.set(id,String(entry.created_at||''));}}
  const bySurface=new Map();
  function get(slug){if(!bySurface.has(slug))bySurface.set(slug,{surface_slug:slug,surface_name:surfaces.find(x=>x.surface_slug===slug)?.surface_name||slug,sessions:0,recommendation_starts:0,recommendation_completions:0,result_views:0,tool_views:0,outbound_clicks:0,_sessions:new Set()});return bySurface.get(slug)}
  for(const [session,slug] of sessionSurface.entries()){const row=get(slug);row._sessions.add(session);row.sessions=row._sessions.size;}
  for(const event of events.results||[]){const id=String(event.session_id||''),slug=sessionSurface.get(id);if(!slug||String(event.created_at||'')<String(first.get(id)||''))continue;const row=get(slug),type=String(event.event_type||'');if(type==='recommendation_started')row.recommendation_starts++;if(type==='recommendation_completed')row.recommendation_completions++;if(type==='recommendation_result_viewed')row.result_views++;if(type==='tool_viewed')row.tool_views++;if(type==='outbound_clicked')row.outbound_clicks++;}
  return [...bySurface.values()].map(({_sessions,...row})=>({...row,quality:behaviorQuality(row)}));
}

export async function applyDistributionBehaviorPriorities(env){
  const signals=await distributionBehaviorSignals(env),bySlug=new Map(signals.map(x=>[x.surface_slug,x]));
  const learning=await safeAll(env,`SELECT surface_slug,operating_decision,priority_weight,decision_reason,monetized_outbound_30d,confirmed_revenue_30d FROM distribution_economic_learning`);
  let adjusted=0;
  for(const row of learning.results||[]){
    const signal=bySlug.get(row.surface_slug),decision=String(row.operating_decision||'');
    const previous=Number((String(row.decision_reason||'').match(/Behavior quality boost \+([0-9.]+)/)||[])[1]||0);
    const basePriority=Math.max(0,n(row.priority_weight)-previous);
    let boost=0;
    if(signal&&signal.quality.score!=null&&['explore','measure','scale'].includes(decision)){
      const cap=decision==='scale'?3:8;
      boost=Math.min(cap,Number((signal.quality.score/100*cap).toFixed(2)));
      if(n(row.confirmed_revenue_30d)>0||n(row.monetized_outbound_30d)>0)boost=Math.min(boost,3);
    }
    const priority=Number(Math.min(100,basePriority+boost).toFixed(2));
    const clean=String(row.decision_reason||'').replace(/\s*Behavior quality boost \+[0-9.]+[^.]*\.?/g,'').trim();
    const reason=boost>0?`${clean} Behavior quality boost +${boost.toFixed(2)} from ${signal.sessions} browser-confirmed attributed session(s); economic evidence remains authoritative.`:clean;
    try{await env.DB.prepare(`UPDATE distribution_economic_learning SET priority_weight=?,decision_reason=?,updated_at=datetime('now') WHERE surface_slug=?`).bind(priority,reason,row.surface_slug).run();await env.DB.prepare(`UPDATE distribution_opportunities SET distribution_score=?,updated_at=datetime('now') WHERE surface_slug=?`).bind(priority,row.surface_slug).run();if(boost>0)adjusted++;}catch{}
  }
  return {ok:true,adjusted,signals:signals.length,windowDays:WINDOW_DAYS,guardrail:'Behavior only adds a bounded priority boost. It cannot change operating decisions, authorize paid distribution, override monetization evidence or revive suspended surfaces.'};
}