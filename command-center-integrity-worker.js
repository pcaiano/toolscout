import base from './visitor-integrity-worker.js';
import {latestEngineRuns} from './engine-run-ledger.js';

const TIME_ZONE='Europe/Lisbon';

function parseUtc(value){const text=String(value||'').trim();if(!text)return null;const d=new Date(text.includes('T')?text:(text.replace(' ','T')+'Z'));return Number.isFinite(d.getTime())?d:null}
function zonedParts(value,timeZone=TIME_ZONE){const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(value instanceof Date?value:new Date(value));return Object.fromEntries(parts.filter(x=>x.type!=='literal').map(x=>[x.type,x.value]))}
function dayKey(value,timeZone=TIME_ZONE){const p=zonedParts(value,timeZone);return `${p.year}-${p.month}-${p.day}`}
function offsetMs(value,timeZone=TIME_ZONE){const d=value instanceof Date?value:new Date(value),p=zonedParts(d,timeZone);return Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day),Number(p.hour),Number(p.minute),Number(p.second))-Math.floor(d.getTime()/1000)*1000}
function zonedMidnight(key,timeZone=TIME_ZONE){const [y,m,d]=key.split('-').map(Number),localUtc=Date.UTC(y,m-1,d,0,0,0);let guess=localUtc;for(let i=0;i<3;i++)guess=localUtc-offsetMs(new Date(guess),timeZone);return new Date(guess)}
function sqliteUtc(date){return date.toISOString().replace('T',' ').slice(0,19)}
function ageMinutes(value,now=Date.now()){const d=parseUtc(value);return d?Math.max(0,(now-d.getTime())/60000):null}
function finiteOrNull(value){const n=Number(value);return Number.isFinite(n)?n:null}

async function first(env,sql,bindings=[]){try{return{ok:true,value:await env.DB.prepare(sql).bind(...bindings).first()}}catch(error){return{ok:false,error:String(error?.message||error)}}}
async function all(env,sql,bindings=[]){try{return{ok:true,value:(await env.DB.prepare(sql).bind(...bindings).all()).results||[]}}catch(error){return{ok:false,error:String(error?.message||error),value:[]}}}

function firstTouchBuckets(rows){
  const firstByVisitor=new Map();
  for(const row of rows||[]){const id=String(row.visitor_id||'');if(id&&!firstByVisitor.has(id))firstByVisitor.set(id,row)}
  const buckets={search:0,ai_referral:0,distribution:0,social:0,dark_direct_deep:0,direct_home:0,tracked_campaign:0,other_referral:0,unattributed:0};
  const ai=['chatgpt.com','chat.openai.com','perplexity.ai','claude.ai','gemini.google.com','copilot.microsoft.com','poe.com','you.com','grok.com'];
  const social=['linkedin.com','lnkd.in','x.com','twitter.com','t.co','bsky.app','facebook.com','instagram.com','reddit.com','threads.net'];
  const distribution=['uneed.best','producthunt.com','saashub.com','peerlist.io','tinylaunch.com','betalist.com','indiehackers.com'];
  const search=['google.','bing.com','search.yahoo.com','duckduckgo.com','search.brave.com','ecosia.org','yandex.','baidu.com'];
  const hostMatch=(host,list)=>list.some(x=>x.endsWith('.')?host.startsWith(x)||host.includes('.'+x):host===x||host.endsWith('.'+x));
  for(const row of firstByVisitor.values()){
    const source=String(row.source||'direct').toLowerCase(),host=String(row.referrer_host||'').toLowerCase(),path=String(row.path||'/');
    if(hostMatch(host,ai)||/(chatgpt|openai|perplexity|claude|gemini|copilot|poe|grok)/.test(source)){buckets.ai_referral++;continue}
    if(hostMatch(host,search)||/^ref:(google\.|bing\.com|duckduckgo\.com|search\.brave\.com|search\.yahoo\.com)/.test(source)){buckets.search++;continue}
    if(hostMatch(host,distribution)||/(uneed|producthunt|saashub|peerlist|tinylaunch|betalist|indiehackers|rss|websub)/.test(source)){buckets.distribution++;continue}
    if(hostMatch(host,social)||/(linkedin|twitter|bluesky|facebook|instagram|reddit|threads|utm_source=x)/.test(source)){buckets.social++;continue}
    if(source==='direct'&&!host){if(path==='/'||path==='/index.html')buckets.direct_home++;else buckets.dark_direct_deep++;continue}
    if(source.includes('utm_source=')||source!=='direct'){buckets.tracked_campaign++;continue}
    if(host||source.startsWith('ref:')){buckets.other_referral++;continue}
    buckets.unattributed++;
  }
  return {total:firstByVisitor.size,buckets:Object.entries(buckets).filter(([,visitors])=>visitors>0).map(([key,visitors])=>({key,visitors}))};
}

