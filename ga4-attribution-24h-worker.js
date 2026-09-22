import base from './d1-read-budget-worker.js';
import {googleAnalyticsOAuthStatus,googleAnalyticsOAuthAccess} from './google-analytics-oauth.js';

const JSON_H={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'private, no-store'};
const GA_DATA_ORIGIN='https://analyticsdata.googleapis.com';
const BUSINESS_TIME_ZONE='Europe/Lisbon';
const COMMAND_CENTER_SESSION_COOKIE='toolscout_cc';
const COMMAND_CENTER_SESSION_TTL_SECONDS=86400;

function n(value){const x=Number(value);return Number.isFinite(x)?x:0}
function pct(value){return Number.isFinite(Number(value))?Number(value):0}
async function digestHex(value){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('')}
function sessionBucket(now=Date.now()){return Math.floor(now/(COMMAND_CENTER_SESSION_TTL_SECONDS*1000))}
async function sessionValue(secret,bucket){return digestHex(`toolscout-command-center:${secret}:${bucket}`)}
async function validCommandCenterSession(request,env){
  if(!env.ADMIN_TOKEN)return false;
  const cookie=request.headers.get('Cookie')||'';
  const match=cookie.match(new RegExp(`(?:^|;\\s*)${COMMAND_CENTER_SESSION_COOKIE}=([^;]+)`));
  if(!match)return false;
  const supplied=decodeURIComponent(match[1]);
  const bucket=sessionBucket();
  for(const candidate of [bucket,bucket-1])if(supplied===await sessionValue(env.ADMIN_TOKEN,candidate))return true;
  return false;
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
function addToMap(map,key,sessions,engaged,extra={}){
  const prior=map.get(key)||{key,sessions:0,engagedSessions:0,...extra};
  prior.sessions+=sessions;prior.engagedSessions+=engaged;
  for(const [name,value] of Object.entries(extra))if(prior[name]==null||prior[name]==='')prior[name]=value;
  map.set(key,prior);
}
function ranked(map,limit=10){
  return [...map.values()].map(row=>({...row,engagementRate:row.sessions?Number((row.engagedSessions/row.sessions*100).toFixed(1)):0})).sort((a,b)=>b.sessions-a.sessions||b.engagedSessions-a.engagedSessions).slice(0,limit);
}
async function acquisition24h(env,request){
  const status=await googleAnalyticsOAuthStatus(env,request);
  if(!status.connected)return {status:'unavailable',reason:'Google Analytics is not connected.',oauth:status,fetchedAt:new Date().toISOString()};
  try{
    const access=await googleAnalyticsOAuthAccess(env,request);if(!access?.token||!access?.propertyId)throw new Error('google_oauth_connection_unavailable');
    const now=new Date(),cutoff=compactMinute(new Date(now.getTime()-24*3600000)),current=compactMinute(now),today=ymd(zoneParts(now)),yesterday=ymd(zoneParts(new Date(now.getTime()-36*3600000)));
    const metrics=[{name:'sessions'},{name:'engagedSessions'}];
    const [sourceReport,landingReport,countryReport]=await Promise.all([
      runReport(access.propertyId,access.token,{dateRanges:[{startDate:yesterday,endDate:today}],dimensions:[{name:'dateHourMinute'},{name:'sessionSource'},{name:'sessionMedium'},{name:'sessionDefaultChannelGroup'}],metrics,limit:'100000'}),
      runReport(access.propertyId,access.token,{dateRanges:[{startDate:yesterday,endDate:today}],dimensions:[{name:'dateHourMinute'},{name:'landingPagePlusQueryString'}],metrics,limit:'100000'}),
      runReport(access.propertyId,access.token,{dateRanges:[{startDate:yesterday,endDate:today}],dimensions:[{name:'dateHourMinute'},{name:'country'}],metrics,limit:'100000'})
    ]);
    const sources=new Map(),landings=new Map(),countries=new Map();let sessions=0,engagedSessions=0,directSessions=0;
    for(const row of sourceReport.rows||[]){
      if(!insideWindow(row,cutoff,current))continue;
      const source=row.dimensionValues?.[1]?.value||'(not set)',medium=row.dimensionValues?.[2]?.value||'(not set)',channel=row.dimensionValues?.[3]?.value||'(not set)',s=n(row.metricValues?.[0]?.value),e=n(row.metricValues?.[1]?.value),key=`${source} / ${medium}`;
      sessions+=s;engagedSessions+=e;if(source==='(direct)'&&medium==='(none)')directSessions+=s;
      addToMap(sources,key,s,e,{source,medium,channel});
    }
    for(const row of landingReport.rows||[]){if(!insideWindow(row,cutoff,current))continue;const landingPage=row.dimensionValues?.[1]?.value||'(not set)';addToMap(landings,landingPage,n(row.metricValues?.[0]?.value),n(row.metricValues?.[1]?.value),{landingPage});}
    for(const row of countryReport.rows||[]){if(!insideWindow(row,cutoff,current))continue;const country=row.dimensionValues?.[1]?.value||'(not set)';addToMap(countries,country,n(row.metricValues?.[0]?.value),n(row.metricValues?.[1]?.value),{country});}
    return {status:'connected',source:'Google Analytics 4 Data API',propertyId:access.propertyId,window:'rolling_24h',sessions,engagedSessions,engagementRate:sessions?Number((engagedSessions/sessions*100).toFixed(1)):0,directSessions,directShare:sessions?Number((directSessions/sessions*100).toFixed(1)):0,sources:ranked(sources,10),landingPages:ranked(landings,10),countries:ranked(countries,10),fetchedAt:new Date().toISOString(),note:'Rolling 24h attribution uses GA4 session source, medium, landing page and country. Direct can include visits whose referrer or campaign information was unavailable.'};
  }catch(error){return {status:'unavailable',reason:String(error?.message||error),oauth:status,fetchedAt:new Date().toISOString()}}
}
function attributionWidget(){return `<section class="widget" data-widget="ga4-attribution-24h" style="--w:12;--h:6"><div class="widgetHead"><div><div class="widgetKicker">GA4 rolling 24h</div><div class="widgetTitle">Where the last 24h came from</div></div><div class="widgetMeta" id="ga4Attribution24hMeta">Source, landing page, country and engagement</div></div><div class="widgetBody" id="ga4Attribution24hBody"><div class="empty">Loading GA4 24h attribution...</div></div><div class="resizeHandle"></div></section>`}
function attributionScript(){return `<script data-ga4-attribution-24h="v1">(function(){
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m])),num=v=>Number(v||0).toLocaleString(),pc=v=>Number(v||0).toFixed(1)+'%';
function metric(label,value,meta){return '<div class="metric"><small>'+esc(label)+'</small><b>'+esc(value)+'</b><span>'+esc(meta||'')+'</span></div>'}
function row(name,value,meta){return '<div class="row"><div><div class="rowName">'+esc(name)+'</div>'+(meta?'<div class="rowMeta">'+esc(meta)+'</div>':'')+'</div><div class="rowValue">'+esc(value)+'</div></div>'}
function section(title,rows,kind){if(!rows||!rows.length)return '<div class="note">No '+esc(title.toLowerCase())+' rows in the rolling 24h window.</div>';return '<div style="margin-top:14px"><div class="widgetKicker" style="margin-bottom:6px">'+esc(title)+'</div>'+rows.map(x=>{const name=kind==='source'?(x.source+' / '+x.medium):kind==='landing'?x.landingPage:x.country;const meta=kind==='source'?(x.channel+' · '+num(x.engagedSessions)+' engaged · '+pc(x.engagementRate)):(num(x.engagedSessions)+' engaged · '+pc(x.engagementRate));return row(name,num(x.sessions)+' sessions',meta)}).join('')+'</div>'}
async function load(){const root=document.getElementById('ga4Attribution24hBody'),meta=document.getElementById('ga4Attribution24hMeta');if(!root)return;try{const response=await fetch('/analytics/api/google/acquisition-24h',{credentials:'same-origin',cache:'no-store'});const data=await response.json().catch(()=>null);if(!response.ok||!data||data.status!=='connected')throw new Error(data&&data.reason||'GA4 24h attribution unavailable');if(meta)meta.textContent='GA4 property '+data.propertyId+' · refreshed '+new Date(data.fetchedAt).toLocaleTimeString();root.innerHTML='<div class="metricGrid">'+metric('GA4 sessions · 24h',num(data.sessions),'Rolling attribution window')+metric('Engaged sessions · 24h',num(data.engagedSessions),'GA4 engaged sessions')+metric('Engagement rate · 24h',pc(data.engagementRate),'Engaged sessions / sessions')+metric('Direct share · 24h',pc(data.directShare),num(data.directSessions)+' direct sessions')+'</div>'+section('Top sources / medium',data.sources,'source')+section('Top landing pages',data.landingPages,'landing')+section('Top countries',data.countries,'country')+'<div class="note" style="margin-top:10px">'+esc(data.note||'')+'</div>';}catch(error){root.innerHTML='<div class="bug"><b>GA4 24h attribution is unavailable.</b><div style="margin-top:6px">'+esc(error&&error.message||error)+'</div></div>';}}
setTimeout(load,1400);setInterval(load,300000);
})();</script>`}
function analyticsPage(path){return path==='/analytics'||path==='/analytics/'||path==='/analytics.html'||path==='/command-center'||path==='/command-center/'}
async function decoratePage(response){
  const type=String(response.headers.get('content-type')||'').toLowerCase();if(!response.ok||!type.includes('text/html'))return response;
  let html=await response.text();
  if(!html.includes('data-widget="ga4-attribution-24h"'))html=html.replace('<section class="widget" data-widget="chairman"',attributionWidget()+'\n    <section class="widget" data-widget="chairman"');
  if(!html.includes('data-ga4-attribution-24h="v1"'))html=html.replace('</body>',attributionScript()+'</body>');
  const headers=new Headers(response.headers);headers.delete('Content-Length');headers.delete('Content-Encoding');return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(request.method==='GET'&&url.pathname==='/analytics/api/google/acquisition-24h'){
      if(!(await validCommandCenterSession(request,env)))return new Response('Not found',{status:404,headers:{'Cache-Control':'no-store'}});
      const data=await acquisition24h(env,request);return Response.json(data,{status:data.status==='connected'?200:503,headers:JSON_H});
    }
    const response=await base.fetch(request,env,ctx);
    return request.method==='GET'&&analyticsPage(url.pathname)?decoratePage(response):response;
  },
  async scheduled(event,env,ctx){return typeof base.scheduled==='function'?base.scheduled(event,env,ctx):undefined}
};
