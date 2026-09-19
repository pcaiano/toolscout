import base from './visitor-integrity-worker.js';
import {latestEngineRuns} from './engine-run-ledger.js';

const TIME_ZONE='Europe/Lisbon';
let optimizationReady=null;

function parseUtc(value){const text=String(value||'').trim();if(!text)return null;const d=new Date(text.includes('T')?text:(text.replace(' ','T')+'Z'));return Number.isFinite(d.getTime())?d:null}
function zonedParts(value,timeZone=TIME_ZONE){const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(value instanceof Date?value:new Date(value));return Object.fromEntries(parts.filter(x=>x.type!=='literal').map(x=>[x.type,x.value]))}
function dayKey(value,timeZone=TIME_ZONE){const p=zonedParts(value,timeZone);return `${p.year}-${p.month}-${p.day}`}
function offsetMs(value,timeZone=TIME_ZONE){const d=value instanceof Date?value:new Date(value),p=zonedParts(d,timeZone);return Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day),Number(p.hour),Number(p.minute),Number(p.second))-Math.floor(d.getTime()/1000)*1000}
function zonedMidnight(key,timeZone=TIME_ZONE){const [y,m,d]=key.split('-').map(Number),localUtc=Date.UTC(y,m-1,d,0,0,0);let guess=localUtc;for(let i=0;i<3;i++)guess=localUtc-offsetMs(new Date(guess),timeZone);return new Date(guess)}
function sqliteUtc(date){return date.toISOString().replace('T',' ').slice(0,19)}
function ageMinutes(value,now=Date.now()){const d=parseUtc(value);return d?Math.max(0,(now-d.getTime())/60000):null}
function finiteOrNull(value){const n=Number(value);return Number.isFinite(n)?n:null}
function normalizeCountry(value){const code=String(value||'').trim().toUpperCase();return /^[A-Z]{2}$/.test(code)?code:null}
function countryBuckets(rows){
  const byVisitor=new Map();
  for(const row of rows||[]){
    const id=String(row.visitor_id||'');if(!id)continue;
    const country=normalizeCountry(row.country);
    if(!byVisitor.has(id))byVisitor.set(id,country);
    else if(!byVisitor.get(id)&&country)byVisitor.set(id,country);
  }
  const counts=new Map();let unknown=0;
  for(const country of byVisitor.values()){
    if(!country){unknown++;continue}
    counts.set(country,(counts.get(country)||0)+1);
  }
  const countries=[...counts.entries()].map(([country,visitors])=>({country,visitors})).sort((a,b)=>b.visitors-a.visitors||a.country.localeCompare(b.country));
  const total=byVisitor.size,known=total-unknown;
  return {total,known,unknown,coverage:total?known/total:null,countries};
}

async function first(env,sql,bindings=[]){try{return{ok:true,value:await env.DB.prepare(sql).bind(...bindings).first()}}catch(error){return{ok:false,error:String(error?.message||error)}}}
async function all(env,sql,bindings=[]){try{return{ok:true,value:(await env.DB.prepare(sql).bind(...bindings).all()).results||[]}}catch(error){return{ok:false,error:String(error?.message||error),value:[]}}}

