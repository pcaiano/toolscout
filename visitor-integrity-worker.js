import base from './outbound-integrity-worker.js';

const ANALYTICS_PATHS=new Set(['/analytics','/analytics/','/analytics.html','/analytics-v2','/analytics-v2/','/analytics-v2.html']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TIME_ZONE='Europe/Lisbon';
const VISITOR_COOKIE='toolscout_visitor';
const VISITOR_MAX_AGE=45*24*60*60;
let schemaReady=null;

function isHtml(response){return (response.headers.get('content-type')||'').toLowerCase().includes('text/html')}
function cookieValue(request,name){
  const cookie=request.headers.get('Cookie')||'';
  const match=cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  if(!match)return null;
  try{return decodeURIComponent(match[1])}catch{return null}
}
function sessionId(request){const value=cookieValue(request,'toolscout_session');return value&&UUID.test(value)?value:null}
function visitorId(request){const value=cookieValue(request,VISITOR_COOKIE);return value&&UUID.test(value)?value:null}
function parseUtc(value){const text=String(value||'').trim();if(!text)return null;const d=new Date(text.includes('T')?text:(text.replace(' ','T')+'Z'));return Number.isFinite(d.getTime())?d:null}
function zonedParts(value,timeZone=TIME_ZONE){const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(value instanceof Date?value:new Date(value));return Object.fromEntries(parts.filter(x=>x.type!=='literal').map(x=>[x.type,x.value]))}
function dayKey(value,timeZone=TIME_ZONE){const p=zonedParts(value,timeZone);return `${p.year}-${p.month}-${p.day}`}
function offsetMs(value,timeZone=TIME_ZONE){const d=value instanceof Date?value:new Date(value),p=zonedParts(d,timeZone);return Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day),Number(p.hour),Number(p.minute),Number(p.second))-Math.floor(d.getTime()/1000)*1000}
function zonedMidnight(key,timeZone=TIME_ZONE){const [y,m,d]=String(key).split('-').map(Number),localUtc=Date.UTC(y,m-1,d,0,0,0);let guess=localUtc;for(let i=0;i<3;i++)guess=localUtc-offsetMs(new Date(guess),timeZone);return new Date(guess)}
function sqliteUtc(date){return date.toISOString().replace('T',' ').slice(0,19)}

async function ensureSchema(env){
  if(schemaReady)return schemaReady;
  schemaReady=(async()=>{
    await env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS confirmed_visitor_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        visitor_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        path TEXT,
        source TEXT NOT NULL DEFAULT 'direct',
        referrer_host TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(visitor_id,session_id)
      )`),
      env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_confirmed_visitor_events_created_at ON confirmed_visitor_events(created_at)`),
      env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_confirmed_visitor_events_visitor_id ON confirmed_visitor_events(visitor_id)`),
      env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_confirmed_visitor_events_session_id ON confirmed_visitor_events(session_id)`),
      env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_confirmed_visitor_events_created_session_visitor ON confirmed_visitor_events(created_at,session_id,visitor_id)`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS confirmed_visitor_countries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        visitor_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        country TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(visitor_id,session_id)
      )`),
      env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_confirmed_visitor_countries_created_at ON confirmed_visitor_countries(created_at)`),
      env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_confirmed_visitor_countries_country ON confirmed_visitor_countries(country)`),
      env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_confirmed_visitor_countries_session_country ON confirmed_visitor_countries(session_id,country)`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS traffic_integrity_meta (key TEXT PRIMARY KEY,value TEXT NOT NULL)`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS confirmed_visitor_registry (
        visitor_id TEXT PRIMARY KEY,
        first_seen_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL
      )`),
      env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_confirmed_visitor_registry_last_seen ON confirmed_visitor_registry(last_seen_at)`),
      env.DB.prepare(`INSERT OR IGNORE INTO traffic_integrity_meta(key,value) VALUES('visitor_guard_linking_started_at',datetime('now'))`),
      env.DB.prepare(`DELETE FROM confirmed_visitor_countries
        WHERE NOT EXISTS (
          SELECT 1
          FROM confirmed_visitor_events e
          WHERE e.session_id=confirmed_visitor_countries.session_id
            AND e.visitor_id=confirmed_visitor_countries.visitor_id
            AND e.id=(SELECT MIN(e2.id) FROM confirmed_visitor_events e2 WHERE e2.session_id=e.session_id)
        )`),
      env.DB.prepare(`DELETE FROM confirmed_visitor_events
        WHERE id NOT IN (SELECT MIN(id) FROM confirmed_visitor_events GROUP BY session_id)`),
      env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS uq_confirmed_visitor_events_session_id ON confirmed_visitor_events(session_id)`),
      env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS uq_confirmed_visitor_countries_session_id ON confirmed_visitor_countries(session_id)`),
      env.DB.prepare(`INSERT INTO traffic_integrity_meta(key,value) VALUES('session_identity_rule','one_session_one_visitor_first_valid_link_wins')
        ON CONFLICT(key) DO UPDATE SET value=excluded.value`)
    ]);
    const backfilled=await env.DB.prepare(`SELECT value FROM traffic_integrity_meta WHERE key='visitor_registry_backfilled_at' LIMIT 1`).first().catch(()=>null);
    if(!backfilled?.value){
      await env.DB.prepare(`INSERT OR IGNORE INTO confirmed_visitor_registry(visitor_id,first_seen_at,last_seen_at)
        SELECT visitor_id,MIN(created_at),MAX(created_at) FROM confirmed_visitor_events GROUP BY visitor_id`).run();
      await env.DB.prepare(`INSERT OR REPLACE INTO traffic_integrity_meta(key,value) VALUES('visitor_registry_backfilled_at',datetime('now'))`).run();
    }
  })().catch(error=>{schemaReady=null;throw error});
  return schemaReady;
}