function runHealth(row,slaMinutes){
  if(!row)return{status:'unknown',last_run_at:null,proof:'No canonical engine run has been recorded since the run ledger was deployed.'};
  const age=ageMinutes(row.completed_at||row.started_at),raw=String(row.status||'unknown');
  if(raw==='failed')return{status:'failed',last_run_at:row.started_at,last_completed_at:row.completed_at||null,mission:row.mission,detail:row.detail||null,age_minutes:age,proof:'engine_runs'};
  if(raw==='degraded')return{status:'degraded',last_run_at:row.started_at,last_completed_at:row.completed_at||null,mission:row.mission,detail:row.detail||null,age_minutes:age,proof:'engine_runs'};
  if(raw==='running')return{status:age!=null&&age>slaMinutes?'stale':'running',last_run_at:row.started_at,last_completed_at:null,mission:row.mission,detail:row.detail||null,age_minutes:age,proof:'engine_runs'};
  if(raw==='completed')return{status:age!=null&&age>slaMinutes?'stale':'healthy',last_run_at:row.started_at,last_completed_at:row.completed_at||null,mission:row.mission,detail:row.detail||null,age_minutes:age,proof:'engine_runs'};
  return{status:'unknown',last_run_at:row.started_at||null,last_completed_at:row.completed_at||null,mission:row.mission||null,detail:row.detail||null,age_minutes:age,proof:'engine_runs'};
}

function eventHealth(row,slaMinutes,proof){
  if(!row)return{status:'unknown',last_event_at:null,proof};
  const age=ageMinutes(row.created_at||row.observed_at),status=age!=null&&age<=slaMinutes?'healthy':'stale';
  return{status,last_event_at:row.created_at||row.observed_at||null,event_type:row.event_type||null,age_minutes:age,proof};
}

function sourceFreshness(source,defaultSlaMinutes=4320){
  const generatedAt=source?.generatedAt||source?.generated_at||source?.observedAt||source?.observed_at||null;
  if(!generatedAt)return{status:source?.status==='unavailable'?'unavailable':'unknown',generated_at:null};
  const age=ageMinutes(generatedAt);
  return{status:age!=null&&age<=defaultSlaMinutes?'fresh':'stale',generated_at:generatedAt,age_minutes:age};
}

