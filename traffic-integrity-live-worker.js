import base from './traffic-integrity-guard-worker.js';
import { classifySessionRequest, SESSION_CLASSIFICATIONS } from './session-classification.js';
import { applySeoUplift } from './seo-uplift-overrides.js';

const ANALYTICS_PATHS=new Set(['/analytics','/analytics/','/analytics.html','/analytics-v2','/analytics-v2/','/analytics-v2.html']);
const TIME_ZONE='Europe/Lisbon';

function isHtml(response){return (response.headers.get('content-type')||'').toLowerCase().includes('text/html')}
function parseUtc(value){const text=String(value||'').trim();if(!text)return null;const d=new Date(text.includes('T')?text:(text.replace(' ','T')+'Z'));return Number.isFinite(d.getTime())?d:null}
function dayKey(value){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(value instanceof Date?value:new Date(value));const map=Object.fromEntries(parts.filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));return `${map.year}-${map.month}-${map.day}`}

function canonicalHtmlRedirect(request,url){
  if(request.method!=='GET'&&request.method!=='HEAD')return null;
  if(url.hostname!=='trytoolscout.org')return null;
  const target=new URL(url.toString());
  let changed=false;
  if(/\/index\.html$/i.test(target.pathname)){
    target.pathname=target.pathname.replace(/\/index\.html$/i,'/')||'/';
    changed=true;
  }else if(/\.html$/i.test(target.pathname)){
    target.pathname=target.pathname.replace(/\.html$/i,'')||'/';
    changed=true;
  }
  if(!changed)return null;
  return new Response(null,{status:301,headers:{Location:target.toString(),'Cache-Control':'public, max-age=86400'}});
}

async function pageConfirmationGate(request){
  if(request.method!=='POST')return null;
  const type=(request.headers.get('Content-Type')||'').toLowerCase();
  if(!type.startsWith('application/json'))return null;
  let body;try{body=JSON.parse(await request.clone().text())}catch{return null}
  if(body?.event_type!=='page_confirmed')return null;
  const classification=classifySessionRequest(request);
  if(classification!==SESSION_CLASSIFICATIONS.LIKELY_HUMAN){
    return Response.json({ok:true,recorded:false,classification,reason:'browser_confirmation_not_eligible'},{status:202,headers:{'Content-Type':'application/json; charset=UTF-8','Cache-Control':'no-store'}});
  }
  if(!body?.browser_proof){
    return Response.json({ok:false,recorded:false,reason:'browser_proof_required'},{status:409,headers:{'Content-Type':'application/json; charset=UTF-8','Cache-Control':'no-store'}});
  }
  return null;
}

async function guardTruth(env){
  if(!env.DB)return {today:0,last24:0};
  const result=await env.DB.prepare(`SELECT session_id,created_at FROM traffic_guard_events WHERE decision='allowed' AND created_at>=datetime('now','-36 hours') ORDER BY created_at`).all();
  const now=new Date(),todayKey=dayKey(now),cutoff=Date.now()-86400000,today=new Set(),last24=new Set();
  for(const row of result?.results||[]){const at=parseUtc(row.created_at),sid=String(row.session_id||'');if(!at||!sid)continue;if(dayKey(at)===todayKey)today.add(sid);if(at.getTime()>=cutoff)last24.add(sid)}
  return {today:today.size,last24:last24.size,generatedAt:new Date().toISOString(),metric:'browser-guard verified sessions'};
}

