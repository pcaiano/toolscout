import base from './ga4-attribution-24h-worker.js';

const JSON_H={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'private, no-store'};
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
function analyticsPage(path){return path==='/analytics'||path==='/analytics/'||path==='/analytics.html'||path==='/command-center'||path==='/command-center/'}

async function ownerSafeAcquisition24h(request,env,ctx){
  const target=new URL(request.url);target.pathname='/analytics/api/google/acquisition-24h';target.search='';
  const upstream=await base.fetch(new Request(target.toString(),request),env,ctx);
  const raw=await upstream.json().catch(()=>null);
  if(!upstream.ok||!raw||raw.status!=='connected')return {status:'unavailable',reason:raw?.reason||'GA4 rolling 24h acquisition is unavailable.',marker:markerState(request),fetchedAt:new Date().toISOString()};
  const sources=Array.isArray(raw.sources)?raw.sources:[];
  const ownerRows=sources.filter(row=>String(row.source||'')===OWNER_SOURCE&&String(row.medium||'')===OWNER_MEDIUM);
  const externalSources=sources.filter(row=>!(String(row.source||'')===OWNER_SOURCE&&String(row.medium||'')===OWNER_MEDIUM));
  const ownerSessions=ownerRows.reduce((sum,row)=>sum+n(row.sessions),0),ownerEngagedSessions=ownerRows.reduce((sum,row)=>sum+n(row.engagedSessions),0);
  const totalSessions=n(raw.sessions),totalEngagedSessions=n(raw.engagedSessions),candidateSessions=Math.max(0,totalSessions-ownerSessions),candidateEngagedSessions=Math.max(0,totalEngagedSessions-ownerEngagedSessions),marker=markerState(request),ready=marker.ready;
  const engagementRate=ready&&candidateSessions?Number((candidateEngagedSessions/candidateSessions*100).toFixed(1)):ready?0:null;
  return {
    status:'connected',propertyId:raw.propertyId,window:'rolling_24h',marker,
    total:{sessions:totalSessions,engagedSessions:totalEngagedSessions,engagementRate:n(raw.engagementRate)},
    owner:{sessions:ownerSessions,engagedSessions:ownerEngagedSessions,source:OWNER_SOURCE,medium:OWNER_MEDIUM},
    external:{status:ready?'ready':'warming_up',sessions:ready?candidateSessions:null,engagedSessions:ready?candidateEngagedSessions:null,engagementRate,candidateSessions,candidateEngagedSessions,sources:externalSources},
    growthSignal:{status:ready?'ready':'warming_up',metric:'ga4_external_sessions_24h',learningAllowed:ready,sessions:ready?candidateSessions:null,engagedSessions:ready?candidateEngagedSessions:null,sources:ready?externalSources:[],reason:ready?'Owner-marked GA4 sessions are excluded from a full rolling 24h window.':'Owner exclusion is warming up. Channel promotion and penalization from GA4 acquisition must remain disabled until the clean window is complete.'},
    fetchedAt:new Date().toISOString(),
    note:ready?'GA4 external sessions exclude only traffic explicitly marked toolscout_owner / internal. Country is never used as an exclusion rule.':'Historical sessions before owner marking cannot be classified retroactively. This device is now marked as owner. The external acquisition metric becomes operational after 24 hours of clean coverage.'
  };
}

