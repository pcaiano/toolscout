import base from './command-center-human-truth-details-worker.js';

const ANALYTICS_PATHS=new Set(['/analytics','/analytics/','/analytics.html','/analytics-v2','/analytics-v2/','/analytics-v2.html']);

function isHtml(response){return (response.headers.get('content-type')||'').toLowerCase().includes('text/html')}

function chartScript(){return `<script data-toolscout-human-truth-chart="2">(function(){
if(window.__toolscoutHumanTruthChartInstalled)return;
window.__toolscoutHumanTruthChartInstalled=true;
var latest=null;
function n(v){var x=Number(v);return Number.isFinite(x)?x:0}
function shortDay(v){var s=String(v||'');return s.slice(8,10)+'/'+s.slice(5,7)}
function renderChart(d){
  latest=d||latest;if(!latest)return;
  var points=latest.trafficTrend&&Array.isArray(latest.trafficTrend.points)?latest.trafficTrend.points:[];
  if(!points.length)return;
  var root=document.getElementById('trafficTruthBody');if(!root)return;
  var svg=root.querySelector('svg[aria-label="Traffic evolution over the last 30 days"],svg[aria-label*="Daily browser sessions"]');
  var card=svg&&svg.parentElement;if(!card)return;
  var w=760,h=240,l=42,r=42,t=24,b=38,iw=w-l-r,ih=h-t-b;
  var sessionValues=points.map(function(x){return n(x.sessions)}),outValues=[];
  points.forEach(function(x){outValues.push(n(x.outboundClicks));outValues.push(n(x.monetizedOutboundClicks))});
  var leftMax=Math.max.apply(null,sessionValues.concat([1])),rightMax=Math.max.apply(null,outValues.concat([1]));
  var xs=points.map(function(x,i){return l+(points.length===1?iw/2:i*iw/(points.length-1))});
  function coords(key,scale){return points.map(function(x,i){return [xs[i],t+ih-(n(x[key])/scale)*ih]})}
  var sessionCoords=coords('sessions',leftMax),outCoords=coords('outboundClicks',rightMax),moneyCoords=coords('monetizedOutboundClicks',rightMax);
  function line(c){return c.map(function(p){return p[0].toFixed(1)+','+p[1].toFixed(1)}).join(' ')}
  function circles(c,key,stroke,label){return c.map(function(p,i){return '<circle cx="'+p[0].toFixed(1)+'" cy="'+p[1].toFixed(1)+'" r="2.8" fill="'+stroke+'"><title>'+shortDay(points[i].day)+': '+n(points[i][key])+' '+label+'</title></circle>'}).join('')}
  function squares(c,key,stroke,label){return c.map(function(p,i){return '<rect x="'+(p[0]-3).toFixed(1)+'" y="'+(p[1]-3).toFixed(1)+'" width="6" height="6" rx="1" fill="var(--card2)" stroke="'+stroke+'" stroke-width="2"><title>'+shortDay(points[i].day)+': '+n(points[i][key])+' '+label+'</title></rect>'}).join('')}
  var mid=Math.floor((points.length-1)/2),idx=[0,mid,points.length-1].filter(function(v,i,a){return a.indexOf(v)===i});
  var labels=idx.map(function(i){return '<text x="'+xs[i].toFixed(1)+'" y="230" text-anchor="middle" fill="currentColor" opacity="0.55" font-size="10">'+shortDay(points[i].day)+'</text>'}).join('');
  var legend='<div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:8px;font-size:12px;color:var(--muted)"><span style="display:inline-flex;align-items:center;gap:6px"><span style="display:inline-block;width:18px;border-top:3px solid var(--accent)"></span>Browser sessions</span><span style="display:inline-flex;align-items:center;gap:6px"><span style="display:inline-block;width:18px;border-top:3px solid var(--warn, #f59e0b)"></span>Outbound clicks</span><span style="display:inline-flex;align-items:center;gap:6px"><span style="display:inline-block;width:18px;border-top:3px dashed var(--good, #22c55e)"></span>Monetized outbound</span></div>';
  card.innerHTML='<div class="rowName">Traffic evolution, last 30 days</div><div class="rowMeta">Browser sessions on the left axis. Outbound clicks on the right axis.</div>'+legend+'<svg viewBox="0 0 '+w+' '+h+'" width="100%" height="240" role="img" aria-label="Daily browser sessions on the left axis, outbound clicks and monetized outbound clicks on the right axis over the last 30 days" style="display:block;margin-top:8px;overflow:visible;color:var(--muted)"><line x1="'+l+'" y1="'+(t+ih)+'" x2="'+(w-r)+'" y2="'+(t+ih)+'" stroke="currentColor" opacity="0.18"/><line x1="'+l+'" y1="'+t+'" x2="'+l+'" y2="'+(t+ih)+'" stroke="currentColor" opacity="0.18"/><line x1="'+(w-r)+'" y1="'+t+'" x2="'+(w-r)+'" y2="'+(t+ih)+'" stroke="currentColor" opacity="0.18"/><text x="4" y="'+(t+5)+'" fill="currentColor" opacity="0.65" font-size="10">'+leftMax+'</text><text x="14" y="'+(t+ih+4)+'" fill="currentColor" opacity="0.55" font-size="10">0</text><text x="'+(w-4)+'" y="'+(t+5)+'" text-anchor="end" fill="currentColor" opacity="0.65" font-size="10">'+rightMax+'</text><text x="'+(w-14)+'" y="'+(t+ih+4)+'" text-anchor="end" fill="currentColor" opacity="0.55" font-size="10">0</text><polyline points="'+line(sessionCoords)+'" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>'+circles(sessionCoords,'sessions','var(--accent)','browser sessions')+'<polyline points="'+line(outCoords)+'" fill="none" stroke="var(--warn, #f59e0b)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>'+circles(outCoords,'outboundClicks','var(--warn, #f59e0b)','outbound clicks')+'<polyline points="'+line(moneyCoords)+'" fill="none" stroke="var(--good, #22c55e)" stroke-width="2.5" stroke-dasharray="7 5" stroke-linecap="round" stroke-linejoin="round"/>'+squares(moneyCoords,'monetizedOutboundClicks','var(--good, #22c55e)','monetized outbound clicks')+labels+'</svg>';
}
function tsDt(v){return v?new Date(String(v).replace(' ','T')+(String(v).includes('T')?'':'Z')).toLocaleString(undefined,{timeZone:'Europe/Lisbon'}):'Not available'}
function healthRow(name,value,meta){return '<div class="row"><div><div class="rowName">'+name+'</div><div class="rowMeta">'+meta+'</div></div><div class="rowValue">'+value+'</div></div>'}
function stateName(v){var s=String(v||'').toLowerCase();if(s==='healthy')return 'Healthy';if(s==='running')return 'Running';if(s==='completed')return 'Completed';if(s==='awaiting_strict_evidence')return 'Waiting';if(s==='failed')return 'Failed';if(s==='degraded')return 'Degraded';if(s==='stale')return 'Stale';if(s==='warning')return 'Warning';if(s==='partial')return 'Partial';if(s==='observed')return 'Observed';if(s==='no_evidence')return 'Unknown';return s?'Unknown':'Unknown'}
function evidenceName(v){var s=String(v||'').toLowerCase();if(s==='healthy'||s==='running'||s==='completed'||s==='observed')return 'Verified';if(s==='partial'||s==='warning'||s==='degraded'||s==='stale')return 'Partial';if(s==='failed')return 'Verified failure';if(s==='no_evidence'||s==='unknown'||s==='unavailable')return 'Limited';return 'Limited'}
function renderHealthClarity(d){
  latest=d||latest;if(!latest)return;
  var root=document.getElementById('healthBody');if(!root)return;
  var widget=root.closest('.widget[data-widget="health"]'),tr=latest.tracking||{},g=latest.growthOps||{},q=g.chairmanQueue||{},eng=g.engines||{},aff=eng.affiliate||{},dist=eng.distribution||{},h=g.health||{},content=h.content||{},audience=h.audience||{},seo=h.seo_geo_aio||{},issues=Array.isArray(h.issues)?h.issues:[],res=latest.resilientCommandCenter||{};
  if(widget){var kicker=widget.querySelector('.widgetKicker'),meta=widget.querySelector('.widgetMeta');if(kicker)kicker.textContent='ENGINE STATE + OBSERVABILITY';if(meta)meta.textContent='Execution + evidence'}
  var affEvidence=aff.last_run_at?'Verified':'Partial',distEvidence=dist.last_activity_at?'Verified':'Partial';
  var contentState=stateName(content.status);
  var audienceState=stateName(audience.status);
  var seoState=stateName(seo.status);
  var html='';
  html+=healthRow('Tracking','Observed · Verified',n(tr.humanSessionsLast24Hours)+' human sessions · 24h');
  html+=healthRow('Affiliate Coverage Engine',stateName(aff.status)+' · '+affEvidence,aff.last_run_at?'Last verified '+tsDt(aff.last_run_at):'Engine state reports running. Execution heartbeat is not exposed by the resilient read.');
  html+=healthRow('Distribution Engine',stateName(dist.status)+' · '+distEvidence,dist.last_activity_at?'Last verified '+tsDt(dist.last_activity_at):'Engine state is available, but no recent execution event is exposed.');
  html+=healthRow('Content Engine',contentState+' · '+evidenceName(content.status),(content.detail||'No execution heartbeat is available.')+(res.active&&content.status==='no_evidence'?' This is limited observability, not a failure signal.':'')+(content.last_event_at?' Last evidence '+tsDt(content.last_event_at):''));
  html+=healthRow('Audience Engine',audienceState+' · '+evidenceName(audience.status),(audience.detail||'No execution heartbeat is available.')+(res.active&&audience.status==='no_evidence'?' This is limited observability, not a failure signal.':'')+(audience.last_event_at?' Last evidence '+tsDt(audience.last_event_at):''));
  html+=healthRow('SEO / GEO / AIO',seoState+' · '+evidenceName(seo.status),(seo.detail||'No readiness evidence is available.')+(seo.last_event_at?' Last evidence '+tsDt(seo.last_event_at):''));
  var broken=(q.broken_links||[]).length;
  html+=healthRow('Broken Chairman links',String(broken),broken?'Detailed below. These are internal ToolScout action link failures.':'None detected');
  if(issues.length)html+=issues.map(function(x){var name=String(x.engine||x.metric||'unknown'),title=String(x.title||x.reason||'Operational warning'),detail=String(x.detail||'');return '<div class="bug '+(x.severity==='warning'?'warning':'')+'"><b>'+(x.severity==='warning'?'Warning':'Engine bug')+' · '+name+':</b> '+title+(detail&&detail!==title?' · '+detail:'')+'</div>'}).join('');
  root.innerHTML=html;
}
var previous=window.render;
if(typeof previous==='function')window.render=function(d){latest=d;var result=previous(d);setTimeout(function(){renderChart(d);renderHealthClarity(d)},0);return result};
function retry(){renderChart(latest);renderHealthClarity(latest);setTimeout(function(){renderChart(latest);renderHealthClarity(latest)},350);setTimeout(function(){renderChart(latest);renderHealthClarity(latest)},900)}
document.addEventListener('click',function(e){if(e.target&&e.target.closest&&e.target.closest('[data-ts-window]'))setTimeout(retry,0)},true);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',retry,{once:true});else retry();
})();</script>`}

async function decorate(response){
  if(!response.ok||!isHtml(response))return response;
  let html=await response.text();
  html=html.replace(/<script data-toolscout-human-truth-chart="1">[\s\S]*?<\/script>/gi,'');
  if(!html.includes('data-toolscout-human-truth-chart="2"'))html=html.replace(/<\/body>/i,chartScript()+'</body>');
  const headers=new Headers(response.headers);
  headers.delete('Content-Length');
  headers.delete('Content-Encoding');
  headers.set('Cache-Control','private, no-store, max-age=0');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(request.method==='GET'&&url.pathname==='/api/command-center-human-truth-chart-health')return Response.json({ok:true,service:'toolscout-command-center-human-truth-chart',version:3,chart:'human-visitors-top',series:3,dualAxis:true,monetizedSeries:'dashed-square-markers',healthSemantics:'engine-state-plus-observability',noAmbiguousNoEvidence:true},{headers:{'Cache-Control':'no-store'}});
    const response=await base.fetch(request,env,ctx);
    if(request.method==='GET'&&ANALYTICS_PATHS.has(url.pathname))return decorate(response);
    return response;
  },
  async scheduled(event,env,ctx){if(typeof base.scheduled==='function')return base.scheduled(event,env,ctx)}
};