async function canonicalSnapshot(env,upstream){
  const now=new Date(),today=dayKey(now),month=today.slice(0,7),todayStart=sqliteUtc(zonedMidnight(today)),monthStart=sqliteUtc(zonedMidnight(`${month}-01`)),last24Start=sqliteUtc(new Date(now.getTime()-86400000));
  const [sessions,trend,outbound,byTool,todayVisitors,last24Visitors,audienceLatest,contentLatest,runsResult]=await Promise.all([
    first(env,`SELECT COUNT(DISTINCT CASE WHEN created_at>=? THEN session_id END) last24,COUNT(DISTINCT CASE WHEN created_at>=? THEN session_id END) today,COUNT(DISTINCT CASE WHEN created_at>=? THEN session_id END) monthToDate,MAX(created_at) lastAllowedAt FROM traffic_guard_events WHERE decision='allowed'`,[last24Start,todayStart,monthStart]),
    all(env,`SELECT session_id,created_at FROM traffic_guard_events WHERE decision='allowed' AND created_at>=datetime('now','-31 days') ORDER BY created_at ASC`),
    first(env,`SELECT COUNT(*) humanOutbound,SUM(CASE WHEN affiliate_active_at_click=1 THEN 1 ELSE 0 END) monetizedOutbound,SUM(CASE WHEN affiliate_active_at_click!=1 OR affiliate_active_at_click IS NULL THEN 1 ELSE 0 END) unmonetizedOutbound,MAX(created_at) lastOutboundAt FROM verified_outbound_events WHERE created_at>=datetime('now','-30 days')`),
    all(env,`SELECT tool_slug,COUNT(*) humanOutbound,SUM(CASE WHEN affiliate_active_at_click=1 THEN 1 ELSE 0 END) monetizedOutbound,MAX(created_at) lastOutboundAt FROM verified_outbound_events WHERE created_at>=datetime('now','-30 days') GROUP BY tool_slug ORDER BY humanOutbound DESC,tool_slug ASC`),
    all(env,`SELECT visitor_id,session_id,path,source,referrer_host,created_at FROM confirmed_visitor_events WHERE created_at>=? ORDER BY created_at ASC`,[todayStart]),
    all(env,`SELECT visitor_id,session_id,path,source,referrer_host,created_at FROM confirmed_visitor_events WHERE created_at>=? ORDER BY created_at ASC`,[last24Start]),
    first(env,`SELECT event_type,observed_at,created_at FROM audience_events WHERE source='make-audience-engine' AND status='published' ORDER BY created_at DESC LIMIT 1`),
    first(env,`SELECT event_type,content_id,observed_at,created_at FROM audience_events WHERE source='make_content_engine' AND event_type='content_published' AND status='published' ORDER BY created_at DESC LIMIT 1`),
    latestEngineRuns(env).then(value=>({ok:true,value})).catch(error=>({ok:false,error:String(error?.message||error),value:[]}))
  ]);

  const queryMap={human_sessions:sessions,traffic_trend:trend,verified_outbound:outbound,verified_outbound_by_tool:byTool,attribution_today:todayVisitors,attribution_last24:last24Visitors,audience_evidence:audienceLatest,content_evidence:contentLatest,engine_runs:runsResult};
  const issues=Object.entries(queryMap).filter(([,q])=>!q.ok).map(([metric,q])=>({metric,severity:'error',reason:q.error||'query_failed'}));
  const dayNumber=Number(today.slice(8,10))||1,daysInMonth=new Date(Date.UTC(Number(today.slice(0,4)),Number(today.slice(5,7)),0)).getUTCDate();
  const sessionRow=sessions.ok?sessions.value||{}:null,mtd=sessionRow?finiteOrNull(sessionRow.monthToDate):null;
  const linkedTodaySessions=todayVisitors.ok?(todayVisitors.value||[]).length:null;
  const distinctTodaySessionIds=todayVisitors.ok?new Set((todayVisitors.value||[]).map(row=>String(row.session_id||'')).filter(Boolean)).size:null;
  const uniqueTodayVisitors=todayVisitors.ok?new Set((todayVisitors.value||[]).map(row=>String(row.visitor_id||'')).filter(Boolean)).size:null;
  const canonicalToday=linkedTodaySessions==null?(sessionRow?finiteOrNull(sessionRow.today):null):linkedTodaySessions;
  if(linkedTodaySessions!=null&&distinctTodaySessionIds!=null&&distinctTodaySessionIds<linkedTodaySessions)issues.push({metric:'today_session_identity',severity:'warning',reason:'multiple_visitor_session_links_share_a_session_id'});
  if(linkedTodaySessions!=null&&uniqueTodayVisitors!=null&&uniqueTodayVisitors>linkedTodaySessions)issues.push({metric:'today_population_alignment',severity:'error',reason:'unique_visitors_exceed_linked_sessions'});
  const dailyAverage=mtd==null?null:mtd/dayNumber,projectedMonth=dailyAverage==null?null:Math.round(dailyAverage*daysInMonth);

  const trendMap=new Map();
  if(trend.ok)for(const row of trend.value){const at=parseUtc(row.created_at),sid=String(row.session_id||'');if(!at||!sid)continue;const key=dayKey(at);if(!trendMap.has(key))trendMap.set(key,new Set());trendMap.get(key).add(sid)}
  const points=[];for(let i=29;i>=0;i--){const d=new Date(now.getTime()-i*86400000),key=dayKey(d);const historical=trend.ok?(trendMap.get(key)?.size||0):null;points.push({day:key,sessions:key===today&&linkedTodaySessions!=null?linkedTodaySessions:historical})}

  const outRow=outbound.ok?outbound.value||{}:null,humanOutbound=outRow?finiteOrNull(outRow.humanOutbound):null,monetized=outRow?finiteOrNull(outRow.monetizedOutbound):null,unmonetized=outRow?finiteOrNull(outRow.unmonetizedOutbound):null;
  const weightedCoverage=humanOutbound==null||monetized==null?null:(humanOutbound?monetized/humanOutbound:null);
  const runMap=new Map();
  if(runsResult.ok)for(const row of runsResult.value||[]){const existing=runMap.get(row.engine),a=parseUtc(row.started_at)?.getTime()||0,b=parseUtc(existing?.started_at)?.getTime()||0;if(!existing||a>b)runMap.set(row.engine,row)}
  const distributionHealth=runHealth(runMap.get('distribution'),90),affiliateHealth=runHealth(runMap.get('affiliate'),90),audienceHealth=eventHealth(audienceLatest.ok?audienceLatest.value:null,36*60,'verified audience_events'),contentHealth=eventHealth(contentLatest.ok?contentLatest.value:null,80*60,'verified Bluesky content publication');
  const gscFreshness=sourceFreshness(upstream?.trafficTruth?.googleSearchConsole,72*60),ga4Freshness=sourceFreshness(upstream?.trafficTruth?.ga4||{},72*60);
  if(gscFreshness.status==='stale'||gscFreshness.status==='unavailable')issues.push({metric:'gsc',severity:'warning',reason:gscFreshness.status});
  if(ga4Freshness.status==='stale'||ga4Freshness.status==='unavailable')issues.push({metric:'ga4',severity:'warning',reason:ga4Freshness.status});
  for(const [engine,health] of [['distribution',distributionHealth],['affiliate',affiliateHealth],['audience',audienceHealth],['content',contentHealth]])if(['failed','degraded','stale','unknown'].includes(health.status))issues.push({metric:`engine:${engine}`,severity:health.status==='failed'?'error':'warning',reason:health.status});

  return {
    status:issues.some(x=>x.severity==='error')?'degraded':issues.length?'warning':'healthy',
    generatedAt:now.toISOString(),timezone:TIME_ZONE,issues,
    sources:{d1_guard:sessions.ok?'available':'unavailable',verified_outbound:outbound.ok?'available':'unavailable',confirmed_visitors:todayVisitors.ok&&last24Visitors.ok?'available':'unavailable',engine_runs:runsResult.ok?'available':'unavailable',gsc:gscFreshness,ga4:ga4Freshness},
    sessions:sessions.ok?{status:'observed',last24:finiteOrNull(sessionRow.last24),today:canonicalToday,monthToDate:mtd,dailyAverageMTD:dailyAverage,projectedMonth,lastAllowedAt:sessionRow.lastAllowedAt||null,todayPopulation:'confirmed_visitor_events visitor-session links in the Europe/Lisbon today window',todayDistinctSessionIds:distinctTodaySessionIds,todayUniqueVisitors:uniqueTodayVisitors,todayPopulationAligned:true}: {status:'unavailable',last24:null,today:null,monthToDate:null,dailyAverageMTD:null,projectedMonth:null,reason:sessions.error,todayPopulationAligned:false},
    trafficTrend:{status:trend.ok?'observed':'unavailable',metric:'Browser Guard allowed sessions; current Lisbon day aligned to confirmed visitor-linked sessions',windowDays:30,points,generatedAt:now.toISOString(),reason:trend.ok?null:trend.error},
    outbound:outbound.ok?{status:'observed',windowDays:30,humanOutbound,monetizedOutbound:monetized,unmonetizedOutbound:unmonetized,weightedCoverage,lastOutboundAt:outRow.lastOutboundAt||null}: {status:'unavailable',windowDays:30,humanOutbound:null,monetizedOutbound:null,unmonetizedOutbound:null,weightedCoverage:null,reason:outbound.error},
    outboundByTool:byTool.ok?byTool.value.map(row=>({tool_slug:row.tool_slug,humanOutbound:finiteOrNull(row.humanOutbound),monetizedOutbound:finiteOrNull(row.monetizedOutbound),lastOutboundAt:row.lastOutboundAt||null})):null,
    attribution:{status:todayVisitors.ok&&last24Visitors.ok?'observed':'unavailable',definition:'First-touch buckets are calculated only from visitor IDs whose sessions were accepted by Browser Guard.',today:todayVisitors.ok?firstTouchBuckets(todayVisitors.value):null,last24:last24Visitors.ok?firstTouchBuckets(last24Visitors.value):null,generatedAt:now.toISOString()},
    engines:{distribution:distributionHealth,affiliate:affiliateHealth,audience:audienceHealth,content:contentHealth}
  };
}

