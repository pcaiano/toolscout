import base from './command-center-human-truth-chart-worker.js';
import { classifySessionRequest, SESSION_CLASSIFICATIONS } from './session-classification.js';

const BASE='https://trytoolscout.org';
const TIME_ZONE='Europe/Lisbon';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_SOURCE=/^[A-Za-z0-9][A-Za-z0-9._:&=/-]{0,99}$/;
const SAFE_HOST=/^(?=.{1,120}$)[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/;
const SAFE_PATH=/^\/[A-Za-z0-9._~!$&'()*+,;=:@%/?-]{0,199}$/;
const ANALYTICS_PATHS=new Set(['/analytics','/analytics/','/analytics.html','/analytics-v2','/analytics-v2/','/analytics-v2.html']);

function isHtml(response){return (response.headers.get('content-type')||'').toLowerCase().includes('text/html')}
function parseSqliteUtc(value){
  const text=String(value||'').trim();
  if(!text)return null;
  const d=new Date(text.includes('T')?text:(text.replace(' ','T')+'Z'));
  return Number.isFinite(d.getTime())?d:null;
}
function zonedDayKey(value,timeZone=TIME_ZONE){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(value instanceof Date?value:new Date(value));
  const out=Object.fromEntries(parts.filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  return `${out.year}-${out.month}-${out.day}`;
}
function minutesOld(value,now=Date.now()){
  const d=parseSqliteUtc(value);
  return d?Math.max(0,(now-d.getTime())/60000):null;
}

async function ensureIntegritySchema(env){
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
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS traffic_integrity_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`),
    env.DB.prepare(`INSERT OR IGNORE INTO traffic_integrity_meta (key,value) VALUES ('confirmed_tracking_started_at',datetime('now'))`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS traffic_integrity_heartbeat (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_traffic_integrity_heartbeat_created_at ON traffic_integrity_heartbeat(created_at)`)
  ]);
}

function jsonHeaders(){return {'Content-Type':'application/json; charset=UTF-8','Cache-Control':'no-store','Access-Control-Allow-Origin':BASE,'Vary':'Origin'}}

async function recordConfirmedVisitor(request,env){
  const headers=jsonHeaders();
  const origin=request.headers.get('Origin')||'';
  if(origin&&origin!==BASE)return Response.json({ok:false,recorded:false,reason:'origin'},{status:403,headers});
  const fetchSite=(request.headers.get('Sec-Fetch-Site')||'').toLowerCase();
  if(fetchSite&&fetchSite!=='same-origin')return Response.json({ok:false,recorded:false,reason:'site'},{status:403,headers});
  const classification=classifySessionRequest(request);
  if(classification!==SESSION_CLASSIFICATIONS.LIKELY_HUMAN)return Response.json({ok:true,recorded:false,classification},{headers});
  if(!(request.headers.get('Content-Type')||'').toLowerCase().startsWith('application/json'))return Response.json({ok:false,error:'unsupported_media_type'},{status:415,headers});
  let body;
  try{
    const raw=await request.text();
    if(raw.length>2048)return Response.json({ok:false,error:'payload_too_large'},{status:413,headers});
    body=JSON.parse(raw);
  }catch{return Response.json({ok:false,error:'invalid_json'},{status:400,headers})}
  const visitorId=String(body?.visitor_id||'');
  const sessionId=String(body?.session_id||'');
  const path=String(body?.path||'/').slice(0,200);
  const source=String(body?.source||'direct').slice(0,100);
  const referrer=body?.referrer_host==null?null:String(body.referrer_host).toLowerCase().slice(0,120);
  if(!UUID.test(visitorId)||!UUID.test(sessionId)||!SAFE_PATH.test(path)||!SAFE_SOURCE.test(source)||(referrer!==null&&!SAFE_HOST.test(referrer)))return Response.json({ok:false,error:'invalid_event'},{status:400,headers});
  await ensureIntegritySchema(env);
  const confirmed=await env.DB.prepare(`SELECT 1 ok FROM funnel_events f JOIN sessions s ON s.session_id=f.session_id WHERE f.session_id=? AND f.event_type='page_confirmed' AND s.classification IN ('likely-human','human') LIMIT 1`).bind(sessionId).first();
  if(!confirmed?.ok)return Response.json({ok:true,recorded:false,reason:'page_not_confirmed_yet'},{status:409,headers});
  await env.DB.prepare(`INSERT OR IGNORE INTO confirmed_visitor_events (visitor_id,session_id,path,source,referrer_host,created_at) VALUES (?,?,?,?,?,datetime('now'))`).bind(visitorId,sessionId,path,source,referrer).run();
  const countryRaw=String(request.cf?.country||'').trim().toUpperCase();
  const country=/^[A-Z]{2}$/.test(countryRaw)?countryRaw:null;
  if(country){
    await env.DB.prepare(`INSERT INTO confirmed_visitor_countries (visitor_id,session_id,country,created_at) VALUES (?,?,?,datetime('now')) ON CONFLICT(visitor_id,session_id) DO UPDATE SET country=excluded.country`).bind(visitorId,sessionId,country).run();
    await env.DB.prepare(`INSERT OR IGNORE INTO traffic_integrity_meta (key,value) VALUES ('country_tracking_started_at',datetime('now'))`).run();
  }
  return Response.json({ok:true,recorded:true,canonical:'d1-browser-confirmed',countryRecorded:Boolean(country)},{status:202,headers});
}