async function augmentStats(response,env){
  if(!response.ok)return response;
  let data;try{data=await response.json()}catch{return response}
  const guard=await guardTruth(env);
  if(data.traffic){data.traffic={...data.traffic,today:guard.today,last24:guard.last24,metric:guard.metric,trafficTruth:'browser_guard_verified'}}
  if(data.tracking)data.tracking={...data.tracking,humanSessionsLast24Hours:guard.last24};
  if(data.trafficTruth){data.trafficTruth={...data.trafficTruth,primaryMetric:'D1 browser-guard verified sessions'};data.trafficTruth.d1={...(data.trafficTruth.d1||{}),today:guard.today,last24:guard.last24,metric:guard.metric,canonicalPopulation:'traffic_guard_events decision=allowed'}}
  if(data.trafficTrend&&Array.isArray(data.trafficTrend.points)){const key=dayKey(new Date());data.trafficTrend.points=data.trafficTrend.points.map(p=>p&&p.day===key?{...p,sessions:guard.today}:p)}
  data.trafficIntegrity={...(data.trafficIntegrity||{}),guardCanonical:{status:'active',today:guard.today,last24:guard.last24,metric:guard.metric,generatedAt:guard.generatedAt}};
  const headers=new Headers(response.headers);headers.set('Content-Type','application/json; charset=UTF-8');headers.set('Cache-Control','private, no-store');headers.delete('Content-Length');headers.delete('Content-Encoding');
  return new Response(JSON.stringify(data),{status:response.status,statusText:response.statusText,headers});
}

function lateVisitorRetryScript(){return `<script data-toolscout-confirmed-visitor-late-retry="1">(function(){try{if(window.__toolscoutConfirmedVisitorLateRetry)return;window.__toolscoutConfirmedVisitorLateRetry=true;var uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;function clean(v,n){return String(v||'').replace(/[^A-Za-z0-9._:&=/-]/g,'').slice(0,n||100)}function payload(){var v=null,s=null;try{v=JSON.parse(localStorage.getItem('toolscout_visitor_v1')||'null');s=JSON.parse(localStorage.getItem('toolscout_session_v2')||'null')}catch(e){}if(!v||!s||!uuid.test(String(v.id||''))||!uuid.test(String(s.id||'')))return null;var source='direct',refHost=null;try{var q=new URLSearchParams(location.search),utm=['utm_source','utm_medium','utm_campaign'].map(function(k){var x=clean(q.get(k));return x?k+'='+x:''}).filter(Boolean).join('&');if(utm)source=clean(utm);else if(q.get('source'))source=clean(q.get('source'));else if(document.referrer){var u=new URL(document.referrer),h=u.hostname.replace(/^www\\./,'');if(h&&h!==location.hostname){refHost=h.slice(0,120);source=clean('ref:'+h)}}}catch(e){}return {visitor_id:v.id,session_id:s.id,path:location.pathname.slice(0,200)||'/',source:source,referrer_host:refHost}}function send(n){var p=payload();if(!p){if(n<12)setTimeout(function(){send(n+1)},500);return}fetch('/api/confirmed-visitor',{method:'POST',credentials:'same-origin',keepalive:true,headers:{'content-type':'application/json'},body:JSON.stringify(p)}).then(function(r){if(!r.ok&&n<12)setTimeout(function(){send(n+1)},500)}).catch(function(){if(n<12)setTimeout(function(){send(n+1)},500)})}setTimeout(function(){send(0)},2600)}catch(e){}})();</script>`}

async function decorate(response,isAnalytics,pathname){
  if(!response.ok||!isHtml(response))return response;
  let html=await response.text();
  if(!isAnalytics)html=applySeoUplift(html,pathname);
  if(!isAnalytics&&!html.includes('data-toolscout-confirmed-visitor-late-retry="1"'))html=html.replace(/<\/body>/i,lateVisitorRetryScript()+'</body>');
  const headers=new Headers(response.headers);
  headers.delete('Content-Length');
  headers.delete('Content-Encoding');
  headers.set('Cache-Control',isAnalytics?'private, no-store, max-age=0':headers.get('Cache-Control')||'public, max-age=0, must-revalidate');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    const canonical=canonicalHtmlRedirect(request,url);
    if(canonical)return canonical;
    if(url.pathname==='/api/events'){const gated=await pageConfirmationGate(request);if(gated)return gated}
    let response=await base.fetch(request,env,ctx);
    if(request.method==='GET'&&url.pathname==='/analytics/api/stats')response=await augmentStats(response,env);
    if(request.method==='GET'&&ANALYTICS_PATHS.has(url.pathname))return decorate(response,true,url.pathname);
    if(request.method==='GET'&&url.hostname==='trytoolscout.org'&&isHtml(response))return decorate(response,false,url.pathname);
    return response;
  },
  async scheduled(event,env,ctx){if(typeof base.scheduled==='function')return base.scheduled(event,env,ctx)}
};
