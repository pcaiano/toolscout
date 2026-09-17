import base from './outbound-integrity-worker.js';

const HEALTH_PATH='/api/traffic-integrity-health';
const TIME_ZONE='Europe/Lisbon';

function zonedParts(value,timeZone=TIME_ZONE){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(value instanceof Date?value:new Date(value));
  return Object.fromEntries(parts.filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
}
function offsetMs(value,timeZone=TIME_ZONE){const d=value instanceof Date?value:new Date(value),p=zonedParts(d,timeZone);return Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day),Number(p.hour),Number(p.minute),Number(p.second))-Math.floor(d.getTime()/1000)*1000}
function zonedMidnight(value=new Date(),timeZone=TIME_ZONE){const p=zonedParts(value,timeZone),localUtc=Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day),0,0,0);let guess=localUtc;for(let i=0;i<3;i++)guess=localUtc-offsetMs(new Date(guess),timeZone);return new Date(guess)}
function zonedMonthStart(value=new Date(),timeZone=TIME_ZONE){const p=zonedParts(value,timeZone),localUtc=Date.UTC(Number(p.year),Number(p.month)-1,1,0,0,0);let guess=localUtc;for(let i=0;i<3;i++)guess=localUtc-offsetMs(new Date(guess),timeZone);return new Date(guess)}
function sqliteUtc(date){return date.toISOString().replace('T',' ').slice(0,19)}
async function first(env,sql,bindings=[]){try{return await env.DB.prepare(sql).bind(...bindings).first()}catch(error){return {error:String(error?.message||error)}}}
async function all(env,sql,bindings=[]){try{return (await env.DB.prepare(sql).bind(...bindings).all()).results||[]}catch(error){return [{error:String(error?.message||error)}]}}

async function visitorAudit(env){
  const now=new Date(),today=sqliteUtc(zonedMidnight(now)),month=sqliteUtc(zonedMonthStart(now)),last24=sqliteUtc(new Date(now.getTime()-86400000));
  const [raw,confirmed,guard,linkage,rawMeta,confirmedMeta,rawTop,guardTop]=await Promise.all([
    first(env,`SELECT COUNT(*) eventsTotal,COUNT(DISTINCT visitor_id) visitorsTotal,COUNT(DISTINCT CASE WHEN created_at>=? THEN visitor_id END) visitors24h,COUNT(DISTINCT CASE WHEN created_at>=? THEN visitor_id END) visitorsToday,COUNT(DISTINCT CASE WHEN created_at>=? THEN visitor_id END) visitorsMonth,MAX(created_at) lastEventAt FROM visitor_events`,[last24,today,month]),
    first(env,`SELECT COUNT(*) eventsTotal,COUNT(DISTINCT visitor_id) visitorsTotal,COUNT(DISTINCT session_id) sessionsTotal,COUNT(DISTINCT CASE WHEN created_at>=? THEN visitor_id END) visitors24h,COUNT(DISTINCT CASE WHEN created_at>=? THEN visitor_id END) visitorsToday,COUNT(DISTINCT CASE WHEN created_at>=? THEN visitor_id END) visitorsMonth,COUNT(DISTINCT CASE WHEN created_at>=? THEN session_id END) sessions24h,COUNT(DISTINCT CASE WHEN created_at>=? THEN session_id END) sessionsToday,MAX(created_at) lastEventAt FROM confirmed_visitor_events`,[last24,today,month,last24,today]),
    first(env,`SELECT COUNT(DISTINCT CASE WHEN created_at>=? THEN session_id END) sessions24h,COUNT(DISTINCT CASE WHEN created_at>=? THEN session_id END) sessionsToday,COUNT(DISTINCT CASE WHEN created_at>=? THEN fingerprint END) fingerprints24h,COUNT(DISTINCT CASE WHEN created_at>=? THEN fingerprint END) fingerprintsToday,MAX(created_at) lastAllowedAt FROM traffic_guard_events WHERE decision='allowed'`,[last24,today,last24,today]),
    first(env,`SELECT COUNT(DISTINCT CASE WHEN g.created_at>=? THEN g.session_id END) guardSessions24h,COUNT(DISTINCT CASE WHEN g.created_at>=? AND c.session_id IS NOT NULL THEN g.session_id END) linkedSessions24h,COUNT(DISTINCT CASE WHEN g.created_at>=? THEN g.session_id END) guardSessionsToday,COUNT(DISTINCT CASE WHEN g.created_at>=? AND c.session_id IS NOT NULL THEN g.session_id END) linkedSessionsToday FROM traffic_guard_events g LEFT JOIN confirmed_visitor_events c ON c.session_id=g.session_id WHERE g.decision='allowed'`,[last24,last24,today,today]),
    first(env,`SELECT value trackingStartedAt FROM visitor_tracking_meta WHERE key='tracking_started_at' LIMIT 1`),
    first(env,`SELECT value trackingStartedAt FROM traffic_integrity_meta WHERE key='confirmed_tracking_started_at' LIMIT 1`),
    all(env,`SELECT COUNT(*) events FROM visitor_events WHERE created_at>=? GROUP BY visitor_id ORDER BY events DESC LIMIT 12`,[today]),
    all(env,`SELECT COUNT(DISTINCT session_id) sessions FROM traffic_guard_events WHERE decision='allowed' AND created_at>=? GROUP BY fingerprint ORDER BY sessions DESC LIMIT 12`,[today])
  ]);
  return {
    status:'observed',readOnly:true,generatedAt:now.toISOString(),timezone:TIME_ZONE,
    rawVisitorEvents:raw,
    confirmedVisitorEvents:confirmed,
    browserGuard:guard,
    guardToVisitorLinkage:linkage,
    tracking:{rawVisitorTrackingStartedAt:rawMeta?.trackingStartedAt||null,confirmedVisitorTrackingStartedAt:confirmedMeta?.trackingStartedAt||null},
    rawVisitorEventCountsToday:rawTop.map(x=>Number(x.events||0)),
    guardSessionCountsByFingerprintToday:guardTop.map(x=>Number(x.sessions||0)),
    interpretation:'If rawVisitorEvents and browserGuard are active while confirmedVisitorEvents/linkage are near zero, the unique visitor card is undercounting because its confirmation gate is stale or broken.'
  };
}

export default {
  async fetch(request,env,ctx){
    const response=await base.fetch(request,env,ctx);
    const url=new URL(request.url);
    if(request.method!=='GET'||url.pathname!==HEALTH_PATH||!response.ok)return response;
    let data;try{data=await response.json()}catch{return response}
    data.visitorAudit=await visitorAudit(env);
    return Response.json(data,{headers:{'Cache-Control':'no-store'}});
  },
  async scheduled(event,env,ctx){if(typeof base.scheduled==='function')return base.scheduled(event,env,ctx)}
};