function mergeAudit(data,audit){
  const d={...data,measurementAudit:audit};
  d.traffic={...(d.traffic||{}),...audit.sessions};
  d.trafficTrend=audit.trafficTrend;
  d.discoveryAttribution=audit.attribution;
  d.verifiedOutboundByTool=audit.outboundByTool;
  d.canonicalCommercialTruth={...(d.canonicalCommercialTruth||{}),...audit.outbound,source:'D1 verified_outbound_events',trafficTruth:'first_party_verified_navigation'};
  d.affiliateCoverage={...(d.affiliateCoverage||{}),humanOutboundClicks:audit.outbound.humanOutbound,monetizedLikelyHumanClicks:audit.outbound.monetizedOutbound,unmonetizedLikelyHumanClicks:audit.outbound.unmonetizedOutbound,weightedCoverage:audit.outbound.weightedCoverage,trafficTruth:'first_party_verified_navigation'};
  d.trafficTruth={...(d.trafficTruth||{}),status:audit.sessions.status==='observed'?'observed':'degraded',primaryMetric:'Browser Guard sessions plus first-party verified outbound navigation; today uses the same confirmed visitor-linked session population as Unique Human Visitors',d1:{...(d.trafficTruth?.d1||{}),status:audit.sessions.status,metric:'Browser Guard sessions; today aligned to confirmed visitor linkage',last24:audit.sessions.last24,today:audit.sessions.today,monthToDate:audit.sessions.monthToDate,dailyAverageMTD:audit.sessions.dailyAverageMTD,projectedMonth:audit.sessions.projectedMonth,humanOutbound:audit.outbound.humanOutbound,monetizedOutbound:audit.outbound.monetizedOutbound,unmonetizedOutbound:audit.outbound.unmonetizedOutbound,weightedCoverage:audit.outbound.weightedCoverage,commercialTruth:'first_party_verified_navigation'}};
  d.growthOps={...(d.growthOps||{}),engines:{...(d.growthOps?.engines||{}),distribution:{...(d.growthOps?.engines?.distribution||{}),...audit.engines.distribution},affiliate:{...(d.growthOps?.engines?.affiliate||{}),...audit.engines.affiliate}},health:{...(d.growthOps?.health||{}),content:audit.engines.content,audience:audit.engines.audience,issues:[...((d.growthOps?.health?.issues)||[]),...audit.issues]}};
  d.resilientCommandCenter={...(d.resilientCommandCenter||{}),integrityLayer:'fail_closed_v2',integrityStatus:audit.status,generatedAt:audit.generatedAt};
  return d;
}

