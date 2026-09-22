import base from './ga4-attribution-24h-worker.js';
import {googleAnalyticsOAuthStatus,googleAnalyticsOAuthAccess} from './google-analytics-oauth.js';

const JSON_H={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'private, no-store'};
const GA_DATA_ORIGIN='https://analyticsdata.googleapis.com';
const BUSINESS_TIME_ZONE='Europe/Lisbon';
const COMMAND_CENTER_SESSION_COOKIE='toolscout_cc';
const COMMAND_CENTER_SESSION_TTL_SECONDS=86400;
const OWNER_COOKIE='toolscout_owner';
const OWNER_SINCE_COOKIE='toolscout_owner_since';
const OWNER_SOURCE='toolscout_owner';
const OWNER_MEDIUM='internal';
const OWNER_COOKIE_TTL_SECONDS=31536000;
const CLEAN_WINDOW_HOURS=24;

function n(value){const x=Number(value);return Number.isFinite(x)?x:0}
async function digestHex(value){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('')}
function sessionBucket(now=Date.now()){return Math.floor(now/(COMMAND_CENTER_SESSION_TTL_SECONDS*1000))}
async function sessionValue(secret,bucket){return digestHex(`toolscout-command-center:${secret}:${bucket}`)}
function cookieValue(request,name){const raw=String(request?.headers?.get('Cookie')||'');const match=raw.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));return match?decodeURIComponent(match[1]):''}
async function validCommandCenterSession(request,env){
  if(!env.ADMIN_TOKEN)return false;
  const supplied=cookieValue(request,COMMAND_CENTER_SESSION_COOKIE);if(!supplied)return false;
  const bucket=sessionBucket();
  for(const candidate of [bucket,bucket-1])if(supplied===await sessionValue(env.ADMIN_TOKEN,candidate))return true;
  return false;
}
function ownerSinceMs(request){const raw=Number(cookieValue(request,OWNER_SINCE_COOKIE));return Number.isFinite(raw)&&raw>0?raw:null}
function markerState(request,now=Date.now()){
  const marked=cookieValue(request,OWNER_COOKIE)==='1',since=ownerSinceMs(request);
  const coverageHours=marked&&since?Math.max(0,Math.min(CLEAN_WINDOW_HOURS,(now-since)/3600000)):0;
  const ready=marked&&Boolean(since)&&coverageHours>=CLEAN_WINDOW_HOURS;
  return {marked,since,coverageHours:Number(coverageHours.toFixed(2)),ready,warmupRemainingHours:Number(Math.max(0,CLEAN_WINDOW_HOURS-coverageHours).toFixed(2)),scope:'this_browser'};
}
function withOwnerMarker(response,request){
  const headers=new Headers(response.headers);
  headers.append('Set-Cookie',`${OWNER_COOKIE}=1; Path=/; Max-Age=${OWNER_COOKIE_TTL_SECONDS}; SameSite=Lax; Secure`);
  if(!ownerSinceMs(request))headers.append('Set-Cookie',`${OWNER_SINCE_COOKIE}=${Date.now()}; Path=/; Max-Age=${OWNER_COOKIE_TTL_SECONDS}; SameSite=Lax; Secure`);
  headers.delete('Content-Length');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
function zoneParts(date=new Date(),timeZone=BUSINESS_TIME_ZONE){
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);
  const map={};for(const part of parts)if(part.type!=='literal')map[part.type]=part.value;
  return {year:Number(map.year),month:Number(map.month),day:Number(map.day),hour:Number(map.hour),minute:Number(map.minute)};
}
function ymd(parts){return `${parts.year}-${String(parts.month).padStart(2,'0')}-${String(parts.day).padStart(2,'0')}`}
function compactMinute(date){const p=zoneParts(date);return `${p.year}${String(p.month).padStart(2,'0')}${String(p.day).padStart(2,'0')}${String(p.hour).padStart(2,'0')}${String(p.minute).padStart(2,'0')}`}
async function googleJson(url,token,init={}){
  const headers=new Headers(init.headers||{});headers.set('Authorization',`Bearer ${token}`);if(init.body)headers.set('Content-Type','application/json');
  const response=await fetch(url,{...init,headers});const body=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(`google_api_${response.status}:${body?.error?.message||'request_failed'}`);
  return body;
}
async function runReport(propertyId,token,body){return googleJson(`${GA_DATA_ORIGIN}/v1beta/properties/${propertyId}:runReport`,token,{method:'POST',body:JSON.stringify(body)})}
function insideWindow(row,cutoff,current){const key=String(row.dimensionValues?.[0]?.value||'');return key>=cutoff&&key<=current}
function add(map,key,sessions,engaged,extra={}){
  const prior=map.get(key)||{key,sessions:0,engagedSessions:0,...extra};prior.sessions+=sessions;prior.engagedSessions+=engaged;map.set(key,prior);
}
function ranked(map,limit=10){return [...map.values()].map(row=>({...row,engagementRate:row.sessions?Number((row.engagedSessions/row.sessions*100).toFixed(1)):0})).sort((a,b)=>b.sessions-a.sessions||b.engagedSessions-a.engagedSessions).slice(0,limit)}