async function guardAllowed(env,sid){
  if(!sid)return false;
  const row=await env.DB.prepare(`SELECT 1 ok FROM traffic_guard_events WHERE session_id=? AND decision='allowed' LIMIT 1`).bind(sid).first().catch(()=>null);
  return Boolean(row?.ok);
}

async function linkVisitor(env,{visitor,session,path='/',source='direct',referrerHost=null}){
  if(!UUID.test(String(visitor||''))||!UUID.test(String(session||'')))return false;
  if(!await guardAllowed(env,session))return false;
  await ensureSchema(env);
  const existing=await env.DB.prepare(`SELECT visitor_id FROM confirmed_visitor_events WHERE session_id=? ORDER BY id ASC LIMIT 1`).bind(session).first().catch(()=>null);
  if(existing?.visitor_id&&String(existing.visitor_id)!==String(visitor))return false;
  await env.DB.prepare(`INSERT OR IGNORE INTO confirmed_visitor_events(visitor_id,session_id,path,source,referrer_host,created_at) VALUES(?,?,?,?,?,datetime('now'))`)
    .bind(visitor,session,String(path||'/').slice(0,200),String(source||'direct').slice(0,100),referrerHost?String(referrerHost).slice(0,120):null).run();
  await env.DB.prepare(`INSERT INTO confirmed_visitor_registry(visitor_id,first_seen_at,last_seen_at) VALUES(?,datetime('now'),datetime('now'))
    ON CONFLICT(visitor_id) DO UPDATE SET last_seen_at=excluded.last_seen_at`).bind(visitor).run();
  const canonical=await env.DB.prepare(`SELECT visitor_id FROM confirmed_visitor_events WHERE session_id=? ORDER BY id ASC LIMIT 1`).bind(session).first().catch(()=>null);
  if(!canonical?.visitor_id||String(canonical.visitor_id)!==String(visitor))return false;
  const geo=await env.DB.prepare(`SELECT country FROM traffic_guard_events WHERE session_id=? AND decision='allowed' AND country IS NOT NULL AND country!='' ORDER BY created_at ASC LIMIT 1`).bind(session).first().catch(()=>null);
  const country=String(geo?.country||'').trim().toUpperCase();
  if(/^[A-Z]{2}$/.test(country)){
    await env.DB.prepare(`INSERT INTO confirmed_visitor_countries(visitor_id,session_id,country,created_at) VALUES(?,?,?,datetime('now')) ON CONFLICT(session_id) DO UPDATE SET country=excluded.country WHERE confirmed_visitor_countries.visitor_id=excluded.visitor_id`).bind(String(canonical.visitor_id),session,country).run();
    await env.DB.prepare(`INSERT OR IGNORE INTO traffic_integrity_meta(key,value) VALUES('country_tracking_started_at',datetime('now'))`).run();
  }
  return true;
}

async function eventContext(request){
  if(request.method!=='POST')return null;
  const type=(request.headers.get('Content-Type')||'').toLowerCase();
  if(!type.startsWith('application/json'))return null;
  try{
    const body=JSON.parse(await request.clone().text());
    if(body?.event_type!=='page_confirmed'||!UUID.test(String(body?.session_id||'')))return null;
    return {session:String(body.session_id),path:String(body.path||'/'),source:String(body.source||'direct'),referrerHost:body.referrer_host==null?null:String(body.referrer_host)};
  }catch{return null}
}