async function confirmedVisitorSnapshot(env){
  await ensureIntegritySchema(env);
  const [events,startRow]=await Promise.all([
    env.DB.prepare(`SELECT visitor_id,created_at FROM confirmed_visitor_events WHERE created_at>=datetime('now','-65 days') ORDER BY created_at ASC`).all(),
    env.DB.prepare(`SELECT value FROM traffic_integrity_meta WHERE key='confirmed_tracking_started_at' LIMIT 1`).first()
  ]);
  const now=new Date(),nowMs=now.getTime(),todayKey=zonedDayKey(now),monthPrefix=todayKey.slice(0,7);
  const last24=new Set(),today=new Set(),month=new Set(),all=new Set(),dailySets=new Map();
  for(const row of events?.results||[]){
    const at=parseSqliteUtc(row.created_at),id=String(row.visitor_id||'');
    if(!at||!id)continue;
    all.add(id);
    const day=zonedDayKey(at);
    if(!dailySets.has(day))dailySets.set(day,new Set());
    dailySets.get(day).add(id);
    if(at.getTime()>=nowMs-86400000)last24.add(id);
    if(day===todayKey)today.add(id);
    if(day.startsWith(monthPrefix))month.add(id);
  }
  const trackingSince=parseSqliteUtc(startRow?.value),trackingDay=trackingSince?zonedDayKey(trackingSince):todayKey;
  const coverage={
    last24Complete:Boolean(trackingSince&&trackingSince.getTime()<=nowMs-86400000),
    todayComplete:Boolean(trackingSince&&trackingDay<todayKey),
    monthToDateComplete:Boolean(trackingSince&&trackingDay.slice(0,7)<monthPrefix)
  };
  const daily=[],parts=todayKey.split('-').map(Number),y=parts[0],m=parts[1],d=parts[2];
  for(let offset=-59;offset<=0;offset++){
    const probe=new Date(Date.UTC(y,m-1,d+offset,12,0,0)),day=zonedDayKey(probe);
    daily.push({day,visitors:dailySets.get(day)?.size||0});
  }
  const dayOfMonth=Number(todayKey.slice(8,10))||1,daysInMonth=new Date(Date.UTC(y,m,0)).getUTCDate();
  const dailyAverageMTD=coverage.monthToDateComplete?daily.filter(x=>x.day.startsWith(monthPrefix)).reduce((sum,x)=>sum+x.visitors,0)/dayOfMonth:null;
  return {
    status:'observed',
    metric:'browser-confirmed unique likely-human visitors',
    definition:'One anonymous first-party browser ID counted once per reporting window only after the same D1 session has a page_confirmed event and is classified likely-human. Owner, known bots, synthetic traffic and unknown sessions are excluded.',
    canonicalPopulation:'D1 page_confirmed + likely-human session',
    timezone:TIME_ZONE,
    trackingSince:trackingSince?.toISOString()||null,
    last24:last24.size,
    today:today.size,
    monthToDate:month.size,
    sinceTracking:all.size,
    dailyAverageMTD,
    projectedMonth:dailyAverageMTD==null?null:Math.round(dailyAverageMTD*daysInMonth),
    coverage,
    daily
  };
}