async function augmentStats(response,env){
  if(!response.ok)return response;
  let data;try{data=await response.json()}catch{return response}
  const audit=await canonicalSnapshot(env,data);
  const headers=new Headers(response.headers);headers.set('Content-Type','application/json; charset=UTF-8');headers.set('Cache-Control','private, no-store');headers.delete('Content-Length');headers.delete('Content-Encoding');
  return new Response(JSON.stringify(mergeAudit(data,audit)),{status:response.status,statusText:response.statusText,headers});
}

async function augmentHealth(response,env){
  if(!response.ok)return response;
  let data;try{data=await response.json()}catch{return response}
  const audit=await canonicalSnapshot(env,data);
  data.commandCenterIntegrity={status:audit.status,generatedAt:audit.generatedAt,sources:audit.sources,engines:audit.engines,issues:audit.issues};
  return Response.json(data,{headers:{'Cache-Control':'no-store'}});
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    const response=await base.fetch(request,env,ctx);
    if(request.method==='GET'&&(url.pathname==='/analytics/api/stats'||url.pathname==='/api/stats'))return augmentStats(response,env);
    if(request.method==='GET'&&url.pathname==='/api/traffic-integrity-health')return augmentHealth(response,env);
    return response;
  },
  async scheduled(event,env,ctx){if(typeof base.scheduled==='function')return base.scheduled(event,env,ctx)}
};