async function linkAfterRequest(request,env,url,response,event){
  const visitor=visitorId(request);
  if(!visitor)return;
  if(event){await linkVisitor(env,{visitor,...event});return}
  if(request.method==='GET'&&url.pathname.startsWith('/go/')&&response.status>=300&&response.status<400){
    const session=sessionId(request);if(!session)return;
    let path='/',referrerHost=null;
    const ref=request.headers.get('Referer')||request.headers.get('Referrer')||'';
    try{const r=new URL(ref);if(r.hostname===url.hostname){path=r.pathname||'/';referrerHost=r.hostname}}catch{}
    await linkVisitor(env,{visitor,session,path,source:'outbound-proof',referrerHost});
  }
}

async function sessionIdentityHealth(env){
  await ensureSchema(env);
  const [duplicates,orphanCountries]=await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) count FROM (SELECT session_id FROM confirmed_visitor_events GROUP BY session_id HAVING COUNT(*)>1)`).first(),
    env.DB.prepare(`SELECT COUNT(*) count FROM confirmed_visitor_countries c WHERE NOT EXISTS (SELECT 1 FROM confirmed_visitor_events e WHERE e.session_id=c.session_id AND e.visitor_id=c.visitor_id)`).first()
  ]);
  return Response.json({
    ok:Number(duplicates?.count||0)===0&&Number(orphanCountries?.count||0)===0,
    service:'toolscout-visitor-session-identity',
    version:1,
    rule:'one_session_one_visitor_first_valid_link_wins',
    duplicateSessionIds:Number(duplicates?.count||0),
    orphanCountryLinks:Number(orphanCountries?.count||0),
    repair:'preserve earliest valid visitor-session link and reject later conflicting visitor IDs'
  },{headers:{'Cache-Control':'no-store'}});
}

async function visitorSnapshot(env){
  await ensureSchema(env);
  const meta=await env.DB.prepare(`SELECT value FROM traffic_integrity_meta WHERE key='visitor_guard_linking_started_at' LIMIT 1`).first();
  const trackingSince=parseUtc(meta?.value)||new Date();
  const now=new Date(),todayKey=dayKey(now),monthPrefix=todayKey.slice(0,7),todayStart=sqliteUtc(zonedMidnight(todayKey)),monthStart=sqliteUtc(zonedMidnight(monthPrefix+'-01')),last24Start=sqliteUtc(new Date(now.getTime()-86400000)),scanStart=last24Start<monthStart?last24Start:monthStart;
  const trendStart=dayKey(new Date(now.getTime()-29*86400000));
  const [counts,registry,guard,dailyResult]=await Promise.all([
    env.DB.prepare(`SELECT
      COUNT(DISTINCT CASE WHEN created_at>=? THEN visitor_id END) visitors24,
      COUNT(DISTINCT CASE WHEN created_at>=? THEN visitor_id END) visitorsToday,
      COUNT(DISTINCT CASE WHEN created_at>=? THEN visitor_id END) visitorsMonth,
      COUNT(DISTINCT CASE WHEN created_at>=? THEN session_id END) linkedSessions24,
      COUNT(DISTINCT CASE WHEN created_at>=? THEN session_id END) linkedSessionsToday
      FROM confirmed_visitor_events
      WHERE created_at>=?`).bind(last24Start,todayStart,monthStart,last24Start,todayStart,scanStart).first(),
    env.DB.prepare(`SELECT COUNT(*) count FROM confirmed_visitor_registry`).first(),
    env.DB.prepare(`SELECT
      COUNT(DISTINCT CASE WHEN created_at>=? THEN session_id END) guardSessions24,
      COUNT(DISTINCT CASE WHEN created_at>=? THEN session_id END) guardSessionsToday
      FROM traffic_guard_events
      WHERE decision='allowed' AND created_at>=?`).bind(last24Start,todayStart,last24Start).first(),
    env.DB.prepare(`SELECT day,unique_visitors visitors FROM command_center_daily_metrics WHERE day>=? ORDER BY day ASC`).bind(trendStart).all().catch(()=>({results:[]}))
  ]);
  const trackingDay=dayKey(trackingSince),coverage={last24Complete:trackingSince.getTime()<=now.getTime()-86400000,todayComplete:trackingDay<todayKey,monthToDateComplete:trackingDay.slice(0,7)<monthPrefix};
  const dailyMap=new Map((dailyResult?.results||[]).map(row=>[String(row.day||''),Number(row.visitors||0)]));
  const daily=[];const p=zonedParts(now),y=Number(p.year),m=Number(p.month),d=Number(p.day);
  for(let offset=-29;offset<=0;offset++){const probe=new Date(Date.UTC(y,m-1,d+offset,12,0,0)),key=dayKey(probe);daily.push({day:key,visitors:key===todayKey?Number(counts?.visitorsToday||0):(dailyMap.has(key)?dailyMap.get(key):null)})}
  return {
    status:'observed',metric:'Browser Guard linked unique human visitors',
    definition:'One anonymous first-party browser ID counted once per reporting window only after its ToolScout session is accepted by Browser Guard. Owner, blocked automation, known bots and synthetic traffic are excluded.',
    canonicalPopulation:'traffic_guard_events decision=allowed linked to first-party visitor ID',timezone:TIME_ZONE,trackingSince:trackingSince.toISOString(),
    last24:Number(counts?.visitors24||0),today:Number(counts?.visitorsToday||0),monthToDate:Number(counts?.visitorsMonth||0),sinceTracking:Number(registry?.count||0),
    coverage,daily,dailyAverageMTD:null,projectedMonth:null,
    integrity:{guardSessionsLast24:Number(guard?.guardSessions24||0),linkedSessionsLast24:Number(counts?.linkedSessions24||0),guardSessionsToday:Number(guard?.guardSessionsToday||0),linkedSessionsToday:Number(counts?.linkedSessionsToday||0)}
  };
}
function mirrorVisitorCookieScript(){return `<script data-toolscout-visitor-cookie="1">(function(){try{var x=JSON.parse(localStorage.getItem('toolscout_visitor_v1')||'null'),id=x&&String(x.id||'');if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))return;document.cookie='${VISITOR_COOKIE}='+encodeURIComponent(id)+'; Max-Age=${VISITOR_MAX_AGE}; Path=/; SameSite=Lax; Secure'}catch(e){}})();</script>`}

async function decorate(response){
  if(!response.ok||!isHtml(response))return response;
  let html=await response.text();if(!html.includes('data-toolscout-visitor-cookie="1"'))html=html.replace(/<\/body>/i,mirrorVisitorCookieScript()+'</body>');
  const headers=new Headers(response.headers);headers.delete('Content-Length');headers.delete('Content-Encoding');return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

async function augmentStats(response,env){
  if(!response.ok)return response;let data;try{data=await response.json()}catch{return response}
  const visitors=await visitorSnapshot(env);data.visitors=visitors;
  data.trafficIntegrity={...(data.trafficIntegrity||{}),canonicalVisitorPopulation:visitors.canonicalPopulation,visitorTrackingSince:visitors.trackingSince,visitorLinkage:visitors.integrity};
  if(data.trafficTruth){data.trafficTruth={...data.trafficTruth,primaryVisitorMetric:visitors.metric};data.trafficTruth.d1={...(data.trafficTruth.d1||{}),uniqueVisitorsLast24:visitors.last24,uniqueVisitorsToday:visitors.today,uniqueVisitorsMonthToDate:visitors.monthToDate,visitorTrackingSince:visitors.trackingSince,visitorCoverage:visitors.coverage,visitorCanonicalPopulation:visitors.canonicalPopulation}}
  const headers=new Headers(response.headers);headers.set('Content-Type','application/json; charset=UTF-8');headers.set('Cache-Control','private, no-store');headers.delete('Content-Length');headers.delete('Content-Encoding');return new Response(JSON.stringify(data),{status:response.status,statusText:response.statusText,headers});
}

async function augmentHealth(response,env){
  if(!response.ok)return response;let data;try{data=await response.json()}catch{return response}
  const visitors=await visitorSnapshot(env);data.visitorIntegrity={status:'active',trackingSince:visitors.trackingSince,canonicalPopulation:visitors.canonicalPopulation,uniqueVisitorsToday:visitors.today,uniqueVisitorsLast24:visitors.last24,...visitors.integrity,coverage:visitors.coverage};
  return Response.json(data,{headers:{'Cache-Control':'no-store'}});
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url),event=url.pathname==='/api/events'?await eventContext(request):null;
    if(request.method==='GET'&&url.pathname==='/api/visitor-session-identity-health')return sessionIdentityHealth(env);
    let response=await base.fetch(request,env,ctx);
    try{await linkAfterRequest(request,env,url,response,event)}catch{}
    if(request.method==='GET'&&url.pathname==='/analytics/api/stats')response=await augmentStats(response,env);
    if(request.method==='GET'&&url.pathname==='/api/traffic-integrity-health')response=await augmentHealth(response,env);
    if(request.method==='GET'&&url.hostname==='trytoolscout.org'&&isHtml(response)&&!ANALYTICS_PATHS.has(url.pathname))return decorate(response);
    return response;
  },
  async scheduled(event,env,ctx){if(typeof base.scheduled==='function')return base.scheduled(event,env,ctx)}
};