async function trafficHealth(env){
  await ensureIntegritySchema(env);
  const [confirmed,heartbeat]=await Promise.all([
    env.DB.prepare(`SELECT MAX(f.created_at) last_confirmed_at,COUNT(DISTINCT CASE WHEN f.created_at>=datetime('now','-24 hours') THEN f.session_id END) sessions_24h FROM funnel_events f JOIN sessions s ON s.session_id=f.session_id WHERE f.event_type='page_confirmed' AND s.classification IN ('likely-human','human')`).first(),
    env.DB.prepare(`SELECT MAX(created_at) last_heartbeat_at FROM traffic_integrity_heartbeat`).first()
  ]);
  const now=Date.now(),humanAge=minutesOld(confirmed?.last_confirmed_at,now),heartbeatAge=minutesOld(heartbeat?.last_heartbeat_at,now);
  let status='healthy';
  if(heartbeatAge===null||heartbeatAge>95)status='warning';
  const trafficState=humanAge===null?'no_confirmed_traffic_yet':humanAge<=120?'active':'quiet';
  return {
    status,
    source:'D1 + Cloudflare Worker cron',
    canonical:'page_confirmed likely-human sessions',
    sessions24h:Number(confirmed?.sessions_24h||0),
    lastPageConfirmedAt:confirmed?.last_confirmed_at||null,
    lastPageConfirmedAgeMinutes:humanAge,
    trafficState,
    lastWorkerHeartbeatAt:heartbeat?.last_heartbeat_at||null,
    workerHeartbeatAgeMinutes:heartbeatAge,
    githubActionsRequired:false,
    note:status==='healthy'&&trafficState==='quiet'?'Worker/D1 heartbeat is healthy; no browser-confirmed human session has arrived in the last two hours.':status==='healthy'?'Worker/D1 heartbeat is healthy and browser-confirmed human traffic is being observed.':'Worker traffic-integrity heartbeat is stale or unavailable; inspect Cloudflare Worker scheduling and D1.'
  };
}

async function augmentStats(response,env){
  if(!response.ok)return response;
  let data;
  try{data=await response.json()}catch{return response}
  const [visitors,health]=await Promise.all([confirmedVisitorSnapshot(env),trafficHealth(env)]);
  data.visitors=visitors;
  data.trafficIntegrity={...(data.trafficIntegrity||{}),canonicalHumanPopulation:'D1 page_confirmed + likely-human',visitorMetric:'browser-confirmed unique likely-human visitors',d1Ingestion:health};
  if(data.trafficTruth){
    data.trafficTruth={...data.trafficTruth,primaryMetric:'D1 browser-confirmed unique likely-human visitors'};
    data.trafficTruth.d1={...(data.trafficTruth.d1||{}),metric:visitors.metric,last24:visitors.last24,today:visitors.today,monthToDate:visitors.monthToDate,dailyAverageMTD:visitors.dailyAverageMTD,projectedMonth:visitors.projectedMonth,trackingSince:visitors.trackingSince,coverage:visitors.coverage,canonicalPopulation:visitors.canonicalPopulation};
    const rec=data.trafficTruth.reconciliation||{};
    data.trafficTruth.reconciliation={...rec,checks:[...(rec.checks||[]).filter(x=>x.id!=='d1-primary'&&x.id!=='d1-ingestion'),{id:'d1-primary',state:'healthy',label:'D1 canonical human truth',detail:'Visitor counts require both a likely-human D1 session and page_confirmed browser evidence.'},{id:'d1-ingestion',state:health.status,label:'D1 live ingestion',detail:health.note}]};
  }
  const headers=new Headers(response.headers);
  headers.set('Content-Type','application/json; charset=UTF-8');
  headers.set('Cache-Control','private, no-store');
  headers.delete('Content-Length');
  return new Response(JSON.stringify(data),{status:response.status,statusText:response.statusText,headers});
}

function confirmedVisitorClientScript(){
  return `<script data-toolscout-confirmed-visitor="1">(function(){try{if(window.__toolscoutConfirmedVisitor)return;window.__toolscoutConfirmedVisitor=true;var uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;function clean(v,n){return String(v||'').replace(/[^A-Za-z0-9._:&=/-]/g,'').slice(0,n||100)}function payload(){var v=null,s=null;try{v=JSON.parse(localStorage.getItem('toolscout_visitor_v1')||'null');s=JSON.parse(localStorage.getItem('toolscout_session_v2')||'null')}catch(e){}if(!v||!s||!uuid.test(String(v.id||''))||!uuid.test(String(s.id||'')))return null;var source='direct',refHost=null;try{var q=new URLSearchParams(location.search),utm=['utm_source','utm_medium','utm_campaign'].map(function(k){var x=clean(q.get(k));return x?k+'='+x:''}).filter(Boolean).join('&');if(utm)source=clean(utm);else if(q.get('source'))source=clean(q.get('source'));else if(document.referrer){var u=new URL(document.referrer),h=u.hostname.replace(/^www\\./,'');if(h&&h!==location.hostname){refHost=h.slice(0,120);source=clean('ref:'+h)}}}catch(e){}return {visitor_id:v.id,session_id:s.id,path:location.pathname.slice(0,200)||'/',source:source,referrer_host:refHost}}function attempt(n){var p=payload();if(!p){if(n<5)setTimeout(function(){attempt(n+1)},150*(n+1));return}fetch('/api/confirmed-visitor',{method:'POST',credentials:'same-origin',keepalive:true,headers:{'content-type':'application/json'},body:JSON.stringify(p)}).then(function(r){if(r.status===409&&n<5)setTimeout(function(){attempt(n+1)},180*(n+1))}).catch(function(){if(n<5)setTimeout(function(){attempt(n+1)},220*(n+1))})}function start(){if(document.visibilityState==='visible')setTimeout(function(){attempt(0)},120);else document.addEventListener('visibilitychange',function onv(){if(document.visibilityState==='visible'){document.removeEventListener('visibilitychange',onv);setTimeout(function(){attempt(0)},120)}})}if(document.prerendering)document.addEventListener('prerenderingchange',start,{once:true});else start()}catch(e){}})();</script>`;
}

