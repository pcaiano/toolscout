import base from './traffic-integrity-guard-worker.js';
import { classifySessionRequest, SESSION_CLASSIFICATIONS } from './session-classification.js';
import { applySeoUplift } from './seo-uplift-overrides.js';
import { applyCommercialCluster } from './commercial-cluster-overrides.js';
import { prioritizedDistributionFeed } from './distribution-feed-priority.js';

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

async function monetizationProof(env){
  if(!env.DB)return {status:'unavailable',reason:'D1 unavailable'};
  try{
    const [ledger,clicks,sessions]=await Promise.all([
      env.DB.prepare(`SELECT COUNT(*) AS rows,COUNT(DISTINCT CASE WHEN conversion_id IS NOT NULL THEN affiliate_slug || ':' || conversion_id END) AS conversions,SUM(commission) AS revenue,GROUP_CONCAT(DISTINCT currency) AS currencies FROM revenue_ledger WHERE status IN ('confirmed','paid')`).first(),
      env.DB.prepare(`SELECT COUNT(*) AS clicks FROM click_events c JOIN sessions s ON s.session_id=c.session_id WHERE c.affiliate_active_at_click=1 AND COALESCE(c.source,'')!='internal-test' AND s.classification='likely-human'`).first(),
      env.DB.prepare(`SELECT COUNT(*) AS sessions FROM sessions WHERE classification='likely-human'`).first()
    ]);
    const evidenceRows=Number(ledger?.rows||0),monetizedOutboundClicks=Number(clicks?.clicks||0),humanSessions=Number(sessions?.sessions||0),confirmedConversions=Number(ledger?.conversions||0);
    const currencies=String(ledger?.currencies||'').split(',').map(x=>x.trim()).filter(Boolean);
    const singleCurrency=currencies.length<=1;
    const currency=currencies[0]||'EUR';
    const confirmedRevenue=evidenceRows>0&&singleCurrency?Number(ledger?.revenue||0):null;
    const earningsPerMonetizedClick=confirmedRevenue!==null&&monetizedOutboundClicks>0?confirmedRevenue/monetizedOutboundClicks:null;
    const revenuePer1000HumanSessions=confirmedRevenue!==null&&humanSessions>0?confirmedRevenue/humanSessions*1000:null;
    const revenuePerHumanSession=confirmedRevenue!==null&&humanSessions>0?confirmedRevenue/humanSessions:null;
    let sampleState='awaiting-confirmed-revenue';
    if(confirmedRevenue!==null)sampleState=monetizedOutboundClicks<20||confirmedConversions<3?'early-sample':'learning-sample';
    return {status:'observed',definition:'Revenue uses confirmed or paid vendor ledger evidence only. Clicks never imply revenue.',sampleState,currency:singleCurrency?currency:null,currencies,confirmedRevenue,confirmedConversions,monetizedOutboundClicks,humanSessions,earningsPerMonetizedClick,revenuePerHumanSession,revenuePer1000HumanSessions,evidenceRows};
  }catch(error){return {status:'unavailable',reason:String(error?.message||error),definition:'Revenue is never inferred from clicks.'};}
}

async function augmentStats(response,env){
  if(!response.ok)return response;
  let data;try{data=await response.json()}catch{return response}
  const [guard,proof]=await Promise.all([guardTruth(env),monetizationProof(env)]);
  if(data.traffic){data.traffic={...data.traffic,today:guard.today,last24:guard.last24,metric:guard.metric,trafficTruth:'browser_guard_verified'}}
  if(data.tracking)data.tracking={...data.tracking,humanSessionsLast24Hours:guard.last24};
  if(data.trafficTruth){data.trafficTruth={...data.trafficTruth,primaryMetric:'D1 browser-guard verified sessions'};data.trafficTruth.d1={...(data.trafficTruth.d1||{}),today:guard.today,last24:guard.last24,metric:guard.metric,canonicalPopulation:'traffic_guard_events decision=allowed'}}
  if(data.trafficTrend&&Array.isArray(data.trafficTrend.points)){const key=dayKey(new Date());data.trafficTrend.points=data.trafficTrend.points.map(p=>p&&p.day===key?{...p,sessions:guard.today}:p)}
  data.trafficIntegrity={...(data.trafficIntegrity||{}),guardCanonical:{status:'active',today:guard.today,last24:guard.last24,metric:guard.metric,generatedAt:guard.generatedAt}};
  data.monetizationProof=proof;
  const headers=new Headers(response.headers);headers.set('Content-Type','application/json; charset=UTF-8');headers.set('Cache-Control','private, no-store');headers.delete('Content-Length');headers.delete('Content-Encoding');
  return new Response(JSON.stringify(data),{status:response.status,statusText:response.statusText,headers});
}