function widget(){return `<section class="widget" data-widget="ga4-external-truth" style="--w:12;--h:5"><div class="widgetHead"><div><div class="widgetKicker">GA4 owner exclusion</div><div class="widgetTitle">External Acquisition Truth</div></div><div class="widgetMeta" id="ga4ExternalMeta">Separating owner from external traffic</div></div><div class="widgetBody" id="ga4ExternalBody"><div class="empty">Loading owner-safe GA4 acquisition...</div></div><div class="resizeHandle"></div></section>`}
function script(){return `<script data-ga4-external-truth="v1">(function(){
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m])),num=v=>Number(v||0).toLocaleString(),pc=v=>v==null?'Warming up':Number(v||0).toFixed(1)+'%';
function metric(label,value,meta){return '<div class="metric"><small>'+esc(label)+'</small><b>'+esc(value)+'</b><span>'+esc(meta||'')+'</span></div>'}
function row(name,value,meta){return '<div class="row"><div><div class="rowName">'+esc(name)+'</div>'+(meta?'<div class="rowMeta">'+esc(meta)+'</div>':'')+'</div><div class="rowValue">'+esc(value)+'</div></div>'}
function sources(rows,title){if(!rows||!rows.length)return '';return '<div style="margin-top:12px"><div class="widgetKicker" style="margin-bottom:6px">'+esc(title)+'</div>'+rows.slice(0,8).map(x=>row((x.source||'(not set)')+' / '+(x.medium||'(not set)'),num(x.sessions)+' sessions',(x.channel||'')+' · '+num(x.engagedSessions)+' engaged · '+pc(x.engagementRate))).join('')+'</div>'}
async function load(){const root=document.getElementById('ga4ExternalBody'),meta=document.getElementById('ga4ExternalMeta');if(!root)return;try{const r=await fetch('/analytics/api/google/external-24h',{credentials:'same-origin',cache:'no-store'}),d=await r.json().catch(()=>null);if(!r.ok||!d||d.status!=='connected')throw new Error(d&&d.reason||'External GA4 acquisition unavailable');const ready=d.external&&d.external.status==='ready',marker=d.marker||{},ext=d.external||{},owner=d.owner||{},total=d.total||{};if(meta)meta.textContent=ready?'Clean 24h window · GA4 property '+d.propertyId:'Warm-up · '+Number(marker.warmupRemainingHours||0).toFixed(1)+'h remaining';root.innerHTML='<div class="metricGrid">'+metric('GA4 total · 24h',num(total.sessions),'Raw GA4 acquisition')+metric('Owner-marked · 24h',num(owner.sessions),'toolscout_owner / internal')+metric(ready?'GA4 external · 24h':'Non-owner-marked · 24h',num(ready?ext.sessions:ext.candidateSessions),ready?'Operational acquisition metric':'Candidate only during warm-up')+metric(ready?'External engagement rate':'Owner exclusion status',ready?pc(ext.engagementRate):'Warming up',ready?num(ext.engagedSessions)+' engaged':'Growth learning disabled · '+Number(marker.warmupRemainingHours||0).toFixed(1)+'h remaining')+'</div>'+sources(ext.sources,ready?'External sources':'Non-owner-marked sources · warm-up')+'<div class="note" style="margin-top:10px">'+esc(d.note||'')+'</div>';}catch(e){root.innerHTML='<div class="bug"><b>External GA4 acquisition is unavailable.</b><div style="margin-top:6px">'+esc(e&&e.message||e)+'</div></div>';}}
setTimeout(load,1700);setInterval(load,300000);
})();</script>`}
async function decorate(response){
  const type=String(response.headers.get('content-type')||'').toLowerCase();if(!response.ok||!type.includes('text/html'))return response;
  let html=await response.text();
  if(!html.includes('data-widget="ga4-external-truth"')){
    if(html.includes('<section class="widget" data-widget="ga4-attribution-24h"'))html=html.replace('<section class="widget" data-widget="ga4-attribution-24h"',widget()+'\n    <section class="widget" data-widget="ga4-attribution-24h"');
    else html=html.replace('<section class="widget" data-widget="chairman"',widget()+'\n    <section class="widget" data-widget="chairman"');
  }
  if(!html.includes('data-ga4-external-truth="v1"'))html=html.replace('</body>',script()+'</body>');
  const headers=new Headers(response.headers);headers.delete('Content-Length');headers.delete('Content-Encoding');return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(request.method==='GET'&&url.pathname==='/analytics/api/google/external-24h'){
      if(!(await validCommandCenterSession(request,env)))return new Response('Not found',{status:404,headers:{'Cache-Control':'no-store'}});
      const data=await ownerSafeAcquisition24h(request,env,ctx);return Response.json(data,{status:data.status==='connected'?200:503,headers:JSON_H});
    }
    const ownerPage=request.method==='GET'&&analyticsPage(url.pathname)&&await validCommandCenterSession(request,env);
    const response=await base.fetch(request,env,ctx);
    if(request.method!=='GET'||!analyticsPage(url.pathname))return response;
    const decorated=await decorate(response);
    return ownerPage?withOwnerMarker(decorated,request):decorated;
  },
  async scheduled(event,env,ctx){return typeof base.scheduled==='function'?base.scheduled(event,env,ctx):undefined}
};