async function externalAcquisition24h(env,request){
  const oauth=await googleAnalyticsOAuthStatus(env,request),marker=markerState(request);
  if(!oauth.connected)return {status:'unavailable',reason:'Google Analytics is not connected.',oauth,marker,fetchedAt:new Date().toISOString()};
  try{
    const access=await googleAnalyticsOAuthAccess(env,request);if(!access?.token||!access?.propertyId)throw new Error('google_oauth_connection_unavailable');
    const now=new Date(),cutoff=compactMinute(new Date(now.getTime()-24*3600000)),current=compactMinute(now),today=ymd(zoneParts(now)),yesterday=ymd(zoneParts(new Date(now.getTime()-36*3600000));
    const report=await runReport(access.propertyId,access.token,{dateRanges:[{startDate:yesterday,endDate:today}],dimensions:[{name:'dateHourMinute'},{name:'sessionSource'},{name:'sessionMedium'},{name:'sessionDefaultChannelGroup'},{name:'landingPagePlusQueryString'},{name:'country'}],metrics:[{name:'sessions'},{name:'engagedSessions'}],limit:'100000'});
    let sessions=0,engagedSessions=0,ownerSessions=0,ownerEngagedSessions=0;
    const externalSources=new Map(),externalLandings=new Map(),externalCountries=new Map();
    for(const row of report.rows||[]){
      if(!insideWindow(row,cutoff,current))continue;
      const source=row.dimensionValues?.[1]?.value||'(not set)',medium=row.dimensionValues?.[2]?.value||'(not set)',channel=row.dimensionValues?.[3]?.value||'(not set)',landingPage=row.dimensionValues?.[4]?.value||'(not set)',country=row.dimensionValues?.[5]?.value||'(not set)',s=n(row.metricValues?.[0]?.value),e=n(row.metricValues?.[1]?.value),owner=source===OWNER_SOURCE&&medium===OWNER_MEDIUM;
      sessions+=s;engagedSessions+=e;
      if(owner){ownerSessions+=s;ownerEngagedSessions+=e;continue;}
      add(externalSources,`${source} / ${medium}`,s,e,{source,medium,channel});
      add(externalLandings,landingPage,s,e,{landingPage});
      add(externalCountries,country,s,e,{country});
    }
    const candidateSessions=Math.max(0,sessions-ownerSessions),candidateEngagedSessions=Math.max(0,engagedSessions-ownerEngagedSessions),ready=marker.ready;
    const sources=ranked(externalSources),landingPages=ranked(externalLandings),countries=ranked(externalCountries);
    return {
      status:'connected',propertyId:access.propertyId,window:'rolling_24h',marker,
      total:{sessions,engagedSessions,engagementRate:sessions?Number((engagedSessions/sessions*100).toFixed(1)):0},
      owner:{sessions:ownerSessions,engagedSessions:ownerEngagedSessions,source:OWNER_SOURCE,medium:OWNER_MEDIUM},
      external:{status:ready?'ready':'warming_up',sessions:ready?candidateSessions:null,engagedSessions:ready?candidateEngagedSessions:null,engagementRate:ready&&candidateSessions?Number((candidateEngagedSessions/candidateSessions*100).toFixed(1)):ready?0:null,candidateSessions,candidateEngagedSessions,sources,landingPages,countries},
      growthSignal:{status:ready?'ready':'warming_up',metric:'ga4_external_sessions_24h',learningAllowed:ready,sessions:ready?candidateSessions:null,engagedSessions:ready?candidateEngagedSessions:null,sources:ready?sources:[],reason:ready?'Owner-marked GA4 traffic is excluded from a full rolling 24h window.':'Owner exclusion is warming up. Do not promote or penalize acquisition channels from this window yet.'},
      fetchedAt:new Date().toISOString(),
      note:ready?'GA4 external sessions exclude sessions explicitly marked toolscout_owner / internal. Geography is not used for exclusion.':'Historical sessions before the owner marker cannot be classified retroactively. The external metric becomes operational after 24 hours of marker coverage. Geography is never used as an exclusion rule.'
    };
  }catch(error){return {status:'unavailable',reason:String(error?.message||error),oauth,marker,fetchedAt:new Date().toISOString()}}
}

function externalWidget(){return `<section class="widget" data-widget="ga4-external-truth" style="--w:12;--h:5"><div class="widgetHead"><div><div class="widgetKicker">GA4 owner exclusion</div><div class="widgetTitle">External Acquisition Truth</div></div><div class="widgetMeta" id="ga4ExternalMeta">Separating owner from external traffic</div></div><div class="widgetBody" id="ga4ExternalBody"><div class="empty">Loading owner-safe GA4 acquisition...</div></div><div class="resizeHandle"></div></section>`}
function externalScript(){return `<script data-ga4-external-truth="v1">(function(){
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m])),num=v=>Number(v||0).toLocaleString(),pc=v=>v==null?'Warming up':Number(v||0).toFixed(1)+'%';
function metric(label,value,meta){return '<div class="metric"><small>'+esc(label)+'</small><b>'+esc(value)+'</b><span>'+esc(meta||'')+'</span></div>'}
function row(name,value,meta){return '<div class="row"><div><div class="rowName">'+esc(name)+'</div>'+(meta?'<div class="rowMeta">'+esc(meta)+'</div>':'')+'</div><div class="rowValue">'+esc(value)+'</div></div>'}
function sourceRows(rows,title){if(!rows||!rows.length)return '';return '<div style="margin-top:12px"><div class="widgetKicker" style="margin-bottom:6px">'+esc(title)+'</div>'+rows.slice(0,8).map(x=>row(x.source+' / '+x.medium,num(x.sessions)+' sessions',(x.channel||'')+' · '+num(x.engagedSessions)+' engaged · '+pc(x.engagementRate))).join('')+'</div>'}
async function load(){const root=document.getElementById('ga4ExternalBody'),meta=document.getElementById('ga4ExternalMeta');if(!root)return;try{const r=await fetch('/analytics/api/google/external-24h',{credentials:'same-origin',cache:'no-store'}),d=await r.json().catch(()=>null);if(!r.ok||!d||d.status!=='connected')throw new Error(d&&d.reason||'External GA4 acquisition unavailable');const ready=d.external&&d.external.status==='ready',marker=d.marker||{},ext=d.external||{},owner=d.owner||{},total=d.total||{};if(meta)meta.textContent=ready?'Clean 24h window · GA4 property '+d.propertyId:'Warm-up · '+Number(marker.warmupRemainingHours||0).toFixed(1)+'h remaining';root.innerHTML='<div class="metricGrid">'+metric('GA4 total · 24h',num(total.sessions),'Raw GA4 acquisition')+metric('Owner-marked · 24h',num(owner.sessions),'toolscout_owner / internal')+metric(ready?'GA4 external · 24h':'Non-owner-marked · 24h',num(ready?ext.sessions:ext.candidateSessions),ready?'Operational acquisition metric':'Candidate only during warm-up')+metric(ready?'External engagement rate':'Owner exclusion status',ready?pc(ext.engagementRate):'Warming up',ready?num(ext.engagedSessions)+' engaged':'Learning disabled · '+Number(marker.warmupRemainingHours||0).toFixed(1)+'h remaining')+'</div>'+sourceRows(ext.sources,ready?'External sources':'Non-owner-marked sources · warm-up')+'<div class="note" style="margin-top:10px">'+esc(d.note||'')+'</div>';}catch(e){root.innerHTML='<div class="bug"><b>External GA4 acquisition is unavailable.</b><div style="margin-top:6px">'+esc(e&&e.message||e)+'</div></div>';}}
setTimeout(load,1700);setInterval(load,300000);
})();</script>`}
function analyticsPage(path){return path==='/analytics'||path==='/analytics/'||path==='/analytics.html'||path==='/command-center'||path==='/command-center/'}
async function decoratePage(response){
  const type=String(response.headers.get('content-type')||'').toLowerCase();if(!response.ok||!type.includes('text/html'))return response;
  let html=await response.text();
  if(!html.includes('data-widget="ga4-external-truth"')){
    if(html.includes('<section class="widget" data-widget="ga4-attribution-24h"'))html=html.replace('<section class="widget" data-widget="ga4-attribution-24h"',externalWidget()+'\n    <section class="widget" data-widget="ga4-attribution-24h"');
    else html=html.replace('<section class="widget" data-widget="chairman"',externalWidget()+'\n    <section class="widget" data-widget="chairman"');
  }
  if(!html.includes('data-ga4-external-truth="v1"'))html=html.replace('</body>',externalScript()+'</body>');
  const headers=new Headers(response.headers);headers.delete('Content-Length');headers.delete('Content-Encoding');return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(request.method==='GET'&&url.pathname==='/analytics/api/google/external-24h'){
      if(!(await validCommandCenterSession(request,env)))return new Response('Not found',{status:404,headers:{'Cache-Control':'no-store'}});
      const data=await externalAcquisition24h(env,request);return Response.json(data,{status:data.status==='connected'?200:503,headers:JSON_H});
    }
    const ownerPage=request.method==='GET'&&analyticsPage(url.pathname)&&await validCommandCenterSession(request,env);
    const response=await base.fetch(request,env,ctx);
    if(request.method!=='GET'||!analyticsPage(url.pathname))return response;
    const decorated=await decoratePage(response);
    return ownerPage?withOwnerMarker(decorated,request):decorated;
  },
  async scheduled(event,env,ctx){return typeof base.scheduled==='function'?base.scheduled(event,env,ctx):undefined}
};
