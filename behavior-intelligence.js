const WINDOW_DAYS=30;

function n(value){const x=Number(value);return Number.isFinite(x)?x:0}
function rate(a,b){const d=n(b);return d>0?Number((n(a)/d*100).toFixed(1)):null}

export function behaviorQuality(row){
  const sessions=n(row.sessions),starts=n(row.recommendation_starts),completions=n(row.recommendation_completions),results=n(row.result_views),outbound=n(row.outbound_clicks);
  if(sessions<3)return {score:null,sample:'insufficient',sessions};
  const startRate=rate(starts,sessions)||0,completionRate=rate(completions,starts)||0,resultRate=rate(results,completions)||0,outboundRate=rate(outbound,sessions)||0;
  const raw=startRate*0.15+completionRate*0.25+resultRate*0.20+outboundRate*0.40;
  const confidence=Math.min(1,sessions/20);
  return {score:Number((raw*(0.7+0.3*confidence)).toFixed(1)),sample:sessions>=20?'strong':'emerging',sessions,startRate,completionRate,resultRate,outboundRate};
}

async function safeAll(env,sql){try{return await env.DB.prepare(sql).all()}catch{return {results:[]}}}

function bucket(rows,keyName){
  const map=new Map();
  for(const row of rows||[]){
    const key=String(row[keyName]||'').trim();if(!key)continue;
    const item=map.get(key)||{key,sessions:0,recommendation_starts:0,recommendation_completions:0,result_views:0,tool_views:0,outbound_clicks:0};
    const type=String(row.event_type||''),events=n(row.events);item.sessions=Math.max(item.sessions,n(row.sessions));
    if(type==='recommendation_started')item.recommendation_starts+=events;
    if(type==='recommendation_completed')item.recommendation_completions+=events;
    if(type==='recommendation_result_viewed')item.result_views+=events;
    if(type==='tool_viewed')item.tool_views+=events;
    if(type==='outbound_clicked')item.outbound_clicks+=events;
    map.set(key,item);
  }
  return [...map.values()].map(x=>({...x,quality:behaviorQuality(x)})).sort((a,b)=>(b.quality.score??-1)-(a.quality.score??-1)||b.outbound_clicks-a.outbound_clicks||b.sessions-a.sessions);
}

export async function behaviorSnapshot(env){
  const events="'recommendation_started','recommendation_completed','recommendation_result_viewed','tool_viewed','outbound_clicked'";
  const confirmed="EXISTS(SELECT 1 FROM funnel_events pc WHERE pc.session_id=f.session_id AND pc.event_type='page_confirmed')";
  const [overall,intents,tools,sources]=await Promise.all([
    safeAll(env,`SELECT f.event_type,COUNT(*) events,COUNT(DISTINCT f.session_id) sessions FROM funnel_events f JOIN sessions s ON s.session_id=f.session_id WHERE s.classification='likely-human' AND f.created_at>=datetime('now','-${WINDOW_DAYS} days') AND ${confirmed} GROUP BY f.event_type`),
    safeAll(env,`SELECT f.intent_slug,f.event_type,COUNT(*) events,COUNT(DISTINCT f.session_id) sessions FROM funnel_events f JOIN sessions s ON s.session_id=f.session_id WHERE s.classification='likely-human' AND f.intent_slug IS NOT NULL AND f.created_at>=datetime('now','-${WINDOW_DAYS} days') AND ${confirmed} AND f.event_type IN (${events}) GROUP BY f.intent_slug,f.event_type`),
    safeAll(env,`SELECT f.tool_slug,f.event_type,COUNT(*) events,COUNT(DISTINCT f.session_id) sessions FROM funnel_events f JOIN sessions s ON s.session_id=f.session_id WHERE s.classification='likely-human' AND f.tool_slug IS NOT NULL AND f.created_at>=datetime('now','-${WINDOW_DAYS} days') AND ${confirmed} AND f.event_type IN ('tool_viewed','outbound_clicked') GROUP BY f.tool_slug,f.event_type`),
    safeAll(env,`SELECT f.source,f.event_type,COUNT(*) events,COUNT(DISTINCT f.session_id) sessions FROM funnel_events f JOIN sessions s ON s.session_id=f.session_id WHERE s.classification='likely-human' AND f.created_at>=datetime('now','-${WINDOW_DAYS} days') AND ${confirmed} AND f.event_type IN (${events}) GROUP BY f.source,f.event_type`)
  ]);
  const totals={sessions:0,recommendation_starts:0,recommendation_completions:0,result_views:0,tool_views:0,outbound_clicks:0};
  for(const row of overall.results||[]){const type=String(row.event_type||''),eventsCount=n(row.events);totals.sessions=Math.max(totals.sessions,n(row.sessions));if(type==='recommendation_started')totals.recommendation_starts=eventsCount;if(type==='recommendation_completed')totals.recommendation_completions=eventsCount;if(type==='recommendation_result_viewed')totals.result_views=eventsCount;if(type==='tool_viewed')totals.tool_views=eventsCount;if(type==='outbound_clicked')totals.outbound_clicks=eventsCount;}
  return {status:'observed',windowDays:WINDOW_DAYS,primarySource:'D1 canonical browser-confirmed events',posthog:{status:'configured',region:'EU',consentBased:true,role:'external behavior validation',decisionSource:false,serverQueryConfigured:false},totals:{...totals,recommendationCompletionRate:rate(totals.recommendation_completions,totals.recommendation_starts),sessionToOutboundRate:rate(totals.outbound_clicks,totals.sessions),quality:behaviorQuality(totals)},topIntents:bucket(intents.results,'intent_slug').slice(0,10),topTools:bucket(tools.results,'tool_slug').slice(0,10),topSources:bucket(sources.results,'source').slice(0,10),guardrail:'PostHog validates consented behavior. First-party D1 remains the decision source for monetization and engine priorities.'};
}