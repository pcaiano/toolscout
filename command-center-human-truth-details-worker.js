import base from './command-center-human-truth-final-worker.js';

const ANALYTICS_PATHS=new Set(['/analytics','/analytics/','/analytics.html','/analytics-v2','/analytics-v2/','/analytics-v2.html']);

function isHtml(response){return (response.headers.get('content-type')||'').toLowerCase().includes('text/html')}
function n(value){const x=Number(value);return Number.isFinite(x)?x:0}
async function safeAll(env,sql){try{return (await env.DB.prepare(sql).all()).results||[]}catch{return []}}
async function assetJson(request,env,path,fallback){try{const r=await env.ASSETS.fetch(new Request(new URL(path,request.url)));return r.ok?await r.json():fallback}catch{return fallback}}

async function affiliateCoverageStatusSnapshot(request,env){
  try{
    const [tools,pipeline,affiliate,workflowRows,clickRows]=await Promise.all([
      assetJson(request,env,'/data/tools.json',[]),
      assetJson(request,env,'/data/affiliate-pipeline.json',{verified_programs:[]}),
      assetJson(request,env,'/data/affiliate.json',{}),
      safeAll(env,`SELECT tool_slug,status,updated_at FROM affiliate_workflow`),
      safeAll(env,`SELECT c.tool_slug,COUNT(*) clicks,SUM(CASE WHEN c.affiliate_active_at_click=1 THEN 1 ELSE 0 END) monetized FROM click_events c LEFT JOIN sessions s ON s.session_id=c.session_id WHERE c.created_at>=datetime('now','-30 days') AND COALESCE(s.classification,'unknown/legacy') IN ('likely-human','human') AND c.source NOT IN ('internal-test','synthetic','health-check','ci') AND EXISTS (SELECT 1 FROM funnel_events f WHERE f.session_id=c.session_id AND f.event_type='page_confirmed') GROUP BY c.tool_slug`)
    ]);
    const pipelineMap=new Map((pipeline?.verified_programs||[]).map(x=>[String(x.slug||''),x]));
    const workflowMap=new Map((workflowRows||[]).map(x=>[String(x.tool_slug||''),x]));
    const clickMap=new Map((clickRows||[]).map(x=>[String(x.tool_slug||''),{clicks:n(x.clicks),monetized:n(x.monetized)}]));
    const activeStates=new Set(['active','verified','earning']);
    const pendingStates=new Set(['submitted','pending_review','pending','under_review','applied','application_submitted']);
    const rejectedStates=new Set(['rejected','declined']);
    const norm=v=>String(v||'').trim().toLowerCase().replace(/[\s-]+/g,'_');
    const groups={active:[],pending:[],rejected:[]};
    for(const tool of tools||[]){
      const slug=String(tool?.slug||'');if(!slug)continue;
      const route=affiliate?.[slug]||{};
      const routeActive=Boolean(route.enabled&&route.url);
      const workflow=workflowMap.get(slug)||{};
      const pipelineRow=pipelineMap.get(slug)||{};
      const status=routeActive?'active':norm(workflow.status||pipelineRow.status);
      let group=null;
      if(routeActive||activeStates.has(status))group='active';
      else if(pendingStates.has(status))group='pending';
      else if(rejectedStates.has(status))group='rejected';
      if(!group)continue;
      const clicks=clickMap.get(slug)||{clicks:0,monetized:0};
      groups[group].push({slug,name:tool.name||slug,status,clicks30d:clicks.clicks,monetizedClicks30d:clicks.monetized});
    }
    for(const items of Object.values(groups))items.sort((a,b)=>b.clicks30d-a.clicks30d||a.name.localeCompare(b.name));
    const summarize=items=>({count:items.length,clicks30d:items.reduce((s,x)=>s+n(x.clicks30d),0),monetizedClicks30d:items.reduce((s,x)=>s+n(x.monetizedClicks30d),0),items});
    return {status:'observed',windowDays:30,trafficTruth:'browser_confirmed',clickDefinition:'Browser-confirmed outbound clicks only; internal and synthetic traffic excluded.',active:summarize(groups.active),pending:summarize(groups.pending),rejected:summarize(groups.rejected)};
  }catch(error){return {status:'unavailable',reason:String(error?.message||error)}}
}