async function ensureOptimizationSchema(env){
  if(optimizationReady)return optimizationReady;
  optimizationReady=(async()=>{
    await env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS command_center_daily_metrics (
        day TEXT PRIMARY KEY,
        human_sessions INTEGER NOT NULL DEFAULT 0,
        unique_visitors INTEGER NOT NULL DEFAULT 0,
        outbound_clicks INTEGER NOT NULL DEFAULT 0,
        monetized_outbound INTEGER NOT NULL DEFAULT 0,
        unmonetized_outbound INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`),
      env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_command_center_daily_updated ON command_center_daily_metrics(updated_at)`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS traffic_integrity_meta (key TEXT PRIMARY KEY,value TEXT NOT NULL)`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS traffic_human_evidence (
        session_id TEXT PRIMARY KEY,
        visitor_id TEXT,
        evidence_type TEXT NOT NULL,
        evidence_strength INTEGER NOT NULL DEFAULT 1,
        interaction_count INTEGER NOT NULL DEFAULT 0,
        first_path TEXT,
        last_path TEXT,
        source TEXT,
        referrer_host TEXT,
        country TEXT,
        asn INTEGER,
        first_evidence_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_evidence_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`),
      env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_traffic_human_evidence_created ON traffic_human_evidence(first_evidence_at)`),
      env.DB.prepare(`INSERT OR IGNORE INTO traffic_integrity_meta(key,value) VALUES('strict_human_tracking_started_at',datetime('now'))`)
    ]);
  })().catch(error=>{optimizationReady=null;throw error});
  return optimizationReady;
}

function dayBounds(key){
  const start=zonedMidnight(key);
  const probe=new Date(start.getTime()+36*60*60*1000);
  const end=zonedMidnight(dayKey(probe));
  return {start:sqliteUtc(start),end:sqliteUtc(end)};
}

async function refreshDailyMetrics(env,daysBack=2){
  await ensureOptimizationSchema(env);
  const now=new Date(),statements=[];
  for(let offset=0;offset<Math.max(1,daysBack);offset++){
    const key=dayKey(new Date(now.getTime()-offset*86400000)),b=dayBounds(key);
    statements.push(env.DB.prepare(`
      INSERT INTO command_center_daily_metrics(
        day,human_sessions,unique_visitors,outbound_clicks,monetized_outbound,unmonetized_outbound,updated_at
      ) VALUES(
        ?,
        (SELECT COUNT(DISTINCT session_id) FROM traffic_human_evidence WHERE first_evidence_at>=? AND first_evidence_at<?),
        (SELECT COUNT(DISTINCT v.visitor_id) FROM traffic_human_evidence h JOIN confirmed_visitor_events v ON v.session_id=h.session_id WHERE h.first_evidence_at>=? AND h.first_evidence_at<?),
        (SELECT COUNT(*) FROM verified_outbound_events WHERE created_at>=? AND created_at<?),
        (SELECT COUNT(*) FROM verified_outbound_events WHERE affiliate_active_at_click=1 AND created_at>=? AND created_at<?),
        (SELECT COUNT(*) FROM verified_outbound_events WHERE (affiliate_active_at_click!=1 OR affiliate_active_at_click IS NULL) AND created_at>=? AND created_at<?),
        datetime('now')
      )
      ON CONFLICT(day) DO UPDATE SET
        human_sessions=excluded.human_sessions,
        unique_visitors=excluded.unique_visitors,
        outbound_clicks=excluded.outbound_clicks,
        monetized_outbound=excluded.monetized_outbound,
        unmonetized_outbound=excluded.unmonetized_outbound,
        updated_at=excluded.updated_at
    `).bind(key,b.start,b.end,b.start,b.end,b.start,b.end,b.start,b.end,b.start,b.end));
  }
  if(statements.length)await env.DB.batch(statements);
}

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
  await ensureOptimizationSchema(env);
  const now=new Date(),today=dayKey(now),month=today.slice(0,7),todayStart=sqliteUtc(zonedMidnight(today)),monthStart=sqliteUtc(zonedMidnight(`${month}-01`)),last24Start=sqliteUtc(new Date(now.getTime()-86400000)),scanStart=last24Start<monthStart?last24Start:monthStart;
  const trendStart=dayKey(new Date(now.getTime()-29*86400000));
  const strictMeta=await first(env,`SELECT value FROM traffic_integrity_meta WHERE key='strict_human_tracking_started_at' LIMIT 1`),strictTrackingSince=parseUtc(strictMeta?.value?.value),strictTrackingDay=strictTrackingSince?dayKey(strictTrackingSince):today;
  const [sessions,trend,outbound,byTool,todayVisitors,last24Visitors,countryRows,audienceLatest,contentLatest,runsResult]=await Promise.all([
    first(env,`SELECT COUNT(DISTINCT CASE WHEN first_evidence_at>=? THEN session_id END) last24,COUNT(DISTINCT CASE WHEN first_evidence_at>=? THEN session_id END) today,COUNT(DISTINCT CASE WHEN first_evidence_at>=? THEN session_id END) monthToDate,MAX(last_evidence_at) lastAllowedAt FROM traffic_human_evidence WHERE first_evidence_at>=?`,[last24Start,todayStart,monthStart,scanStart]),
    all(env,`SELECT day,human_sessions sessions FROM command_center_daily_metrics WHERE day>=? ORDER BY day ASC`,[trendStart]),
    first(env,`SELECT COUNT(*) humanOutbound,SUM(CASE WHEN affiliate_active_at_click=1 THEN 1 ELSE 0 END) monetizedOutbound,SUM(CASE WHEN affiliate_active_at_click!=1 OR affiliate_active_at_click IS NULL THEN 1 ELSE 0 END) unmonetizedOutbound,MAX(created_at) lastOutboundAt FROM verified_outbound_events WHERE created_at>=datetime('now','-30 days')`),
    all(env,`SELECT tool_slug,COUNT(*) humanOutbound,SUM(CASE WHEN affiliate_active_at_click=1 THEN 1 ELSE 0 END) monetizedOutbound,MAX(created_at) lastOutboundAt FROM verified_outbound_events WHERE created_at>=datetime('now','-30 days') GROUP BY tool_slug ORDER BY humanOutbound DESC,tool_slug ASC`),
    all(env,`SELECT v.visitor_id,v.session_id,v.path,v.source,v.referrer_host,h.first_evidence_at created_at FROM traffic_human_evidence h JOIN confirmed_visitor_events v ON v.session_id=h.session_id WHERE h.first_evidence_at>=? ORDER BY h.first_evidence_at ASC`,[todayStart]),
    all(env,`SELECT v.visitor_id,v.session_id,v.path,v.source,v.referrer_host,h.first_evidence_at created_at FROM traffic_human_evidence h JOIN confirmed_visitor_events v ON v.session_id=h.session_id WHERE h.first_evidence_at>=? ORDER BY h.first_evidence_at ASC`,[last24Start]),
    all(env,`SELECT v.visitor_id,v.session_id,h.first_evidence_at created_at,COALESCE(vc.country,UPPER(h.country)) country FROM traffic_human_evidence h JOIN confirmed_visitor_events v ON v.session_id=h.session_id LEFT JOIN confirmed_visitor_countries vc ON vc.visitor_id=v.visitor_id AND vc.session_id=v.session_id WHERE h.first_evidence_at>=? ORDER BY h.first_evidence_at ASC`,[monthStart]),
    first(env,`SELECT event_type,observed_at,created_at FROM audience_events WHERE source='make-audience-engine' AND status='published' ORDER BY created_at DESC LIMIT 1`),
    first(env,`SELECT event_type,content_id,observed_at,created_at FROM audience_events WHERE source='make_content_engine' AND event_type='content_published' AND status='published' ORDER BY created_at DESC LIMIT 1`),
    latestEngineRuns(env).then(value=>({ok:true,value})).catch(error=>({ok:false,error:String(error?.message||error),value:[]}))
  ]);

  const queryMap={human_sessions:sessions,traffic_trend:trend,verified_outbound:outbound,verified_outbound_by_tool:byTool,attribution_today:todayVisitors,attribution_last24:last24Visitors,visitor_countries:countryRows,audience_evidence:audienceLatest,content_evidence:contentLatest,engine_runs:runsResult};
  const issues=Object.entries(queryMap).filter(([,q])=>!q.ok).map(([metric,q])=>({metric,severity:'error',reason:q.error||'query_failed'}));
  const dayNumber=Number(today.slice(8,10))||1,daysInMonth=new Date(Date.UTC(Number(today.slice(0,4)),Number(today.slice(5,7)),0)).getUTCDate();
  const sessionRow=sessions.ok?sessions.value||{}:null,mtd=sessionRow?finiteOrNull(sessionRow.monthToDate):null;
  const linkedTodaySessions=todayVisitors.ok?(todayVisitors.value||[]).length:null;
  const distinctTodaySessionIds=todayVisitors.ok?new Set((todayVisitors.value||[]).map(row=>String(row.session_id||'')).filter(Boolean)).size:null;
  const uniqueTodayVisitors=todayVisitors.ok?new Set((todayVisitors.value||[]).map(row=>String(row.visitor_id||'')).filter(Boolean)).size:null;
  const canonicalToday=sessionRow?finiteOrNull(sessionRow.today):null;
  if(linkedTodaySessions!=null&&distinctTodaySessionIds!=null&&distinctTodaySessionIds<linkedTodaySessions)issues.push({metric:'today_session_identity',severity:'warning',reason:'multiple_visitor_session_links_share_a_session_id'});
  if(distinctTodaySessionIds!=null&&uniqueTodayVisitors!=null&&uniqueTodayVisitors>distinctTodaySessionIds)issues.push({metric:'today_population_alignment',severity:'error',reason:'unique_visitors_exceed_distinct_sessions'});
  const dailyAverage=mtd==null?null:mtd/dayNumber,projectedMonth=dailyAverage==null?null:Math.round(dailyAverage*daysInMonth);

  const trendMap=new Map();
  if(trend.ok)for(const row of trend.value||[]){const key=String(row.day||'');if(key)trendMap.set(key,finiteOrNull(row.sessions)||0)}
  const points=[];for(let i=29;i>=0;i--){const d=new Date(now.getTime()-i*86400000),key=dayKey(d);const historical=key<strictTrackingDay?null:(trend.ok?(trendMap.has(key)?trendMap.get(key):null):null);points.push({day:key,sessions:key===today&&canonicalToday!=null?canonicalToday:historical})}

  const countryMonth=countryRows.ok?countryBuckets(countryRows.value):null;
  const countryLast24=countryRows.ok?countryBuckets((countryRows.value||[]).filter(row=>String(row.created_at||'')>=last24Start)):null;
  const countryToday=countryRows.ok?countryBuckets((countryRows.value||[]).filter(row=>String(row.created_at||'')>=todayStart)):null;
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
    generatedAt:now.toISOString(),timezone:TIME_ZONE,strictTrackingSince:strictTrackingSince?.toISOString()||null,issues,
    sources:{strict_human_evidence:sessions.ok?'available':'unavailable',daily_metrics:trend.ok?'available':'unavailable',verified_outbound:outbound.ok?'available':'unavailable',confirmed_visitors:todayVisitors.ok&&last24Visitors.ok?'available':'unavailable',visitor_countries:countryRows.ok?'available':'unavailable',engine_runs:runsResult.ok?'available':'unavailable',gsc:gscFreshness,ga4:ga4Freshness},
    sessions:sessions.ok?{status:'observed',last24:finiteOrNull(sessionRow.last24),today:canonicalToday,monthToDate:mtd,dailyAverageMTD:dailyAverage,projectedMonth,lastAllowedAt:sessionRow.lastAllowedAt||null,todayPopulation:'strict verified human sessions with positive evidence in the Europe/Lisbon today window',todayLinkRows:linkedTodaySessions,todayDistinctSessionIds:distinctTodaySessionIds,todayUniqueVisitors:uniqueTodayVisitors,todayPopulationAligned:linkedTodaySessions===distinctTodaySessionIds&&uniqueTodayVisitors<=distinctTodaySessionIds}: {status:'unavailable',last24:null,today:null,monthToDate:null,dailyAverageMTD:null,projectedMonth:null,reason:sessions.error,todayPopulationAligned:false},
    trafficTrend:{status:trend.ok?'observed':'unavailable',metric:'Persisted daily strict verified human session aggregates',windowDays:30,points,generatedAt:now.toISOString(),storage:'command_center_daily_metrics',reason:trend.ok?null:trend.error},
    outbound:outbound.ok?{status:'observed',windowDays:30,humanOutbound,monetizedOutbound:monetized,unmonetizedOutbound:unmonetized,weightedCoverage,lastOutboundAt:outRow.lastOutboundAt||null}: {status:'unavailable',windowDays:30,humanOutbound:null,monetizedOutbound:null,unmonetizedOutbound:null,weightedCoverage:null,reason:outbound.error},
    outboundByTool:byTool.ok?byTool.value.map(row=>({tool_slug:row.tool_slug,humanOutbound:finiteOrNull(row.humanOutbound),monetizedOutbound:finiteOrNull(row.monetizedOutbound),lastOutboundAt:row.lastOutboundAt||null})):null,
    attribution:{status:todayVisitors.ok&&last24Visitors.ok?'observed':'unavailable',definition:'First-touch buckets are calculated only from visitor IDs whose sessions have positive strict-human evidence.',today:todayVisitors.ok?firstTouchBuckets(todayVisitors.value):null,last24:last24Visitors.ok?firstTouchBuckets(last24Visitors.value):null,generatedAt:now.toISOString()},
    countries:countryRows.ok?{status:'observed',source:'Cloudflare request country on strict-human evidence',definition:'Country is the Cloudflare network-location country code associated only with strict verified human sessions. Raw IP addresses are not stored. VPNs or proxies can affect the reported country.',today:countryToday,last24:countryLast24,monthToDate:countryMonth,generatedAt:now.toISOString()}:{status:'unavailable',source:'Cloudflare request country',definition:'Country data is unavailable for this snapshot.',today:null,last24:null,monthToDate:null,reason:countryRows.error,generatedAt:now.toISOString()},
    engines:{distribution:distributionHealth,affiliate:affiliateHealth,audience:audienceHealth,content:contentHealth}
  };
}

function mergeAudit(data,audit){
  const d={...data,measurementAudit:audit};
  d.traffic={...(d.traffic||{}),...audit.sessions};
  d.trafficTrend=audit.trafficTrend;
  d.discoveryAttribution=audit.attribution;
  d.trafficCountries=audit.countries;
  d.verifiedOutboundByTool=audit.outboundByTool;
  d.canonicalCommercialTruth={...(d.canonicalCommercialTruth||{}),...audit.outbound,source:'D1 verified_outbound_events',trafficTruth:'first_party_verified_navigation'};
  d.affiliateCoverage={...(d.affiliateCoverage||{}),humanOutboundClicks:audit.outbound.humanOutbound,monetizedLikelyHumanClicks:audit.outbound.monetizedOutbound,unmonetizedLikelyHumanClicks:audit.outbound.unmonetizedOutbound,weightedCoverage:audit.outbound.weightedCoverage,trafficTruth:'first_party_verified_navigation'};
  d.trafficTruth={...(d.trafficTruth||{}),status:audit.sessions.status==='observed'?'observed':'degraded',version:'strict-human-v1',trackingSince:audit.strictTrackingSince,primaryMetric:'Strict verified human sessions plus first-party verified outbound navigation',d1:{...(d.trafficTruth?.d1||{}),status:audit.sessions.status,metric:'strict verified human sessions',last24:audit.sessions.last24,today:audit.sessions.today,monthToDate:audit.sessions.monthToDate,dailyAverageMTD:audit.sessions.dailyAverageMTD,projectedMonth:audit.sessions.projectedMonth,humanOutbound:audit.outbound.humanOutbound,monetizedOutbound:audit.outbound.monetizedOutbound,unmonetizedOutbound:audit.outbound.unmonetizedOutbound,weightedCoverage:audit.outbound.weightedCoverage,commercialTruth:'first_party_verified_navigation',countries:audit.countries}};
  d.growthOps={...(d.growthOps||{}),engines:{...(d.growthOps?.engines||{}),distribution:{...(d.growthOps?.engines?.distribution||{}),...audit.engines.distribution},affiliate:{...(d.growthOps?.engines?.affiliate||{}),...audit.engines.affiliate}},health:{...(d.growthOps?.health||{}),content:audit.engines.content,audience:audit.engines.audience,issues:[...((d.growthOps?.health?.issues)||[]),...audit.issues]}};
  d.resilientCommandCenter={...(d.resilientCommandCenter||{}),integrityLayer:'strict-human-v1',integrityStatus:audit.status,generatedAt:audit.generatedAt};
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
    if(request.method==='GET'&&(url.pathname==='/analytics/api/stats'||url.pathname==='/api/stats'||url.pathname==='/api/traffic-integrity-health')){
      try{await ensureOptimizationSchema(env);ctx.waitUntil(refreshDailyMetrics(env,2))}catch{}
    }
    const response=await base.fetch(request,env,ctx);
    if(request.method==='GET'&&(url.pathname==='/analytics/api/stats'||url.pathname==='/api/stats'))return augmentStats(response,env);
    if(request.method==='GET'&&url.pathname==='/api/traffic-integrity-health')return augmentHealth(response,env);
    return response;
  },
  async scheduled(event,env,ctx){
    if(typeof base.scheduled==='function')await base.scheduled(event,env,ctx);
    try{await refreshDailyMetrics(env,event?.cron==='15 3 * * *'?8:2)}catch{}
  }
};