function dashboardIntegrityScript(){
  return `<script data-toolscout-traffic-integrity-ui="1">(function(){if(window.__toolscoutTrafficIntegrityUi)return;window.__toolscoutTrafficIntegrityUi=true;function render(d){var h=d&&d.trafficIntegrity&&d.trafficIntegrity.d1Ingestion;if(!h)return;var root=document.getElementById('healthBody');if(!root)return;var old=document.getElementById('trafficIntegrityRow');if(old)old.remove();var div=document.createElement('div');div.id='trafficIntegrityRow';div.className='row';var age=h.lastPageConfirmedAgeMinutes==null?'No confirmed session yet':Math.round(h.lastPageConfirmedAgeMinutes)+' min since last confirmed human session';var heartbeat=h.workerHeartbeatAgeMinutes==null?'Worker heartbeat unavailable':Math.round(h.workerHeartbeatAgeMinutes)+' min since Worker heartbeat';div.innerHTML='<div><div class="rowName">D1 traffic integrity</div><div class="rowMeta">'+age+' · '+heartbeat+' · GitHub Actions not required</div></div><div class="rowValue">'+String(h.status==='healthy'?(h.trafficState==='quiet'?'Healthy · quiet':'Healthy'):'Warning')+'</div>';root.prepend(div)}var previous=window.render;if(typeof previous==='function')window.render=function(d){var out=previous(d);setTimeout(function(){render(d)},20);return out};try{if(typeof snapshot!=='undefined'&&snapshot)setTimeout(function(){render(snapshot)},50)}catch(e){}})();</script>`;
}

async function decorateHtml(response,isAnalytics){
  if(!response.ok||!isHtml(response))return response;
  let html=await response.text();
  if(!isAnalytics&&!html.includes('data-toolscout-confirmed-visitor="1"'))html=html.replace(/<\/body>/i,confirmedVisitorClientScript()+'</body>');
  if(isAnalytics&&!html.includes('data-toolscout-traffic-integrity-ui="1"'))html=html.replace(/<\/body>/i,dashboardIntegrityScript()+'</body>');
  const headers=new Headers(response.headers);
  headers.delete('Content-Length');headers.delete('Content-Encoding');
  headers.set('Cache-Control',isAnalytics?'private, no-store, max-age=0':headers.get('Cache-Control')||'public, max-age=0, must-revalidate');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname==='/api/confirmed-visitor'&&request.method==='OPTIONS')return new Response(null,{status:204,headers:jsonHeaders()});
    if(url.pathname==='/api/confirmed-visitor'&&request.method==='POST')return recordConfirmedVisitor(request,env);
    if(url.pathname==='/api/traffic-integrity-health'&&request.method==='GET')return Response.json(await trafficHealth(env),{headers:{'Cache-Control':'no-store'}});
    const response=await base.fetch(request,env,ctx);
    if(url.pathname==='/analytics/api/stats'&&request.method==='GET')return augmentStats(response,env);
    if(request.method==='GET'&&ANALYTICS_PATHS.has(url.pathname))return decorateHtml(response,true);
    if(request.method==='GET'&&url.hostname===new URL(BASE).hostname&&isHtml(response))return decorateHtml(response,false);
    return response;
  },
  async scheduled(event,env,ctx){
    await ensureIntegritySchema(env);
    await env.DB.prepare(`INSERT INTO traffic_integrity_heartbeat (created_at) VALUES (datetime('now'))`).run();
    await env.DB.prepare(`DELETE FROM traffic_integrity_heartbeat WHERE created_at<datetime('now','-14 days')`).run();
    if(typeof base.scheduled==='function')return base.scheduled(event,env,ctx);
  }
};