async function augmentAffiliateStatus(response,request,env){
  if(!response.ok)return response;
  let data;try{data=await response.json()}catch{return response}
  if(Array.isArray(data?.growthOps?.health?.issues))data.growthOps.health.issues=data.growthOps.health.issues.filter(issue=>!(issue?.engine==='command-center'&&issue?.title==='Resilient snapshot active'));
  if(data?.affiliateCoverageStatus?.status!=='observed')data.affiliateCoverageStatus=await affiliateCoverageStatusSnapshot(request,env);
  const headers=new Headers(response.headers);
  headers.set('Content-Type','application/json; charset=UTF-8');
  headers.set('Cache-Control','private, no-store');
  headers.delete('Content-Length');
  headers.delete('Content-Encoding');
  return new Response(JSON.stringify(data),{status:response.status,statusText:response.statusText,headers});
}

function detailsScript(){return `<style data-toolscout-human-truth-details="1">
#trafficTruthBody .tsTrafficDetail{margin-top:12px}
#trafficTruthBody .tsTrafficDetailHead{margin-bottom:9px}
#trafficTruthBody .tsTrafficDetailHead strong{display:block;font-size:12px;letter-spacing:.02em}
#trafficTruthBody .tsTrafficDetailHead span{display:block;color:var(--muted);font-size:10px;line-height:1.4;margin-top:3px}
#trafficTruthBody .tsDetailGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
#trafficTruthBody .tsDetailCard{border:1px solid var(--line);background:var(--card2);border-radius:14px;padding:12px 13px;min-width:0}
#trafficTruthBody .tsDetailCard small{display:block;color:var(--muted);font-size:8.5px;font-weight:850;letter-spacing:.075em;text-transform:uppercase;line-height:1.35}
#trafficTruthBody .tsDetailCard b{display:block;font-size:25px;letter-spacing:-.04em;line-height:1.05;margin-top:6px}
#trafficTruthBody .tsDetailCard span{display:block;color:var(--muted);font-size:9px;line-height:1.35;margin-top:5px}
@media(max-width:430px){#trafficTruthBody .tsDetailGrid{grid-template-columns:1fr 1fr;gap:8px}#trafficTruthBody .tsDetailCard{padding:11px}#trafficTruthBody .tsDetailCard b{font-size:23px}}
</style><script data-toolscout-human-truth-details="1">(function(){
if(window.__toolscoutHumanTruthDetailsInstalled)return;
window.__toolscoutHumanTruthDetailsInstalled=true;
var latest=null,wrapped=false;
function n(v){var x=Number(v);return Number.isFinite(x)?x:0}
function fmt(v,digits){var x=n(v);return digits==null?x.toLocaleString():x.toFixed(digits)}
function card(label,value,meta){return '<div class="tsDetailCard"><small>'+label+'</small><b>'+value+'</b><span>'+meta+'</span></div>'}
function visitorWindowMeta(v,key){var c=v&&v.coverage||{},ok=key==='last24'?!!c.last24Complete:key==='today'?!!c.todayComplete:!!c.monthToDateComplete;return ok?'Complete exact measurement window':'Exact count for covered period only'}
function renderDetails(d){
  latest=d||latest;if(!latest)return;
  var root=document.getElementById('trafficTruthBody');if(!root)return;
  var forecast=root.querySelector('.tsTruthForecast');if(!forecast)return;
  var old=root.querySelector('.tsTrafficDetail');if(old)old.remove();
  var v=latest.visitors||{},traffic=latest.traffic||{},tracking=latest.tracking||{},commercial=latest.canonicalCommercialTruth||{};
  var html='<div class="tsTrafficDetail"><div class="tsTrafficDetailHead"><strong>Traffic detail</strong><span>Supporting first-party visitor, browser-session and commercial click metrics. Human Visitors remains the canonical headline metric.</span></div><div class="tsDetailGrid">'+
    card('Human visitors, last 24h',fmt(v.last24),visitorWindowMeta(v,'last24'))+
    card('Human visitors today',fmt(v.today),visitorWindowMeta(v,'today'))+
    card('Human visitors this month',fmt(v.monthToDate),visitorWindowMeta(v,'month'))+
    card('Human visitors since tracking',fmt(v.sinceTracking),'Unique first-party human browser IDs observed since exact tracking began')+
    card('Outbound clicks, 30d',fmt(commercial.humanOutbound),'Browser-confirmed human outbound clicks')+
    card('Monetized outbound clicks, 30d',fmt(commercial.monetizedOutbound),'Human outbound clicks routed through active monetized affiliate paths')+
    card('Browser sessions, last 24h',fmt(tracking.humanSessionsLast24Hours),'Browser-confirmed likely-human sessions')+
    card('Browser sessions this month',fmt(traffic.monthToDate),'Comparable month-to-date behavior metric')+
    card('Average sessions per day MTD',fmt(traffic.dailyAverageMTD,1),'Browser-confirmed sessions per calendar day')+
    card('Projected browser sessions this month',fmt(traffic.projectedMonth),'Behavior forecast only, separate from the human-visitor forecast')+
    '</div></div>';
  forecast.insertAdjacentHTML('afterend',html);
}
function install(){
  if(wrapped)return;wrapped=true;
  var previous=window.render;
  if(typeof previous==='function')window.render=function(d){latest=d;var result=previous(d);renderDetails(d);return result};
  try{if(typeof snapshot!=='undefined'&&snapshot){latest=snapshot;renderDetails(snapshot)}}catch(e){}
}
document.addEventListener('click',function(e){var b=e.target&&e.target.closest?e.target.closest('[data-ts-window]'):null;if(!b)return;setTimeout(function(){renderDetails(latest)},0)},true);
function boot(){setTimeout(install,1050)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();</script>`}

