import base from './posthog-behavior-worker.js';
import { classifySessionRequest, SESSION_CLASSIFICATIONS } from './session-classification.js';

const BASE='https://trytoolscout.org';
const TIME_ZONE='Europe/Lisbon';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_SOURCE=/^[A-Za-z0-9][A-Za-z0-9._:&=/-]{0,99}$/;
const SAFE_HOST=/^(?=.{1,120}$)[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/;
const SAFE_PATH=/^\/[A-Za-z0-9._~!$&'()*+,;=:@%/?-]{0,199}$/;
const ANALYTICS_PATHS=new Set(['/analytics','/analytics/','/analytics.html','/analytics-v2','/analytics-v2/','/analytics-v2.html']);

function zonedDayKey(value,timeZone=TIME_ZONE){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(value instanceof Date?value:new Date(value));
  const map=Object.fromEntries(parts.filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  return `${map.year}-${map.month}-${map.day}`;
}
function parseSqliteUtc(value){
  const text=String(value||'').trim();
  if(!text)return null;
  const date=new Date(text.includes('T')?text:(text.replace(' ','T')+'Z'));
  return Number.isFinite(date.getTime())?date:null;
}
function isHtml(response){return (response.headers.get('content-type')||'').toLowerCase().includes('text/html')}

async function ensureVisitorSchema(env){
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS visitor_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      visitor_id TEXT NOT NULL,
      path TEXT,
      source TEXT NOT NULL DEFAULT 'direct',
      referrer_host TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_visitor_events_created_at ON visitor_events(created_at)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_visitor_events_visitor_id ON visitor_events(visitor_id)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS visitor_tracking_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`),
    env.DB.prepare(`INSERT OR IGNORE INTO visitor_tracking_meta (key,value) VALUES ('tracking_started_at',datetime('now'))`)
  ]);
}

function visitorHeaders(){
  return {'Content-Type':'application/json; charset=UTF-8','Cache-Control':'no-store','Access-Control-Allow-Origin':BASE,'Vary':'Origin'};
}

async function recordVisitor(request,env){
  const headers=visitorHeaders();
  const origin=request.headers.get('Origin')||'';
  if(origin&&origin!==BASE)return Response.json({ok:false,recorded:false,reason:'origin'},{status:403,headers});
  const fetchSite=(request.headers.get('Sec-Fetch-Site')||'').toLowerCase();
  if(fetchSite&&fetchSite!=='same-origin')return Response.json({ok:false,recorded:false,reason:'site'},{status:403,headers});
  const classification=classifySessionRequest(request);
  if(classification!==SESSION_CLASSIFICATIONS.LIKELY_HUMAN){
    return Response.json({ok:true,recorded:false,classification},{headers});
  }
  if(!(request.headers.get('Content-Type')||'').toLowerCase().startsWith('application/json')){
    return Response.json({ok:false,error:'unsupported_media_type'},{status:415,headers});
  }
  const length=Number(request.headers.get('Content-Length')||0);
  if(length>2048)return Response.json({ok:false,error:'payload_too_large'},{status:413,headers});
  let body;
  try{
    const raw=await request.text();
    if(raw.length>2048)return Response.json({ok:false,error:'payload_too_large'},{status:413,headers});
    body=JSON.parse(raw);
  }catch{return Response.json({ok:false,error:'invalid_json'},{status:400,headers})}
  const visitorId=String(body?.visitor_id||'');
  const path=String(body?.path||'/').slice(0,200);
  const source=String(body?.source||'direct').slice(0,100);
  const referrer=body?.referrer_host==null?null:String(body.referrer_host).toLowerCase().slice(0,120);
  if(!UUID.test(visitorId)||!SAFE_PATH.test(path)||!SAFE_SOURCE.test(source)||(referrer!==null&&!SAFE_HOST.test(referrer))){
    return Response.json({ok:false,error:'invalid_event'},{status:400,headers});
  }
  await ensureVisitorSchema(env);
  await env.DB.prepare(`INSERT INTO visitor_events (visitor_id,path,source,referrer_host,created_at) VALUES (?,?,?,?,datetime('now'))`).bind(visitorId,path,source,referrer).run();
  return Response.json({ok:true,recorded:true},{status:202,headers});
}

async function visitorSnapshot(env){
  await ensureVisitorSchema(env);
  const [events,startRow]=await Promise.all([
    env.DB.prepare(`SELECT visitor_id,created_at FROM visitor_events WHERE created_at >= datetime('now','-65 days') ORDER BY created_at ASC`).all(),
    env.DB.prepare(`SELECT value FROM visitor_tracking_meta WHERE key='tracking_started_at' LIMIT 1`).first()
  ]);
  const now=new Date();
  const nowMs=now.getTime();
  const todayKey=zonedDayKey(now);
  const monthPrefix=todayKey.slice(0,7);
  const last24Set=new Set(),todaySet=new Set(),monthSet=new Set(),allSet=new Set();
  const dailySets=new Map();
  for(const row of events?.results||[]){
    const at=parseSqliteUtc(row.created_at);
    const id=String(row.visitor_id||'');
    if(!at||!id)continue;
    allSet.add(id);
    const day=zonedDayKey(at);
    if(!dailySets.has(day))dailySets.set(day,new Set());
    dailySets.get(day).add(id);
    if(at.getTime()>=nowMs-86400000)last24Set.add(id);
    if(day===todayKey)todaySet.add(id);
    if(day.startsWith(monthPrefix))monthSet.add(id);
  }
  const trackingSince=parseSqliteUtc(startRow?.value);
  const trackingDay=trackingSince?zonedDayKey(trackingSince):todayKey;
  const last24Complete=Boolean(trackingSince&&trackingSince.getTime()<=nowMs-86400000);
  const todayComplete=Boolean(trackingSince&&trackingDay<todayKey);
  const monthToDateComplete=Boolean(trackingSince&&trackingDay.slice(0,7)<monthPrefix);
  const daily=[];
  const [y,m,d]=todayKey.split('-').map(Number);
  for(let offset=-59;offset<=0;offset++){
    const probe=new Date(Date.UTC(y,m-1,d+offset,12,0,0));
    const day=zonedDayKey(probe);
    daily.push({day,visitors:dailySets.get(day)?.size||0});
  }
  const dayOfMonth=Number(todayKey.slice(8,10))||1;
  const daysInMonth=new Date(Date.UTC(y,m,0)).getUTCDate();
  const dailyAverageMTD=monthToDateComplete?daily.filter(x=>x.day.startsWith(monthPrefix)).reduce((sum,x)=>sum+x.visitors,0)/dayOfMonth:null;
  const projectedMonth=dailyAverageMTD==null?null:Math.round(dailyAverageMTD*daysInMonth);
  return {
    status:'observed',
    metric:'unique anonymous browser visitors',
    definition:'One first-party anonymous browser identifier counted once per reporting window. Sessions remain a separate behavior metric.',
    timezone:TIME_ZONE,
    trackingSince:trackingSince?.toISOString()||null,
    last24:last24Set.size,
    today:todaySet.size,
    monthToDate:monthSet.size,
    sinceTracking:allSet.size,
    dailyAverageMTD,
    projectedMonth,
    coverage:{last24Complete,todayComplete,monthToDateComplete},
    daily
  };
}

function acquisitionScript(){
  return `<script data-toolscout-visitor-tracker="1">(function(){try{var key='toolscout_visitor_v1',ttl=45*24*60*60*1000,now=Date.now(),saved=null;try{saved=JSON.parse(localStorage.getItem(key)||'null')}catch(e){}var valid=saved&&typeof saved.id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(saved.id)&&now-Number(saved.lastSeen||0)<ttl;if(!valid&&!window.crypto?.randomUUID)return;var id=valid?saved.id:crypto.randomUUID();try{localStorage.setItem(key,JSON.stringify({id:id,lastSeen:now}))}catch(e){return}function clean(v,n){return String(v||'').replace(/[^A-Za-z0-9._:&=/-]/g,'').slice(0,n||100)}var source='direct',refHost=null;try{var q=new URLSearchParams(location.search),utm=['utm_source','utm_medium','utm_campaign'].map(function(k){var v=clean(q.get(k));return v?k+'='+v:''}).filter(Boolean).join('&');if(utm)source=clean(utm);else if(q.get('source'))source=clean(q.get('source'));else if(document.referrer){var u=new URL(document.referrer),h=u.hostname.replace(/^www\./,'');if(h&&h!==location.hostname){refHost=h.slice(0,120);source=clean('ref:'+h)}}}catch(e){}fetch('/api/visitor',{method:'POST',credentials:'same-origin',keepalive:true,headers:{'content-type':'application/json'},body:JSON.stringify({visitor_id:id,path:location.pathname.slice(0,200)||'/',source:source,referrer_host:refHost})}).catch(function(){})}catch(e){}})();</script>`;
}

async function decoratePublicPage(response){
  if(!response.ok||!isHtml(response))return response;
  let html=await response.text();
  if(!html.includes('data-toolscout-visitor-tracker="1"'))html=html.replace(/<\/body>/i,acquisitionScript()+'</body>');
  const headers=new Headers(response.headers);
  headers.delete('Content-Length');
  headers.delete('Content-Encoding');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

function accuracyDashboardScript(){
  return `<script data-toolscout-visitor-accuracy="1">(function(){function coverageText(v,key){var c=v.coverage||{},start=v.trackingSince?dt(v.trackingSince):'now';if(c[key])return 'Complete measurement window';return 'Partial window since '+start}function renderExactVisitors(d){var v=d?.visitors||{},f=d?.funnel||{},r=d?.revenue||{},c=d?.commercial||{},ac=d?.affiliateCoverage||{},tr=d?.tracking||{};var out=first(f.outboundClicks,c.totals&&c.totals.outbound)||0;var mon=first(c.totals&&c.totals.monetizedOutbound,c.monetizedOutbound,ac.monetizedLikelyHumanClicks);var completeMtd=!!v.coverage?.monthToDateComplete;var thirdLabel=completeMtd?'Unique visitors · MTD':'Unique visitors · since tracking';var thirdValue=completeMtd?v.monthToDate:v.sinceTracking;var thirdMeta=completeMtd?'Unique browsers this month':('Exact tracking began '+(v.trackingSince?dt(v.trackingSince):'now'));var root=document.getElementById('northstarBody');if(root)root.innerHTML='<div class="metricGrid">'+metric('Unique visitors · today',num(v.today||0),coverageText(v,'todayComplete'))+metric('Unique visitors · 24h',num(v.last24||0),coverageText(v,'last24Complete'))+metric(thirdLabel,num(thirdValue||0),thirdMeta)+metric('Browser sessions · 24h',num(first(tr.humanSessionsLast24Hours)||0),'Behavior sessions, not unique visitors')+metric('Human outbound',num(out),pct(f.sessionToOutboundCtr)+' session to outbound')+metric('Monetized outbound',mon==null?'Unavailable':num(mon),mon==null?'Unavailable, not zero':pct(out?mon/out*100:0)+' of human outbound')+metric('Confirmed revenue',r.confirmedRevenue==null?'Unknown':money(r.confirmedRevenue,r.currency),r.reportingStatus==='connected'?'Vendor evidence connected':'No confirmed vendor evidence')+metric('Visitor tracking',v.status==='observed'?'Exact ID count':'Unavailable',v.definition||'Anonymous first-party browser IDs')+'</div>';var truth=document.getElementById('trafficTruthBody');if(truth){var t=d?.trafficTruth||{},g=t.ga4||{},s=t.googleSearchConsole||{},d1=t.d1||{};var note=(v.coverage?.last24Complete&&v.coverage?.todayComplete)?'Unique visitor windows are fully covered. Browser sessions remain visible only as a behavioral diagnostic.':'Exact unique visitor tracking is active. Historical windows before '+(v.trackingSince?dt(v.trackingSince):'activation')+' are intentionally marked partial and are not reconstructed from session counts.';truth.innerHTML='<div class="metricGrid">'+metric('Unique visitors 24h',num(v.last24||0),coverageText(v,'last24Complete'))+metric('Unique visitors today',num(v.today||0),coverageText(v,'todayComplete'))+metric('Browser sessions 24h',num(first(tr.humanSessionsLast24Hours)||0),'Diagnostic only')+metric('GA4 sessions today',num(g.today?.sessions||0),g.consentBased?'Consent-based':'Analytics')+metric('GSC clicks 28d',num(s.clicks||0),(s.startDate||'')+' to '+(s.endDate||''))+metric('GSC impressions 28d',num(s.impressions||0),'Settled search data')+metric('Human outbound',num(d1.humanOutbound||out||0),'D1 operational')+metric('Monetized outbound',num(d1.monetizedOutbound||mon||0),'D1 operational')+'</div><div class="note" style="margin-top:10px">'+esc(note)+'</div>'}}var previous=window.render;if(typeof previous==='function')window.render=function(d){previous(d);renderExactVisitors(d)};try{if(typeof snapshot!=='undefined'&&snapshot)renderExactVisitors(snapshot)}catch(e){}})();</script>`;
}

async function decorateCommandCenter(response){
  if(!response.ok||!isHtml(response))return response;
  let html=await response.text();
  if(!html.includes('data-toolscout-visitor-accuracy="1"'))html=html.replace(/<\/body>/i,accuracyDashboardScript()+'</body>');
  html=html.replace('Human only</div>','Unique browser visitors</div>');
  const headers=new Headers(response.headers);
  headers.delete('Content-Length');
  headers.delete('Content-Encoding');
  headers.append('Set-Cookie','toolscout_owner=1; Max-Age=31536000; Path=/; SameSite=Lax; Secure');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

async function augmentStats(response,env){
  if(!response.ok)return response;
  let data;
  try{data=await response.json()}catch{return response}
  const visitors=await visitorSnapshot(env);
  data.visitors=visitors;
  if(data.trafficTruth){
    data.trafficTruth={...data.trafficTruth,primaryMetric:'D1 unique anonymous browser visitors'};
    data.trafficTruth.d1={...(data.trafficTruth.d1||{}),metric:'unique anonymous browser visitors',last24:visitors.last24,today:visitors.today,monthToDate:visitors.monthToDate,dailyAverageMTD:visitors.dailyAverageMTD,projectedMonth:visitors.projectedMonth,trackingSince:visitors.trackingSince,coverage:visitors.coverage};
    const reconciliation=data.trafficTruth.reconciliation||{};
    data.trafficTruth.reconciliation={...reconciliation,checks:(reconciliation.checks||[]).map(x=>x.id==='d1-primary'?{...x,label:'D1 visitor truth',detail:'Unique anonymous browser IDs are primary for visitor counts. Browser-confirmed sessions remain a separate behavior metric.'}:x)};
  }
  const headers=new Headers(response.headers);
  headers.set('Content-Type','application/json; charset=UTF-8');
  headers.set('Cache-Control','private, no-store');
  headers.delete('Content-Length');
  return new Response(JSON.stringify(data),{status:response.status,statusText:response.statusText,headers});
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname==='/api/visitor'&&request.method==='OPTIONS')return new Response(null,{status:204,headers:visitorHeaders()});
    if(url.pathname==='/api/visitor'&&request.method==='POST')return recordVisitor(request,env);
    const response=await base.fetch(request,env,ctx);
    if(url.pathname==='/analytics/api/stats'&&request.method==='GET')return augmentStats(response,env);
    if(ANALYTICS_PATHS.has(url.pathname))return decorateCommandCenter(response);
    if(url.hostname===new URL(BASE).hostname&&request.method==='GET'&&isHtml(response)){
      if(ctx?.waitUntil)ctx.waitUntil(ensureVisitorSchema(env));
      return decoratePublicPage(response);
    }
    return response;
  },
  async scheduled(event,env,ctx){
    if(typeof base.scheduled==='function')return base.scheduled(event,env,ctx);
  }
};