function monetizationProofPanel(){return `<section id="ts-monetization-proof" data-toolscout-monetization-proof="2" style="max-width:1180px;margin:24px auto;padding:0 18px;font-family:Inter,system-ui,sans-serif"><div style="background:#fff;border:1px solid #e4e7ec;border-radius:18px;padding:20px"><div style="display:flex;justify-content:space-between;gap:16px;align-items:flex-start;flex-wrap:wrap"><div><div style="font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#667085">Monetization proof</div><h2 style="margin:6px 0 4px;font-size:22px;color:#101828">Revenue evidence and unit economics</h2><p style="margin:0;color:#667085;font-size:13px">Revenue is vendor-confirmed only. Clicks do not imply revenue.</p></div><div id="ts-mp-state" style="font-size:12px;font-weight:750;color:#344054">Loading</div></div><div id="ts-mp-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-top:16px"></div></div></section><script data-toolscout-monetization-proof-script="2">(function(){if(window.__toolscoutMonetizationProofHook)return;window.__toolscoutMonetizationProofHook=true;function money(v,c){if(v===null||v===undefined||!Number.isFinite(Number(v)))return 'Unknown';try{return new Intl.NumberFormat('en',{style:'currency',currency:c||'EUR',maximumFractionDigits:2}).format(Number(v))}catch(e){return String(Number(v).toFixed(2))}}function num(v){return Number.isFinite(Number(v))?new Intl.NumberFormat('en').format(Number(v)):'Unknown'}function card(label,value){return '<div style="background:#f8fafc;border:1px solid #eaecf0;border-radius:12px;padding:13px"><div style="font-size:11px;color:#667085;text-transform:uppercase;letter-spacing:.05em">'+label+'</div><div style="font-size:20px;font-weight:800;color:#101828;margin-top:5px">'+value+'</div></div>'}function apply(d){var p=d&&d.monetizationProof||{},c=p.currency||'EUR',s=document.getElementById('ts-mp-state'),g=document.getElementById('ts-mp-grid');if(!s||!g)return;s.textContent=String(p.sampleState||p.status||'unknown').replace(/-/g,' ');g.innerHTML=card('Confirmed affiliate revenue',money(p.confirmedRevenue,c))+card('Monetized outbound clicks',num(p.monetizedOutboundClicks))+card('Earnings per monetized click',money(p.earningsPerMonetizedClick,c))+card('Revenue per 1,000 human sessions',money(p.revenuePer1000HumanSessions,c))+card('Confirmed conversions',num(p.confirmedConversions))+card('Human sessions',num(p.humanSessions))}function install(n){var previous=window.render;if(typeof previous==='function'&&!previous.__toolscoutMonetizationProofWrapped){var wrapped=function(d){var result=previous(d);setTimeout(function(){apply(d)},0);return result};wrapped.__toolscoutMonetizationProofWrapped=true;window.render=wrapped;return}if(n<30)setTimeout(function(){install(n+1)},100)}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){install(0)},{once:true});else install(0)})();</script>`}

function lateVisitorRetryScript(){return `<script data-toolscout-confirmed-visitor-late-retry="1">(function(){try{if(window.__toolscoutConfirmedVisitorLateRetry)return;window.__toolscoutConfirmedVisitorLateRetry=true;var uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;function clean(v,n){return String(v||'').replace(/[^A-Za-z0-9._:&=/-]/g,'').slice(0,n||100)}function payload(){var v=null,s=null;try{v=JSON.parse(localStorage.getItem('toolscout_visitor_v1')||'null');s=JSON.parse(localStorage.getItem('toolscout_session_v2')||'null')}catch(e){}if(!v||!s||!uuid.test(String(v.id||''))||!uuid.test(String(s.id||'')))return null;var source='direct',refHost=null;try{var q=new URLSearchParams(location.search),utm=['utm_source','utm_medium','utm_campaign'].map(function(k){var x=clean(q.get(k));return x?k+'='+x:''}).filter(Boolean).join('&');if(utm)source=clean(utm);else if(q.get('source'))source=clean(q.get('source'));else if(document.referrer){var u=new URL(document.referrer),h=u.hostname.replace(/^www\\./,'');if(h&&h!==location.hostname){refHost=h.slice(0,120);source=clean('ref:'+h)}}}catch(e){}return {visitor_id:v.id,session_id:s.id,path:location.pathname.slice(0,200)||'/',source:source,referrer_host:refHost}}function send(n){var p=payload();if(!p){if(n<12)setTimeout(function(){send(n+1)},500);return}fetch('/api/confirmed-visitor',{method:'POST',credentials:'same-origin',keepalive:true,headers:{'content-type':'application/json'},body:JSON.stringify(p)}).then(function(r){if(!r.ok&&n<12)setTimeout(function(){send(n+1)},500)}).catch(function(){if(n<12)setTimeout(function(){send(n+1)},500)})}setTimeout(function(){send(0)},2600)}catch(e){}})();</script>`}

async function decorate(response,isAnalytics,pathname){
  if(!response.ok||!isHtml(response))return response;
  let html=await response.text();
  if(!isAnalytics){html=applySeoUplift(html,pathname);html=applyCommercialCluster(html,pathname);}
  if(isAnalytics&&!html.includes('data-toolscout-monetization-proof="2"'))html=html.replace(/<\/body>/i,monetizationProofPanel()+'</body>');
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
    if(request.method==='GET'&&url.pathname==='/api/distribution/feed.json')return prioritizedDistributionFeed(request,env,'json');
    if(request.method==='GET'&&url.pathname==='/api/distribution/feed.xml')return prioritizedDistributionFeed(request,env,'xml');
    if(url.pathname==='/api/events'){const gated=await pageConfirmationGate(request);if(gated)return gated}
    let response=await base.fetch(request,env,ctx);
    if(request.method==='GET'&&url.pathname==='/analytics/api/stats')response=await augmentStats(response,env);
    if(request.method==='GET'&&ANALYTICS_PATHS.has(url.pathname))return decorate(response,true,url.pathname);
    if(request.method==='GET'&&url.hostname==='trytoolscout.org'&&isHtml(response))return decorate(response,false,url.pathname);
    return response;
  },
  async scheduled(event,env,ctx){if(typeof base.scheduled==='function')return base.scheduled(event,env,ctx)}
};
