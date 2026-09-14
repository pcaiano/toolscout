import base from './agent-protocol-worker.js';
import { behaviorSnapshot } from './behavior-intelligence.js';
import { applyDistributionBehaviorPriorities } from './distribution-behavior-worker.js';

const JSON_H={'Content-Type':'application/json; charset=UTF-8','Cache-Control':'private, no-store'};
const ANALYTICS_PATHS=new Set(['/analytics','/analytics/','/analytics.html','/analytics-v2','/analytics-v2/','/analytics-v2.html']);

function behaviorWidget(){return `<section class="widget" data-widget="product-behavior" style="--w:8;--h:5"><div class="widgetHead"><div><div class="widgetKicker">D1 canonical + PostHog audit</div><div class="widgetTitle">Product Behaviour</div></div><div class="widgetMeta" id="behaviorMeta">30d</div></div><div class="widgetBody" id="behaviorBody"><div class="empty">Refresh to load behaviour signals.</div></div><div class="resizeHandle"></div></section>`}
function behaviorScript(){return `<script>(function(){function drawBehavior(d){var b=d&&d.productBehavior,root=document.getElementById('behaviorBody'),meta=document.getElementById('behaviorMeta');if(!root)return;if(!b||b.status!=='observed'){root.innerHTML='<div class="empty">Behaviour intelligence unavailable.</div>';return}var t=b.totals||{},p=b.posthog||{};if(meta)meta.innerHTML=pill(p.status||'configured','info');root.innerHTML='<div class="metricGrid">'+metric('Confirmed sessions',num(t.sessions||0),'D1 30d')+metric('Recommendation starts',num(t.recommendation_starts||0),'Canonical event')+metric('Recommendation completed',num(t.recommendation_completions||0),pct(t.recommendationCompletionRate||0))+metric('Result views',num(t.result_views||0),'Canonical event')+metric('Vendor outbound',num(t.outbound_clicks||0),pct(t.sessionToOutboundRate||0)+' of sessions')+metric('Behaviour quality',t.quality&&t.quality.score!=null?num(t.quality.score):'Warming up',t.quality&&t.quality.sample||'insufficient')+'</div><div class="note" style="margin-top:10px">PostHog validates the consented subset. Engine decisions remain on first-party browser-confirmed D1 events.</div>'}var originalFetch=window.fetch;window.fetch=async function(){var r=await originalFetch.apply(this,arguments);try{var u=String(arguments[0]&&arguments[0].url||arguments[0]||'');if(u.indexOf('/analytics/api/stats')!==-1)r.clone().json().then(drawBehavior).catch(function(){})}catch(e){}return r};fetch('/analytics/api/stats',{cache:'no-store'}).then(function(r){return r.ok?r.json():null}).then(function(d){if(d)drawBehavior(d)}).catch(function(){});})();</script>`}

async function decorateBehaviorPage(response){
  if(!response.ok||!(response.headers.get('content-type')||'').toLowerCase().includes('text/html'))return response;
  let html=await response.text();
  const anchor='<section class="widget" data-widget="traffic-truth"';
  if(!html.includes('data-widget="product-behavior"'))html=html.includes(anchor)?html.replace(anchor,behaviorWidget()+'\n\n    '+anchor):html.replace('</body>',behaviorWidget()+'</body>');
  if(!html.includes('drawBehavior'))html=html.replace('</body>',behaviorScript()+'</body>');
  const headers=new Headers(response.headers);headers.delete('Content-Length');return new Response(html,{status:response.status,statusText:response.statusText,headers});
}
async function augmentStats(response,env){if(!response.ok)return response;let data;try{data=await response.json()}catch{return response}return Response.json({...data,productBehavior:await behaviorSnapshot(env)},{headers:JSON_H})}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(request.method==='GET'&&url.pathname==='/analytics/api/stats')return augmentStats(await base.fetch(request,env,ctx),env);
    if(request.method==='GET'&&url.pathname==='/analytics/api/behavior')return Response.json(await behaviorSnapshot(env),{headers:JSON_H});
    let response=await base.fetch(request,env,ctx);
    if(request.method==='GET'&&ANALYTICS_PATHS.has(url.pathname))response=await decorateBehaviorPage(response);
    return response;
  },
  async scheduled(event,env,ctx){
    const result=base.scheduled?await base.scheduled(event,env,ctx):undefined;
    ctx.waitUntil(applyDistributionBehaviorPriorities(env).catch(()=>({ok:false})));
    return result;
  }
};