async function decorate(response){
  if(!response.ok||!isHtml(response))return response;
  let html=await response.text();
  html=html.replace(/<section class="widget" data-widget="product-behavior"[\s\S]*?<\/section>\s*/i,'');
  html=html.replace(/<section class="widget" data-widget="ledger"[\s\S]*?<\/section>\s*/i,'');
  html=html.replace(/<script>\(function\(\)\{function drawBehavior\(d\)\{[\s\S]*?<\/script>/i,'');
  html=html.replace("document.getElementById('ledgerBody').innerHTML=","const ledgerBody=document.getElementById('ledgerBody');if(!ledgerBody)return;ledgerBody.innerHTML=");
  if(!html.includes('data-toolscout-human-truth-details="1"'))html=html.replace(/<\/body>/i,detailsScript()+'</body>');
  const headers=new Headers(response.headers);
  headers.delete('Content-Length');
  headers.delete('Content-Encoding');
  headers.set('Cache-Control','private, no-store, max-age=0');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(request.method==='GET'&&url.pathname==='/api/command-center-human-truth-details-health')return Response.json({ok:true,service:'toolscout-command-center-human-truth-details',version:6,canonicalMetric:'human visitors',supportingTrafficMetrics:true,outboundMetrics:true,affiliateCoverageStatus:true,productBehaviourCard:false,growthLedgerCard:false,resilientNoticeVisible:false,refreshNullGuard:true,detailsPosition:'below human visitor forecast'},{headers:{'Cache-Control':'no-store'}});
    let response=await base.fetch(request,env,ctx);
    if(request.method==='GET'&&url.pathname==='/analytics/api/stats')response=await augmentAffiliateStatus(response,request,env);
    if(request.method==='GET'&&ANALYTICS_PATHS.has(url.pathname))response=await decorate(response);
    return response;
  },
  async scheduled(event,env,ctx){if(typeof base.scheduled==='function')return base.scheduled(event,env,ctx)}
};