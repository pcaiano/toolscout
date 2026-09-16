import base from './command-center-human-truth-final-worker.js';

const ANALYTICS_PATHS=new Set(['/analytics','/analytics/','/analytics.html','/analytics-v2','/analytics-v2/','/analytics-v2.html']);

function isHtml(response){return (response.headers.get('content-type')||'').toLowerCase().includes('text/html')}

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
    if(request.method==='GET'&&url.pathname==='/api/command-center-human-truth-details-health')return Response.json({ok:true,service:'toolscout-command-center-human-truth-details',version:2,canonicalMetric:'human visitors',supportingTrafficMetrics:true,outboundMetrics:true,detailsPosition:'below human visitor forecast'},{headers:{'Cache-Control':'no-store'}});
    const response=await base.fetch(request,env,ctx);
    if(request.method==='GET'&&ANALYTICS_PATHS.has(url.pathname))return decorate(response);
    return response;
  },
  async scheduled(event,env,ctx){if(typeof base.scheduled==='function')return base.scheduled(event,env,ctx)}
};
